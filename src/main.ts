import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./style.css";

import { FPS, LAST_FRAME, TOTAL_FRAMES, timecode } from "./engine/math";
import { renderFrame } from "./scene/render";
import { CHAPTERS, chapterAt } from "./scene/storyboard";

declare global {
  interface Window {
    __hsm?: { ready: boolean; render: (f: number) => void; hero: () => void; total: number };
  }
}

const params = new URLSearchParams(location.search);
const renderMode = params.has("render") || params.has("hero");

const canvas = document.getElementById("view") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadFonts() {
  const faces = [
    '400 20px "Space Grotesk"',
    '500 20px "Space Grotesk"',
    '600 20px "Space Grotesk"',
    '700 20px "Space Grotesk"',
    '500 20px "JetBrains Mono"',
    '600 20px "JetBrains Mono"',
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f, "HSM σ ‖ ✓ → ←")));
}

let frame = clamp(Number(params.get("f") ?? 0));
let playing = false;
let last = 0;
let acc = 0;

function clamp(n: number) {
  return Math.max(0, Math.min(LAST_FRAME, Number.isFinite(n) ? Math.round(n) : 0));
}

function draw() {
  renderFrame(ctx, frame);
  if (renderMode) return;
  ($("scrub") as HTMLInputElement).value = String(frame);
  $("tc").textContent = `${timecode(frame)} · f ${String(frame).padStart(4, "0")}`;
  const ch = chapterAt(frame);
  document.querySelectorAll<HTMLButtonElement>(".chapters button").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.n) === ch.n);
  });
}

function setPlaying(p: boolean) {
  playing = p;
  const btn = $("play");
  btn.textContent = p ? "❚❚" : "▶";
  btn.setAttribute("aria-label", p ? "Pause" : "Play");
  if (p) {
    if (frame >= LAST_FRAME) frame = 0;
    last = performance.now();
    acc = 0;
    requestAnimationFrame(tick);
  }
}

function tick(now: number) {
  if (!playing) return;
  acc += (now - last) / 1000;
  last = now;
  const step = Math.floor(acc * FPS);
  if (step > 0) {
    acc -= step / FPS;
    frame += step;
    if (frame > LAST_FRAME) {
      if (($("loop") as HTMLInputElement).checked) frame %= TOTAL_FRAMES;
      else {
        frame = LAST_FRAME;
        draw();
        setPlaying(false);
        return;
      }
    }
    draw();
  }
  requestAnimationFrame(tick);
}

function seek(f: number) {
  frame = clamp(f);
  draw();
}

function buildUi() {
  const ticks = $("ticks");
  const list = $("chapters");
  for (const c of CHAPTERS) {
    const t = document.createElement("span");
    t.style.left = `${(c.start / LAST_FRAME) * 100}%`;
    ticks.appendChild(t);
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.dataset.n = String(c.n);
    b.innerHTML = `<span class="n">0${c.n}</span><span class="t">${c.title}</span><span class="r">f ${c.start}–${c.end} · ${(c.start / FPS).toFixed(0)}–${((c.end + 1) / FPS).toFixed(0)}s</span>`;
    b.addEventListener("click", () => {
      seek(c.start);
    });
    li.appendChild(b);
    list.appendChild(li);
  }

  $("play").addEventListener("click", () => setPlaying(!playing));
  $("back").addEventListener("click", () => {
    setPlaying(false);
    seek(frame - 1);
  });
  $("fwd").addEventListener("click", () => {
    setPlaying(false);
    seek(frame + 1);
  });
  const scrub = $("scrub") as HTMLInputElement;
  scrub.addEventListener("input", () => {
    setPlaying(false);
    seek(Number(scrub.value));
  });

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
    if (e.code === "Space") {
      e.preventDefault();
      setPlaying(!playing);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPlaying(false);
      seek(frame + (e.shiftKey ? 30 : 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPlaying(false);
      seek(frame - (e.shiftKey ? 30 : 1));
    } else if (e.key === "Home") seek(0);
    else if (e.key === "End") seek(LAST_FRAME);
    else if (/^[1-5]$/.test(e.key)) seek(CHAPTERS[Number(e.key) - 1].start);
  });

  // Hide the download link if the rendered video was not shipped with this build.
  fetch("media/hsm-explainer-Cursor.mp4", { method: "HEAD" })
    .then((r) => {
      if (!r.ok) $("dl-video").remove();
    })
    .catch(() => $("dl-video").remove());
}

async function boot() {
  if (renderMode) document.body.classList.add("render");
  await loadFonts();
  $("loading").classList.add("hidden");

  if (renderMode) {
    window.__hsm = {
      ready: true,
      total: TOTAL_FRAMES,
      render: (f: number) => renderFrame(ctx, f),
      hero: () => renderFrame(ctx, 0, { hero: true }),
    };
    if (params.has("hero")) renderFrame(ctx, 0, { hero: true });
    else draw();
    return;
  }

  buildUi();
  draw();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && !params.has("f")) setPlaying(true);
}

boot();
