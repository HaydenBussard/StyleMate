# Implementation decisions

Short records of the choices that shape the code — the "why" you'd be asked
about in an interview.

### 1. Run Maia-3 in the browser, not on a server
**Chosen:** maia3-ts (plain TypeScript) in a Web Worker.
**Why:** zero server cost, no cold starts, no backend to secure or scale; the
5M model is small enough (20 MB, ~0.3 s/move on CPU).
**Trade-off:** one-time 20 MB download; only the 5M model is practical;
AGPL-3.0 applies (see 2). A server path (Python `maia3-uci` or Maia-2) still
fits behind `MaiaBackend` if bigger models are needed.

### 2. Accept AGPL-3.0 and ship source with every deploy
Maia-3 and maia3-ts are AGPL. For a portfolio project, open source is a
feature. The app links `source.zip`, generated from the committed HEAD by
`npm run release`. Escape hatch: Maia-2 is MIT.

### 3. Vendor maia3-ts instead of installing from GitHub
Single-author v0.1.0 with no npm release. Vendoring four unmodified files pins
the reviewed code. Weights are downloaded by script and **SHA-256-verified**
both at fetch time and in the browser before loading.

### 4. Sample at temperature 1 (like the official engine)
Taking Maia's top move every time gives a stronger, less human opponent. Sampling
from the full distribution reproduces human error rates: if 15% of 1500 players
play a dubious move here, the bot plays it ~15% of the time.

### 5. Style = exponential tilt over measurable features
`q(m) ∝ p(m)·exp(strength·w·f(m))`. The model never plays a move it thinks no
human would play (zero stays zero), strength 0 is exactly Maia, and the cost is
a single number: KL(q‖p). The style report shows *played vs pure-Maia
baseline* per feature, so style claims are measured, not asserted. Weights are
hand-set for now; learning them from real players' PGNs is the next step.

### 6. chess.js is the single source of truth for rules
Only `GameSession` touches chess.js. Opponents receive the legal-move list and
are filtered against it; `Match` rejects illegal output. Model bugs can't
corrupt a game.

### 7. Async `Opponent` interface
Even the placeholder returns a Promise, so worker-, HTTP- and in-process
backends are interchangeable and the game loop never changes.

### 8. Keep a clearly labelled placeholder opponent
Useful as a fallback when the model can't load, and as a contrast: it shows the
"weakened engine" behaviour (random blunders) this project exists to replace.
Its `humanLike: false` flag drives the red UI badge and goes into the PGN.

### 9. No framework
Vanilla TypeScript + Vite: ~1k lines of app code, no React/state library.
Each module is readable on its own. Revisit if the UI grows (accounts, history,
analysis board).

### 10. Squares are `<button>`s; click-to-move
Keyboard and screen-reader accessible for free. Drag-and-drop is a later
enhancement.

### 11. Tests at three levels
Rules + PGN round-trip (`game.test.ts`); opponents and game loop with fakes
(`opponent.test.ts`, `style.test.ts`); real-weights integration
(`maia3-model.test.ts`, skipped if weights absent). CI runs all of them.
