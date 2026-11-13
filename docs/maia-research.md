# Maia integration research (November 2026)

What was checked, what it means for this project, and what is still an assumption.

## Options

| Option | What it is | License | Runs on | Verdict |
|---|---|---|---|---|
| **Maia-1** (`CSSLab/maia-chess`) | Nine separate Leela-format networks, `maia-1100` … `maia-1900` | GPL-3.0 | lc0 engine binary | Superseded; only 9 fixed ratings, needs lc0 |
| **Maia-2** (`CSSLab/maia2`, `pip install maia2`) | One skill-aware model across ratings; rapid and blitz checkpoints | MIT | PyTorch on CUDA / Apple MPS / CPU, Python 3.10–3.12 | Best option if a permissive license matters |
| **Maia-3** (`CSSLab/maia3`) | "Chessformer" transformer; 5M / 23M / 79M presets; ratings 600–2600 | AGPL-3.0 (repo; model cards defer to repo) | PyTorch; ships as a UCI engine (`maia3-uci`) | Most accurate and the authors' recommendation for new projects |
| **maia3-ts** (`dmallory42/maia3-ts`) | Plain-TypeScript port of Maia-3 5M inference | AGPL-3.0-or-later | Any JavaScript runtime: browser, Node, workers | **Chosen** — runs client-side, no server |

## Verified facts

Sources: [CSSLab/maia3](https://github.com/CSSLab/maia3), [Maia-3 announcement](https://lichess.org/@/ashtonanderson/blog/introducing-maia-3-free-and-open-source/vCPPRtX3), [CSSLab/maia2](https://github.com/CSSLab/maia2), [maia2 on PyPI](https://pypi.org/project/maia2/0.10.0/), [maia3-ts](https://github.com/dmallory42/maia3-ts), [Maia3-5M model card](https://huggingface.co/UofTCSSLab/Maia3-5M), [Hugging Face pricing](https://huggingface.co/pricing).

- Maia-3 was released and open-sourced in May 2026; it models Lichess blitz ratings 600–2600 and reports 57.1% move-match accuracy vs 52.0% (Maia-2) and 51.6% (Maia-1).
- Maia-3 has 5M, 23M and 79M presets; CSSLab describes 5M as suitable for CPU and chess GUIs.
- Maia-3's UCI engine takes `Elo`, `SelfElo` and `OppoElo` options — it conditions on both players' ratings.
- The Maia-3 repository is AGPL-3.0. The Hugging Face model card says to see the repository for the code and weights license, so treat the weights as AGPL too.
- The maia2 package README now says Maia-3 is recommended for new projects. Maia-2 itself is MIT.
- maia3-ts weights are 20 MB (20,671,420 bytes). **Re-verified here:** the SHA-256 matches the published value, and the port matched the reference policy within 2.5e-6 on the fixture positions.
- **Measured here:** about 340 ms per position on this project's (slow, shared) build-machine CPU in Node. Expect browsers on a modern laptop to be similar or faster; phones slower.
- Hugging Face Spaces "CPU Basic" (2 vCPU, 16 GB) is free; "CPU Upgrade" is $0.03/hour.

## Assumptions (not verified)

- Browser latency on a typical phone — not measured. The app runs inference in a Web Worker so the UI stays responsive regardless.
- The rating slider is Maia's *conditioning* rating. Whether a human at that Lichess rating would score ~50% against it has not been tested.
- Maia-3 23M/79M quality gains have not been measured in this app; only 5M is wired up.
- Lichess blitz ratings ≠ Chess.com or FIDE ratings.

## License consequences (not legal advice)

Using maia3-ts makes this app a combined work under **AGPL-3.0**. In practice:

1. The repo is licensed AGPL-3.0-or-later (`LICENSE`).
2. Anyone who uses the deployed app must be able to get its source. Every deploy ships `source.zip` (built by `npm run release` from the committed HEAD) and links it in the header.
3. If a permissive license is ever needed (e.g. a closed commercial product), switch the model layer to Maia-2 (MIT) behind the same `Opponent` interface.

## Hosting cost

| Approach | Cost | Notes |
|---|---|---|
| **Client-side inference (current)** | $0 server compute; static hosting only | 20 MB one-time download per visitor (cached) |
| Python Maia-3/Maia-2 server on HF Spaces CPU Basic | Free tier | Cold starts; shared CPU; concurrency limited |
| Same on HF CPU Upgrade | ~$22/month | 8 vCPU, always-on |
| GPU server | Not needed for 5M | Only worth it for 79M at scale |
