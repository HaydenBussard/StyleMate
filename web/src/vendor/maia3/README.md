# Vendored: maia3-ts

Plain-TypeScript inference for Maia-3 (CSSLab, University of Toronto).

- Upstream: https://github.com/dmallory42/maia3-ts at commit `1fed2c3` (v0.1.0)
- Original model and architecture: https://github.com/CSSLab/maia3 (AGPL-3.0), paper arXiv:2605.19091
- Weights: UofTCSSLab/Maia3-5M, converted to safetensors by maia3-ts; SHA-256
  `c3f778e606a06d69355885a6bfb3d3dfa5c45a18cb50c3f013fe76afa5445e0a`
- License: AGPL-3.0-or-later (see `LICENSE`)

Why vendored instead of `npm install github:...`: the package is a single-author,
v0.1.0 project with no npm release. Copying the four source files pins the exact
code we tested, lets Vite bundle it into the Web Worker, and makes the
dependency reviewable in this repo. The files are unmodified.

Upstream verified its outputs against the official PyTorch model on 420 reference
positions (max probability error ≈ 4e-6 when re-run here).
