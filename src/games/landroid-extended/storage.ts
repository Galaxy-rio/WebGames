import { Universe, type Landing } from './engine.ts';
import { RULES, add, length, polar, type Vec } from './physics.ts';
import type { ChallengeData, FlightResult } from './challenge.ts';

const KEY = 'landroid-extended:v2';
const PREVIOUS_KEY = 'landroid-extended:v1';
const RESULTS_KEY = 'landroid-extended:results:v1';
// Preserve flights saved before the game was renamed.
const LEGACY_KEY = 'android-easter-egg-extended:v1';
const validNumber = (n: unknown, bound = 1e12): n is number =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= bound;
const validVector = (v: unknown, bound: number): v is Vec =>
  !!v &&
  typeof v === 'object' &&
  validNumber((v as Vec).x, bound) &&
  validNumber((v as Vec).y, bound);
export interface SaveData {
  version: 1 | 2;
  challenge?: ChallengeData & { scoredDiscoveries: number };
  impactContact?: number | null;
  seed: number;
  time: number;
  position: Vec;
  velocity: Vec;
  angle: number;
  explored: number[];
  orbits: number[];
  flags: Landing[];
  landing: Landing | null;
  autopilot: boolean;
  gravityAfter: number;
}

export function snapshot(u: Universe): SaveData {
  return {
    version: 2,
    challenge: u.challenge.snapshot(),
    impactContact: u.impactContact,
    seed: u.seed,
    time: u.time,
    position: { ...u.ship.position },
    velocity: { ...u.ship.velocity },
    angle: u.ship.angle,
    explored: u.planets.filter((p) => p.explored).map((p) => p.id),
    orbits: u.planets.map((p) => p.orbitAngle),
    flags: u.flags.map((flag) => ({ ...flag })),
    landing: u.ship.landing ? { ...u.ship.landing } : null,
    autopilot: u.autopilot.enabled,
    gravityAfter: u.ship.gravityAfter,
  };
}

export function restore(value: unknown): Universe | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const s = value as SaveData;
    if (
      ![1, 2].includes(s.version) ||
      !Number.isSafeInteger(s.seed) ||
      s.seed < 0 ||
      !validNumber(s.time) ||
      s.time < 0 ||
      !validVector(s.position, RULES.universeRadius) ||
      length(s.position) > RULES.universeRadius + 1 ||
      !validVector(s.velocity, 10_000) ||
      !validNumber(s.angle) ||
      !validNumber(s.gravityAfter) ||
      typeof s.autopilot !== 'boolean'
    )
      return null;
    const u = new Universe(s.seed);
    const validId = (id: unknown): id is number =>
      Number.isInteger(id) &&
      (id as number) >= 0 &&
      (id as number) < u.planets.length;
    const validLanding = (item: unknown): item is Landing => {
      if (!item || typeof item !== 'object') return false;
      const p = item as Landing;
      return (
        validId(p.planetId) &&
        validNumber(p.angle) &&
        validNumber(p.time) &&
        p.time >= 0 &&
        p.time <= s.time &&
        typeof p.job === 'string' &&
        p.job.length <= 180
      );
    };
    if (
      !Array.isArray(s.orbits) ||
      s.orbits.length !== u.planets.length ||
      !s.orbits.every((n) => validNumber(n)) ||
      !Array.isArray(s.explored) ||
      !s.explored.every(validId) ||
      !Array.isArray(s.flags) ||
      s.flags.length > 200 ||
      !s.flags.every(validLanding) ||
      (s.landing !== null && !validLanding(s.landing))
    )
      return null;
    u.time = s.time;
    for (const p of u.planets) {
      p.orbitAngle = s.orbits[p.id]!;
      p.position = polar(p.orbitAngle, p.orbit);
      p.previous = { ...p.position };
      p.velocity = polar(p.orbitAngle + Math.PI / 2, p.speed);
      p.explored = s.explored.includes(p.id);
    }
    u.ship.position = { ...s.position };
    u.ship.velocity = { ...s.velocity };
    u.ship.angle = s.angle;
    u.ship.gravityAfter = s.gravityAfter;
    u.flags = s.flags.map((flag) => ({ ...flag }));
    u.ship.landing = s.landing ? { ...s.landing } : null;
    if (u.ship.landing) {
      const landing = u.ship.landing;
      const p = u.planets[landing.planetId]!;
      p.explored = true;
      u.ship.position = add(
        p.position,
        polar(landing.angle, p.radius + RULES.shipRadius),
      );
      u.ship.velocity = { ...p.velocity };
      u.ship.angle = landing.angle;
      if (
        !u.flags.some(
          (flag) =>
            flag.planetId === landing.planetId && flag.time === landing.time,
        )
      )
        u.flags.push(landing);
    }
    u.autopilot.setEnabled(s.autopilot);
    const explored = u.planets.filter((p) => p.explored).map((p) => p.id);
    if (s.version === 2) {
      if (
        !u.challenge.restore(s.challenge, explored, s.time) ||
        (s.autopilot && u.challenge.eligible && !u.challenge.finished) ||
        (s.impactContact !== null && !validId(s.impactContact))
      )
        return null;
      u.impactContact = s.impactContact ?? null;
    } else u.challenge.importLegacy(explored, s.time);
    return u;
  } catch {
    return null;
  }
}
export function load(): Universe | null {
  try {
    const current = localStorage.getItem(KEY);
    if (current !== null) return restore(JSON.parse(current));
    const previous = restore(
      JSON.parse(
        localStorage.getItem(PREVIOUS_KEY) ||
          localStorage.getItem(LEGACY_KEY) ||
          'null',
      ),
    );
    return previous;
  } catch {
    return null;
  }
}
export function readResults(): FlightResult[] {
  try {
    const data = JSON.parse(localStorage.getItem(RESULTS_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter((r): r is FlightResult => {
        if (
          !r ||
          !Number.isSafeInteger(r.seed) ||
          r.seed < 0 ||
          !Number.isSafeInteger(r.score) ||
          r.eligible !== true ||
          !validNumber(r.finishedAt, 1e15) ||
          !r.details
        )
          return false;
        const u = new Universe(r.seed);
        return (
          r.planetCount === u.planets.length &&
          r.details.completedAt !== null &&
          u.challenge.restore(
            r.details,
            r.details.visited,
            r.details.completedAt,
          ) &&
          u.challenge.eligible &&
          u.challenge.finished &&
          r.id === u.challenge.data.id &&
          r.score === u.challenge.score
        );
      })
      .slice(0, 20);
  } catch {
    return [];
  }
}
export function rememberResult(result: FlightResult): boolean {
  if (!result.eligible) return false;
  try {
    const records = readResults();
    if (!records.some((r) => r.id === result.id))
      localStorage.setItem(
        RESULTS_KEY,
        JSON.stringify([result, ...records].slice(0, 20)),
      );
    return true;
  } catch {
    return false;
  }
}
export function save(u: Universe): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot(u)));
    return true;
  } catch {
    return false;
  }
}
export function readProgress(): {
  explored: number;
  total: number;
  star: string;
} | null {
  const u = load();
  return u
    ? {
        explored: u.planets.filter((p) => p.explored).length,
        total: u.planets.length,
        star: u.star.name,
      }
    : null;
}
