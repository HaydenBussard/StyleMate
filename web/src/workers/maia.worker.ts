/**
 * Web Worker that owns the Maia-3 model.
 *
 * A forward pass takes a few hundred milliseconds of pure CPU work; running
 * it here keeps the board responsive. The worker downloads the weights once
 * (the browser HTTP cache keeps them), verifies their SHA-256, and then
 * answers policy requests.
 */
import { loadMaia, maiaPolicy, type MaiaModel } from "../vendor/maia3/index";

type InMsg =
  | { type: "load"; url: string; sha256: string }
  | { type: "policy"; id: number; fen: string; history?: string[]; eloSelf: number; eloOppo: number };

let model: MaiaModel | null = null;

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

async function load(url: string, sha256: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body?.getReader();
  let buf: ArrayBuffer;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      post({ type: "progress", received, total });
    }
    const all = new Uint8Array(received);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    buf = all.buffer;
  } else {
    buf = await res.arrayBuffer();
  }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== sha256) throw new Error("Model checksum mismatch — refusing to load");
  model = loadMaia(buf);
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "load") {
    try {
      await load(msg.url, msg.sha256);
      post({ type: "ready" });
    } catch (err) {
      post({ type: "error", message: (err as Error).message });
    }
    return;
  }
  if (msg.type === "policy") {
    try {
      if (!model) throw new Error("Model not loaded");
      const out = maiaPolicy(model, msg);
      post({ type: "policy", id: msg.id, ...out });
    } catch (err) {
      post({ type: "policy-error", id: msg.id, message: (err as Error).message });
    }
  }
};
