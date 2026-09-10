import { games } from '../data/games';
import { GameLibrary } from '../lib/game-library';
import { resolveLibraryTheme } from '../lib/library-theme';
import { sound } from '../lib/audio';

const library = new GameLibrary(
  games,
  new URLSearchParams(location.search).get('game'),
);
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const tiles = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-game-tile]'),
);
const background = el<HTMLImageElement>('library-background');

function refreshStats() {
  const stats = library.current.stats;
  const panel = el('game-stats');
  const values = el('game-stats-values');
  panel.hidden = !stats;
  values.replaceChildren();
  el('game-stats-title').textContent = stats?.title ?? '';
  if (!stats) return;
  for (const stat of stats.read()) {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = stat.label;
    value.textContent = stat.value;
    row.append(label, value);
    values.append(row);
  }
}
function render() {
  const game = library.current;
  const theme = resolveLibraryTheme(game);
  for (const [name, value] of Object.entries(theme.variables)) {
    document.body.style.setProperty(name, value);
  }
  document.documentElement.style.backgroundColor = theme.background;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.background);
  tiles.forEach((tile) => {
    const selected = tile.dataset.gameTile === game.id;
    const definition = games.find((item) => item.id === tile.dataset.gameTile)!;
    tile.classList.toggle('selected', selected);
    tile.setAttribute('aria-pressed', String(selected));
    tile.setAttribute(
      'aria-label',
      definition.name + (selected ? '，已选中。按回车游玩。' : '，选择游戏。'),
    );
    tile.tabIndex = selected ? 0 : -1;
  });
  el('selected-game-name').textContent = game.name;
  // The image element owns loading; rapid selection cannot commit an older preload.
  if (background.getAttribute('src') !== game.background)
    background.src = game.background;
  background.style.objectPosition = game.backgroundPosition ?? 'center';
  const logo = el<HTMLImageElement>('game-logo');
  logo.src = game.logo;
  logo.alt = game.name;
  el('game-description').textContent = game.description;
  el('game-tags').replaceChildren(
    ...game.tags.map((tag) => {
      const span = document.createElement('span');
      span.textContent = tag;
      return span;
    }),
  );
  el<HTMLAnchorElement>('primary-play').href = game.href;
  el<HTMLAnchorElement>('about-play').href = game.href;
  el('game-about-button').setAttribute(
    'aria-label',
    '了解 ' + game.name + ' 玩法',
  );
  el('about-title').textContent = game.name;
  el('about-description').textContent = game.description;
  el('about-instructions').replaceChildren(
    ...game.instructions.map((instruction, index) => {
      const row = document.createElement('p');
      const number = document.createElement('b');
      const text = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      text.textContent = instruction;
      row.append(number, text);
      return row;
    }),
  );
  refreshStats();
  scrollCurrentIntoView();
}
function selectGame(id: string) {
  if (!library.select(id)) return;
  render();
  const url = new URL(location.href);
  url.searchParams.set('game', library.current.id);
  history.replaceState(null, '', url);
}
function scrollCurrentIntoView() {
  const tile = tiles.find(
    (item) => item.dataset.gameTile === library.current.id,
  );
  if (!tile) return;
  const rail = tile.parentElement!;
  const tileRect = tile.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const railStyle = getComputedStyle(rail);
  const leftInset = parseFloat(railStyle.paddingLeft);
  const rightInset = parseFloat(railStyle.paddingRight);
  if (tileRect.left < railRect.left + leftInset)
    rail.scrollLeft -= railRect.left + leftInset - tileRect.left;
  else if (tileRect.right > railRect.right - rightInset)
    rail.scrollLeft += tileRect.right - railRect.right + rightInset;
}
function focusCurrent() {
  tiles
    .find((item) => item.dataset.gameTile === library.current.id)
    ?.focus({ preventScroll: true });
}
function moveSelection(direction: -1 | 1) {
  selectGame(library.move(direction).id);
  focusCurrent();
  sound('tap');
}
tiles.forEach((tile) => {
  tile.addEventListener('click', () => {
    selectGame(tile.dataset.gameTile!);
    sound('tap');
  });
  tile.addEventListener('focus', () => {
    if (tile.dataset.gameTile !== library.current.id)
      selectGame(tile.dataset.gameTile!);
  });
  tile.addEventListener('dblclick', () => {
    location.href = library.current.href;
  });
  tile.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      location.href = library.current.href;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveSelection(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
});
document
  .querySelectorAll<HTMLButtonElement>('[data-select-game]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      selectGame(button.dataset.selectGame!);
      el<HTMLDialogElement>('library-dialog').close();
      focusCurrent();
      sound('tap');
    });
  });
document.addEventListener('keydown', (event) => {
  if (event.target !== document.body || document.querySelector('dialog[open]'))
    return;
  if (event.key === 'Enter') {
    event.preventDefault();
    location.href = library.current.href;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
render();
window.addEventListener('pageshow', refreshStats);
