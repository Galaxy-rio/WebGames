/* Copyright (C) 2023–2026 The Android Open Source Project.
 * Apache-2.0; see public/licenses/landroid-extended.txt.
 * Modified: Canvas 2D rendering, viewport culling and numbered planet bearings. */
import { legsPath, planetTextures, shipPath } from './art.ts';
import type { Planet, Universe } from './engine.ts';
import { planetGuides } from './navigation.ts';
import {
  RULES,
  TAU,
  add,
  clamp,
  distance,
  length,
  polar,
  smooth,
  sub,
  vec,
  type Vec,
} from './physics.ts';

export const COLORS = {
  background: '#16161d',
  grid: '#292936',
  orbit: '#3c3c4f',
  console: '#b7b7ff',
  unknown: '#a7a7ca',
  auto: '#4285f4',
  track: '#34a853',
  flag: '#c6ff00',
} as const;
export interface Stick {
  origin: Vec;
  current: Vec;
  min: number;
  max: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly guideCanvas: HTMLCanvasElement;
  readonly guideContext: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  zoom = 1;
  showGrid = true;
  showGravity = true;
  showGuides = true;
  stick: Stick | null = null;
  private center = vec();
  private scale = 1;
  private ship = new Path2D(shipPath);
  private legs = new Path2D(legsPath);
  private textures = planetTextures.map((path) => new Path2D(path));
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, guideCanvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.guideCanvas = guideCanvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    const guideCtx = guideCanvas.getContext('2d');
    if (!ctx || !guideCtx)
      throw new Error('此浏览器无法启动 Canvas 2D，请尝试新版浏览器。');
    this.context = ctx;
    this.guideContext = guideCtx;
    this.resize();
  }
  resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.guideCanvas.width = this.canvas.width;
    this.guideCanvas.height = this.canvas.height;
  }
  private point(p: Vec): Vec {
    return vec(
      (p.x - this.center.x) * this.scale + this.width / 2,
      (p.y - this.center.y) * this.scale + this.height / 2,
    );
  }
  private line(a: Vec, b: Vec, color: string, width = 1): void {
    const ctx = this.context;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  private circle(
    center: Vec,
    radius: number,
    color: string,
    width = 1,
    fill = false,
  ): void {
    if (!Number.isFinite(radius) || radius <= 0) return;
    const ctx = this.context;
    const farX = Math.max(Math.abs(center.x), Math.abs(center.x - this.width));
    const farY = Math.max(Math.abs(center.y), Math.abs(center.y - this.height));
    if (!fill && radius > Math.hypot(farX, farY) + width) return;
    if (
      center.x + radius < 0 ||
      center.x - radius > this.width ||
      center.y + radius < 0 ||
      center.y - radius > this.height
    )
      return;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, TAU);
    if (fill) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  private polygon(
    center: Vec,
    radius: number,
    sides: number,
    rotation: number,
    color: string,
    alternate = radius,
    width = 1,
  ): void {
    const ctx = this.context;
    ctx.beginPath();
    for (let i = 0; i < sides * 2; i++) {
      const p = add(
        center,
        polar(rotation + (i * Math.PI) / sides, i % 2 ? alternate : radius),
      );
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  render(u: Universe, dt: number): void {
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.width, this.height);
    const nearest = u.closest();
    const surfaceDistance = Math.max(
      1,
      distance(u.ship.position, nearest.position) - nearest.radius * 1.2,
    );
    const target = u.autopilot.enabled
      ? clamp(500 / surfaceDistance, 0.00125, 5)
      : 1;
    this.zoom = smooth(this.zoom, target, dt);
    this.center = u.ship.position;
    this.scale = this.zoom * 0.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.showGrid) this.drawGrid();
    ctx.setLineDash([8, 8]);
    this.circle(
      this.point(vec()),
      RULES.universeRadius * this.scale,
      '#800000',
    );
    ctx.setLineDash([]);
    const starPosition = this.point(u.star.position);
    if (this.showGravity) this.drawGravity(u.star, u.time);
    this.circle(
      starPosition,
      u.star.radius * this.scale,
      u.star.color,
      1,
      true,
    );
    if (
      distance(starPosition, vec(this.width / 2, this.height / 2)) <
      u.star.radius * this.scale + Math.hypot(this.width, this.height)
    ) {
      this.polygon(
        starPosition,
        (u.star.radius + 80) * this.scale,
        37,
        (u.time / 23) * TAU,
        u.star.color,
        (u.star.radius + 250) * this.scale,
        1.5,
      );
      this.polygon(
        starPosition,
        (u.star.radius + 20) * this.scale,
        38,
        (-u.time / 19) * TAU,
        u.star.color,
        (u.star.radius + 200) * this.scale,
        1.5,
      );
    }
    for (const planet of u.planets) this.drawPlanet(planet, u);
    for (const flag of u.flags) {
      const p = u.planets[flag.planetId]!;
      const base = this.point(add(p.position, polar(flag.angle, p.radius)));
      const tip = this.point(add(p.position, polar(flag.angle, p.radius + 80)));
      this.line(base, tip, COLORS.flag, 1.1);
      const side = this.point(
        add(
          add(p.position, polar(flag.angle, p.radius + 70)),
          polar(flag.angle + Math.PI / 2, 20),
        ),
      );
      const bottom = this.point(
        add(p.position, polar(flag.angle, p.radius + 60)),
      );
      this.line(tip, side, COLORS.flag, 1.1);
      this.line(side, bottom, COLORS.flag, 1.1);
    }
    if (u.autopilot.enabled && u.autopilot.targetId !== null) {
      const auto = u.autopilot;
      const targetPlanet = u.planets[auto.targetId!]!;
      const position = this.point(targetPlanet.position);
      this.polygon(
        position,
        (targetPlanet.radius + auto.brakingDistance) * this.scale,
        15,
        (u.time * TAU) / 10,
        '#4285f477',
      );
      this.circle(
        position,
        (targetPlanet.radius + auto.landingAltitude / 2) * this.scale,
        '#4285f422',
        Math.max(1, auto.landingAltitude * this.scale),
      );
      this.line(
        this.point(u.ship.position),
        this.point(auto.leadingPosition),
        '#4285f477',
      );
      this.circle(this.point(auto.leadingPosition), 3, '#4285f4aa');
    }
    ctx.beginPath();
    for (let i = 0; i < u.track.length - 1; i += 2) {
      const a = this.point(u.track[i]!);
      const b = this.point(u.track[i + 1]!);
      if (
        Math.max(a.x, b.x) < 0 ||
        Math.min(a.x, b.x) > this.width ||
        Math.max(a.y, b.y) < 0 ||
        Math.min(a.y, b.y) > this.height
      )
        continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = COLORS.track;
    ctx.lineWidth = 0.65;
    ctx.stroke();
    for (const p of u.particles) {
      const age = 1 - p.life / p.ttl;
      this.circle(
        this.point(p.position),
        p.impact ? 1 : (Math.exp(1 + age * 2) - 1) * this.scale,
        `rgba(255,255,255,${(1 - age) * 0.3})`,
        0.6,
        p.impact,
      );
    }
    const shipPosition = this.point(u.ship.position);
    ctx.save();
    ctx.translate(shipPosition.x, shipPosition.y);
    ctx.rotate(u.ship.angle);
    ctx.scale(this.scale, this.scale);
    ctx.strokeStyle = u.ship.transit ? '#000000' : '#ffffff';
    ctx.lineWidth = 1.1 / this.scale;
    if (u.ship.landing) {
      ctx.strokeStyle = '#cccccc';
      ctx.stroke(this.legs);
      ctx.strokeStyle = '#ffffff';
    }
    ctx.fillStyle = COLORS.background;
    ctx.fill(this.ship);
    ctx.stroke(this.ship);
    if (u.ship.thrust > 0) {
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-3.5, -2.6);
      ctx.lineTo(-3.5, 2.6);
      ctx.closePath();
      ctx.strokeStyle = '#ff8800';
      ctx.stroke();
    }
    ctx.restore();
    this.guideContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.guideContext.clearRect(0, 0, this.width, this.height);
    if (this.showGuides) this.drawGuides(u);
    if (this.stick) this.drawStick(this.stick);
  }

  private drawGrid(): void {
    let step = 1000;
    while (step * this.scale < 32) step *= 10;
    const left = this.center.x - this.width / this.scale / 2;
    const top = this.center.y - this.height / this.scale / 2;
    const right = left + this.width / this.scale;
    const bottom = top + this.height / this.scale;
    for (let x = Math.floor(left / step) * step; x < right; x += step) {
      const px = this.point(vec(x, 0)).x;
      this.line(
        vec(px, 0),
        vec(px, this.height),
        COLORS.grid,
        x % (step * 10) === 0 ? 1.2 : 0.65,
      );
    }
    for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
      const py = this.point(vec(0, y)).y;
      this.line(
        vec(0, py),
        vec(this.width, py),
        COLORS.grid,
        y % (step * 10) === 0 ? 1.2 : 0.65,
      );
    }
  }
  private drawGravity(planet: Planet, time: number): void {
    for (let i = 0; i < 10; i++) {
      const force = 2000 + ((0.01 - 2000) * (i - (time % 1))) / 10;
      const radius = Math.sqrt(
        (RULES.gravity * planet.mass * RULES.shipMass) / force,
      );
      this.circle(
        this.point(planet.position),
        radius * this.scale,
        `rgba(255,0,0,${0.75 - (0.65 * i) / 10})`,
        0.85,
      );
    }
  }
  private drawPlanet(planet: Planet, u: Universe): void {
    const ctx = this.context;
    this.circle(
      this.point(vec()),
      planet.orbit * this.scale,
      COLORS.orbit,
      0.65,
    );
    if (this.showGravity) this.drawGravity(planet, u.time);
    const center = this.point(planet.position);
    const radius = planet.radius * this.scale;
    if (
      center.x + radius < 0 ||
      center.x - radius > this.width ||
      center.y + radius < 0 ||
      center.y - radius > this.height
    )
      return;
    const color = planet.explored ? planet.color : COLORS.unknown;
    this.circle(center, radius, COLORS.background, 1, true);
    if (
      planet.explored &&
      this.zoom > 0.05 &&
      distance(planet.position, u.ship.position) < 10_000
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, TAU);
      ctx.clip();
      ctx.translate(center.x, center.y);
      ctx.rotate((TAU * (planet.radius % 100)) / 100);
      ctx.translate(-radius, -radius);
      const textureScale = radius / 64;
      ctx.scale(textureScale, textureScale);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6 / textureScale;
      ctx.stroke(
        this.textures[
          Math.floor(((planet.radius % 17) / 17) * this.textures.length)
        ]!,
      );
      ctx.restore();
    }
    this.circle(center, radius, color, 1.1);
  }
  private drawGuides(u: Universe): void {
    const ctx = this.guideContext;
    ctx.save();
    ctx.font = '10px "Landroid Mono", monospace';
    ctx.textBaseline = 'middle';
    for (const guide of planetGuides(
      this.width,
      this.height,
      u.ship.position,
      u.planets,
      this.scale,
    )) {
      const planet = u.planets[guide.id]!;
      const color = planet.explored ? planet.color : COLORS.unknown;
      ctx.save();
      ctx.translate(guide.position.x, guide.position.y);
      ctx.rotate(guide.angle);
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -5.5);
      ctx.lineTo(-6, 5.5);
      ctx.closePath();
      ctx.fillStyle = COLORS.background;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (guide.range !== 'far') {
        ctx.beginPath();
        ctx.moveTo(2.5, 0);
        ctx.lineTo(-3.5, -2.35);
        ctx.lineTo(-3.5, 2.35);
        ctx.closePath();
        ctx.stroke();
      }
      if (guide.range === 'near') {
        ctx.beginPath();
        ctx.moveTo(-0.3, -6.3);
        ctx.lineTo(-5.7, -8.4);
        ctx.moveTo(-0.3, 6.3);
        ctx.lineTo(-5.7, 8.4);
        ctx.stroke();
      }
      ctx.restore();
      const offsetX =
        guide.side === 'left' ? 12 : guide.side === 'right' ? -12 : 0;
      const offsetY =
        guide.side === 'top' ? 14 : guide.side === 'bottom' ? -14 : 0;
      ctx.textAlign =
        guide.side === 'left'
          ? 'left'
          : guide.side === 'right'
            ? 'right'
            : 'center';
      const label = String(guide.id + 1).padStart(2, '0');
      ctx.strokeStyle = COLORS.background;
      ctx.lineWidth = 3;
      ctx.strokeText(
        label,
        guide.position.x + offsetX,
        guide.position.y + offsetY,
      );
      ctx.fillStyle = color;
      ctx.fillText(
        label,
        guide.position.x + offsetX,
        guide.position.y + offsetY,
      );
    }
    ctx.restore();
  }
  private drawStick(stick: Stick): void {
    const delta = sub(stick.current, stick.origin);
    const magnitude = Math.min(stick.max, length(delta));
    const ctx = this.context;
    if (magnitude < stick.min) ctx.setLineDash([1, 2]);
    this.circle(stick.origin, Math.max(stick.min, magnitude), '#00ff00', 0.85);
    ctx.setLineDash([]);
    this.line(
      stick.origin,
      add(stick.origin, polar(Math.atan2(delta.y, delta.x), magnitude)),
      '#00ff00',
      0.85,
    );
  }
}
