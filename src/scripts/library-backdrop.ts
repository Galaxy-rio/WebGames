import type { GameDefinition } from '../lib/game-library';
import { resolveLibraryTheme } from '../lib/library-theme';

/** Soft circular reveals retain their painted layers when a new selection interrupts. */
export class LibraryBackdrop {
  private revision = 0;
  private frame = 0;
  private images = new Map<string, Promise<void>>();

  constructor(
    private host: HTMLElement,
    games: readonly GameDefinition[],
  ) {
    for (const game of games) {
      const image = new Image();
      image.src = game.background;
      this.images.set(
        game.background,
        image.decode().catch(() => {}),
      );
    }
  }

  show(
    game: GameDefinition,
    origin: { x: number; y: number },
    animate: boolean,
  ): void {
    const revision = ++this.revision;
    cancelAnimationFrame(this.frame);
    const layer = document.createElement('div');
    layer.className = 'backdrop-layer';
    layer.dataset.game = game.id;
    for (const [name, value] of Object.entries(
      resolveLibraryTheme(game).variables,
    ))
      layer.style.setProperty(name, value);
    const image = document.createElement('img');
    image.alt = '';
    image.src = game.background;
    image.style.objectPosition = game.backgroundPosition ?? 'center';
    image.addEventListener(
      'error',
      () => {
        image.hidden = true;
      },
      { once: true },
    );
    const shade = document.createElement('div');
    shade.className = 'backdrop-shade';
    layer.append(image, shade);
    const motionSetting = document.documentElement.dataset.reducedMotion;
    const reduced =
      motionSetting === 'true' ||
      (motionSetting === undefined &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!animate || reduced) {
      this.host.replaceChildren(layer);
      return;
    }
    void (this.images.get(game.background) ?? Promise.resolve()).then(() => {
      if (revision !== this.revision) return;
      const bounds = this.host.getBoundingClientRect();
      const x = Math.max(0, Math.min(bounds.width, origin.x - bounds.left));
      const y = Math.max(0, Math.min(bounds.height, origin.y - bounds.top));
      const radius =
        Math.hypot(
          Math.max(x, bounds.width - x),
          Math.max(y, bounds.height - y),
        ) + 160;
      layer.classList.add('backdrop-ripple');
      layer.style.setProperty('--reveal-x', `${x}px`);
      layer.style.setProperty('--reveal-y', `${y}px`);
      layer.style.setProperty(
        '--reveal-feather',
        `${Math.min(145, Math.max(70, bounds.width * 0.09))}px`,
      );
      layer.style.setProperty('--reveal-radius', '0px');
      this.host.append(layer);
      const started = performance.now();
      const tick = (now: number) => {
        if (revision !== this.revision) return;
        const progress = Math.max(0, Math.min(1, (now - started) / 440));
        const eased = 1 - (1 - progress) ** 2;
        layer.style.setProperty('--reveal-radius', `${radius * eased}px`);
        if (progress < 1) this.frame = requestAnimationFrame(tick);
        else {
          layer.classList.remove('backdrop-ripple');
          this.host.replaceChildren(layer);
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
}
