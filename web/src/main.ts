/**
 * Web-interface entry point: wires DOM controls to the Match controller and
 * BoardView. No chess rules or model code live here.
 */
import type { Square } from "chess.js";
import "./styles.css";
import type { Color, PromotionPiece } from "./core/game";
import { findTimeControl, formatClock, TIME_CONTROLS } from "./core/clock";
import { Match } from "./core/match";
import { Maia3Opponent } from "./opponents/maia3";
import { WorkerMaiaBackend, type LoadState } from "./opponents/maia-worker-backend";
import { PlaceholderOpponent } from "./opponents/placeholder";
import { FEATURE_KEYS, FEATURE_LABELS, STYLES, type StyleId } from "./opponents/style";
import type { Opponent } from "./opponents/types";
import { BoardView } from "./ui/board";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  board: $("board"),
  status: $("status"),
  moves: $("moves"),
  candidates: $("candidates"),
  candidatesNote: $("candidates-note"),
  engine: $<HTMLSelectElement>("engine"),
  color: $<HTMLSelectElement>("color"),
  elo: $<HTMLInputElement>("elo"),
  eloOut: $("elo-out"),
  style: $<HTMLSelectElement>("style"),
  strength: $<HTMLInputElement>("strength"),
  strengthOut: $("strength-out"),
  styleDesc: $("style-desc"),
  humanElo: $<HTMLInputElement>("human-elo"),
  newGame: $<HTMLButtonElement>("new-game"),
  takeBack: $<HTMLButtonElement>("take-back"),
  resign: $<HTMLButtonElement>("resign"),
  flip: $<HTMLButtonElement>("flip"),
  downloadPgn: $<HTMLButtonElement>("download-pgn"),
  copyPgn: $<HTMLButtonElement>("copy-pgn"),
  downloadLog: $<HTMLButtonElement>("download-log"),
  pgnPreview: $<HTMLTextAreaElement>("pgn-preview"),
  promo: $<HTMLDialogElement>("promo"),
  about: $<HTMLDialogElement>("about"),
  aboutBtn: $<HTMLButtonElement>("about-btn"),
  toast: $("toast"),
  opponentName: $("opponent-name"),
  opponentMeta: $("opponent-meta"),
  opponentBadge: $("opponent-badge"),
  youMeta: $("you-meta"),
  outcome: $("outcome"),
  outcomeFill: $("outcome-fill"),
  outcomeLabel: $("outcome-label"),
  overlay: $("model-overlay"),
  modelProgress: $("model-progress"),
  modelSub: $("model-sub"),
  styleReport: $("style-report"),
  timeControl: $<HTMLSelectElement>("time-control"),
  clockTop: $("clock-top"),
  clockBottom: $("clock-bottom"),
};

// Populate the clock options from the single source of truth in core/clock.ts.
els.timeControl.replaceChildren(
  new Option("No clock", "none"),
  ...TIME_CONTROLS.map((t) => new Option(t.label, t.id)),
);

// ---- Opponent registry -------------------------------------------------------
// The Maia worker is created once and shared by every game.
let maiaBackend: WorkerMaiaBackend | null = null;
let maiaState: LoadState = { state: "idle" };

function onMaiaState(s: LoadState): void {
  maiaState = s;
  syncOverlay();
  if (s.state === "loading") {
    const pct = s.total ? Math.min(100, (s.received / s.total) * 100) : 0;
    els.modelProgress.style.width = `${pct.toFixed(0)}%`;
    els.modelSub.textContent = `${(s.received / 1e6).toFixed(1)} of ${(s.total / 1e6).toFixed(1)} MB · downloaded once, then cached`;
  } else if (s.state === "ready") {
    render();
    void maybeOpponentMove();
  } else if (s.state === "error") {
    toast(`Maia-3 failed to load (${s.message}). Switched to the placeholder bot.`);
    els.engine.value = "placeholder";
    startGame();
  }
}

/** The loading overlay covers the board only while the current opponent is a Maia that isn't ready. */
function syncOverlay(): void {
  const usingMaia = typeof match !== "undefined" && match.options.opponent instanceof Maia3Opponent;
  els.overlay.hidden = !(usingMaia && maiaState.state === "loading");
}

function createOpponent(kind: string): Opponent {
  if (kind === "maia3") {
    maiaBackend ??= new WorkerMaiaBackend(onMaiaState);
    return new Maia3Opponent(maiaBackend);
  }
  return new PlaceholderOpponent();
}

// ---- Game lifecycle ----------------------------------------------------------
let match: Match;
const view = new BoardView(els.board, () => match.session, {
  canInteract: () => match.isHumanTurn,
  onMove: (from, to) => void handleHumanMove(from, to),
});

function newMatch(): Match {
  const color: Color = els.color.value === "random" ? (Math.random() < 0.5 ? "w" : "b") : (els.color.value as Color);
  const styleId = els.style.value as StyleId;
  const strength = styleId === "balanced" ? 0 : Number(els.strength.value) / 100;
  return new Match({
    humanColor: color,
    opponent: createOpponent(els.engine.value),
    targetElo: Number(els.elo.value),
    humanElo: clampNum(Number(els.humanElo.value) || 1500, 400, 3000),
    style: { id: styleId, strength },
    timeControl: findTimeControl(els.timeControl.value),
  });
}

function startGame(): void {
  match = newMatch();
  view.clearSelection();
  view.flipped = match.options.humanColor === "b";
  saveSettings();
  render();
  startTicker();
  void maybeOpponentMove();
}

// ---- Clock -------------------------------------------------------------------
// The clock logic lives in core/clock.ts; this only repaints it and checks for
// a flag. 100 ms is enough to show tenths of a second under ten seconds.
let ticker: number | undefined;
function startTicker(): void {
  clearInterval(ticker);
  if (!match.clock) return;
  ticker = window.setInterval(() => {
    if (match.checkFlag()) {
      clearInterval(ticker);
      render();
      return;
    }
    renderClocks();
  }, 100);
}

function renderClocks(): void {
  const clock = match.clock;
  els.clockTop.hidden = els.clockBottom.hidden = !clock;
  if (!clock) return;
  const now = performance.now();
  const st = match.session.status();
  const human = match.options.humanColor;
  // The bottom strip is whoever sits at the bottom of the board.
  const bottomColor = view.flipped ? "b" : "w";
  const pairs: [HTMLElement, typeof human][] = [
    [els.clockBottom, bottomColor],
    [els.clockTop, bottomColor === "w" ? "b" : "w"],
  ];
  for (const [el, color] of pairs) {
    const ms = clock.remaining(color, now);
    el.textContent = formatClock(ms);
    el.classList.toggle("running", clock.runningColor === color && !st.over);
    el.classList.toggle("low", clock.runningColor === color && !st.over && ms < 20_000);
    el.classList.toggle("flagged", st.over && st.reason?.startsWith("timeout") === true && st.turn === color);
    el.setAttribute("aria-label", `${color === human ? "Your" : "Opponent's"} clock: ${formatClock(ms)}`);
  }
}

async function handleHumanMove(from: Square, to: Square): Promise<void> {
  let promotion: PromotionPiece | undefined;
  if (match.session.isPromotion(from, to)) {
    promotion = await askPromotion(match.options.humanColor);
    if (!promotion) return render();
  }
  if (!match.humanMove(from, to, promotion)) return render();
  render();
  await maybeOpponentMove();
}

async function maybeOpponentMove(): Promise<void> {
  if (match.isHumanTurn || match.isOpponentThinking || match.session.status().over) return;
  if (match.options.opponent instanceof Maia3Opponent && maiaState.state !== "ready") return; // resumes on "ready"
  const current = match;
  render();
  const started = performance.now();
  try {
    await current.opponentMove();
  } catch (err) {
    toast(`Opponent error: ${(err as Error).message}`);
  }
  // Keep a minimum "thinking" time so replies don't feel instant; purely cosmetic.
  const wait = 450 - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (current === match) render();
}

function askPromotion(color: Color): Promise<PromotionPiece | undefined> {
  const glyphs: Record<PromotionPiece, string> = { q: "♛", r: "♜", b: "♝", n: "♞" };
  const names: Record<PromotionPiece, string> = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" };
  const box = els.promo.querySelector(".promo-options")!;
  box.replaceChildren(
    ...(Object.keys(glyphs) as PromotionPiece[]).map((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.value = p;
      b.className = `piece ${color === "w" ? "white" : "black"}`;
      b.textContent = glyphs[p] + "\uFE0E";
      b.setAttribute("aria-label", names[p]);
      return b;
    }),
  );
  return new Promise((resolve) => {
    const onClick = (e: Event) => {
      const v = (e.target as HTMLElement).closest("button")?.value as PromotionPiece | undefined;
      if (v) els.promo.close(v);
    };
    box.addEventListener("click", onClick);
    els.promo.addEventListener(
      "close",
      () => {
        box.removeEventListener("click", onClick);
        resolve((els.promo.returnValue as PromotionPiece) || undefined);
        els.promo.returnValue = "";
      },
      { once: true },
    );
    els.promo.showModal();
  });
}

// ---- Rendering ---------------------------------------------------------------
function render(): void {
  syncOverlay();
  view.render();
  const s = match.session;
  const st = s.status();
  const o = match.options;
  const info = o.opponent.info;
  const style = STYLES[o.style?.id ?? "balanced"];

  els.opponentName.textContent = info.name;
  els.opponentMeta.textContent =
    `${o.targetElo} · ${style.name}${style.id !== "balanced" ? ` ${Math.round((o.style?.strength ?? 0) * 100)}%` : ""}` +
    ` · plays ${o.humanColor === "w" ? "Black" : "White"}`;
  els.opponentBadge.textContent = info.humanLike ? "Human-like model" : "Placeholder · not human-like";
  els.opponentBadge.classList.toggle("placeholder", !info.humanLike);
  els.youMeta.textContent = `${o.humanElo} · plays ${o.humanColor === "w" ? "White" : "Black"}`;

  if (st.over) {
    const winner = st.result === "1/2-1/2" ? "Draw" : st.result === "1-0" ? "White wins" : "Black wins";
    els.status.textContent = `${winner} · ${st.reason === "timeout" ? "on time" : st.reason}`;
  } else if (!match.isHumanTurn) {
    els.status.textContent = maiaState.state === "loading" && info.humanLike ? "Loading model…" : "Opponent is thinking…";
  } else {
    els.status.textContent = st.inCheck ? "Your move · you're in check" : "Your move";
  }

  // Move list as numbered pairs.
  const san = s.historySan;
  const rows: string[] = [];
  for (let i = 0; i < san.length; i += 2) {
    rows.push(`<li><span class="num">${i / 2 + 1}.</span><span>${san[i]}</span><span>${san[i + 1] ?? ""}</span></li>`);
  }
  els.moves.innerHTML = rows.join("") || `<li class="empty">No moves yet.</li>`;
  els.moves.scrollTop = els.moves.scrollHeight;

  renderDecision();
  renderOutcome();
  renderStyleReport();

  els.takeBack.disabled = !match.canTakeBack;
  els.takeBack.title = match.clock ? "Take-back is off in timed games" : "";
  renderClocks();
  els.resign.disabled = st.over || s.historyUci.length === 0;
  els.downloadLog.disabled = match.decisions.length === 0;
  els.pgnPreview.value = s.toPgn();
}

function renderDecision(): void {
  const d = match.decisions[match.decisions.length - 1];
  if (!d) {
    els.candidatesNote.textContent = "After the opponent moves, its top candidate moves and their probabilities appear here.";
    els.candidates.innerHTML = "";
    return;
  }
  const human = d.analysis
    ? ` · humans at ${d.targetElo} play this ${(d.analysis.baseProbability * 100).toFixed(0)}% of the time`
    : "";
  els.candidatesNote.textContent = `Played ${d.san}${human}`;
  els.candidates.innerHTML = d.candidates
    .map(
      (c) =>
        `<li class="${c.move === d.move ? "chosen" : ""}"><code>${c.move}</code><span class="bar" style="--p:${(
          c.probability * 100
        ).toFixed(1)}%"></span><span class="pct">${(c.probability * 100).toFixed(1)}%</span></li>`,
    )
    .join("");
}

function renderOutcome(): void {
  const d = [...match.decisions].reverse().find((x) => x.analysis?.value);
  els.outcome.classList.toggle("flipped", view.flipped);
  if (!d || !d.analysis?.value) {
    els.outcomeFill.style.height = "50%";
    els.outcomeLabel.textContent = "";
    els.outcome.setAttribute("aria-label", "No outcome estimate yet");
    els.outcome.title = "Maia-3's predicted outcome appears after its first move";
    return;
  }
  const v = d.analysis.value;
  const oppIsWhite = match.options.humanColor === "b";
  const white = oppIsWhite ? v.win + v.draw / 2 : v.loss + v.draw / 2;
  const pct = Math.round(white * 100);
  els.outcomeFill.style.height = `${pct}%`;
  els.outcomeLabel.textContent = String(pct);
  const label = `Maia-3 predicts White scores ${pct}% from here, for players at these ratings (not an engine evaluation)`;
  els.outcome.setAttribute("aria-label", label);
  els.outcome.title = label;
}

function renderStyleReport(): void {
  const r = match.styleReport();
  if (!r) {
    els.styleReport.innerHTML = `<p class="hint">${
      match.options.opponent.info.humanLike
        ? "Measured after the opponent's first move."
        : "Available for model-backed opponents only."
    }</p>`;
    return;
  }
  const isScore = (k: string) => k === "kingPressure" || k === "advance";
  const fmt = (k: string, x: number) => {
    const v = isScore(k) ? Number(x.toFixed(2)) : Math.round(x * 100);
    const body = isScore(k) ? Math.abs(v).toFixed(2) : `${Math.abs(v)}%`;
    return { v, text: (v < 0 ? "−" : "") + body };
  };
  const rows = FEATURE_KEYS.map((k) => {
    const sh = fmt(k, r.shift[k]);
    const cls = sh.v === 0 ? "" : sh.v > 0 ? "up" : "down";
    return `<tr><td>${FEATURE_LABELS[k]}</td><td>${fmt(k, r.played[k]).text}</td><td>${fmt(k, r.baseline[k]).text}</td><td class="${cls}">${sh.v > 0 ? "+" : ""}${sh.text}</td></tr>`;
  }).join("");
  els.styleReport.innerHTML = `
    <table class="report">
      <thead><tr><th>Feature</th><th>Played</th><th>Pure Maia</th><th>Shift</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="report-summary">
      <div class="metric"><div class="metric-value">${r.meanKl.toFixed(3)}</div><div class="metric-label">Style cost · mean KL (nats)</div></div>
      <div class="metric"><div class="metric-value">${(r.meanBaseProbability * 100).toFixed(0)}%</div><div class="metric-label">Avg. human probability of its moves</div></div>
    </div>
    <p class="hint" style="margin-top:10px">Over ${r.moves} opponent move${r.moves === 1 ? "" : "s"}. "Pure Maia" is what the unstyled model would have done on average in the same positions.</p>`;
}

// ---- Utilities ---------------------------------------------------------------
function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const clampNum = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

let toastTimer: number | undefined;
function toast(msg: string): void {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

const SETTINGS_KEY = "stylemate:settings:v1";
const LEGACY_SETTINGS_KEY = "human-chess:settings:v1";
const SETTING_IDS = ["engine", "color", "elo", "style", "strength", "human-elo", "time-control"] as const;
function saveSettings(): void {
  try {
    const data = Object.fromEntries(SETTING_IDS.map((id) => [id, ($(id) as HTMLInputElement).value]));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode / sandboxed preview) — settings just won't persist */
  }
}
function loadSettings(): void {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY) ?? "{}") as Record<string, string>;
    for (const id of SETTING_IDS) if (data[id] != null) ($(id) as HTMLInputElement).value = data[id];
  } catch {
    /* ignore */
  }
}

function syncLabels(): void {
  els.eloOut.textContent = els.elo.value;
  els.strengthOut.textContent = `${els.strength.value}%`;
  const st = STYLES[els.style.value as StyleId];
  els.styleDesc.textContent = st.description;
  const balanced = st.id === "balanced";
  els.strength.disabled = balanced || els.engine.value !== "maia3";
  els.style.disabled = els.engine.value !== "maia3";
}

// ---- Controls ----------------------------------------------------------------
els.newGame.addEventListener("click", startGame);
for (const el of [els.elo, els.strength]) el.addEventListener("input", syncLabels);
for (const el of [els.engine, els.style]) el.addEventListener("change", syncLabels);
for (const el of [els.engine, els.color, els.elo, els.style, els.strength, els.humanElo, els.timeControl]) {
  el.addEventListener("change", () => {
    saveSettings();
    // Changing settings mid-game would invalidate the game record; apply them to a fresh game
    // only if no moves have been made yet.
    if (match.session.historyUci.length === 0 || match.session.status().over) startGame();
    else toast("Settings saved — they apply to your next game");
  });
}
els.flip.addEventListener("click", () => {
  view.flipped = !view.flipped;
  render();
});
els.takeBack.addEventListener("click", () => {
  match.takeBack();
  view.clearSelection();
  render();
  void maybeOpponentMove();
});
els.resign.addEventListener("click", () => {
  match.resign();
  render();
});
els.downloadPgn.addEventListener("click", () => {
  download(`stylemate-${stamp()}.pgn`, match.session.toPgn(), "application/x-chess-pgn");
  toast("PGN downloaded");
});
els.copyPgn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(match.session.toPgn());
    toast("PGN copied");
  } catch {
    els.pgnPreview.select();
    toast("Clipboard unavailable — PGN selected, press Ctrl/Cmd+C");
  }
});
els.downloadLog.addEventListener("click", () => {
  download(`stylemate-decisions-${stamp()}.jsonl`, match.decisionsJsonl(), "application/jsonl");
  toast("Decision log downloaded");
});
els.aboutBtn.addEventListener("click", () => els.about.showModal());

loadSettings();
syncLabels();
startGame();

// Handy for debugging from the browser console.
(window as unknown as { __match: () => Match }).__match = () => match;
