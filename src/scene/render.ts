import { makeProjector, sampleCamera, type Projector } from "../engine/camera";
import {
  LAST_FRAME,
  clamp,
  easeInOutSine,
  easeOutCubic,
  hash,
  lerp,
  prog,
  timecode,
  v3,
  win,
  type Vec3,
} from "../engine/math";
import { CHASSIS, COMPONENTS, PATHS, byId, type Component, type ComponentId } from "./model";
import { CAMERA, CAPTIONS, CHAPTERS, T, chapterAt } from "./storyboard";

export const W = 1920;
export const H = 1080;

export const C = {
  stage: "#0B1019",
  material: "#344257",
  cyan: "#00E5FF",
  gold: "#FFD166",
  violet: "#9D4EDD",
  ink: "#E6EDF5",
  mute: "#8A9AB2",
  dim: "#5A6A82",
  line: "rgba(200,214,232,0.22)",
};

const FONT = {
  display: (px: number, w = 600) => `${w} ${px}px "Space Grotesk", system-ui, sans-serif`,
  mono: (px: number, w = 500) => `${w} ${px}px "JetBrains Mono", ui-monospace, monospace`,
};

type Ctx = CanvasRenderingContext2D;

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(clamp(c * k, 0, 255)).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/* ------------------------------------------------------------------ focus & roles */

const ROLE: Record<ComponentId, string> = {
  host: C.ink,
  verifier: C.ink,
  io: C.cyan,
  policy: C.violet,
  entropy: C.cyan,
  drbg: C.cyan,
  keystore: C.violet,
  engine: C.cyan,
  audit: C.violet,
  tamper: C.gold,
  power: C.gold,
};

const ALL = COMPONENTS.map((c) => c.id);
const FOCUS: ComponentId[][] = [
  ALL,
  ["entropy", "drbg", "engine", "keystore"],
  ["host", "io", "policy", "engine", "audit"],
  ["keystore", "engine", "io", "host", "power", "audit"],
  ALL,
];

function focusOf(id: ComponentId, f: number) {
  const idx = CHAPTERS.findIndex((c) => f >= c.start && f <= c.end);
  const cur = FOCUS[idx].includes(id) ? 1 : 0.22;
  if (idx === 0) return cur;
  const prev = FOCUS[idx - 1].includes(id) ? 1 : 0.22;
  return lerp(prev, cur, easeInOutSine(prog(f, CHAPTERS[idx].start, CHAPTERS[idx].start + 22)));
}

/* ------------------------------------------------------------------ geometry */

interface Face {
  pts: Vec3[];
  normal: Vec3;
}

function boxFaces(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Face[] {
  const P = (x: number, y: number, z: number): Vec3 => [x, y, z];
  return [
    { normal: [0, 1, 0], pts: [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)] },
    { normal: [0, 0, 1], pts: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)] },
    { normal: [0, 0, -1], pts: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)] },
    { normal: [1, 0, 0], pts: [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)] },
    { normal: [-1, 0, 0], pts: [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)] },
  ];
}

const LIGHT = v3.norm([-0.35, 1, 0.55]);

function polyPath(ctx: Ctx, proj: Projector, pts: Vec3[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = proj.project(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

function hatch(ctx: Ctx, proj: Projector, pts: Vec3[], color: string, gap: number, alpha: number) {
  ctx.save();
  polyPath(ctx, proj, pts);
  ctx.clip();
  const s = pts.map((p) => proj.project(p));
  const minX = Math.min(...s.map((q) => q.x)) - 400;
  const maxX = Math.max(...s.map((q) => q.x)) + 400;
  const minY = Math.min(...s.map((q) => q.y));
  const maxY = Math.max(...s.map((q) => q.y));
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = minX; x < maxX; x += gap) {
    ctx.moveTo(x, maxY);
    ctx.lineTo(x + (maxY - minY), minY);
  }
  ctx.stroke();
  ctx.restore();
}

interface SolidOpts {
  alpha: number;
  base: string;
  edge?: string;
  edgeAlpha?: number;
  hatchTop?: { color: string; gap: number; alpha: number };
  hatchSides?: { color: string; gap: number; alpha: number };
}

function drawSolid(ctx: Ctx, proj: Projector, faces: Face[], o: SolidOpts) {
  if (o.alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  for (const face of faces) {
    const c = face.pts.reduce((a, p) => v3.add(a, v3.scale(p, 0.25)), [0, 0, 0] as Vec3);
    if (v3.dot(face.normal, v3.sub(proj.eye, c)) <= 0) continue;
    const lum = 0.62 + 0.5 * Math.max(0, v3.dot(face.normal, LIGHT));
    polyPath(ctx, proj, face.pts);
    ctx.fillStyle = shade(o.base, lum);
    ctx.fill();
    ctx.strokeStyle = rgba(o.edge ?? "#C8D6E8", o.edgeAlpha ?? 0.16);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    const isTop = face.normal[1] === 1;
    if (isTop && o.hatchTop) hatch(ctx, proj, face.pts, o.hatchTop.color, o.hatchTop.gap, o.hatchTop.alpha);
    if (!isTop && o.hatchSides) hatch(ctx, proj, face.pts, o.hatchSides.color, o.hatchSides.gap, o.hatchSides.alpha);
  }
  ctx.restore();
}

function componentFaces(c: Component, hScale: number) {
  return boxFaces(c.x - c.w / 2, c.x + c.w / 2, 0, Math.max(0.02, c.h * hScale), c.z - c.d / 2, c.z + c.d / 2);
}

function topCenter(c: Component, hScale = 1): Vec3 {
  return [c.x, c.h * hScale, c.z];
}

/* ------------------------------------------------------------------ overlays */

function pathLength(pts: Vec3[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += v3.dist(pts[i - 1], pts[i]);
  return L;
}

function pointAt(pts: Vec3[], t: number): Vec3 {
  const L = pathLength(pts) * clamp(t);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = v3.dist(pts[i - 1], pts[i]);
    if (acc + seg >= L) return v3.lerp(pts[i - 1], pts[i], seg === 0 ? 0 : (L - acc) / seg);
    acc += seg;
  }
  return pts[pts.length - 1];
}

function subPath(pts: Vec3[], t: number): Vec3[] {
  if (t >= 1) return pts;
  const L = pathLength(pts) * clamp(t);
  const out: Vec3[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = v3.dist(pts[i - 1], pts[i]);
    if (acc + seg >= L) {
      out.push(v3.lerp(pts[i - 1], pts[i], seg === 0 ? 0 : (L - acc) / seg));
      return out;
    }
    out.push(pts[i]);
    acc += seg;
  }
  return out;
}

type Kind = "input" | "output" | "control" | "energy" | "actuation";

interface TraceOpts {
  kind: Kind;
  alpha: number;
  reveal?: number;
  f: number;
  width?: number;
}

const KIND_COLOR: Record<Kind, string> = {
  input: C.cyan,
  output: C.cyan,
  control: C.violet,
  energy: C.gold,
  actuation: C.gold,
};

function strokeProjected(ctx: Ctx, proj: Projector, pts: Vec3[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = proj.project(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
}

function trace(ctx: Ctx, proj: Projector, pts: Vec3[], o: TraceOpts) {
  if (o.alpha <= 0.001) return;
  const shown = subPath(pts, o.reveal ?? 1);
  if (shown.length < 2) return;
  const col = KIND_COLOR[o.kind];
  const w = o.width ?? 3;
  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Under-stroke keeps overlays legible over geometry.
  strokeProjected(ctx, proj, shown);
  ctx.strokeStyle = "rgba(11,16,25,0.85)";
  ctx.lineWidth = w + 5;
  ctx.setLineDash([]);
  ctx.stroke();

  strokeProjected(ctx, proj, shown);
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  if (o.kind === "control") ctx.setLineDash([10, 8]);
  else if (o.kind === "energy") {
    ctx.setLineDash([2, 9]);
    ctx.lineDashOffset = -o.f * 0.9;
    ctx.lineWidth = w + 1.5;
  } else if (o.kind === "actuation") ctx.setLineDash([14, 6, 2, 6]);
  else if (o.kind === "output") {
    ctx.lineWidth = w + 3;
    ctx.stroke();
    strokeProjected(ctx, proj, shown);
    ctx.strokeStyle = C.stage;
    ctx.lineWidth = Math.max(1, w - 1.2);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Direction chevrons on input/output lanes.
  if ((o.kind === "input" || o.kind === "output") && (o.reveal ?? 1) >= 1) {
    const n = Math.max(2, Math.round(pathLength(pts) / 3));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const a = proj.project(pointAt(pts, t - 0.01));
      const b = proj.project(pointAt(pts, t + 0.01));
      chevron(ctx, b.x, b.y, Math.atan2(b.y - a.y, b.x - a.x), col, o.kind === "output");
    }
  }
  ctx.restore();
}

function chevron(ctx: Ctx, x: number, y: number, ang: number, col: string, hollow: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(-5, -5);
  ctx.lineTo(3, 0);
  ctx.lineTo(-5, 5);
  ctx.strokeStyle = hollow ? C.ink : col;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function packet(
  ctx: Ctx,
  proj: Projector,
  pts: Vec3[],
  t: number,
  color: string,
  alpha: number,
  text?: string,
  shape: "dot" | "key" | "token" = "dot",
) {
  if (alpha <= 0.001) return;
  const s = proj.project(pointAt(pts, easeInOutSine(clamp(t))));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  if (shape === "dot") {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "token") {
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 9);
    ctx.lineTo(s.x + 9, s.y);
    ctx.lineTo(s.x, s.y + 9);
    ctx.lineTo(s.x - 9, s.y);
    ctx.closePath();
    ctx.fill();
  } else {
    keyGlyph(ctx, s.x, s.y, color, 1);
  }
  ctx.shadowBlur = 0;
  if (text) chip(ctx, s.x + 14, s.y - 30, text, color);
  ctx.restore();
}

function keyGlyph(ctx: Ctx, x: number, y: number, color: string, k: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-6, 0, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14, 0);
  ctx.moveTo(10, 0);
  ctx.lineTo(10, 5);
  ctx.moveTo(14, 0);
  ctx.lineTo(14, 6);
  ctx.stroke();
  ctx.restore();
}

function chip(ctx: Ctx, x: number, y: number, text: string, color: string, size = 15) {
  ctx.save();
  ctx.font = FONT.mono(size, 600);
  const w = ctx.measureText(text).width + 18;
  const h = size + 12;
  ctx.fillStyle = "rgba(11,16,25,0.92)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 9, y + h / 2 + 1);
  ctx.restore();
  return w;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(
  ctx: Ctx,
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  title: string,
  sub: string | null,
  color: string,
  alpha: number,
  scale = 1,
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const tSize = 20 * scale;
  const sSize = 13.5 * scale;
  ctx.font = FONT.display(tSize, 600);
  const tw = ctx.measureText(title).width;
  ctx.font = FONT.mono(sSize, 500);
  const sw = sub ? ctx.measureText(sub).width : 0;
  const bw = Math.max(tw, sw) + 24 * scale;
  const bh = (sub ? 54 : 34) * scale;
  const bx = dx >= 0 ? ax + dx : ax + dx - bw;
  const by = ay + dy - bh / 2;
  const lx = dx >= 0 ? bx : bx + bw;

  ctx.strokeStyle = rgba(color, 0.75);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(lx, ay + dy);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(11,16,25,0.88)";
  roundRect(ctx, bx, by, bw, bh, 7 * scale);
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.55);
  ctx.stroke();
  ctx.fillStyle = rgba(color, 0.9);
  ctx.fillRect(dx >= 0 ? bx : bx + bw - 3, by + 6, 3, bh - 12);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.ink;
  ctx.font = FONT.display(tSize, 600);
  ctx.fillText(title, bx + 12 * scale, by + (sub ? 24 : 23) * scale);
  if (sub) {
    ctx.fillStyle = C.mute;
    ctx.font = FONT.mono(sSize, 500);
    ctx.fillText(sub, bx + 12 * scale, by + 44 * scale);
  }
  ctx.restore();
}

interface PanelLine {
  text: string;
  color?: string;
  mono?: boolean;
  size?: number;
  alpha?: number;
  gap?: number;
}

function panel(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  kicker: string,
  title: string,
  lines: PanelLine[],
  accent: string,
  alpha: number,
) {
  if (alpha <= 0.01) return 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  const pad = 22;
  let h = pad + 18 + 34;
  for (const l of lines) h += (l.size ?? 17) + (l.gap ?? 11);
  h += pad - 6;
  const yy = y + (1 - easeOutCubic(alpha)) * 18;

  ctx.fillStyle = "rgba(16,22,34,0.9)";
  roundRect(ctx, x, yy, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.45);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(x + pad, yy + 16, 26, 3);

  ctx.fillStyle = rgba(accent, 0.95);
  ctx.font = FONT.mono(12.5, 600);
  ctx.fillText(kicker.toUpperCase(), x + pad + 36, yy + 22);
  ctx.fillStyle = C.ink;
  ctx.font = FONT.display(23, 600);
  ctx.fillText(title, x + pad, yy + 58);

  let cy = yy + 58 + 10;
  for (const l of lines) {
    const sz = l.size ?? 17;
    cy += sz + (l.gap ?? 11);
    ctx.globalAlpha = alpha * (l.alpha ?? 1);
    ctx.fillStyle = l.color ?? C.ink;
    ctx.font = l.mono ? FONT.mono(sz - 1, 500) : FONT.display(sz, 400);
    ctx.fillText(l.text, x + pad, cy - 4);
  }
  ctx.restore();
  return h;
}

/* ------------------------------------------------------------------ scene */

export interface RenderOptions {
  hero?: boolean;
}

export function renderFrame(ctx: Ctx, frame: number, opts: RenderOptions = {}) {
  const f = clamp(Math.round(frame), 0, LAST_FRAME);
  const hero = !!opts.hero;
  const cam = hero
    ? { target: [-1.5, 0, 0] as Vec3, yaw: 0.5, pitch: 0.82, dist: 40, fovDeg: 34, shiftX: 330, shiftY: 70 }
    : sampleCamera(CAMERA, f);
  const proj = makeProjector(cam, W, H);
  // Hero is a composed still: everything in its resolved state.
  const F = hero ? 1000 : f;

  drawStage(ctx, proj);

  /* ---- chassis ---- */
  const rise = (i: number) => (hero ? 1 : easeOutCubic(prog(F, T.componentsRise[0] + i * 3, T.componentsRise[0] + i * 3 + 22)));
  const lidA = hero ? 0 : 1 - prog(F, T.lidFade[0], T.lidFade[1]);
  const lidLift = hero ? 1 : easeInOutSine(prog(F, T.lidFade[0], T.lidFade[1]));
  const cut = hero ? 1 : easeInOutSine(prog(F, T.sectionCut[0], T.sectionCut[1]));
  const chassisIn = hero ? 1 : easeOutCubic(prog(F, 0, 26));
  const wallH = CHASSIS.h * chassisIn;
  const nearH = lerp(wallH, 0.55, cut);
  const t = 0.28;
  const { x0, x1, z0, z1 } = CHASSIS;
  const sectionHatch = cut > 0.05 ? { color: C.ink, gap: 7, alpha: 0.28 * cut } : undefined;
  const envelopeHatch = { color: C.ink, gap: 12, alpha: 0.06 };

  const farWalls: Face[][] = [boxFaces(x0, x1, 0, wallH, z0 - t, z0), boxFaces(x0 - t, x0, 0, wallH, z0, z1)];
  const nearWalls: Face[][] = [boxFaces(x0 - t, x1 + t, 0, nearH, z1, z1 + t), boxFaces(x1, x1 + t, 0, nearH, z0 - t, z1)];
  const ports: Face[][] = [
    boxFaces(x0 - 1.0, x0 - t, 0, 0.9 * chassisIn, -2.6, 2.4),
    boxFaces(x0 - 0.9, x0 - t, 0, 0.7 * chassisIn, 4.4, 5.6),
  ];

  // Outside parties are drawn first; they sit behind the far-left wall from this camera.
  const outside = COMPONENTS.filter((c) => c.outside);
  const inside = COMPONENTS.filter((c) => !c.outside).sort(
    (a, b) => proj.depth(topCenter(b)) - proj.depth(topCenter(a)),
  );

  outside.forEach((c, i) => {
    const a = (c.id === "verifier" ? win(F, 760, Infinity, 30) : 1) * focusOf(c.id, F);
    drawSolid(ctx, proj, componentFaces(c, rise(i)), { alpha: a, base: shade(C.material, 0.9) });
  });

  farWalls.forEach((fw) => drawSolid(ctx, proj, fw, { alpha: chassisIn, base: shade(C.material, 0.75), hatchSides: envelopeHatch }));
  ports.forEach((p) => drawSolid(ctx, proj, p, { alpha: chassisIn, base: C.material }));

  drawBoard(ctx, proj, chassisIn);

  inside.forEach((c, i) => {
    const a = focusOf(c.id, F);
    const glow = !hero && f >= 150 && f < 750 && a > 0.9;
    drawSolid(ctx, proj, componentFaces(c, rise(i + 2)), {
      alpha: chassisIn * (0.35 + 0.65 * a),
      base: C.material,
      edge: glow ? ROLE[c.id] : undefined,
      edgeAlpha: glow ? 0.85 : 0.18,
    });
  });

  nearWalls.forEach((nw) =>
    drawSolid(ctx, proj, nw, {
      alpha: chassisIn * lerp(1, 0.92, cut),
      base: shade(C.material, 0.85),
      hatchTop: sectionHatch,
      hatchSides: envelopeHatch,
    }),
  );

  // Lid, lifting away during the reveal.
  if (lidA > 0.01) {
    const ly = wallH + 0.02 + lidLift * 2.2;
    drawSolid(ctx, proj, boxFaces(x0 - t, x1 + t, ly, ly + 0.22, z0 - t, z1 + t), {
      alpha: lidA * 0.96 * chassisIn,
      base: shade(C.material, 1.05),
      edgeAlpha: 0.3,
    });
  }

  /* ---- boundary ---- */
  drawBoundary(ctx, proj, F, hero);

  /* ---- energy, always-on once powered ---- */
  const powerA = hero ? 0.9 : win(F, T.powerOn, Infinity, 24);
  trace(ctx, proj, PATHS.powerIn, { kind: "energy", alpha: powerA * focusMix(F, ["power"]), f: F });
  const signing = !hero && F >= T.signRing[0] && F <= T.signRing[1];
  trace(ctx, proj, PATHS.powerBus, { kind: "energy", alpha: powerA * focusMix(F, ["power", "engine"]), f: F * (signing ? 2.4 : 1), width: signing ? 4 : 3 });
  trace(ctx, proj, PATHS.zeroize, { kind: "actuation", alpha: (hero ? 0.9 : Math.max(win(F, 100, 150, 16, 16), win(F, 780, Infinity, 30))) * 0.9, f: F, width: 2.5 });

  if (hero) {
    drawHeroOverlays(ctx, proj);
    drawLabels(ctx, proj, F, true);
    drawHeroTitle(ctx);
    return;
  }

  drawChapterOverlays(ctx, proj, f);
  drawLabels(ctx, proj, f, false);
  drawInsets(ctx, proj, f);
  drawHud(ctx, f);
}

function focusMix(f: number, ids: ComponentId[]) {
  return Math.max(...ids.map((id) => focusOf(id, f)));
}

function drawStage(ctx: Ctx, proj: Projector) {
  ctx.fillStyle = C.stage;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.45, H * 0.45, 100, W * 0.5, H * 0.5, W * 0.75);
  g.addColorStop(0, "rgba(40,56,82,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.strokeStyle = "rgba(160,180,210,0.05)";
  ctx.lineWidth = 1;
  for (let x = -30; x <= 20; x += 2) strokeLine3(ctx, proj, [x, -0.02, -14], [x, -0.02, 14]);
  for (let z = -14; z <= 14; z += 2) strokeLine3(ctx, proj, [-30, -0.02, z], [20, -0.02, z]);
  ctx.restore();
}

function strokeLine3(ctx: Ctx, proj: Projector, a: Vec3, b: Vec3) {
  const p = proj.project(a);
  const q = proj.project(b);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
}

function drawBoard(ctx: Ctx, proj: Projector, a: number) {
  const { x0, x1, z0, z1 } = CHASSIS;
  ctx.save();
  ctx.globalAlpha = a;
  polyPath(ctx, proj, [
    [x0, 0.01, z0],
    [x1, 0.01, z0],
    [x1, 0.01, z1],
    [x0, 0.01, z1],
  ]);
  ctx.fillStyle = "#141C2A";
  ctx.fill();
  ctx.strokeStyle = "rgba(160,180,210,0.07)";
  for (let x = Math.ceil(x0); x <= x1; x += 1) strokeLine3(ctx, proj, [x, 0.02, z0], [x, 0.02, z1]);
  for (let z = Math.ceil(z0); z <= z1; z += 1) strokeLine3(ctx, proj, [x0, 0.02, z], [x1, 0.02, z]);
  ctx.restore();
}

function drawBoundary(ctx: Ctx, proj: Projector, f: number, hero: boolean) {
  const { x0, x1, z0, z1 } = CHASSIS;
  const o = 0.55;
  const r = hero ? 1 : easeInOutSine(prog(f, T.boundaryDraw[0], T.boundaryDraw[1]));
  const ring: Vec3[] = [
    [x0 - o, 0.04, z0 - o],
    [x1 + o, 0.04, z0 - o],
    [x1 + o, 0.04, z1 + o],
    [x0 - o, 0.04, z1 + o],
    [x0 - o, 0.04, z0 - o],
  ];
  const pulse = hero ? 1 : 0.75 + 0.25 * Math.sin(f / 9);
  ctx.save();
  ctx.globalAlpha = 0.9 * pulse;
  strokeProjected(ctx, proj, subPath(ring, r));
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 10]);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ labels */

interface LabelSpec {
  id: ComponentId;
  dx: number;
  dy: number;
}

const LABEL_POS: Record<ComponentId, [number, number]> = {
  host: [-30, 150],
  verifier: [-30, 110],
  io: [-50, -170],
  policy: [-40, -150],
  entropy: [-50, -120],
  drbg: [50, -130],
  keystore: [70, -120],
  engine: [70, -150],
  audit: [-60, 110],
  tamper: [60, 110],
  power: [-60, 110],
};

/** Overview positions are tuned separately so dense wide shots don't collide. */
const OVERVIEW_POS: Partial<Record<ComponentId, [number, number]>> = {
  policy: [-30, -60],
  entropy: [-10, -110],
  drbg: [30, -70],
  verifier: [-30, 170],
};

function labelWindows(f: number): { ids: ComponentId[]; a: number; sub: boolean }[] {
  return [
    { ids: ["host", "io", "policy", "keystore", "engine", "audit"], a: win(f, 112, 156, 16, 12), sub: false },
    { ids: ["entropy", "drbg", "engine", "keystore"], a: win(f, 168, 300, 16, 14), sub: true },
    { ids: ["host"], a: win(f, 304, 400, 14, 14), sub: true },
    { ids: ["io"], a: win(f, 340, 430, 14, 14), sub: true },
    { ids: ["policy"], a: win(f, 384, 512, 14, 14), sub: true },
    { ids: ["engine"], a: win(f, 468, 512, 14, 14), sub: true },
    { ids: ["keystore", "engine"], a: win(f, 520, 650, 14, 14), sub: true },
    { ids: ["io", "host"], a: win(f, 660, 752, 14, 14), sub: true },
    { ids: ["host", "verifier", "io", "policy", "entropy", "drbg", "keystore", "engine", "audit", "tamper", "power"], a: win(f, 846, Infinity, 24), sub: false },
  ];
}

function drawLabels(ctx: Ctx, proj: Projector, f: number, hero: boolean) {
  const seen = new Map<ComponentId, { a: number; sub: boolean }>();
  const windows = hero
    ? [{ ids: COMPONENTS.map((c) => c.id).filter((id) => id !== "verifier" && id !== "host"), a: 1, sub: false }]
    : labelWindows(f);
  for (const w of windows) {
    for (const id of w.ids) {
      const prev = seen.get(id);
      if (!prev || w.a > prev.a) seen.set(id, { a: w.a, sub: w.sub });
    }
  }
  const overview = hero || f >= 846 || f < 160;
  const specs: LabelSpec[] = [...seen.keys()].map((id) => {
    const [dx, dy] = (overview && OVERVIEW_POS[id]) || LABEL_POS[id];
    return { id, dx, dy };
  });
  for (const s of specs) {
    const st = seen.get(s.id)!;
    if (st.a <= 0.01) continue;
    const c = byId[s.id];
    const a = proj.project(topCenter(c));
    const k = overview ? 0.5 : 1;
    label(ctx, a.x, a.y, s.dx * k, s.dy * k, c.name, st.sub ? c.sub : null, ROLE[s.id], st.a, overview ? 0.82 : 1);
  }
}

/* ------------------------------------------------------------------ chapter overlays */

function ringOnTop(ctx: Ctx, proj: Projector, c: Component, r: number, t: number, color: string, alpha: number, f: number) {
  if (alpha <= 0.01) return;
  const pts: Vec3[] = [];
  const n = 64;
  const start = f / 14;
  for (let i = 0; i <= n * t; i++) {
    const a = start + (i / n) * Math.PI * 2;
    pts.push([c.x + Math.cos(a) * r, c.h + 0.06, c.z + Math.sin(a) * r * 0.8]);
  }
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  strokeProjected(ctx, proj, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawChapterOverlays(ctx: Ctx, proj: Projector, f: number) {
  const deferred: (() => void)[] = [];
  /* 1 · boundary annotation */
  const bA = win(f, 40, 112, 16, 14);
  if (bA > 0) {
    const a = proj.project([CHASSIS.x1 + 0.55, 0.04, CHASSIS.z1 + 0.55]);
    label(ctx, a.x, a.y, 60, 40, "Cryptographic boundary", "every secret stays inside this perimeter", C.ink, bA);
    const e = proj.project([CHASSIS.x0, CHASSIS.h * 0.7, CHASSIS.z0 + 2]);
    label(ctx, e.x, e.y, 70, -70, "Tamper-sensing envelope", "conceptual · design-specific", C.ink, bA);
  }
  const zA = win(f, 112, 150, 12, 10);
  if (zA > 0) {
    const z = proj.project(pointAt(PATHS.zeroize, 0.5));
    label(ctx, z.x, z.y, 70, 30, "Zeroize on tamper", "actuation path · design-dependent", C.gold, zA);
  }

  /* 2 · key generation */
  if (f >= 150 && f < 320) {
    const fade = 1 - prog(f, 300, 320);
    const ent = byId.entropy;
    const nA = win(f, T.entropyNoise[0], T.entropyNoise[1], 10, 14) * fade;
    if (nA > 0) {
      ctx.save();
      ctx.globalAlpha = nA;
      ctx.font = FONT.mono(15, 600);
      ctx.fillStyle = C.cyan;
      const step = Math.floor(f / 3);
      for (let i = 0; i < 12; i++) {
        const gx = ent.x - ent.w / 2 + 0.35 + (i % 6) * 0.35;
        const gz = ent.z - 0.35 + Math.floor(i / 6) * 0.7;
        const s = proj.project([gx, ent.h + 0.05, gz]);
        ctx.globalAlpha = nA * (0.45 + 0.55 * hash(step * 13 + i));
        ctx.fillText(hash(step * 7 + i * 3) > 0.5 ? "1" : "0", s.x - 4, s.y + 5);
      }
      ctx.restore();
    }
    trace(ctx, proj, PATHS.entropyToDrbg, { kind: "input", alpha: win(f, 176, 320, 10, 20), reveal: prog(f, 176, 190), f });
    for (let i = 0; i < 5; i++) {
      const s0 = T.entropyStream[0] + i * 9;
      packet(ctx, proj, PATHS.entropyToDrbg, prog(f, s0, s0 + 16), C.cyan, win(f, s0, s0 + 16, 3, 3), i === 0 ? "raw entropy" : undefined);
    }
    trace(ctx, proj, PATHS.drbgToEngine, { kind: "input", alpha: win(f, T.drbgOut[0] - 6, 320, 10, 20), reveal: prog(f, T.drbgOut[0] - 6, T.drbgOut[0] + 8), f });
    packet(ctx, proj, PATHS.drbgToEngine, prog(f, T.drbgOut[0], T.drbgOut[1]), C.cyan, win(f, T.drbgOut[0], T.drbgOut[1], 4, 4), "random bits");
    ringOnTop(ctx, proj, byId.engine, 1.3, prog(f, T.keygenRing[0], T.keygenRing[1]), C.cyan, win(f, T.keygenRing[0], T.keygenRing[1] + 8, 4, 8), f);
    trace(ctx, proj, PATHS.engineToKeystore, { kind: "input", alpha: win(f, T.keyStore[0] - 4, 320, 10, 20), reveal: prog(f, T.keyStore[0] - 4, T.keyStore[0] + 8), f });
    packet(ctx, proj, PATHS.engineToKeystore, prog(f, T.keyStore[0], T.keyStore[1]), C.violet, win(f, T.keyStore[0], T.keyStore[1], 4, 4), "key pair K1", "key");
    const ks = byId.keystore;
    const kA = win(f, T.keyStore[1] - 2, 320, 8, 20);
    if (kA > 0) {
      const s = proj.project(topCenter(ks));
      ctx.save();
      ctx.globalAlpha = kA;
      ctx.shadowColor = C.violet;
      ctx.shadowBlur = 16;
      keyGlyph(ctx, s.x - 6, s.y + 2, C.violet, 1.3);
      ctx.restore();
    }
  }

  /* 3 · authorize */
  if (f >= 300 && f < 760) {
    const lanes = win(f, 312, 760, 16, 20);
    trace(ctx, proj, PATHS.reqIn, { kind: "input", alpha: lanes, reveal: prog(f, 312, 340), f });
    trace(ctx, proj, PATHS.respOut, { kind: "output", alpha: lanes * (f < T.respTravel[0] ? 0.35 : 1), reveal: prog(f, 322, 350), f });
    if (f < 520) {
      const laneA = win(f, 350, 520, 14, 14);
      const a = proj.project(pointAt(PATHS.reqIn, 0.18));
      const b = proj.project(pointAt(PATHS.respOut, 0.86));
      if (laneA > 0) {
        chip(ctx, a.x - 60, a.y - 56, "INPUT LANE", C.cyan, 13);
        ctx.globalAlpha = 1;
        chip(ctx, b.x - 60, b.y + 18, "OUTPUT LANE (idle)", C.mute, 13);
      }
    }

    const hostC = byId.host;
    const fA = win(f, T.reqForm[0], T.reqTravel[0] + 4, 10, 4);
    if (fA > 0) {
      const s = proj.project(topCenter(hostC));
      ctx.save();
      ctx.globalAlpha = fA;
      chip(ctx, s.x + 20, s.y - 70, "SIGN(handle K1, H(m))", C.cyan);
      chip(ctx, s.x + 20, s.y - 34, "+ credential", C.violet);
      ctx.restore();
    }
    packet(ctx, proj, PATHS.reqIn, prog(f, T.reqTravel[0], T.reqTravel[1]), C.cyan, win(f, T.reqTravel[0], T.reqTravel[1] + 6, 4, 6), "SIGN · K1 · H(m) · cred");

    // Policy: authorization checks.
    const pol = byId.policy;
    const ps = proj.project(topCenter(pol));
    const checks = [
      "session authenticated",
      "role permits SIGN",
      "K1 usage includes sign",
      "handle K1 resolves",
    ];
    const cA = win(f, T.checks[0], 478, 10, 14);
    if (cA > 0) {
      const lines: PanelLine[] = checks.map((c, i) => {
        const on = prog(f, T.checks[0] + 6 + i * 10, T.checks[0] + 12 + i * 10);
        return { text: `${on > 0.5 ? "✓" : "·"}  ${c}`, mono: true, size: 16, color: on > 0.5 ? C.violet : C.dim, alpha: 0.4 + 0.6 * on };
      });
      deferred.push(() => panel(ctx, ps.x + 40, ps.y + 30, 330, "control · policy", "Authorize SIGN", lines, C.violet, cA));
    }
    trace(ctx, proj, PATHS.authorize, { kind: "control", alpha: win(f, T.authorize[0], 760, 10, 20), reveal: prog(f, T.authorize[0], T.authorize[0] + 18), f });
    packet(ctx, proj, PATHS.authorize, prog(f, T.authorize[0] + 10, T.authorize[1]), C.violet, win(f, T.authorize[0] + 10, T.authorize[1] + 4, 4, 6), "grant: SIGN K1", "token");
    trace(ctx, proj, PATHS.digestToEngine, { kind: "input", alpha: win(f, T.digest[0], 760, 10, 20), reveal: prog(f, T.digest[0], T.digest[0] + 16), f });
    packet(ctx, proj, PATHS.digestToEngine, prog(f, T.digest[0] + 8, T.digest[1]), C.cyan, win(f, T.digest[0] + 8, T.digest[1] + 4, 4, 6), "H(m)");

    trace(ctx, proj, PATHS.policyToAudit, { kind: "control", alpha: win(f, 420, 520, 10, 14) * 0.9, f, width: 2.5 });
    packet(ctx, proj, PATHS.policyToAudit, prog(f, 422, 446), C.violet, win(f, 422, 448, 3, 4), undefined, "token");
    packet(ctx, proj, PATHS.policyToAudit, prog(f, 490, 512), C.violet, win(f, 490, 514, 3, 4), undefined, "token");

    // Export attempt, refused by policy.
    trace(ctx, proj, PATHS.exportIn, { kind: "input", alpha: win(f, T.exportTravel[0] - 6, 516, 10, 14) * 0.8, reveal: prog(f, T.exportTravel[0] - 6, T.exportTravel[0] + 10), f, width: 2.5 });
    packet(ctx, proj, PATHS.exportIn, prog(f, T.exportTravel[0], T.exportTravel[1]), C.cyan, win(f, T.exportTravel[0], T.exportTravel[1] + 2, 4, 2), "EXPORT(K1.private)");
    const dA = win(f, T.denied[0], 516, 6, 12);
    if (dA > 0) {
      const e = proj.project(PATHS.exportIn[PATHS.exportIn.length - 1]);
      ctx.save();
      ctx.globalAlpha = dA;
      ctx.strokeStyle = C.violet;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.x - 12, e.y - 12);
      ctx.lineTo(e.x + 12, e.y + 12);
      ctx.moveTo(e.x + 12, e.y - 12);
      ctx.lineTo(e.x - 12, e.y + 12);
      ctx.stroke();
      chip(ctx, e.x - 330, e.y + 22, "DENIED · K1 export = false", C.violet, 16);
      ctx.restore();
    }
  }

  /* 4 · sign internally */
  if (f >= 510 && f < 770) {
    const fade = 1 - prog(f, 750, 770);
    trace(ctx, proj, PATHS.keystoreToEngine, { kind: "input", alpha: win(f, T.keyLoad[0] - 8, 770, 10, 20), reveal: prog(f, T.keyLoad[0] - 8, T.keyLoad[0] + 6), f });
    packet(ctx, proj, PATHS.keystoreToEngine, prog(f, T.keyLoad[0], T.keyLoad[1]), C.violet, win(f, T.keyLoad[0], T.keyLoad[1] + 4, 4, 6), "sk_K1 · internal only", "key");
    ringOnTop(ctx, proj, byId.engine, 1.35, prog(f, T.signRing[0], T.signRing[1]), C.cyan, win(f, T.signRing[0], T.signRing[1] + 10, 6, 10) * fade, f);

    // Heat: qualitative. Energy that enters as electrical power leaves as heat.
    const hA = win(f, T.signRing[0], T.signRing[1] + 30, 10, 20) * fade;
    if (hA > 0) {
      const eng = byId.engine;
      ctx.save();
      ctx.strokeStyle = C.mute;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const ph = ((f + i * 9) % 40) / 40;
        const b = proj.project([eng.x - 1.2 + i * 0.6, eng.h + 0.2 + ph * 1.6, eng.z - 0.4]);
        ctx.globalAlpha = hA * (1 - ph) * 0.8;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.quadraticCurveTo(b.x + 6, b.y - 8, b.x, b.y - 16);
        ctx.quadraticCurveTo(b.x - 6, b.y - 24, b.x, b.y - 32);
        ctx.stroke();
      }
      ctx.restore();
      const top = proj.project([eng.x - 1.6, eng.h + 1.6, eng.z - 0.4]);
      ctx.save();
      ctx.globalAlpha = hA;
      chip(ctx, top.x - 330, top.y - 40, "power in → heat out (qualitative)", C.gold, 14);
      ctx.restore();
    }
    packet(ctx, proj, PATHS.respOut, prog(f, T.respTravel[0], T.respTravel[1]), C.ink, win(f, T.respTravel[0], T.respTravel[1] + 6, 4, 6), "σ + status OK");
    trace(ctx, proj, PATHS.engineToAudit, { kind: "control", alpha: win(f, 640, 770, 10, 20) * 0.9, f, width: 2.5 });
    packet(ctx, proj, PATHS.engineToAudit, prog(f, 646, 672), C.violet, win(f, 646, 674, 3, 4), undefined, "token");
  }

  /* 5 · verify & audit */
  if (f >= 750) {
    const keep = win(f, 760, Infinity, 24);
    trace(ctx, proj, PATHS.reqIn, { kind: "input", alpha: keep * 0.75, f });
    trace(ctx, proj, PATHS.respOut, { kind: "output", alpha: keep * 0.75, f });
    trace(ctx, proj, PATHS.authorize, { kind: "control", alpha: keep * 0.7, f });
    trace(ctx, proj, PATHS.digestToEngine, { kind: "input", alpha: keep * 0.6, f });
    trace(ctx, proj, PATHS.keystoreToEngine, { kind: "input", alpha: keep * 0.6, f });
    trace(ctx, proj, PATHS.policyToAudit, { kind: "control", alpha: keep * 0.6, f, width: 2.5 });
    trace(ctx, proj, PATHS.engineToAudit, { kind: "control", alpha: keep * 0.6, f, width: 2.5 });

    trace(ctx, proj, PATHS.pubOut, { kind: "output", alpha: win(f, T.pubOut[0], Infinity, 10), reveal: prog(f, T.pubOut[0], T.pubOut[0] + 26), f });
    packet(ctx, proj, PATHS.pubOut, prog(f, T.pubOut[0] + 6, T.pubOut[1]), C.ink, win(f, T.pubOut[0] + 6, T.pubOut[1] + 4, 4, 6), "pub K1 (exportable by design)");
    trace(ctx, proj, PATHS.hostToVerifier, { kind: "output", alpha: win(f, T.toVerifier[0], Infinity, 10), reveal: prog(f, T.toVerifier[0], T.toVerifier[0] + 12), f });
    packet(ctx, proj, PATHS.hostToVerifier, prog(f, T.toVerifier[0] + 4, T.toVerifier[1]), C.ink, win(f, T.toVerifier[0] + 4, T.toVerifier[1] + 4, 4, 6), "m + σ");
    const vA = win(f, T.verified[0], Infinity, 12);
    if (vA > 0) {
      const v = proj.project(topCenter(byId.verifier));
      ctx.save();
      ctx.globalAlpha = vA;
      chip(ctx, v.x - 140, v.y + 36, "Verify(pub K1, m, σ) → valid", C.cyan, 15);
      ctx.restore();
    }
    const zA = win(f, 800, Infinity, 20);
    if (zA > 0) {
      const z = proj.project(pointAt(PATHS.zeroize, 0.35));
      label(ctx, z.x, z.y, 40, -6, "Zeroize on tamper", "design-dependent", C.gold, zA, 0.82);
    }
  }

  deferred.forEach((d) => d());
}

/* ------------------------------------------------------------------ insets */

function drawInsets(ctx: Ctx, proj: Projector, f: number) {
  // 1 · definition card
  const dA = win(f, 8, 112, 16, 16);
  if (dA > 0) {
    panel(
      ctx,
      70,
      150,
      640,
      "Reference · NIST CSRC glossary",
      "Hardware Security Module (HSM)",
      [
        { text: "“A physical computing device that safeguards and manages", size: 19 },
        { text: "cryptographic keys and provides cryptographic processing.”", size: 19, gap: 6 },
        { text: "Source cited by NIST: SP 800-57 Part 2 Rev. 1", mono: true, size: 14, color: C.mute, gap: 16 },
      ],
      C.ink,
      dA,
    );
  }

  // 2 · key attributes
  const kA = win(f, T.keyCard[0], 312, 12, 14);
  if (kA > 0) {
    const ks = proj.project(topCenter(byId.keystore));
    const x = 1400;
    const y = 640;
    ctx.save();
    ctx.globalAlpha = kA * 0.7;
    ctx.strokeStyle = C.violet;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(ks.x, ks.y);
    ctx.lineTo(x + 30, y);
    ctx.stroke();
    ctx.restore();
    panel(
      ctx,
      x,
      y,
      460,
      "State · key attributes",
      "K1 (signing key pair)",
      [
        { text: "private part   stays in key store", mono: true, size: 16 },
        { text: "EXPORTABLE     false  ← selected", mono: true, size: 16, color: C.violet },
        { text: "usage          SIGN only", mono: true, size: 16 },
        { text: "public part    may leave boundary", mono: true, size: 16 },
        { text: "Non-exportability is a configuration chosen", size: 15, color: C.mute, gap: 16 },
        { text: "for this walkthrough, not a property of all keys.", size: 15, color: C.mute, gap: 6 },
      ],
      C.violet,
      kA,
    );
  }

  // 4 · qualitative signing inset
  const sA = win(f, T.signInset[0], T.signInset[1] + 14, 16, 18);
  if (sA > 0) {
    const x = 1390;
    const y = 150;
    const h = panel(
      ctx,
      x,
      y,
      480,
      "Qualitative inset · not to scale",
      "What happens inside",
      [
        { text: "σ = Sign( sk_K1 , H(m) )", mono: true, size: 24, color: C.cyan, gap: 18 },
        { text: "Mathematical notation, not a measurement.", size: 15, color: C.mute, gap: 8 },
        { text: "inputs   H(m), handle K1, grant", mono: true, size: 16, gap: 22 },
        { text: "uses     sk_K1 (never leaves)", mono: true, size: 16, color: C.violet },
        { text: "output   σ, status", mono: true, size: 16 },
      ],
      C.cyan,
      sA,
    );
    const lA = win(f, T.ledger[0], T.ledger[1] + 14, 14, 18);
    panel(
      ctx,
      x,
      y + h + 20,
      480,
      "Boundary ledger · this request",
      "What crossed the boundary",
      [
        { text: "IN     request, credential, H(m)", mono: true, size: 16, color: C.cyan },
        { text: "OUT    σ, status code", mono: true, size: 16, color: C.ink },
        { text: "NEVER  sk_K1", mono: true, size: 16, color: C.violet },
      ],
      C.ink,
      lA,
    );
  }

  // 5 · audit log + limits
  const aA = win(f, T.audit[0], Infinity, 16);
  if (aA > 0) {
    const x = 1370;
    const entries = [
      { s: 812, t: "e1  GENERATE K1   export=false" },
      { s: 836, t: "e2  SIGN K1       authorized" },
      { s: 860, t: "e3  EXPORT K1     denied" },
      { s: 884, t: "e4  SIGN K1       σ returned" },
    ];
    const lines: PanelLine[] = [];
    entries.forEach((e, i) => {
      const on = easeOutCubic(prog(f, e.s, e.s + 12));
      lines.push({ text: e.t, mono: true, size: 16, color: i === 2 ? C.violet : C.ink, alpha: on, gap: i === 0 ? 11 : 8 });
      lines.push({ text: `    h${i + 1} = H(h${i} ‖ e${i + 1})`, mono: true, size: 14, color: C.mute, alpha: on, gap: 4 });
    });
    lines.push({ text: "Chaining shown conceptually. Real log formats", size: 14, color: C.mute, gap: 16 });
    lines.push({ text: "and integrity schemes vary by product.", size: 14, color: C.mute, gap: 4 });
    const h = panel(ctx, x, 120, 510, "Control · audit trail", "Audit log (append-only)", lines, C.violet, aA);

    const lmA = win(f, T.limits[0], Infinity, 18);
    panel(
      ctx,
      x,
      120 + h + 18,
      510,
      "Limits · what this does not prove",
      "Scope and uncertainty",
      [
        { text: "• Protects keys, not intent: an authorized caller", size: 15.5 },
        { text: "  can still sign a malicious message.", size: 15.5, gap: 4 },
        { text: "• Authorization is only as strong as credential", size: 15.5 },
        { text: "  and role management outside the box.", size: 15.5, gap: 4 },
        { text: "• Export = false is a selected configuration.", size: 15.5 },
        { text: "• Tamper response, side-channel resistance, and", size: 15.5 },
        { text: "  certification level are design-specific. Not shown.", size: 15.5, gap: 4 },
        { text: "• Power in becomes heat. Qualitative, not measured.", size: 15.5, color: C.gold },
      ],
      C.gold,
      lmA,
    );
  }
}

/* ------------------------------------------------------------------ HUD */

function drawHud(ctx: Ctx, f: number) {
  const ch = chapterAt(f);
  const local = f - ch.start;

  // Top-left: chapter.
  ctx.save();
  ctx.fillStyle = C.cyan;
  ctx.font = FONT.mono(14, 600);
  ctx.fillText("HARDWARE SECURITY MODULE · ANATOMY", 70, 62);
  const tA = clamp(local / 14);
  ctx.globalAlpha = tA;
  ctx.fillStyle = C.ink;
  ctx.font = FONT.display(40, 600);
  ctx.fillText(`${String(ch.n).padStart(2, "0")}  ${ch.title}`, 70, 108);
  ctx.globalAlpha = tA * 0.85;
  ctx.fillStyle = C.mute;
  ctx.font = FONT.display(18, 400);
  if (!(f >= 8 && f <= 112)) ctx.fillText(ch.kicker, 70, 138);
  ctx.restore();

  // Top-right: scope stamp.
  ctx.save();
  ctx.font = FONT.mono(13, 600);
  ctx.textAlign = "right";
  ctx.fillStyle = C.mute;
  ctx.fillText("CONCEPTUAL SCHEMATIC · NOT TO SCALE · NOT A PRODUCT GEOMETRY", W - 60, 62);
  ctx.fillText("TIME COMPRESSED · OPERATIONS NOT SHOWN AT REAL SPEED", W - 60, 84);
  ctx.restore();

  // Caption.
  for (const c of CAPTIONS) {
    const a = win(f, c.a, c.b >= 1020 ? Infinity : c.b, 10, 10);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = FONT.display(22, 500);
    const tw = ctx.measureText(c.text).width;
    const x = W / 2 - tw / 2;
    const y = H - 128;
    ctx.fillStyle = "rgba(11,16,25,0.82)";
    roundRect(ctx, x - 20, y - 30, tw + 40, 44, 10);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.fillText(c.text, x, y);
    ctx.restore();
  }

  // Legend.
  const legend: [string, string, Kind][] = [
    [C.cyan, "transport / signal", "input"],
    [C.gold, "energy / actuation", "energy"],
    [C.violet, "control / state", "control"],
  ];
  ctx.save();
  let lx = 70;
  const ly = H - 64;
  ctx.font = FONT.mono(13.5, 500);
  for (const [col, text, kind] of legend) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash(kind === "control" ? [8, 6] : kind === "energy" ? [2, 6] : []);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 30, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.ink;
    ctx.fillText(text, lx + 40, ly + 5);
    lx += 40 + ctx.measureText(text).width + 34;
  }
  ctx.fillStyle = C.dim;
  ctx.fillText("Colors are explanatory overlays, not emission.", lx, ly + 5);
  ctx.restore();

  // Chapter progress + timecode.
  const bx = 70;
  const bw = W - 140;
  const by = H - 36;
  ctx.save();
  for (const c of CHAPTERS) {
    const x0 = bx + (c.start / 1020) * bw;
    const x1 = bx + ((c.end + 1) / 1020) * bw - 6;
    ctx.fillStyle = "rgba(138,154,178,0.18)";
    ctx.fillRect(x0, by, x1 - x0, 4);
    const p = clamp((f - c.start + 1) / (c.end - c.start + 1));
    ctx.fillStyle = c.n === ch.n ? C.cyan : rgba(C.cyan, 0.55);
    ctx.fillRect(x0, by, (x1 - x0) * p, 4);
  }
  ctx.font = FONT.mono(13, 600);
  ctx.textAlign = "right";
  ctx.fillStyle = C.mute;
  ctx.fillText(`${timecode(f)}  ·  f ${String(f).padStart(4, "0")} / ${LAST_FRAME}  ·  30 fps`, W - 70, H - 56);
  ctx.restore();
}

/* ------------------------------------------------------------------ hero still */

function drawHeroOverlays(ctx: Ctx, proj: Projector) {
  const f = 1000;
  trace(ctx, proj, PATHS.reqIn, { kind: "input", alpha: 1, f });
  trace(ctx, proj, PATHS.digestToEngine, { kind: "input", alpha: 0.9, f });
  trace(ctx, proj, PATHS.authorize, { kind: "control", alpha: 1, f });
  trace(ctx, proj, PATHS.keystoreToEngine, { kind: "input", alpha: 0.9, f });
  trace(ctx, proj, PATHS.respOut, { kind: "output", alpha: 1, f });
  trace(ctx, proj, PATHS.policyToAudit, { kind: "control", alpha: 0.8, f, width: 2.5 });
  trace(ctx, proj, PATHS.engineToAudit, { kind: "control", alpha: 0.8, f, width: 2.5 });
  trace(ctx, proj, PATHS.exportIn, { kind: "input", alpha: 0.7, f, width: 2.5 });
  const e = proj.project(PATHS.exportIn[PATHS.exportIn.length - 1]);
  ctx.save();
  ctx.strokeStyle = C.violet;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(e.x - 10, e.y - 10);
  ctx.lineTo(e.x + 10, e.y + 10);
  ctx.moveTo(e.x + 10, e.y - 10);
  ctx.lineTo(e.x - 10, e.y + 10);
  ctx.stroke();
  ctx.restore();
  packet(ctx, proj, PATHS.respOut, 0.55, C.ink, 1, "σ");
  packet(ctx, proj, PATHS.keystoreToEngine, 0.6, C.violet, 1, undefined, "key");
  ringOnTop(ctx, proj, byId.engine, 1.35, 0.8, C.cyan, 1, 30);
}

function drawHeroTitle(ctx: Ctx) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 900, 0);
  g.addColorStop(0, "rgba(11,16,25,0.96)");
  g.addColorStop(0.75, "rgba(11,16,25,0.7)");
  g.addColorStop(1, "rgba(11,16,25,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 900, H);
  ctx.fillStyle = C.cyan;
  ctx.font = FONT.mono(20, 600);
  ctx.fillText("ANATOMY OF A HARDWARE SECURITY MODULE", 90, 300);
  ctx.fillStyle = C.ink;
  ctx.font = FONT.display(78, 700);
  ctx.fillText("The key never", 90, 400);
  ctx.fillText("leaves the box.", 90, 484);
  ctx.fillStyle = C.mute;
  ctx.font = FONT.display(26, 400);
  ctx.fillText("Generate · authorize · sign · verify · audit,", 90, 552);
  ctx.fillText("traced across one cryptographic boundary.", 90, 588);
  ctx.font = FONT.mono(15, 500);
  ctx.fillStyle = C.dim;
  ctx.fillText("Non-exportable key configuration shown", 90, 650);
  ctx.fillText("Conceptual schematic · not a product geometry", 90, 674);
  const legend: [string, string][] = [
    [C.cyan, "signal"],
    [C.gold, "energy"],
    [C.violet, "control"],
  ];
  let x = 90;
  for (const [c, t] of legend) {
    ctx.fillStyle = c;
    ctx.fillRect(x, 716, 28, 4);
    ctx.fillStyle = C.ink;
    ctx.fillText(t, x + 38, 723);
    x += 150;
  }
  ctx.restore();
}
