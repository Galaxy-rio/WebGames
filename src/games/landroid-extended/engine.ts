/* Copyright (C) 2023–2026 The Android Open Source Project.
 * Apache-2.0; see public/licenses/landroid-extended.txt.
 * Modified: TypeScript port; fixed-step integration, swept collisions, event hooks,
 * normalized landing angles, and browser persistence support. */
import { Namer, Random } from './random.ts';
import { Autopilot } from './autopilot.ts';
import { Challenge } from './challenge.ts';
import {
  RULES,
  TAU,
  add,
  angle,
  angleDifference,
  clamp,
  contactTime,
  distance,
  dot,
  length,
  mul,
  polar,
  sub,
  vec,
  type Vec,
} from './physics.ts';

export interface Planet {
  id: number;
  name: string;
  radius: number;
  mass: number;
  position: Vec;
  previous: Vec;
  velocity: Vec;
  orbit: number;
  orbitAngle: number;
  speed: number;
  color: string;
  description: string;
  atmosphere: string;
  flora: string;
  fauna: string;
  explored: boolean;
}
export interface Star extends Planet {
  classification: string;
}
export interface Landing {
  planetId: number;
  angle: number;
  job: string;
  time: number;
}
export interface Ship {
  position: Vec;
  velocity: Vec;
  angle: number;
  thrust: number;
  landing: Landing | null;
  launchTime: number | null;
  gravityAfter: number;
  transit: boolean;
}
export interface Particle {
  position: Vec;
  velocity: Vec;
  life: number;
  ttl: number;
  impact: boolean;
}
export type GameEvent =
  | { type: 'discovery'; planet: Planet; time: number }
  | { type: 'launch'; planet: Planet; time: number }
  | {
      type: 'land';
      planet: Planet;
      time: number;
      relativeSpeed: number;
      angleError: number;
    }
  | {
      type: 'impact';
      planet: Planet;
      time: number;
      headOn: boolean;
      newContact: boolean;
    }
  | { type: 'autopilot'; enabled: boolean; time: number };

const STAR_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const;
const STAR_COLORS = [
  '#6666ff',
  '#ccccff',
  '#eeeeff',
  '#ffffff',
  '#ffff66',
  '#ffcc33',
  '#ff8800',
];
const f = Math.fround;
// Kotlin's original `4 / 3` uses integer division. Preserve its effective mass.
const mass = (radius: number, density: number) =>
  f(f(f(Math.PI) * f(radius ** 3)) * density);
const emptyPlanet = (): Planet => ({
  id: -1,
  name: '',
  radius: 0,
  mass: 0,
  position: vec(),
  previous: vec(),
  velocity: vec(),
  orbit: 0,
  orbitAngle: 0,
  speed: 0,
  color: '#a7a7ca',
  description: '',
  atmosphere: '',
  flora: '',
  fauna: '',
  explored: false,
});

export function dailySeed(date = new Date()): number {
  // AOSP uses Calendar.MONTH (zero-based).
  return date.getFullYear() * 10_000 + date.getMonth() * 100 + date.getDate();
}

export class Universe {
  readonly seed: number;
  readonly random: Random;
  readonly effects: Random;
  readonly namer = new Namer();
  readonly star: Star;
  readonly planets: Planet[] = [];
  readonly ship: Ship;
  readonly autopilot: Autopilot;
  readonly challenge: Challenge;
  impactContact: number | null = null;
  time = 0;
  flags: Landing[] = [];
  track: Vec[] = [];
  particles: Particle[] = [];
  latestDiscovery: number | null = null;
  private listeners = new Set<(event: GameEvent) => void>();
  private trackClock = 0;

  constructor(seed = dailySeed()) {
    this.seed = Number.isSafeInteger(seed) && seed >= 0 ? seed : dailySeed();
    this.random = new Random(this.seed);
    this.effects = new Random(this.seed + 77);
    const rng = this.random;
    const name = this.namer.system(rng);
    const cls = rng.int(STAR_CLASSES.length);
    const radius = rng.range(1000, 8000);
    this.star = {
      ...emptyPlanet(),
      name,
      radius,
      mass: mass(radius, 0.5),
      classification: STAR_CLASSES[cls]!,
      color: STAR_COLORS[cls]!,
    };
    const count = rng.int(10) + 1;
    for (let i = 0; i < count; i++) {
      const r = rng.range(50, 2000);
      const orbit = rng.range(RULES.orbitMin, RULES.orbitMax);
      const period = f(f(Math.sqrt(f(f(orbit ** 3) / this.star.mass))) * 50);
      const speed = f(f(f(2 * f(Math.PI)) * orbit) / period);
      const orbitAngle = f(rng.float() * f(TAU));
      const position = polar(orbitAngle, orbit);
      const description = this.namer.planet(rng);
      const atmosphere = this.namer.descriptor('atmo', rng);
      const flora = this.namer.descriptor('life', rng);
      const fauna = this.namer.descriptor('life', rng);
      this.planets.push({
        ...emptyPlanet(),
        radius: r,
        mass: mass(r, 2.5),
        orbit,
        orbitAngle,
        speed,
        position,
        previous: { ...position },
        velocity: polar(orbitAngle + Math.PI / 2, speed),
        description,
        atmosphere,
        flora,
        fauna,
        color: `hsl(${r % 360} 100% 62.5%)`,
      });
    }
    this.planets.sort((a, b) => a.orbit - b.orbit);
    this.planets.forEach((p, id) => {
      p.id = id;
      p.name = `${name} ${id + 1}`;
    });
    const startAngle = f(rng.float() * f(TAU));
    const startOrbit = rng.range(RULES.orbitMin, RULES.orbitMax);
    this.ship = {
      position: polar(startAngle, startOrbit),
      velocity: vec(),
      angle: f(rng.float() * f(TAU)),
      thrust: 0,
      landing: null,
      launchTime: null,
      gravityAfter: 2,
      transit: false,
    };
    this.challenge = new Challenge(this.planets.length);
    this.autopilot = new Autopilot(this);
  }

  on(listener: (event: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: GameEvent): void {
    this.challenge.handle(event);
    this.listeners.forEach((listener) => listener(event));
  }
  closest(): Planet {
    return [...this.planets, this.star].reduce((a, b) =>
      distance(a.position, this.ship.position) <
      distance(b.position, this.ship.position)
        ? a
        : b,
    );
  }
  gravityAt(position: Vec): Vec {
    let result = vec();
    for (const body of [this.star, ...this.planets]) {
      const delta = sub(body.position, position);
      const d = length(delta);
      if (d > body.radius && d > 0)
        result = add(
          result,
          mul(delta, (RULES.gravity * RULES.shipMass * body.mass) / d ** 3),
        );
    }
    return result;
  }
  manual(heading?: number, thrust = 0): void {
    if (this.autopilot.enabled) this.autopilot.setEnabled(false);
    if (heading !== undefined && !this.ship.landing) this.ship.angle = heading;
    this.ship.thrust = clamp(thrust, 0, 1);
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
    this.time += dt;
    for (const p of this.planets) {
      p.previous = p.position;
      p.orbitAngle = (p.orbitAngle + (p.speed / p.orbit) * dt) % TAU;
      p.position = polar(p.orbitAngle, p.orbit);
      p.velocity = mul(sub(p.position, p.previous), 1 / dt);
    }
    this.autopilot.update(dt);
    const ship = this.ship;
    if (this.impactContact !== null) {
      const body = this.planets[this.impactContact]!;
      if (
        distance(ship.position, body.position) >
        body.radius + RULES.shipRadius + 2
      )
        this.impactContact = null;
    }
    ship.transit =
      distance(ship.position, this.star.position) < this.star.radius;
    if (ship.landing) {
      const planet = this.planets[ship.landing.planetId]!;
      ship.angle = ship.landing.angle;
      ship.position = add(
        planet.position,
        polar(ship.angle, planet.radius + RULES.shipRadius),
      );
      ship.velocity = { ...planet.velocity };
      if (ship.thrust > 0) {
        ship.launchTime ??= this.time;
        if (this.time - ship.launchTime >= RULES.launchDelay) {
          ship.landing = null;
          // Free integration starts in the previous planet frame; otherwise its
          // orbital displacement is counted twice and creates spurious contacts.
          ship.position = add(
            planet.previous,
            polar(ship.angle, planet.radius + RULES.shipRadius + 0.1),
          );
          ship.gravityAfter = this.time + RULES.launchGrace;
          ship.launchTime = null;
          this.emit({ type: 'launch', planet, time: this.time });
        }
      } else ship.launchTime = null;
    }
    this.challenge.advance(dt, ship.thrust, !ship.landing);
    if (!ship.landing) {
      if (this.time > ship.gravityAfter)
        ship.velocity = add(
          ship.velocity,
          mul(this.gravityAt(ship.position), dt),
        );
      ship.velocity = add(
        ship.velocity,
        polar(ship.angle, ship.thrust * RULES.engineAcceleration * dt),
      );
      const speed = length(ship.velocity);
      if (speed > RULES.speedLimit)
        ship.velocity = mul(ship.velocity, RULES.speedLimit / speed);
      const previous = ship.position;
      ship.position = add(previous, mul(ship.velocity, dt));
      this.collide(previous);
      const edge = RULES.universeRadius - RULES.shipRadius;
      if (length(ship.position) > edge) {
        const normal = mul(ship.position, 1 / length(ship.position));
        ship.position = mul(normal, edge);
        const outward = dot(ship.velocity, normal);
        if (outward > 0)
          ship.velocity = sub(ship.velocity, mul(normal, outward));
      }
    }
    this.flags = this.flags.filter(
      (flag) =>
        this.time - flag.time < RULES.flagLifetime || flag === ship.landing,
    );
    this.trackClock += dt;
    if (this.trackClock >= 1 / 60) {
      this.trackClock %= 1 / 60;
      this.track.push({ ...ship.position });
      if (this.track.length >= 10_000) this.track.splice(0, 2);
    }
    this.updateParticles(dt);
  }

  private collide(previous: Vec): void {
    const ship = this.ship;
    let collision: { planet: Planet; t: number } | null = null;
    for (const planet of this.planets) {
      const t = contactTime(
        sub(previous, planet.previous),
        sub(ship.position, planet.position),
        planet.radius + RULES.shipRadius,
      );
      if (t !== null && (!collision || t < collision.t))
        collision = { planet, t };
    }
    if (!collision) return;
    const { planet, t } = collision;
    const relative = add(
      sub(previous, planet.previous),
      mul(
        sub(
          sub(ship.position, planet.position),
          sub(previous, planet.previous),
        ),
        t,
      ),
    );
    const normalAngle = angle(relative);
    const angleError = Math.abs(angleDifference(ship.angle, normalAngle));
    const relativeSpeed = length(sub(ship.velocity, planet.velocity));
    const normal = polar(normalAngle, 1);
    ship.position = add(
      planet.position,
      mul(normal, planet.radius + RULES.shipRadius + 0.01),
    );
    if (angleError < Math.PI / 4) {
      this.impactContact = null;
      const landing: Landing = {
        planetId: planet.id,
        angle: normalAngle,
        job: this.namer.activity(this.random, planet),
        time: this.time,
      };
      ship.landing = landing;
      ship.angle = normalAngle;
      ship.velocity = { ...planet.velocity };
      ship.thrust = 0;
      ship.launchTime = null;
      this.flags.push(landing);
      if (!planet.explored) {
        planet.explored = true;
        this.latestDiscovery = planet.id;
        this.emit({ type: 'discovery', planet, time: this.time });
      }
      this.emit({
        type: 'land',
        planet,
        time: this.time,
        relativeSpeed,
        angleError,
      });
    } else {
      const relativeVelocity = sub(ship.velocity, planet.velocity);
      const inward = dot(relativeVelocity, normal);
      if (inward < 0)
        ship.velocity = add(
          planet.velocity,
          sub(relativeVelocity, mul(normal, inward * 1.65)),
        );
      for (let i = 0; i < 10; i++)
        this.particles.push({
          position: { ...ship.position },
          velocity: add(
            planet.velocity,
            polar(this.effects.range(0, TAU), this.effects.range(10, 90)),
          ),
          life: 0.7,
          ttl: 0.7,
          impact: true,
        });
      const newContact = this.impactContact !== planet.id;
      this.impactContact = planet.id;
      this.emit({
        type: 'impact',
        planet,
        time: this.time,
        headOn: angleError > Math.PI / 2,
        newContact,
      });
    }
  }

  private updateParticles(dt: number): void {
    const ship = this.ship;
    if (this.effects.float() < ship.thrust * dt * 60) {
      const ttl = this.effects.range(0.5, 1);
      this.particles.push({
        position: add(ship.position, polar(ship.angle, -5)),
        velocity: add(
          ship.velocity,
          polar(ship.angle + this.effects.range(-0.2, 0.2), -170 * ship.thrust),
        ),
        life: ttl,
        ttl,
        impact: false,
      });
    }
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.position = add(p.position, mul(p.velocity, dt));
      return p.life > 0;
    });
  }
}
