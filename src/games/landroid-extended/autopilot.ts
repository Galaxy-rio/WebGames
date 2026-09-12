/* Copyright (C) 2024–2026 The Android Open Source Project.
 * Apache-2.0; see public/licenses/landroid-extended.txt.
 * Modified: TypeScript port; relative-velocity braking and gravity compensation
 * near moving targets prevent repeated missed landings in the browser simulation. */
import type { Universe } from './engine.ts';
import {
  RULES,
  add,
  angle,
  clamp,
  distance,
  dot,
  length,
  mul,
  smooth,
  sub,
  vec,
  type Vec,
} from './physics.ts';

export type Strategy =
  | 'NONE'
  | 'CHASING'
  | 'APPROACHING'
  | 'LANDING'
  | 'LANDED'
  | 'LAUNCHING';
export class Autopilot {
  private universe: Universe;
  enabled = false;
  targetId: number | null = null;
  strategy: Strategy = 'NONE';
  brakingDistance = 0;
  landingAltitude = 0;
  leadingPosition: Vec = vec();
  relativeSpeed = 0;
  altitude = 0;
  waitUntil = 0;
  private launchUntil = 0;
  constructor(universe: Universe) {
    this.universe = universe;
  }
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.targetId = null;
    this.strategy = 'NONE';
    this.waitUntil = 0;
    this.launchUntil = 0;
    this.universe.ship.thrust = 0;
    this.universe.emit({
      type: 'autopilot',
      enabled,
      time: this.universe.time,
    });
  }
  update(dt: number): void {
    if (!this.enabled) return;
    const u = this.universe;
    const ship = u.ship;
    if (ship.landing) {
      if (this.strategy !== 'LANDED' && this.strategy !== 'LAUNCHING') {
        this.strategy = 'LANDED';
        this.targetId = null;
        this.waitUntil = u.time + RULES.sightseeingTime;
        ship.thrust = 0;
      }
      if (u.time >= this.waitUntil) {
        this.strategy = 'LAUNCHING';
        ship.thrust = 1;
        this.launchUntil = u.time + 4;
      }
      return;
    }
    if (this.strategy === 'LAUNCHING' && u.time < this.launchUntil) {
      ship.thrust = 1;
      return;
    }
    if (this.targetId === null) {
      const candidates = u.planets.filter((p) => !p.explored);
      const pool = candidates.length ? candidates : u.planets;
      const sorted = [...pool].sort(
        (a, b) =>
          distance(a.position, ship.position) -
          distance(b.position, ship.position),
      );
      this.targetId = candidates.length
        ? sorted[0]!.id
        : u.random.pick(pool).id;
    }
    const target = u.planets[this.targetId]!;
    const delta = sub(target.position, ship.position);
    const d = Math.max(length(delta), 1);
    const toward = mul(delta, 1 / d);
    const relativeVelocity = sub(ship.velocity, target.velocity);
    const closingSpeed = dot(relativeVelocity, toward);
    const lateral = sub(relativeVelocity, mul(toward, closingSpeed));
    this.relativeSpeed = length(relativeVelocity) * Math.sign(closingSpeed);
    this.altitude = d - target.radius;
    this.landingAltitude = Math.min(target.radius, 100);
    this.brakingDistance = smooth(
      this.brakingDistance,
      Math.max(0, closingSpeed) * 5,
      dt,
      5,
    );
    this.leadingPosition = add(
      target.position,
      mul(
        target.velocity,
        Math.min(this.altitude / Math.max(target.speed, 1) / 2, 1),
      ),
    );

    if (this.altitude < this.landingAltitude && length(lateral) < 35) {
      this.strategy = 'LANDING';
      ship.angle = angle(mul(toward, -1));
      ship.thrust = 0;
      return;
    }
    if (
      closingSpeed < 0 ||
      this.altitude > Math.max(this.brakingDistance, 2000)
    ) {
      this.strategy = 'CHASING';
      const desiredClosing = Math.min(
        4500,
        Math.sqrt(Math.max(0, this.altitude - RULES.shipRadius) * 560),
      );
      const desiredVelocity = add(target.velocity, mul(toward, desiredClosing));
      const acceleration = sub(
        mul(sub(desiredVelocity, ship.velocity), 0.85),
        u.gravityAt(ship.position),
      );
      ship.angle = angle(acceleration);
      ship.thrust = clamp(
        length(acceleration) / RULES.engineAcceleration,
        0,
        1,
      );
    } else {
      this.strategy = 'APPROACHING';
      // Match the planet's moving frame. Bleed off lateral drift before landing.
      const desiredClosing = Math.min(
        1400,
        Math.sqrt(Math.max(0, this.altitude - RULES.shipRadius) * 300),
      );
      const desiredRelative = mul(toward, desiredClosing);
      const acceleration = sub(
        mul(sub(desiredRelative, relativeVelocity), 1.5),
        u.gravityAt(ship.position),
      );
      ship.angle = angle(acceleration);
      ship.thrust = clamp(
        length(acceleration) / RULES.engineAcceleration,
        0,
        1,
      );
      // A nose-out approach is the original landing condition, even at high speed.
      if (
        this.altitude < Math.max(this.landingAltitude * 2, 160) &&
        length(lateral) < 55
      ) {
        ship.angle = angle(mul(toward, -1));
        ship.thrust = 0;
        this.strategy = 'LANDING';
      }
    }
  }
}
