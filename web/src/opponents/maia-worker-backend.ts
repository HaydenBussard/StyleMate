/**
 * Browser MaiaBackend: forwards policy requests to the Maia Web Worker and
 * exposes model-loading progress to the UI.
 */
import type { MaiaBackend, MaiaPolicyInput, MaiaPolicyOutput } from "./maia3";
import workerUrl from "../workers/maia.worker.ts?worker&url";

/**
 * Start the Maia worker. Sandboxed hosts (e.g. the preview iframe) give the page
 * an opaque "null" origin, and browsers refuse `new Worker(url)` there. The
 * worker bundle is a self-contained IIFE, so we can fetch it and start it from
 * a Blob URL instead, which inherits the page's origin.
 */
async function startWorker(): Promise<Worker> {
  const href = new URL(workerUrl, document.baseURI).href;
  if (self.origin !== "null") {
    try {
      return new Worker(href);
    } catch {
      /* fall through to the Blob path */
    }
  }
  const res = await fetch(href);
  if (!res.ok) throw new Error(`Could not fetch Maia worker (HTTP ${res.status})`);
  const blob = new Blob([await res.text()], { type: "text/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

/** Weights served from this site; checked against the SHA-256 published by maia3-ts v0.1.0. */
export const MAIA3_WEIGHTS = {
  url: "models/maia3-5m.safetensors",
  sha256: "c3f778e606a06d69355885a6bfb3d3dfa5c45a18cb50c3f013fe76afa5445e0a",
  bytes: 20_671_420,
} as const;

export type LoadState =
  | { state: "idle" }
  | { state: "loading"; received: number; total: number }
  | { state: "ready" }
  | { state: "error"; message: string };

export class WorkerMaiaBackend implements MaiaBackend {
  private worker!: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (o: MaiaPolicyOutput) => void; reject: (e: Error) => void }>();
  private ready: Promise<void>;
  loadState: LoadState = { state: "idle" };

  constructor(onState: (s: LoadState) => void) {
    this.ready = this.init(onState);
    this.ready.catch(() => undefined); // surfaced via onState
  }

  private async init(onState: (s: LoadState) => void): Promise<void> {
    this.loadState = { state: "loading", received: 0, total: MAIA3_WEIGHTS.bytes };
    onState(this.loadState);
    try {
      this.worker = await startWorker();
    } catch (err) {
      this.loadState = { state: "error", message: (err as Error).message };
      onState(this.loadState);
      throw err;
    }
    const ready = new Promise<void>((resolve, reject) => {
      this.worker.onerror = (e) => {
        this.loadState = { state: "error", message: e.message || "Maia worker failed to start" };
        onState(this.loadState);
        reject(new Error(this.loadState.message));
      };
      this.worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "progress") {
          this.loadState = { state: "loading", received: m.received, total: m.total || MAIA3_WEIGHTS.bytes };
          onState(this.loadState);
        } else if (m.type === "ready") {
          this.loadState = { state: "ready" };
          onState(this.loadState);
          resolve();
        } else if (m.type === "error") {
          this.loadState = { state: "error", message: m.message };
          onState(this.loadState);
          reject(new Error(m.message));
        } else if (m.type === "policy" || m.type === "policy-error") {
          const p = this.pending.get(m.id);
          if (!p) return;
          this.pending.delete(m.id);
          if (m.type === "policy") p.resolve({ policy: m.policy, value: m.value });
          else p.reject(new Error(m.message));
        }
      };
    });
    const url = new URL(MAIA3_WEIGHTS.url, document.baseURI).href;
    this.worker.postMessage({ type: "load", url, sha256: MAIA3_WEIGHTS.sha256 });
    return ready;
  }

  async policy(input: MaiaPolicyInput): Promise<MaiaPolicyOutput> {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "policy", id, ...input });
    });
  }
}
