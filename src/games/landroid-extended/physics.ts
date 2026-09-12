/* AOSP Landroid browser port; Apache-2.0. See public/licenses/landroid-extended.txt. */
export const TAU = Math.PI * 2;
export const RULES = Object.freeze({
  universeRadius: 200_000,
  gravity: 0.01,
  shipMass: 10,
  shipRadius: 12,
  engineAcceleration: 1000,
  speedLimit: 5000,
  orbitMin: 16_000,
  orbitMax: 150_000,
  launchDelay: 1,
  launchGrace: 2,
  sightseeingTime: 15,
  flagLifetime: 900,
  fixedStep: 1 / 120,
});
export interface Vec {
  x: number;
  y: number;
}
export const vec = (x = 0, y = 0): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec, b: Vec): Vec => vec(a.x - b.x, a.y - b.y);
export const mul = (a: Vec, k: number): Vec => vec(a.x * k, a.y * k);
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec): number => length(sub(a, b));
export const angle = (a: Vec): number => Math.atan2(a.y, a.x);
export const polar = (a: number, r: number): Vec =>
  vec(Math.cos(a) * r, Math.sin(a) * r);
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const clamp = (x: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, x));
export const angleDifference = (a: number, b: number): number =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const smooth = (a: number, b: number, dt: number, rate = 1.5): number =>
  b + (a - b) * Math.exp(-dt * rate);

/** Earliest contact against a circle, including fast fly-throughs between frames. */
export function contactTime(from: Vec, to: Vec, radius: number): number | null {
  const d = sub(to, from);
  const c = dot(from, from) - radius * radius;
  if (c <= 0) return 0;
  const a = dot(d, d);
  if (a === 0) return null;
  const b = 2 * dot(from, d);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
