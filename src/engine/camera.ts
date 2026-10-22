import { easeInOutCubic, lerp, prog, v3, type Vec3 } from "./math";

export interface CameraState {
  target: Vec3;
  /** Azimuth around +Y in radians, 0 = looking from +Z. */
  yaw: number;
  /** Elevation in radians, 0 = horizon, PI/2 = top-down. */
  pitch: number;
  dist: number;
  fovDeg: number;
  /** Horizontal screen shift in px, used to make room for side insets. */
  shiftX: number;
  shiftY: number;
}

export interface CameraKey extends CameraState {
  f: number;
}

export function sampleCamera(keys: CameraKey[], f: number): CameraState {
  if (f <= keys[0].f) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (f >= a.f && f <= b.f) {
      const t = easeInOutCubic(prog(f, a.f, b.f));
      return {
        target: v3.lerp(a.target, b.target, t),
        yaw: lerp(a.yaw, b.yaw, t),
        pitch: lerp(a.pitch, b.pitch, t),
        dist: lerp(a.dist, b.dist, t),
        fovDeg: lerp(a.fovDeg, b.fovDeg, t),
        shiftX: lerp(a.shiftX, b.shiftX, t),
        shiftY: lerp(a.shiftY, b.shiftY, t),
      };
    }
  }
  return keys[keys.length - 1];
}

export interface Projector {
  eye: Vec3;
  project(p: Vec3): { x: number; y: number; z: number };
  depth(p: Vec3): number;
}

export function makeProjector(cam: CameraState, w: number, h: number): Projector {
  const cp = Math.cos(cam.pitch);
  const eye: Vec3 = v3.add(cam.target, [
    cam.dist * cp * Math.sin(cam.yaw),
    cam.dist * Math.sin(cam.pitch),
    cam.dist * cp * Math.cos(cam.yaw),
  ]);
  const fwd = v3.norm(v3.sub(cam.target, eye));
  const right = v3.norm(v3.cross(fwd, [0, 1, 0]));
  const up = v3.cross(right, fwd);
  const focal = h / 2 / Math.tan((cam.fovDeg * Math.PI) / 360);
  const cx = w / 2 + cam.shiftX;
  const cy = h / 2 + cam.shiftY;
  return {
    eye,
    project(p) {
      const d = v3.sub(p, eye);
      const z = Math.max(0.01, v3.dot(d, fwd));
      return { x: cx + (focal * v3.dot(d, right)) / z, y: cy - (focal * v3.dot(d, up)) / z, z };
    },
    depth(p) {
      return v3.dist(p, eye);
    },
  };
}
