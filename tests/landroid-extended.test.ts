import test from 'node:test';
import assert from 'node:assert/strict';
import { Universe, dailySeed } from '../src/games/landroid-extended/engine.ts';
import {
  RULES,
  add,
  distance,
  length,
  polar,
  vec,
  contactTime,
} from '../src/games/landroid-extended/physics.ts';
import {
  load,
  restore,
  snapshot,
} from '../src/games/landroid-extended/storage.ts';
import { planetGuides } from '../src/games/landroid-extended/navigation.ts';

const advance = (u: Universe, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / RULES.fixedStep); i++)
    u.step(RULES.fixedStep);
};
function readyToLand(u: Universe, outward = Math.PI) {
  const planet = u.planets[1]!;
  u.time = 10;
  u.ship.position = add(
    planet.position,
    polar(outward, planet.radius + RULES.shipRadius + 0.2),
  );
  u.ship.velocity = add(planet.velocity, polar(outward, -60));
  u.ship.angle = outward;
  return planet;
}

test('Android 17 reference seed matches the supplied screenshot, including both discovered planet descriptions', () => {
  const u = new Universe(20260324);
  assert.equal(u.star.name, 'Lollipop.W 4696');
  assert.equal(u.star.classification, 'B');
  assert.equal(Math.floor(u.star.radius), 5186);
  assert.equal(u.star.mass.toExponential(2), '2.19e+11');
  assert.equal(u.planets.length, 6);
  assert.deepEqual(
    u.planets.slice(1, 3).map(({ description, atmosphere, fauna, flora }) => ({
      description,
      atmosphere,
      fauna,
      flora,
    })),
    [
      {
        description: 'compact ploonet',
        atmosphere: 'skunky',
        fauna: 'slender',
        flora: 'communal',
      },
      {
        description: 'crowded planetoid',
        atmosphere: 'toxic',
        fauna: 'enormous',
        flora: 'alien',
      },
    ],
  );
  assert.deepEqual(new Universe(20260324).planets, u.planets);
  assert.notEqual(new Universe(20260325).star.name, u.star.name);
  assert.equal(dailySeed(new Date(2026, 3, 24)), 20260324);
});

test('ship accelerates, coasts without artificial drag, and respects the speed limit', () => {
  const u = new Universe(20260324);
  u.ship.position = vec(180000, 0);
  u.ship.gravityAfter = 100;
  u.ship.angle = Math.PI / 2;
  u.ship.thrust = 1;
  advance(u, 1);
  assert.ok(Math.abs(length(u.ship.velocity) - 1000) < 1e-6);
  u.ship.thrust = 0;
  const before = { ...u.ship.velocity };
  advance(u, 1);
  assert.deepEqual(u.ship.velocity, before);
  u.ship.thrust = 1;
  advance(u, 7);
  assert.ok(length(u.ship.velocity) <= RULES.speedLimit + 1e-6);
});

test('gravity attracts the ship and the planets remain on their circular orbits', () => {
  const u = new Universe(20260324);
  u.time = 3;
  u.ship.position = vec(10000, 0);
  const initial = length(u.ship.velocity);
  advance(u, 1);
  assert.ok(u.ship.velocity.x < 0);
  assert.ok(length(u.ship.velocity) > initial);
  for (const planet of u.planets)
    assert.ok(Math.abs(length(planet.position) - planet.orbit) < 1e-6);
});

test('swept collision catches a small planet even if both frame endpoints are outside', () => {
  assert.ok(Math.abs(contactTime(vec(-100, 0), vec(100, 0), 20)! - 0.4) < 1e-9);
  assert.equal(contactTime(vec(-100, 50), vec(100, 50), 20), null);
});

test('nose-out landings handle the +π/-π wrap and emit one discovery', () => {
  const u = new Universe(20260324);
  const planet = readyToLand(u, -Math.PI + 0.01);
  u.ship.angle = Math.PI - 0.01;
  const events: string[] = [];
  u.on((event) => events.push(event.type));
  advance(u, 0.1);
  assert.equal(u.ship.landing?.planetId, planet.id);
  assert.equal(planet.explored, true);
  assert.deepEqual(events, ['discovery', 'land']);
  assert.equal(u.flags.length, 1);
  assert.ok(u.ship.landing?.job.length);
  advance(u, 2);
  assert.ok(
    Math.abs(
      distance(u.ship.position, planet.position) -
        planet.radius -
        RULES.shipRadius,
    ) < 1e-7,
  );
  assert.equal(events.filter((e) => e === 'discovery').length, 1);
});

test('a nose-first impact bounces without falsely discovering the planet', () => {
  const u = new Universe(20260324);
  const planet = readyToLand(u);
  u.ship.angle += Math.PI;
  advance(u, 0.1);
  assert.equal(u.ship.landing, null);
  assert.equal(planet.explored, false);
  assert.ok(
    distance(u.ship.position, planet.position) >=
      planet.radius + RULES.shipRadius,
  );
});

test('a held launch takes one second, clears the surface and does not re-land each frame', () => {
  const u = new Universe(20260324);
  const planet = readyToLand(u);
  advance(u, 0.1);
  assert.ok(u.ship.landing);
  u.ship.thrust = 1;
  advance(u, 0.5);
  assert.ok(u.ship.landing);
  advance(u, 1.5);
  assert.equal(u.ship.landing, null);
  assert.equal(u.flags.length, 1);
  assert.ok(distance(u.ship.position, planet.position) > planet.radius + 100);
});

test('autopilot discovers every body across representative seeds, including takeoff and repeated travel', () => {
  for (const seed of [20260324, 20260812, 5038, 0, 17]) {
    const u = new Universe(seed);
    u.autopilot.setEnabled(true);
    let launches = 0;
    u.on((event) => {
      if (event.type === 'launch') launches++;
    });
    advance(u, 900);
    assert.equal(
      u.planets.filter((p) => p.explored).length,
      u.planets.length,
      `seed ${seed}`,
    );
    assert.ok(launches >= u.planets.length - 1);
    assert.ok(Number.isFinite(u.ship.position.x));
    u.manual(0, 0.5);
    assert.equal(u.autopilot.enabled, false);
    assert.equal(u.ship.thrust, 0.5);
  }
});

test('local save resumes orbital phase, landing, discoveries and autopilot without offscreen time jumps', () => {
  const u = new Universe(20260324);
  readyToLand(u);
  advance(u, 0.1);
  u.autopilot.setEnabled(true);
  const saved = snapshot(u);
  const restored = restore(JSON.parse(JSON.stringify(saved)));
  assert.ok(restored);
  assert.equal(restored.time, u.time);
  assert.deepEqual(
    restored.planets.map((p) => p.explored),
    u.planets.map((p) => p.explored),
  );
  assert.deepEqual(restored.ship.landing, u.ship.landing);
  assert.ok(distance(restored.ship.position, u.ship.position) < 1e-6);
  assert.equal(restored.autopilot.enabled, true);
  const time = restored.time;
  restored.step(10);
  restored.step(Number.NaN);
  assert.equal(restored.time, time);
  advance(restored, 18);
  assert.equal(restored.ship.landing, null);
});

test('damaged or out-of-bounds saves are rejected without crashing the game', () => {
  const saved = snapshot(new Universe(20260324));
  assert.equal(restore(null), null);
  assert.equal(restore({ ...saved, version: 9 }), null);
  assert.equal(restore({ ...saved, position: vec(NaN, 0) }), null);
  assert.equal(restore({ ...saved, position: vec(9999999, 0) }), null);
  assert.equal(restore({ ...saved, orbits: [] }), null);
  assert.equal(restore({ ...saved, flags: [{ planetId: 100 }] }), null);
  assert.equal(restore({ ...saved, explored: [999] }), null);
});

test('every planet gets a numbered edge bearing, including nearby planets', () => {
  const planets = [vec(1, 0), vec(0, 200), vec(-300, 0), vec(0, -10)].map(
    (position, id) => ({ id, position }),
  );
  const guides = planetGuides(1000, 600, vec(), planets);
  assert.deepEqual(
    guides.map((g) => g.id),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    guides.map((g) => g.side),
    ['right', 'bottom', 'left', 'top'],
  );
  const expected = [vec(988, 300), vec(500, 588), vec(12, 300), vec(500, 12)];
  guides.forEach((guide, i) =>
    assert.ok(distance(guide.position, expected[i]!) < 1e-9),
  );
  for (let i = 0; i < planets.length; i++)
    assert.ok(
      Math.abs(
        guides[i]!.angle -
          Math.atan2(planets[i]!.position.y, planets[i]!.position.x),
      ) < 1e-12,
    );
});

test('planet guide detail follows surface distance at the 10000 and 20000 boundaries, independent of camera scale', () => {
  const origin = vec(320, -890);
  const planets = [9999, 10000, 19999, 20000, 20001].map((altitude, id) => ({
    id,
    radius: 6000,
    position: add(origin, vec(altitude + 6000, 0)),
  }));
  for (const scale of [0.5, 1, 5]) {
    assert.deepEqual(
      planetGuides(1000, 600, origin, planets, scale).map(
        (guide) => guide.range,
      ),
      ['near', 'mid', 'mid', 'far', 'far'],
    );
  }
  assert.deepEqual(
    planetGuides(1000, 600, add(origin, vec(2000, 0)), planets, 1).map(
      (guide) => guide.range,
    ),
    ['near', 'near', 'mid', 'mid', 'mid'],
  );
});

test('crowded planet bearings stay separated inside phone and landscape edges without changing direction', () => {
  for (const [width, height] of [
    [360, 640],
    [960, 432],
  ]) {
    for (const bearing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const planets = Array.from({ length: 10 }, (_, id) => ({
        id,
        position: polar(bearing + id * 0.001, 100 + id * 10000),
      }));
      const guides = planetGuides(width!, height!, vec(), planets);
      assert.equal(guides.length, 10);
      const axis =
        guides[0]!.side === 'left' || guides[0]!.side === 'right' ? 'y' : 'x';
      const sorted = [...guides].sort(
        (a, b) => a.position[axis] - b.position[axis],
      );
      for (let i = 0; i < sorted.length; i++) {
        const guide = sorted[i]!;
        assert.ok(
          guide.position.x >= 11.9 && guide.position.x <= width! - 11.9,
        );
        assert.ok(
          guide.position.y >= 11.9 && guide.position.y <= height! - 11.9,
        );
        if (i)
          assert.ok(
            guide.position[axis] - sorted[i - 1]!.position[axis] >= 29.9,
          );
        const target = planets[guide.id]!.position;
        assert.equal(guide.angle, Math.atan2(target.y, target.x));
      }
    }
  }
  const coincident = planetGuides(360, 640, vec(), [
    { id: 0, position: vec() },
  ])[0]!;
  assert.ok(
    Number.isFinite(coincident.position.x) &&
      Number.isFinite(coincident.position.y),
  );
});

test('pre-scoring flights remain readable and untouched, while scored saves take priority', (t) => {
  const old = {
    ...snapshot(new Universe(20260324)),
    version: 1,
    challenge: undefined,
    impactContact: undefined,
  };
  const current = snapshot(new Universe(17));
  const memory = new Map([
    ['android-easter-egg-extended:v1', JSON.stringify(old)],
  ]);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  assert.equal(load()?.seed, old.seed);
  assert.equal(load()?.challenge.data.legacy, true);
  assert.equal(load()?.challenge.eligible, false);
  assert.ok(memory.has('android-easter-egg-extended:v1'));
  memory.set('landroid-extended:v2', JSON.stringify(current));
  assert.equal(load()?.seed, current.seed);
});
