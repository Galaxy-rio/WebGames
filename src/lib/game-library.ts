import type { LibraryAppearance } from './library-theme.ts';

export interface GameStat {
  label: string;
  value: string;
}
export interface GameDefinition extends LibraryAppearance {
  id: string;
  name: string;
  href: string;
  cover: string;
  logo: string;
  background: string;
  backgroundPosition?: string;
  tags: readonly string[];
  description: string;
  instructions: readonly string[];
  stats?: {
    title: string;
    read: () => readonly GameStat[];
  };
}

/** Shared selection state; every part of the hub reads the same selected game. */
export class GameLibrary<T extends { id: string }> {
  readonly games: readonly T[];
  private index = 0;
  constructor(games: readonly T[], initialId?: string | null) {
    if (!games.length)
      throw new Error('The game library needs at least one game.');
    if (new Set(games.map((game) => game.id)).size !== games.length)
      throw new Error('Game IDs must be unique.');
    this.games = [...games];
    if (initialId) this.select(initialId);
  }
  get current(): T {
    return this.games[this.index]!;
  }
  select(id: string): T | null {
    const index = this.games.findIndex((game) => game.id === id);
    if (index < 0) return null;
    this.index = index;
    return this.current;
  }
  move(direction: -1 | 1): T {
    this.index =
      (this.index + direction + this.games.length) % this.games.length;
    return this.current;
  }
}
