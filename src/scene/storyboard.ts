import type { CameraKey } from "../engine/camera";

export interface Chapter {
  n: number;
  start: number;
  end: number;
  title: string;
  kicker: string;
}

export const CHAPTERS: Chapter[] = [
  { n: 1, start: 0, end: 149, title: "Reveal boundary", kicker: "Everything security-relevant lives inside one physical perimeter." },
  { n: 2, start: 150, end: 299, title: "Generate key", kicker: "Keys are born inside the boundary from conditioned entropy." },
  { n: 3, start: 300, end: 509, title: "Authorize request", kicker: "Every operation is a request that policy must approve first." },
  { n: 4, start: 510, end: 749, title: "Sign internally", kicker: "The private key is used where it lives. Only the signature leaves." },
  { n: 5, start: 750, end: 1019, title: "Verify and audit", kicker: "Anyone can verify with the public key. The module records what it did." },
];

export const chapterAt = (f: number) => CHAPTERS.find((c) => f >= c.start && f <= c.end) ?? CHAPTERS[CHAPTERS.length - 1];

const k = (
  f: number,
  target: [number, number, number],
  yaw: number,
  pitch: number,
  dist: number,
  shiftX = 0,
  shiftY = 40,
  fovDeg = 34,
): CameraKey => ({ f, target, yaw, pitch, dist, fovDeg, shiftX, shiftY });

/** Camera moves are original illustrative directions, not derived from any product. */
export const CAMERA: CameraKey[] = [
  // 1 · Reveal boundary: hold the full assembly, then a measured three-quarter push.
  k(0, [-4.5, 0, 0], 0.18, 1.02, 58),
  k(60, [-4.5, 0, 0], 0.24, 0.98, 55),
  k(149, [0.5, 0, -0.5], 0.62, 0.74, 36),
  // 2 · Generate key: sectional close-up on entropy → DRBG → engine → key store.
  k(185, [3.6, 0, -2.4], 0.42, 0.86, 21),
  k(299, [4.2, 0, -2.0], 0.5, 0.84, 20),
  // 3 · Authorize request: track the causal path host → interface → policy → engine.
  k(335, [-13.5, 0, -0.8], 0.42, 0.8, 24),
  k(395, [-7.8, 0, -1.8], 0.48, 0.82, 22),
  k(445, [-4.0, 0, -1.6], 0.5, 0.84, 20),
  k(509, [-1.6, 0, -0.6], 0.55, 0.84, 22),
  // 4 · Sign internally: close on engine + key store, then follow the response out.
  k(545, [3.6, 0, 0.0], 0.66, 0.8, 18, -230),
  k(640, [3.4, 0, 0.2], 0.7, 0.8, 18.5, -230),
  k(720, [-7.0, 0, 1.0], 0.55, 0.82, 26, -230),
  k(749, [-7.4, 0, 1.0], 0.55, 0.82, 27, -230),
  // 5 · Verify and audit: pull back to a stable overview and hold.
  k(845, [-5.0, 0, 0.3], 0.3, 0.98, 54, -250, 30),
  k(1019, [-5.0, 0, 0.3], 0.3, 0.98, 54, -250, 30),
];

export interface Caption {
  a: number;
  b: number;
  text: string;
}

export const CAPTIONS: Caption[] = [
  { a: 96, b: 149, text: "Cutaway: lid removed and near walls sectioned for illustration." },
  { a: 160, b: 222, text: "A physical noise source is conditioned into seed material for the DRBG." },
  { a: 222, b: 299, text: "The crypto engine derives key pair K1 and stores it with attributes, including export = false." },
  { a: 305, b: 388, text: "The host sends SIGN(K1, H(m)) with a credential. Requests ride the input lane only." },
  { a: 388, b: 455, text: "Access control checks session, role, and key policy before anything runs." },
  { a: 455, b: 509, text: "An EXPORT request for K1's private key is refused. Policy, not geometry, enforces this." },
  { a: 515, b: 640, text: "The engine loads the private key internally and computes the signature over H(m)." },
  { a: 640, b: 749, text: "Only σ and a status code cross back over the boundary, on the output lane." },
  { a: 760, b: 880, text: "Verification needs only the public key, so it can run outside the HSM." },
  { a: 880, b: 960, text: "Each decision is appended to the audit log, including the denial." },
  { a: 960, b: 1020, text: "Conceptual schematic based on the NIST HSM definition. Not a product geometry." },
];

/**
 * Timeline markers (frames). Kept in one place so the renderer, captions, and docs agree.
 */
export const T = {
  boundaryDraw: [10, 70],
  componentsRise: [18, 64],
  lidFade: [62, 104],
  sectionCut: [104, 146],
  powerOn: 88,
  entropyNoise: [168, 236],
  entropyStream: [178, 232],
  drbgOut: [214, 244],
  keygenRing: [238, 264],
  keyStore: [256, 284],
  keyCard: [266, 299],
  reqForm: [304, 330],
  reqTravel: [328, 392],
  checks: [392, 446],
  authorize: [430, 470],
  digest: [444, 492],
  exportTravel: [452, 486],
  denied: [484, 509],
  keyLoad: [528, 578],
  signRing: [572, 640],
  signInset: [560, 749],
  respTravel: [642, 716],
  ledger: [690, 749],
  pubOut: [786, 836],
  toVerifier: [806, 852],
  verified: [852, 1020],
  audit: [812, 1020],
  limits: [892, 1020],
} as const;
