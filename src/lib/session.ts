import { scoreColor, randomColor, isRGB, type RGB } from './color.ts';
import type { Mode } from './storage.ts';

export type Phase = 'ready' | 'playing' | 'reveal' | 'finished';
export interface RoundResult {
  target: RGB;
  guess: RGB;
  score: number;
  timedOut: boolean;
}
export interface Attempt extends RoundResult {
  passed: boolean;
  penaltyMs: number;
}
export class ColorSession {
  phase: Phase = 'ready';
  target: RGB = [128, 128, 128];
  guess: RGB = [128, 128, 128];
  results: RoundResult[] = [];
  lastAttempt: Attempt | null = null;
  deadline = 0;
  penaltyMs = 0;
  readonly maxRounds = 10;
  readonly roundLimitMs = 30000;
  private startedAt = 0;
  private endedAt: number | null = null;
  private speedPausedAt: number | null = null;
  private speedPausedMs = 0;
  private lastSubmittedAt = -Infinity;
  readonly mode: Mode;
  private random: () => number;
  constructor(mode: Mode, random: () => number = Math.random) {
    this.mode = mode;
    this.random = random;
  }
  get hasRoundTimer() {
    return this.mode === 'accuracy' || this.mode === 'blind';
  }
  get isGuessHidden() {
    return this.mode === 'blind' && this.phase === 'playing';
  }
  get revealedAnswer(): RGB | null {
    if (this.phase !== 'reveal' && this.phase !== 'finished') return null;
    return this.lastAttempt ? [...this.lastAttempt.target] : null;
  }
  get isFinished() {
    return this.phase === 'finished';
  }
  get total() {
    return this.results.reduce((sum, r) => sum + r.score, 0);
  }
  get average() {
    return this.results.length
      ? Math.round((this.total / this.results.length) * 10) / 10
      : 0;
  }
  get best() {
    return this.results.length
      ? Math.max(...this.results.map((r) => r.score))
      : 0;
  }
  elapsed(now: number) {
    if (this.phase === 'ready') return 0;
    const activeUntil =
      this.endedAt ??
      (this.mode === 'speed' ? (this.speedPausedAt ?? now) : now);
    return Math.max(0, activeUntil - this.startedAt - this.speedPausedMs);
  }
  totalTime(now: number) {
    return this.elapsed(now) + this.penaltyMs;
  }
  start(now: number) {
    this.results = [];
    this.penaltyMs = 0;
    this.startedAt = now;
    this.endedAt = null;
    this.speedPausedAt = null;
    this.speedPausedMs = 0;
    this.lastSubmittedAt = -Infinity;
    this.prepareRound(now);
  }
  private prepareRound(now: number) {
    this.phase = 'playing';
    this.lastAttempt = null;
    this.target = randomColor(this.random);
    this.guess = [128, 128, 128];
    this.deadline = this.hasRoundTimer ? now + this.roundLimitMs : 0;
  }
  remaining(now: number) {
    if (!this.hasRoundTimer) return Infinity;
    if (this.phase === 'ready') return this.roundLimitMs;
    if (this.phase !== 'playing') return 0;
    return Math.max(0, this.deadline - now);
  }
  /** A deadline resolves one round only. The controller checks isFinished separately. */
  tick(now: number): Attempt | null {
    if (!this.hasRoundTimer || this.phase !== 'playing' || now < this.deadline)
      return null;
    return this.finishAttempt(this.deadline, true);
  }
  setGuess(rgb: RGB, now: number) {
    if (this.tick(now) || this.phase !== 'playing' || !isRGB(rgb)) return false;
    this.guess = [...rgb];
    this.lastAttempt = null;
    return true;
  }
  submit(now: number): Attempt | null {
    const expired = this.tick(now);
    if (expired) return expired;
    if (this.phase !== 'playing' || now <= this.lastSubmittedAt) return null;
    this.lastSubmittedAt = now;
    return this.finishAttempt(now, false);
  }
  private finishAttempt(now: number, timedOut: boolean): Attempt {
    const score = scoreColor(this.target, this.guess);
    const passed = this.mode !== 'speed' || score >= 85;
    const penaltyMs = this.mode === 'speed' && !passed ? 1000 : 0;
    const attempt: Attempt = {
      target: [...this.target],
      guess: [...this.guess],
      score,
      timedOut,
      passed,
      penaltyMs,
    };
    this.penaltyMs += penaltyMs;
    this.lastAttempt = attempt;
    if (!passed) return attempt;
    this.results.push({
      target: [...attempt.target],
      guess: [...attempt.guess],
      score,
      timedOut,
    });
    if (this.results.length === this.maxRounds) {
      this.phase = 'finished';
      this.endedAt = now;
    } else {
      this.phase = 'reveal';
      if (this.mode === 'speed') this.speedPausedAt = now;
    }
    return attempt;
  }
  next(now: number) {
    if (this.phase !== 'reveal') return false;
    if (this.mode === 'speed' && this.speedPausedAt !== null) {
      this.speedPausedMs += Math.max(0, now - this.speedPausedAt);
      this.speedPausedAt = null;
    }
    this.prepareRound(now);
    return true;
  }
}
