import test from 'node:test';
import assert from 'node:assert/strict';
import { Universe } from '../src/games/landroid-extended/engine.ts';
import { Challenge } from '../src/games/landroid-extended/challenge.ts';
import {
  snapshot,
  restore,
  readResults,
  rememberResult,
} from '../src/games/landroid-extended/storage.ts';
import {
  RULES,
  add,
  polar,
  vec,
} from '../src/games/landroid-extended/physics.ts';
import { planetGuides } from '../src/games/landroid-extended/navigation.ts';

const land = (challenge: Challenge, id: number, speed = 0, error = 0) =>
  challenge.handle({
    type: 'land',
    planet: { ...new Universe(20260324).planets[0]!, id },
    time: 100 + id,
    relativeSpeed: speed,
    angleError: error,
  });

test('new flights start with 5000 and fractional travel/fuel costs are independent of frame rate', () => {
  for (const fps of [30, 60, 120]) {
    const c = new Challenge(6);
    assert.equal(c.score, 5000);
    c.start();
    for (let frame = 0; frame < fps * 10; frame++)
      c.advance(1 / fps, 0.5, true);
    assert.equal(c.score, 4400);
    assert.ok(Math.abs(c.data.flightSeconds - 10) < 1e-9);
    assert.ok(Math.abs(c.data.fuelSeconds - 5) < 1e-9);
    c.advance(1 / fps, 1, false);
    assert.equal(c.score, 4400);
  }
  const c = new Challenge(6);
  c.start();
  for (let i = 0; i < 120; i++) c.advance(1 / 120, 1, true);
  assert.equal(c.score, 4890);
  for (let i = 0; i < 120; i++) c.advance(1 / 120, 0, true);
  assert.equal(c.score, 4880);
  c.advance(NaN, 1, true);
  c.advance(-1, 1, true);
  c.advance(50, 1, true);
  assert.equal(c.score, 4880);
});

test('new flights do not charge waiting time until the first manual input, then coasting keeps the clock running', () => {
  const u = new Universe(20260324);
  for (let i = 0; i < 120 * 30; i++) u.step(RULES.fixedStep);
  assert.equal(u.challenge.score, 5000);
  assert.equal(u.challenge.data.flightSeconds, 0);
  assert.equal(u.challenge.data.fuelSeconds, 0);
  const waiting = restore(snapshot(u))!;
  assert.ok(waiting);
  assert.equal(waiting.challenge.data.started, false);
  for (let i = 0; i < 120 * 10; i++) waiting.step(RULES.fixedStep);
  assert.equal(waiting.challenge.score, 5000);
  waiting.manual(undefined, 0);
  for (let i = 0; i < 120; i++) waiting.step(RULES.fixedStep);
  assert.equal(waiting.challenge.data.started, true);
  assert.equal(waiting.challenge.score, 4990);
  assert.equal(waiting.challenge.data.fuelSeconds, 0);
  const active = restore(snapshot(waiting))!;
  assert.ok(active);
  for (let i = 0; i < 120; i++) active.step(RULES.fixedStep);
  assert.equal(active.challenge.score, 4980);
  assert.equal(new Universe(17).challenge.data.started, false);
});

test('older saves keep their running clock, and malformed start flags cannot bypass recorded costs', () => {
  const u = new Universe(20260324);
  u.manual(undefined, 0);
  for (let i = 0; i < 120; i++) u.step(RULES.fixedStep);
  const saved = snapshot(u);
  const old = JSON.parse(JSON.stringify(saved));
  delete old.challenge.started;
  const restored = restore(old)!;
  assert.ok(restored);
  assert.equal(restored.challenge.data.started, true);
  assert.equal(restored.challenge.score, 4990);
  for (let i = 0; i < 120; i++) restored.step(RULES.fixedStep);
  assert.equal(restored.challenge.score, 4980);
  for (const started of [false, 'false', null])
    assert.equal(
      restore({ ...saved, challenge: { ...saved.challenge, started } }),
      null,
    );
});

test('first landing scores relative speed and cosine error; repeat landings cannot farm any bonus', () => {
  const c = new Challenge(3);
  land(c, 0, 200, Math.PI / 6);
  assert.equal(
    c.score,
    5000 + 3000 + 2400 + Math.round(Math.cos(Math.PI / 6) * 3000),
  );
  const score = c.score;
  land(c, 0);
  assert.equal(c.score, score);
  land(c, 1, 1500);
  assert.equal(c.data.speedBonus, 2400);
  assert.equal(c.data.sequenceBonus, 0);
  land(c, 2);
  assert.equal(c.data.sequenceBonus, 2000);
  assert.ok(c.finished);
  const final = c.score;
  c.advance(0.1, 1, true);
  land(c, 2);
  assert.equal(c.score, final);
});

test('only a complete ordered first-discovery sequence earns the one-time 2000 bonus', () => {
  const ordered = new Challenge(9);
  for (let id = 0; id < 8; id++) land(ordered, id);
  assert.equal(ordered.data.sequenceBonus, 0);
  land(ordered, 8);
  assert.equal(ordered.score, 5000 + 9 * 9000 + 2000);
  const unordered = new Challenge(3);
  for (const id of [1, 0, 1, 2]) land(unordered, id);
  assert.equal(unordered.data.sequenceBonus, 0);
  assert.equal(unordered.score, 5000 + 3 * 9000);
});

test('AUTO permanently stops scoring for that run, including after manual takeover and save/restore', () => {
  const u = new Universe(20260324);
  u.step(0.1);
  const before = u.challenge.score;
  u.autopilot.setEnabled(true);
  u.step(0.1);
  u.manual(0, 1);
  for (let i = 0; i < 120; i++) u.step(RULES.fixedStep);
  assert.equal(u.challenge.score, before);
  assert.equal(u.challenge.eligible, false);
  const resumed = restore(snapshot(u))!;
  assert.ok(resumed);
  resumed.manual(0, 1);
  resumed.step(0.1);
  assert.equal(resumed.challenge.score, before);
  assert.equal(resumed.challenge.eligible, false);
  assert.equal(new Universe(17).challenge.score, 5000);
  assert.equal(new Universe(17).challenge.eligible, true);
});

test('only a new nose contact deducts 500, not a side contact or repeated contact frames', () => {
  const c = new Challenge(6);
  const planet = new Universe(20260324).planets[0]!;
  for (const [headOn, newContact] of [
    [false, true],
    [true, false],
    [true, true],
    [true, false],
  ])
    c.handle({
      type: 'impact',
      planet,
      time: 5,
      headOn: headOn!,
      newContact: newContact!,
    });
  assert.equal(c.score, 4500);
  assert.equal(c.data.impacts, 1);
});

test('physics reports landing speed and angle before snapping ship velocity and heading to the surface', () => {
  const u = new Universe(20260324);
  const p = u.planets[1]!;
  const outward = 0.8;
  u.time = 10;
  u.ship.gravityAfter = 100;
  u.ship.position = add(
    p.position,
    polar(outward, p.radius + RULES.shipRadius + 0.02),
  );
  u.ship.velocity = add(p.velocity, polar(outward, -320));
  u.ship.angle = outward + 0.2;
  let measured: { relativeSpeed: number; angleError: number } | undefined;
  u.on((event) => {
    if (event.type === 'land') measured = event;
  });
  u.step(RULES.fixedStep);
  assert.ok(measured);
  assert.ok(Math.abs(measured.relativeSpeed - 320) < 0.1);
  assert.ok(Math.abs(measured.angleError - 0.2) < 0.001);
  assert.ok(
    u.challenge.data.speedBonus < 2100 && u.challenge.data.speedBonus > 2000,
  );
  assert.ok(u.challenge.data.angleBonus < 3000);
  assert.equal(restore(snapshot(u))!.challenge.score, u.challenge.score);
});

test('costs allow negative integer scores and on-planet dwell costs nothing', () => {
  const c = new Challenge(6);
  c.start();
  for (let i = 0; i < 120 * 50; i++) c.advance(1 / 120, 1, true);
  assert.equal(c.score, -500);
  for (let i = 0; i < 120 * 60; i++) c.advance(1 / 120, 1, false);
  assert.equal(c.score, -500);
});

test('visible and partly visible planets lose their edge guides when the original camera zooms out', () => {
  const planets = [
    { id: 0, position: vec(600, 0), radius: 60 },
    { id: 1, position: vec(0, 50), radius: 10 },
    { id: 2, position: vec(480, 0), radius: 50 },
  ];
  assert.deepEqual(
    planetGuides(900, 600, vec(), planets, 1).map((g) => g.id),
    [0],
  );
  assert.deepEqual(
    planetGuides(900, 600, vec(), planets, 0.1).map((g) => g.id),
    [],
  );
});

test('completed eligible results survive persistence and are recorded only once per flight', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
  t.after(() =>
    previous
      ? Object.defineProperty(globalThis, 'localStorage', previous)
      : Reflect.deleteProperty(globalThis, 'localStorage'),
  );
  const u = new Universe(20260324);
  for (const p of u.planets) land(u.challenge, p.id);
  const result = u.challenge.result(u.seed)!;
  assert.ok(rememberResult(result));
  assert.ok(rememberResult(result));
  assert.equal(readResults().length, 1);
  assert.equal(readResults()[0]!.score, result.score);
  assert.equal(rememberResult({ ...result, eligible: false }), false);
});
