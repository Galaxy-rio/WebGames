import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fromHex,
  toHex,
  isRGB,
  colorDifference,
  scoreColor,
  randomColor,
  type RGB,
} from '../src/lib/color.ts';
import { ColorSession } from '../src/lib/session.ts';
import {
  isMode,
  parseRecords,
  loadRecords,
  saveRecord,
  loadPreferences,
  loadHistory,
  bestRecord,
  recordScore,
  LEGACY_RECORD_KEY,
  RECORD_KEY,
  type GameRecord,
} from '../src/lib/storage.ts';

test('RGB endpoints round-trip through HEX', () => {
  for (const rgb of [
    [0, 0, 0],
    [255, 255, 255],
    [94, 131, 180],
    [1, 16, 128],
  ] as RGB[]) {
    assert.deepEqual(fromHex(toHex(rgb)), rgb);
  }
});
test('HEX accepts case and optional hash, rejects incomplete or invalid values', () => {
  assert.deepEqual(fromHex(' 68a7C4 '), [104, 167, 196]);
  for (const invalid of ['#abc', '#ZZZZZZ', '#12345', '', '1234567'])
    assert.equal(fromHex(invalid), null);
});
test('channel validation rejects out of range, fractional, NaN and malformed arrays', () => {
  for (const rgb of [
    [-1, 0, 0],
    [256, 0, 0],
    [0.5, 1, 2],
    [NaN, 0, 0],
    [1, 2],
    ['1', 2, 3],
    null,
  ])
    assert.equal(isRGB(rgb), false);
});
test('sRGB black and white have CIEDE2000 distance 100', () => {
  assert.ok(
    Math.abs(colorDifference([0, 0, 0], [255, 255, 255]) - 100) < 0.00001,
  );
});
test('identical channels score exactly 100 and near matches do not', () => {
  assert.equal(scoreColor([94, 131, 180], [94, 131, 180]), 100);
  assert.ok(scoreColor([94, 131, 180], [95, 131, 180]) < 100);
});
test('perceptual scores are symmetric and bounded', () => {
  let seed = 31;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 35; i++) {
    const a = randomColor(random),
      b = randomColor(random);
    const score = scoreColor(a, b);
    assert.ok(isRGB(a) && isRGB(b));
    assert.ok(Number.isInteger(score) && score >= 0 && score <= 100);
    assert.equal(score, scoreColor(b, a));
  }
});
test('invalid colors fail before scoring', () => {
  assert.throws(() => scoreColor([300, 1, 1], [0, 0, 0]), RangeError);
});

test('ready sessions cannot submit or edit', () => {
  const s = new ColorSession('accuracy');
  assert.equal(s.submit(0), null);
  assert.equal(s.setGuess([1, 2, 3], 0), false);
  assert.equal(s.elapsed(500), 0);
});
test('accuracy starts with a full 30 seconds for each round', () => {
  const s = new ColorSession('accuracy');
  s.start(500);
  assert.equal(s.remaining(500), 30000);
  s.submit(1000);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.tick(999999), null);
  assert.equal(s.results.length, 1);
  assert.equal(s.next(1000000), true);
  assert.equal(s.remaining(1000000), 30000);
});
test('a last-moment manual answer is accepted once', () => {
  const s = new ColorSession('accuracy');
  s.start(0);
  s.setGuess(s.target, 29998);
  assert.equal(s.submit(29999)?.score, 100);
  assert.equal(s.submit(30000), null);
  assert.equal(s.tick(30000), null);
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].timedOut, false);
});
test('at or after the deadline only the current round auto-submits once', () => {
  for (const now of [30000, 30001, 999999]) {
    const s = new ColorSession('accuracy');
    s.start(0);
    s.setGuess(s.target, 1);
    const result = s.submit(now)!;
    assert.equal(result.score, 100);
    assert.equal(result.timedOut, true);
    assert.equal(s.phase, 'reveal');
    assert.equal(s.results.length, 1);
    assert.equal(s.tick(now + 1), null);
    assert.equal(s.submit(now + 2), null);
    assert.equal(s.next(now + 3), true);
    assert.equal(s.remaining(now + 3), 30000);
  }
});
test('input arriving after the deadline cannot change the auto-submitted answer', () => {
  const s = new ColorSession('accuracy');
  s.start(0);
  s.setGuess([1, 2, 3], 1);
  assert.equal(s.setGuess(s.target, 30000), false);
  assert.deepEqual(s.results[0].guess, [1, 2, 3]);
  assert.equal(s.results[0].timedOut, true);
  assert.equal(s.phase, 'reveal');
});
test('timer tick and submit at the same deadline do not duplicate the result', () => {
  const s = new ColorSession('accuracy');
  s.start(0);
  assert.equal(s.tick(30000)?.timedOut, true);
  assert.equal(s.submit(30000), null);
  assert.equal(s.results.length, 1);
});
for (const mode of ['accuracy', 'blind'] as const)
  test('all ten ' + mode + ' timeouts finish exactly ten rounds', () => {
    const s = new ColorSession(mode);
    s.start(0);
    let start = 0;
    for (let i = 0; i < 10; i++) {
      assert.ok(s.tick(start + 30000));
      if (i < 9) {
        start += 50000;
        assert.equal(s.next(start), true);
      }
    }
    assert.equal(s.isFinished, true);
    assert.equal(s.results.length, 10);
    assert.equal(s.tick(99999999), null);
    assert.equal(s.next(99999999), false);
  });
test('speed has no per-round deadline', () => {
  for (const mode of ['speed'] as const) {
    const s = new ColorSession(mode);
    s.start(100);
    assert.equal(s.tick(1000000), null);
    assert.equal(s.remaining(1000000), Infinity);
    assert.equal(s.elapsed(1000000), 999900);
  }
});
test('guess and result snapshots do not alias the caller or live guess', () => {
  const s = new ColorSession('accuracy');
  s.start(0);
  const rgb: RGB = [1, 2, 3];
  s.setGuess(rgb, 1);
  rgb[0] = 255;
  assert.deepEqual(s.guess, [1, 2, 3]);
  const result = s.submit(2)!;
  s.guess[0] = 99;
  result.guess[1] = 99;
  assert.deepEqual(s.results[0].guess, [1, 2, 3]);
});
function guessForScore(target: RGB, score: number): RGB {
  for (let r = 0; r < 256; r++) {
    const guess: RGB = [r, target[1], target[2]];
    if (scoreColor(target, guess) === score) return guess;
  }
  throw new Error('No RGB fixture found for ' + score);
}
test('speed requires strictly greater than 90 percent and failed attempts stay on the same round', () => {
  const s = new ColorSession('speed');
  s.start(0);
  s.target = [94, 131, 180];
  const guess = guessForScore(s.target, 90);
  s.setGuess(guess, 100);
  const result = s.submit(1000)!;
  assert.equal(result.score, 90);
  assert.equal(result.passed, false);
  assert.equal(result.penaltyMs, 1000);
  assert.deepEqual(s.target, [94, 131, 180]);
  assert.deepEqual(s.guess, guess);
  assert.equal(s.results.length, 0);
  assert.equal(s.phase, 'playing');
  assert.equal(s.penaltyMs, 1000);
  assert.equal(s.totalTime(1000), 1000 + 1000);
  assert.equal(s.submit(1000), null);
});
test('91 percent passes immediately and prepares the next speed round', () => {
  const s = new ColorSession('speed');
  s.start(0);
  s.target = [94, 131, 180];
  s.setGuess(guessForScore(s.target, 91), 10);
  assert.equal(s.submit(1000)?.passed, true);
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].score, 91);
  assert.equal(s.phase, 'playing');
  assert.deepEqual(s.guess, [128, 128, 128]);
  assert.equal(s.penaltyMs, 0);
  assert.equal(s.next(2000), false);
});
test('each failed speed submission accumulates its penalty exactly once', () => {
  const s = new ColorSession('speed');
  s.start(0);
  s.target = [0, 0, 0];
  s.setGuess([255, 255, 255], 1);
  for (let i = 1; i <= 3; i++) assert.equal(s.submit(i * 1000)?.passed, false);
  assert.equal(s.penaltyMs, 3 * 1000);
  assert.equal(s.totalTime(9000), 9000 + 3 * 1000);
  assert.equal(s.results.length, 0);
});
test('ten submissions complete accuracy and blind; final score is their average, with decimals', () => {
  for (const mode of ['accuracy', 'blind'] as const) {
    const s = new ColorSession(mode);
    s.start(0);
    for (let i = 0; i < 10; i++) {
      s.target = [94, 131, 180];
      s.setGuess(
        i === 0 ? guessForScore(s.target, 91) : s.target,
        i * 1000 + 10,
      );
      assert.ok(s.submit(i * 1000 + 100));
      if (i < 9) assert.equal(s.next(i * 1000 + 200), true);
    }
    assert.equal(s.isFinished, true);
    assert.equal(s.total, 991);
    assert.equal(s.average, 99.1);
    assert.equal(s.submit(12000), null);
    assert.equal(s.results.length, 10);
  }
});
test('the tenth speed pass freezes elapsed time including every penalty', () => {
  const s = new ColorSession('speed');
  s.start(100);
  for (let i = 0; i < 10; i++) {
    s.setGuess(s.target, 1000 + i * 1000 - 1);
    s.submit(1000 + i * 1000);
  }
  assert.equal(s.phase, 'finished');
  assert.equal(s.results.length, 10);
  assert.equal(s.elapsed(900000), 9900);
  assert.equal(s.totalTime(900000), 9900 + 10 * 0);
  assert.equal(s.submit(900000), null);
  assert.equal(s.tick(900000), null);
  assert.equal(s.next(900000), false);
});
test('restart clears results, penalty, final time and old deadlines', () => {
  const s = new ColorSession('speed');
  s.start(0);
  s.target = [0, 0, 0];
  s.setGuess([255, 255, 255], 1);
  s.submit(1000);
  s.setGuess(s.target, 2000);
  s.submit(3000);
  s.start(9000);
  assert.equal(s.results.length, 0);
  assert.equal(s.lastAttempt, null);
  assert.equal(s.penaltyMs, 0);
  assert.equal(s.elapsed(9500), 500);
  assert.equal(s.phase, 'playing');
});
test('bad storage JSON and unexpected shapes cannot break parsing', () => {
  for (const raw of ['{', 'null', '{}', '5', '[null,3,"x",{}]'])
    assert.deepEqual(parseRecords(raw), []);
});
const record: GameRecord = {
  id: 'one',
  date: '2026-09-10T10:00:00.000Z',
  mode: 'accuracy',
  total: 800,
  average: 80,
  best: 99,
  rounds: 10,
  elapsedMs: 90000,
  penaltyMs: 0,
};
test('stored records validate mode and scoring bounds', () => {
  assert.deepEqual(parseRecords(JSON.stringify([record])), [record]);
  assert.deepEqual(
    parseRecords(
      JSON.stringify([
        { ...record, mode: 'unknown' },
        { ...record, total: 1001 },
        { ...record, rounds: 11 },
        { ...record, date: 'bad' },
        { ...record, elapsedMs: -1 },
        { ...record, penaltyMs: 3000 },
        { ...record, average: 99 },
        { ...record, mode: 'rush' },
        { ...record, mode: 'invalid' },
      ]),
    ),
    [],
  );
});
test('history is capped to 30 records', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({
    ...record,
    id: String(i),
  }));
  assert.equal(parseRecords(JSON.stringify(rows)).length, 30);
});
test('storage failures permit play and safe defaults', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('denied');
    },
  });
  try {
    assert.deepEqual(loadRecords(), []);
    assert.equal(saveRecord(record), false);
    assert.equal(loadPreferences().volume, 0.25);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
test('completed runs are only saved once', () => {
  const data = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  try {
    assert.equal(saveRecord(record), true);
    assert.equal(saveRecord(record), true);
    assert.equal(parseRecords(data.get(RECORD_KEY)!).length, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('challenge best records use independent modes and opposite ranking directions', () => {
  const rows: GameRecord[] = [
    { ...record, id: 'a1', mode: 'accuracy', total: 801, average: 80.1 },
    { ...record, id: 'a2', mode: 'accuracy', total: 900, average: 90 },
    { ...record, id: 'b', mode: 'blind', total: 990, average: 99 },
    {
      ...record,
      id: 's1',
      mode: 'speed',
      total: 950,
      average: 95,
      elapsedMs: 10000,
      penaltyMs: 6000,
    },
    {
      ...record,
      id: 's2',
      mode: 'speed',
      total: 950,
      average: 95,
      elapsedMs: 13000,
      penaltyMs: 0,
    },
  ];
  assert.equal(bestRecord('accuracy', rows)?.id, 'a2');
  assert.equal(bestRecord('speed', rows)?.id, 's2');
  assert.equal(bestRecord('blind', rows)?.id, 'b');
  assert.equal(recordScore(rows[0]), '80.1%');
  assert.equal(recordScore(rows[3]), '16.0s');
});
test('new speed records reject non-finite times and malformed penalty values', () => {
  const speed: GameRecord = {
    ...record,
    mode: 'speed',
    total: 950,
    average: 95,
    elapsedMs: 12345,
    penaltyMs: 1000,
  };
  assert.deepEqual(parseRecords(JSON.stringify([speed])), [speed]);
  for (const patch of [
    { elapsedMs: Infinity },
    { elapsedMs: NaN },
    { penaltyMs: -3000 },
    { penaltyMs: 100 },
    { total: 900, average: 90 },
  ]) {
    assert.deepEqual(
      parseRecords(JSON.stringify([{ ...speed, ...patch }])),
      [],
    );
  }
});
test('legacy history remains visible without changing new best scores', () => {
  const data = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const legacy = {
    id: 'old',
    date: '2026-09-09T00:00:00.000Z',
    mode: 'rush',
    rounds: 10,
    total: 999,
  };
  data.set(LEGACY_RECORD_KEY, JSON.stringify([legacy]));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  try {
    assert.equal(saveRecord(record), true);
    const history = loadHistory();
    assert.equal(history.length, 2);
    assert.equal(history[1].label, '旧版 · 限时挑战');
    assert.equal(history[1].score, '999 分');
    assert.equal(bestRecord('blind'), undefined);
    assert.equal(loadRecords().length, 1);
    assert.equal(data.get(LEGACY_RECORD_KEY), JSON.stringify([legacy]));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('blind guesses stay hidden while editing and reveal only after submission or timeout', () => {
  const s = new ColorSession('blind');
  assert.equal(s.isGuessHidden, false);
  s.start(100);
  assert.equal(s.hasRoundTimer, true);
  assert.equal(s.remaining(100), 30000);
  assert.equal(s.isGuessHidden, true);
  s.setGuess([25, 100, 240], 200);
  assert.equal(s.isGuessHidden, true);
  const submitted = s.submit(1000)!;
  assert.deepEqual(submitted.guess, [25, 100, 240]);
  assert.equal(s.isGuessHidden, false);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.next(2000), true);
  assert.equal(s.isGuessHidden, true);
  assert.equal(s.remaining(2000), 30000);
  s.setGuess([200, 10, 60], 2500);
  assert.equal(s.tick(31999), null);
  assert.equal(s.isGuessHidden, true);
  assert.equal(s.tick(32000)?.timedOut, true);
  assert.deepEqual(s.results[1].guess, [200, 10, 60]);
  assert.equal(s.isGuessHidden, false);
  assert.equal(s.penaltyMs, 0);
  s.start(40000);
  assert.equal(s.isGuessHidden, true);
  assert.equal(s.results.length, 0);
  assert.equal(s.remaining(40000), 30000);
});

test('accuracy and speed keep the guess visible during adjustment', () => {
  for (const mode of ['accuracy', 'speed'] as const) {
    const s = new ColorSession(mode);
    s.start(0);
    s.setGuess([100, 50, 150], 10);
    assert.equal(s.isGuessHidden, false);
  }
});

test('retired practice records survive saving a new blind result but are not a playable mode', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const retired: GameRecord = { ...record, id: 'retired', mode: 'practice' };
  const blind: GameRecord = {
    ...record,
    id: 'blind-new',
    mode: 'blind',
    total: 880,
    average: 88,
  };
  const data = new Map([[RECORD_KEY, JSON.stringify([retired])]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  try {
    assert.equal(isMode('practice'), false);
    assert.equal(isMode('blind'), true);
    assert.equal(saveRecord(blind), true);
    assert.equal(loadRecords().length, 2);
    assert.equal(
      loadHistory().find((r) => r.id === 'retired')?.label,
      '旧版 · 练习模式',
    );
    assert.equal(bestRecord('blind')?.id, 'blind-new');
    assert.equal(bestRecord('accuracy'), undefined);
    assert.equal(recordScore(blind), '88.0%');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
