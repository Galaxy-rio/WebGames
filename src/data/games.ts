import type { GameDefinition } from '../lib/game-library';
import { chroma } from '../games/chroma/info';

// Each game owns its assets and copy. Add its definition here to list it in the hub.
export const games: readonly GameDefinition[] = [chroma];
