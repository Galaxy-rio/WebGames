import { clamp, type Vec } from './physics.ts';

type Side = 'left' | 'right' | 'top' | 'bottom';
export interface PlanetGuide {
  id: number;
  position: Vec;
  angle: number;
  side: Side;
  range: 'far' | 'mid' | 'near';
}

/** Intersect every planet bearing with the viewport, then separate nearby labels. */
export function planetGuides(
  width: number,
  height: number,
  origin: Vec,
  planets: readonly { id: number; position: Vec; radius?: number }[],
  scale?: number,
): PlanetGuide[] {
  const inset = 12;
  const halfWidth = Math.max(1, width / 2 - inset);
  const halfHeight = Math.max(1, height / 2 - inset);
  const offscreen = planets.filter((planet) => {
    if (scale === undefined) return true;
    const x = (planet.position.x - origin.x) * scale + width / 2;
    const y = (planet.position.y - origin.y) * scale + height / 2;
    const radius = (planet.radius ?? 0) * scale;
    // Once any part of the body is in view, the body itself supplies its bearing.
    return Math.hypot(x - clamp(x, 0, width), y - clamp(y, 0, height)) > radius;
  });
  const guides = offscreen.map((planet): PlanetGuide => {
    const dx = planet.position.x - origin.x;
    const dy = planet.position.y - origin.y;
    // Use altitude, matching the flight HUD, rather than distance to the center.
    const surfaceDistance = Math.max(
      0,
      Math.hypot(dx, dy) - (planet.radius ?? 0),
    );
    // A coincident center has no bearing; keep its marker finite and visible.
    const angle = dx === 0 && dy === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const tx = halfWidth / Math.max(1e-12, Math.abs(x));
    const ty = halfHeight / Math.max(1e-12, Math.abs(y));
    const reach = Math.min(tx, ty);
    return {
      id: planet.id,
      position: { x: width / 2 + x * reach, y: height / 2 + y * reach },
      angle,
      side: tx < ty ? (x < 0 ? 'left' : 'right') : y < 0 ? 'top' : 'bottom',
      range:
        surfaceDistance >= 20_000
          ? 'far'
          : surfaceDistance >= 10_000
            ? 'mid'
            : 'near',
    };
  });
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const axis = side === 'left' || side === 'right' ? 'y' : 'x';
    const group = guides.filter((guide) => guide.side === side);
    group.sort((a, b) => a.position[axis] - b.position[axis] || a.id - b.id);
    const start = inset + 24;
    const end = Math.max(start, (axis === 'x' ? width : height) - start);
    const spacing = Math.min(30, (end - start) / Math.max(1, group.length - 1));
    for (let i = 0; i < group.length; i++) {
      const guide = group[i]!;
      guide.position[axis] = Math.max(
        clamp(guide.position[axis], start, end),
        i === 0 ? start : group[i - 1]!.position[axis] + spacing,
      );
    }
    for (let i = group.length - 1; i >= 0; i--) {
      group[i]!.position[axis] = Math.min(
        group[i]!.position[axis],
        i === group.length - 1 ? end : group[i + 1]!.position[axis] - spacing,
      );
    }
  }
  return guides;
}
