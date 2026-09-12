import type { GameEvent } from './engine.ts';

export const SCORE_RULES = {
  version: 1,
  initial: 5000,
  discovery: 3000,
  speed: 3,
  angle: 3000,
  ordered: 2000,
  impact: 500,
  fuel: 100,
  travel: 10,
} as const;

export interface ChallengeData {
  version: 1;
  id: string;
  eligible: boolean;
  legacy: boolean;
  started: boolean;
  visited: number[];
  flightSeconds: number;
  fuelSeconds: number;
  speedBonus: number;
  angleBonus: number;
  sequenceBonus: number;
  impacts: number;
  completedAt: number | null;
}

export interface FlightResult {
  id: string;
  seed: number;
  planetCount: number;
  score: number;
  eligible: boolean;
  finishedAt: number;
  details: ChallengeData;
}

/** Keep fractional costs; round the total only for display and submission. */
export class Challenge {
  readonly planetCount: number;
  data: ChallengeData;
  constructor(planetCount: number) {
    this.planetCount = planetCount;
    this.data = {
      version: 1,
      id: crypto.randomUUID(),
      eligible: true,
      legacy: false,
      started: false,
      visited: [],
      flightSeconds: 0,
      fuelSeconds: 0,
      speedBonus: 0,
      angleBonus: 0,
      sequenceBonus: 0,
      impacts: 0,
      completedAt: null,
    };
  }
  get finished(): boolean {
    return this.data.completedAt !== null;
  }
  get eligible(): boolean {
    return this.data.eligible;
  }
  get cost(): number {
    return Math.round(
      this.data.fuelSeconds * SCORE_RULES.fuel +
        this.data.flightSeconds * SCORE_RULES.travel,
    );
  }
  get score(): number {
    const s = this.data;
    // Unscored visits do not earn discovery points: the eligible visit count is
    // represented by earned bonuses in a separate frozen snapshot below.
    return (
      SCORE_RULES.initial +
      this.scoredDiscoveries * SCORE_RULES.discovery +
      s.speedBonus +
      s.angleBonus +
      s.sequenceBonus -
      s.impacts * SCORE_RULES.impact -
      this.cost
    );
  }
  private scoredDiscoveries = 0;
  start(): void {
    this.data.started = true;
  }
  advance(dt: number, thrust: number, airborne: boolean): void {
    if (
      !this.eligible ||
      !this.data.started ||
      this.finished ||
      !airborne ||
      !Number.isFinite(dt) ||
      dt <= 0 ||
      dt > 0.1
    )
      return;
    this.data.flightSeconds += dt;
    this.data.fuelSeconds +=
      dt * Math.max(0, Math.min(1, Number.isFinite(thrust) ? thrust : 0));
  }
  handle(event: GameEvent): void {
    const s = this.data;
    if (this.finished) return;
    if (event.type === 'autopilot' && event.enabled) s.eligible = false;
    if (
      event.type === 'impact' &&
      event.headOn &&
      event.newContact &&
      this.eligible
    )
      s.impacts++;
    if (event.type !== 'land' || s.visited.includes(event.planet.id)) return;
    s.visited.push(event.planet.id);
    if (this.eligible) {
      this.scoredDiscoveries++;
      s.speedBonus += Math.round(
        Math.max(0, 1000 - event.relativeSpeed) * SCORE_RULES.speed,
      );
      s.angleBonus += Math.round(
        Math.max(0, Math.cos(event.angleError)) * SCORE_RULES.angle,
      );
    }
    if (s.visited.length === this.planetCount) {
      s.completedAt = event.time;
      if (this.eligible && s.visited.every((id, i) => id === i))
        s.sequenceBonus = SCORE_RULES.ordered;
    }
  }
  snapshot(): ChallengeData & { scoredDiscoveries: number } {
    return {
      ...this.data,
      visited: [...this.data.visited],
      scoredDiscoveries: this.scoredDiscoveries,
    };
  }
  restore(value: unknown, explored: number[], time: number): boolean {
    if (!value || typeof value !== 'object') return false;
    const s = value as ReturnType<Challenge['snapshot']>;
    const nonnegative = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e12;
    if (
      s.version !== 1 ||
      typeof s.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        s.id,
      ) ||
      typeof s.eligible !== 'boolean' ||
      typeof s.legacy !== 'boolean' ||
      (s.started !== undefined && typeof s.started !== 'boolean') ||
      !Array.isArray(s.visited) ||
      s.visited.length > this.planetCount ||
      new Set(s.visited).size !== s.visited.length ||
      s.visited.some(
        (id) => !Number.isInteger(id) || id < 0 || id >= this.planetCount,
      ) ||
      s.visited.length !== explored.length ||
      !explored.every((id) => s.visited.includes(id)) ||
      !nonnegative(s.flightSeconds) ||
      s.flightSeconds > time + 1e-6 ||
      !nonnegative(s.fuelSeconds) ||
      s.fuelSeconds > s.flightSeconds + 1e-6 ||
      (s.started === false && (s.flightSeconds > 0 || s.fuelSeconds > 0)) ||
      !Number.isInteger(s.scoredDiscoveries) ||
      s.scoredDiscoveries < 0 ||
      s.scoredDiscoveries > s.visited.length ||
      (s.eligible && s.scoredDiscoveries !== s.visited.length) ||
      ![s.speedBonus, s.angleBonus].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 3000 * s.scoredDiscoveries,
      ) ||
      ![0, SCORE_RULES.ordered].includes(s.sequenceBonus) ||
      !Number.isSafeInteger(s.impacts) ||
      s.impacts < 0 ||
      (s.completedAt !== null &&
        (!nonnegative(s.completedAt) ||
          s.completedAt > time ||
          s.visited.length !== this.planetCount)) ||
      (s.visited.length === this.planetCount && s.completedAt === null) ||
      (s.sequenceBonus > 0 &&
        (!s.eligible ||
          s.completedAt === null ||
          !s.visited.every((id, i) => id === i)))
    )
      return false;
    // Earlier saves had already been timing from page load; keep those costs
    // and keep their clock running instead of giving resumed runs a free pause.
    this.data = { ...s, started: s.started ?? true, visited: [...s.visited] };
    this.scoredDiscoveries = s.scoredDiscoveries;
    return true;
  }
  importLegacy(explored: number[], time: number): void {
    this.data.eligible = false;
    this.data.legacy = true;
    this.data.started = true;
    this.data.visited = [...explored];
    if (explored.length === this.planetCount) this.data.completedAt = time;
  }
  result(seed: number): FlightResult | null {
    return this.finished
      ? {
          id: this.data.id,
          seed,
          planetCount: this.planetCount,
          score: this.score,
          eligible: this.eligible,
          finishedAt: Date.now(),
          details: this.snapshot(),
        }
      : null;
  }
}
