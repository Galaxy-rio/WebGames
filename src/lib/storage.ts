export type Mode = 'accuracy' | 'speed' | 'blind';
// Keep retired practice records readable without exposing a playable practice mode.
type RecordMode = Mode | 'practice';
export interface GameRecord {
  id: string;
  date: string;
  mode: RecordMode;
  total: number;
  average: number;
  best: number;
  rounds: number;
  elapsedMs: number;
  penaltyMs: number;
}
export interface Preferences {
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
}
export const RECORD_KEY = 'galaxyrio.chroma-dash.records.v2';
export const LEGACY_RECORD_KEY = 'galaxyrio.chroma.records.v1';
export const PREF_KEY = 'galaxyrio.play.preferences.v1';
export const modeLabels: Record<Mode, string> = {
  accuracy: '准度挑战',
  speed: '速度挑战',
  blind: '盲猜模式',
};
export const isMode = (value: unknown): value is Mode =>
  value === 'accuracy' || value === 'speed' || value === 'blind';
export const formatAccuracy = (value: number) => value.toFixed(1) + '%';
export const formatDuration = (milliseconds: number) =>
  (milliseconds / 1000).toFixed(1) + 's';
export const recordValue = (r: GameRecord) =>
  r.mode === 'speed' ? r.elapsedMs + r.penaltyMs : r.average;
export const recordScore = (r: GameRecord) =>
  r.mode === 'speed'
    ? formatDuration(recordValue(r))
    : formatAccuracy(r.average);

export function parseRecords(raw: string | null): GameRecord[] {
  try {
    const rows: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (r): r is GameRecord =>
          r &&
          typeof r === 'object' &&
          typeof r.id === 'string' &&
          r.id.length > 0 &&
          typeof r.date === 'string' &&
          Number.isFinite(Date.parse(r.date)) &&
          (isMode(r.mode) || r.mode === 'practice') &&
          r.rounds === 10 &&
          Number.isInteger(r.total) &&
          r.total >= 0 &&
          r.total <= 1000 &&
          Number.isFinite(r.average) &&
          r.average === Math.round((r.total / 10) * 10) / 10 &&
          Number.isInteger(r.best) &&
          r.best >= r.average &&
          r.best <= Math.min(100, r.total) &&
          Number.isFinite(r.elapsedMs) &&
          r.elapsedMs >= 0 &&
          Number.isInteger(r.penaltyMs) &&
          r.penaltyMs >= 0 &&
          r.penaltyMs % 1000 === 0 &&
          (r.mode === 'speed' ? r.average > 90 : r.penaltyMs === 0),
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}
export function loadRecords(): GameRecord[] {
  try {
    return parseRecords(localStorage.getItem(RECORD_KEY));
  } catch {
    return [];
  }
}
export function saveRecord(record: GameRecord): boolean {
  try {
    if (!parseRecords(JSON.stringify([record])).length) return false;
    const rows = loadRecords();
    if (rows.some((r) => r.id === record.id)) return true;
    localStorage.setItem(
      RECORD_KEY,
      JSON.stringify([record, ...rows].slice(0, 30)),
    );
    return true;
  } catch {
    return false;
  }
}
export function bestRecord(
  mode: Mode,
  rows: GameRecord[] = loadRecords(),
): GameRecord | undefined {
  return rows
    .filter((r) => r.mode === mode)
    .reduce<GameRecord | undefined>((best, r) => {
      if (!best) return r;
      return (
        mode === 'speed'
          ? recordValue(r) < recordValue(best)
          : recordValue(r) > recordValue(best)
      )
        ? r
        : best;
    }, undefined);
}
export interface HistoryEntry {
  id: string;
  date: string;
  rounds: number;
  label: string;
  score: string;
}
export function loadHistory(): HistoryEntry[] {
  const entries: HistoryEntry[] = loadRecords().map((r) => ({
    id: r.id,
    date: r.date,
    rounds: r.rounds,
    label: r.mode === 'practice' ? '旧版 · 练习模式' : modeLabels[r.mode],
    score: recordScore(r),
  }));
  // Previous rules remain readable, but never participate in the new challenges' records.
  try {
    const old: unknown = JSON.parse(
      localStorage.getItem(LEGACY_RECORD_KEY) ?? '[]',
    );
    const labels: Record<string, string> = {
      practice: '自由练习',
      rush: '限时挑战',
      blind: '盲调实验',
    };
    if (Array.isArray(old))
      for (const r of old.slice(0, 30)) {
        if (
          !r ||
          typeof r !== 'object' ||
          typeof r.id !== 'string' ||
          typeof r.date !== 'string' ||
          !Number.isFinite(Date.parse(r.date)) ||
          !Object.hasOwn(labels, r.mode) ||
          !Number.isInteger(r.rounds) ||
          r.rounds < 0 ||
          r.rounds > 10 ||
          !Number.isFinite(r.total) ||
          r.total < 0 ||
          r.total > r.rounds * 100
        )
          continue;
        entries.push({
          id: r.id,
          date: r.date,
          rounds: r.rounds,
          label: '旧版 · ' + labels[r.mode],
          score: r.total + ' 分',
        });
      }
  } catch {}
  return entries
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 30);
}
export function loadPreferences(): Preferences {
  const defaults = { sound: true, volume: 0.25, reducedMotion: false };
  try {
    const r = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
    return {
      sound: typeof r.sound === 'boolean' ? r.sound : defaults.sound,
      volume: Number.isFinite(r.volume)
        ? Math.min(1, Math.max(0, r.volume))
        : defaults.volume,
      reducedMotion: r.reducedMotion === true,
    };
  } catch {
    return defaults;
  }
}
export function savePreferences(value: Preferences) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(value));
  } catch {}
}
