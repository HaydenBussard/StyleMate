// Downloads the Maia-3 5M weights into public/models and verifies the SHA-256.
// Weights: UofTCSSLab/Maia3-5M converted to safetensors by maia3-ts v0.1.0 (AGPL-3.0).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const URL_ = "https://github.com/dmallory42/maia3-ts/releases/download/v0.1.0/maia3-5m.safetensors";
const SHA256 = "c3f778e606a06d69355885a6bfb3d3dfa5c45a18cb50c3f013fe76afa5445e0a";
const OUT = new URL("../public/models/maia3-5m.safetensors", import.meta.url);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

if (existsSync(OUT) && sha(readFileSync(OUT)) === SHA256) {
  console.log("Maia-3 weights already present and verified.");
  process.exit(0);
}
console.log("Downloading Maia-3 5M weights (~20 MB)…");
const res = await fetch(URL_);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
if (sha(buf) !== SHA256) throw new Error("Checksum mismatch — not saving.");
mkdirSync(new URL("../public/models/", import.meta.url), { recursive: true });
writeFileSync(OUT, buf);
console.log("Saved and verified public/models/maia3-5m.safetensors");
