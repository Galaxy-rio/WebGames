/* Copyright 2010–2018 JetBrains s.r.o. and Kotlin Programming Language contributors.
 * Copyright (C) 2023–2026 The Android Open Source Project.
 * Apache-2.0; see public/licenses/landroid-extended.txt.
 * Modified: browser TypeScript port of Kotlin XorWowRandom and AOSP Namer/Bag. */
import { words } from './words.ts';

export class Random {
  private x: number;
  private y: number;
  private z = 0;
  private w = 0;
  private v: number;
  private addend: number;
  constructor(seed: number) {
    this.x = seed | 0;
    this.y = Math.floor(seed / 4294967296) | 0;
    this.v = ~this.x;
    this.addend = (this.x << 10) ^ (this.y >>> 4);
    for (let i = 0; i < 64; i++) this.next();
  }
  next(): number {
    let t = this.x ^ (this.x >>> 2);
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = this.v;
    t = t ^ (t << 1) ^ this.v ^ (this.v << 4);
    this.v = t;
    this.addend = (this.addend + 362437) | 0;
    return (t + this.addend) | 0;
  }
  float(): number {
    return (this.next() >>> 8) / 16777216;
  }
  range(from: number, to: number): number {
    return Math.fround(
      from + Math.fround(Math.fround(to - from) * this.float()),
    );
  }
  int(until: number): number {
    if (until <= 0) throw new RangeError('Random bound must be positive');
    if ((until & -until) === until) {
      const bits = 31 - Math.clz32(until);
      const value = this.next();
      return bits === 0 ? 0 : value >>> (32 - bits);
    }
    let bits: number, value: number;
    do {
      bits = this.next() >>> 1;
      value = bits % until;
    } while (((bits - value + until - 1) | 0) < 0);
    return value;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
}

class Bag {
  private items: string[];
  private index: number;
  constructor(items: readonly string[]) {
    this.items = [...items];
    this.index = items.length;
  }
  pull(rng: Random): string {
    if (this.index === this.items.length) {
      for (let i = this.items.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [this.items[i], this.items[j]] = [this.items[j]!, this.items[i]!];
      }
      this.index = 0;
    }
    return this.items[this.index++]!;
  }
}

export class Namer {
  private bags = Object.fromEntries(
    Object.entries(words).map(([name, list]) => [name, new Bag(list)]),
  ) as Record<keyof typeof words, Bag>;
  pull(name: keyof typeof words, rng: Random): string {
    return this.bags[name].pull(rng);
  }
  private delimiter(rng: Random): string {
    let n = rng.range(0, 24.1);
    for (const [weight, value] of [
      [15, ' '],
      [3, '-'],
      [1, '_'],
      [1, '/'],
      [1, '.'],
      [1, '*'],
      [1, '^'],
      [1, '#'],
      [0.1, '(^*!%@##!!'],
    ] as const) {
      n = Math.fround(n - weight);
      if (n < 0) return value;
    }
    return '(^*!%@##!!';
  }
  system(rng: Random): string {
    let name = this.pull(
      rng.float() < 0.05 ? 'constellations_rare' : 'constellations',
      rng,
    );
    if (rng.float() <= 0.75) {
      name +=
        this.delimiter(rng) +
        this.pull(
          rng.float() < 0.05 ? 'star_suffixes_rare' : 'star_suffixes',
          rng,
        );
      if (rng.float() <= 0.05)
        name += ' ' + this.pull('star_suffixes_rare', rng);
    }
    if (rng.float() <= 0.3) {
      name += this.delimiter(rng) + String.fromCharCode(65 + rng.int(26));
      if (rng.float() <= 0.05) name += this.delimiter(rng);
    }
    if (rng.float() <= 0.3) name += this.delimiter(rng) + (rng.int(5037) + 2);
    return name;
  }
  descriptor(kind: 'planet' | 'life' | 'atmo', rng: Random): string {
    return this.pull(
      rng.float() < 0.75 ? `${kind}_descriptors` : 'any_descriptors',
      rng,
    );
  }
  planet(rng: Random): string {
    return (
      this.descriptor('planet', rng) + ' ' + this.pull('planet_types', rng)
    );
  }
  activity(
    rng: Random,
    planet: {
      flora: string;
      fauna: string;
      atmosphere: string;
      description: string;
    },
  ): string {
    return this.pull('activities', rng)
      .replace(/\{(flora|fauna|planet|atmo)\}/g, (_, kind: string) => {
        if (kind === 'planet') return planet.description;
        if (kind === 'flora')
          return planet.flora + ' ' + this.pull('flora_generic_plurals', rng);
        if (kind === 'fauna')
          return planet.fauna + ' ' + this.pull('fauna_generic_plurals', rng);
        return planet.atmosphere + ' ' + this.pull('atmo_generic_plurals', rng);
      })
      .toUpperCase();
  }
}
