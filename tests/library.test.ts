import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLibrary, type GameDefinition } from '../src/lib/game-library.ts';
import { resolveLibraryTheme } from '../src/lib/library-theme.ts';

const first: GameDefinition = {
  id: 'first',
  name: 'First Game',
  href: '/first/',
  cover: '/first-cover.webp',
  logo: '/first-logo.svg',
  background: '/first-bg.webp',
  tags: ['色彩'],
  description: 'First description',
  instructions: ['First instruction'],
  stats: {
    title: 'First scores',
    read: () => [{ label: 'Score', value: '98%' }],
  },
};
const second: GameDefinition = {
  id: 'second',
  name: 'Second Game',
  href: '/second/?level=1',
  cover: '/second-cover.webp',
  logo: '/second-logo.svg',
  background: '/second-bg.webp',
  backgroundPosition: 'right center',
  tags: ['解谜', '单人'],
  description: 'Second description',
  instructions: ['Second instruction'],
};
const third: GameDefinition = {
  ...second,
  id: 'third',
  name: 'Third Game',
  href: '/third/',
};

test('a requested game initializes the entire game presentation, with a safe unknown-ID fallback', () => {
  assert.strictEqual(
    new GameLibrary([first, second], 'second').current,
    second,
  );
  assert.strictEqual(
    new GameLibrary([first, second], 'missing').current,
    first,
  );
});
test('selection replaces all game-owned assets, copy, launch URL and optional score provider together', () => {
  const library = new GameLibrary([first, second]);
  assert.equal(library.current.stats?.read()[0].value, '98%');
  library.select('second');
  const current = library.current;
  assert.deepEqual(
    {
      name: current.name,
      href: current.href,
      cover: current.cover,
      logo: current.logo,
      background: current.background,
      position: current.backgroundPosition,
      tags: current.tags,
      description: current.description,
      instructions: current.instructions,
      stats: current.stats,
    },
    {
      name: 'Second Game',
      href: '/second/?level=1',
      cover: '/second-cover.webp',
      logo: '/second-logo.svg',
      background: '/second-bg.webp',
      position: 'right center',
      tags: ['解谜', '单人'],
      description: 'Second description',
      instructions: ['Second instruction'],
      stats: undefined,
    },
  );
  library.select('first');
  assert.strictEqual(library.current, first);
});
test('arrow navigation wraps and continues from a directly selected game', () => {
  const library = new GameLibrary([first, second, third]);
  assert.strictEqual(library.move(-1), third);
  assert.strictEqual(library.move(1), first);
  library.select('second');
  assert.strictEqual(library.move(1), third);
  assert.strictEqual(library.move(-1), second);
});
test('unknown selections leave the current game and launch URL intact', () => {
  const library = new GameLibrary([first, second], 'second');
  assert.equal(library.select('missing'), null);
  assert.equal(library.current.href, '/second/?level=1');
});
test('one-game libraries remain playable in both navigation directions', () => {
  const library = new GameLibrary([first]);
  assert.strictEqual(library.move(1), first);
  assert.strictEqual(library.move(-1), first);
});
test('empty catalogs and duplicate game IDs cannot create ambiguous selection', () => {
  assert.throws(() => new GameLibrary([]), /at least one game/);
  assert.throws(
    () => new GameLibrary([first, { ...second, id: first.id }]),
    /unique/,
  );
});

test('a game can tint individual surfaces while retaining the other palette defaults', () => {
  const base = resolveLibraryTheme({ theme: 'light' });
  const themed = resolveLibraryTheme({
    theme: 'light',
    backgroundColor: '#f1e5cf',
    ui: { button: '#aa886655', panel: '#fff4dc88', overlay: '#ffeebb11' },
  });
  assert.equal(themed.background, '#f1e5cf');
  assert.equal(themed.variables['--ui-button'], '#aa886655');
  assert.equal(themed.variables['--ui-panel'], '#fff4dc88');
  assert.equal(themed.variables['--ui-overlay'], '#ffeebb11');
  assert.equal(themed.variables['--ui-text'], base.variables['--ui-text']);
  assert.equal(
    themed.variables['--ui-mobile-overlay'],
    base.variables['--ui-mobile-overlay'],
  );
});
test('switching custom light to default dark and back replaces every UI color without residue', () => {
  const custom: GameDefinition = {
    ...first,
    theme: 'light',
    backgroundColor: '#faead4',
    ui: {
      button: '#e0a58888',
      panel: '#ddddaa66',
      overlay: '#ffddbb22',
      accent: '#556655',
    },
  };
  const library = new GameLibrary([custom, second]);
  const applied = new Map<string, string>();
  const applyCurrent = () => {
    for (const [key, value] of Object.entries(
      resolveLibraryTheme(library.current).variables,
    ))
      applied.set(key, value);
  };
  applyCurrent();
  const initial = Object.fromEntries(applied);
  library.select('second');
  applyCurrent();
  assert.deepEqual(
    Object.fromEntries(applied),
    resolveLibraryTheme({}).variables,
  );
  library.select('first');
  applyCurrent();
  assert.deepEqual(Object.fromEntries(applied), initial);
});
test('resolving or modifying a result cannot change another game or the shared defaults', () => {
  const palette = { button: '#abcdef88', accent: '#567890' };
  const appearance = { theme: 'light' as const, ui: palette };
  const saved = JSON.stringify(appearance);
  const result = resolveLibraryTheme(appearance);
  result.variables['--ui-text'] = '#ff0000';
  result.variables['--ui-button'] = '#000000';
  assert.equal(JSON.stringify(appearance), saved);
  assert.equal(
    resolveLibraryTheme(appearance).variables['--ui-button'],
    '#abcdef88',
  );
  assert.notEqual(
    resolveLibraryTheme({ theme: 'light' }).variables['--ui-text'],
    '#ff0000',
  );
});
test('palette configuration does not expose layout, border width or blur overrides', () => {
  const extraFields = {
    button: '#ffffff88',
    blur: '0px',
    radius: '0px',
    borderWidth: '8px',
  };
  const theme = resolveLibraryTheme({ ui: extraFields });
  assert.equal(theme.variables['--ui-button'], '#ffffff88');
  assert.equal(Object.values(theme.variables).includes('0px'), false);
  assert.equal(Object.values(theme.variables).includes('8px'), false);
  assert.deepEqual(
    Object.keys(theme.variables),
    Object.keys(resolveLibraryTheme({}).variables),
  );
});
