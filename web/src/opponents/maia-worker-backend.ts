/**
 * Browser MaiaBackend: forwards policy requests to the Maia Web Worker and
 * exposes model-loading progress to the UI.
 */
import type { MaiaBackend, MaiaPolicyInput, MaiaPolicyOutput } from "./maia3";

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
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (o: MaiaPolicyOutput) => void; reject: (e: Error) => void }>();
  private ready: Promise<void>;
  loadState: LoadState = { state: "idle" };

  constructor(onState: (s: LoadState) => void) {
    this.worker = new Worker(new URL("../workers/maia.worker.ts", import.meta.url), { type: "module" });
    this.ready = new Promise((resolve, reject) => {
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
    this.ready.catch(() => undefined); // surfaced via onState
    this.loadState = { state: "loading", received: 0, total: MAIA3_WEIGHTS.bytes };
    onState(this.loadState);
    const url = new URL(MAIA3_WEIGHTS.url, document.baseURI).href;
    this.worker.postMessage({ type: "load", url, sha256: MAIA3_WEIGHTS.sha256 });
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
