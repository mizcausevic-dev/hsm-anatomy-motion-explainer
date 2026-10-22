import type { Vec3 } from "../engine/math";

/**
 * Conceptual schematic only. Positions and sizes are arbitrary layout units chosen for
 * legibility. They do not represent any product's geometry, dimensions, or materials.
 */
export type ComponentId =
  | "host"
  | "verifier"
  | "io"
  | "policy"
  | "entropy"
  | "drbg"
  | "keystore"
  | "engine"
  | "audit"
  | "tamper"
  | "power";

export interface Component {
  id: ComponentId;
  name: string;
  sub: string;
  /** Center on the board plane (x, z). */
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  outside?: boolean;
}

export const COMPONENTS: Component[] = [
  { id: "host", name: "Host application", sub: "outside the boundary", x: -19, z: -0.4, w: 3.4, d: 4.4, h: 2.4, outside: true },
  { id: "verifier", name: "Relying party", sub: "verifies with public key", x: -19, z: 6.2, w: 3.0, d: 2.6, h: 1.8, outside: true },
  { id: "io", name: "Host interface", sub: "API / transport", x: -8.6, z: 0, w: 2.0, d: 4.2, h: 1.0 },
  { id: "policy", name: "Access control", sub: "authN · roles · key policy", x: -4.6, z: -3.2, w: 3.0, d: 2.4, h: 0.8 },
  { id: "entropy", name: "Entropy source", sub: "physical noise → seed", x: -0.6, z: -4.6, w: 2.4, d: 1.8, h: 0.6 },
  { id: "drbg", name: "DRBG", sub: "deterministic random bit generator", x: 3.0, z: -4.6, w: 2.4, d: 1.8, h: 0.6 },
  { id: "keystore", name: "Protected key store", sub: "keys + attributes", x: 7.2, z: -2.6, w: 3.0, d: 2.8, h: 0.9 },
  { id: "engine", name: "Crypto engine", sub: "keygen · sign", x: 2.2, z: 1.4, w: 3.8, d: 3.0, h: 1.0 },
  { id: "audit", name: "Audit log", sub: "append-only record", x: -4.2, z: 4.4, w: 3.0, d: 2.0, h: 0.7 },
  { id: "tamper", name: "Tamper response", sub: "sense → zeroize", x: 7.4, z: 4.4, w: 2.6, d: 2.0, h: 0.6 },
  { id: "power", name: "Power conditioning", sub: "energy in", x: -8.8, z: 5.0, w: 1.8, d: 1.8, h: 0.7 },
];

export const byId = Object.fromEntries(COMPONENTS.map((c) => [c.id, c])) as Record<ComponentId, Component>;

/** Chassis extents (board plane). The cryptographic boundary is drawn on its perimeter. */
export const CHASSIS = { x0: -11, x1: 10, z0: -7, z1: 7, h: 2.6 };

const Y = 0.05;
const p = (x: number, z: number, y = Y): Vec3 => [x, y, z];

/**
 * Traces are drawn as overlays on the board plane. Input and output lanes are separated
 * in z so requests and responses never share a drawn path.
 */
export const PATHS = {
  // Signal / transport (cyan)
  reqIn: [p(-17.2, -1.6), p(-11, -1.6), p(-9.6, -1.6), p(-8.6, -1.6), p(-8.6, -3.2), p(-6.1, -3.2)],
  exportIn: [p(-17.2, -2.2), p(-11, -2.2), p(-9.6, -2.2), p(-8.0, -2.2), p(-8.0, -3.7), p(-6.1, -3.7)],
  entropyToDrbg: [p(0.6, -4.6), p(1.8, -4.6)],
  drbgToEngine: [p(3.0, -3.7), p(3.0, -0.1)],
  engineToKeystore: [p(4.1, 0.6), p(7.2, 0.6), p(7.2, -1.2)],
  keystoreToEngine: [p(6.4, -1.2), p(6.4, 1.8), p(4.1, 1.8)],
  digestToEngine: [p(-3.1, -2.4), p(-1.2, -2.4), p(-1.2, 0.9), p(0.3, 0.9)],
  respOut: [p(0.3, 2.2), p(-7.6, 2.2), p(-7.6, 1.6), p(-9.6, 1.6), p(-11, 1.6), p(-17.2, 1.6)],
  hostToVerifier: [p(-19, 1.8), p(-19, 4.9)],
  pubOut: [p(8.7, -2.6), p(9.4, -2.6), p(9.4, 6.4, Y), p(-11, 6.4), p(-17.5, 6.4)],
  // Control / state (violet)
  authorize: [p(-3.1, -3.2), p(-0.2, -3.2), p(-0.2, 0.2), p(0.3, 0.2)],
  policyToAudit: [p(-4.6, -2.0), p(-4.6, 3.4)],
  engineToAudit: [p(1.0, 2.9), p(1.0, 4.4), p(-2.7, 4.4)],
  // Energy / actuation (gold)
  powerIn: [p(-13.5, 5.0), p(-11, 5.0), p(-9.7, 5.0)],
  powerBus: [p(-7.9, 5.6), p(-6.2, 5.6), p(-6.2, 6.0), p(2.2, 6.0), p(2.2, 2.9)],
  zeroize: [p(7.4, 3.4), p(7.4, -1.2)],
} satisfies Record<string, Vec3[]>;

export type PathId = keyof typeof PATHS;
