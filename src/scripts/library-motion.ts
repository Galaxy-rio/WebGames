export const motionEnabled = () =>
  document.documentElement.dataset.reducedMotion === 'false' ||
  (document.documentElement.dataset.reducedMotion !== 'true' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches);

export function prepareThemeMotion(variables: Record<string, string>): void {
  const properties: string[] = [];
  for (const [name, value] of Object.entries(variables)) {
    if (!CSS.supports('color', value)) continue;
    try {
      CSS.registerProperty({
        name,
        syntax: '<color>',
        inherits: true,
        initialValue: value,
      });
    } catch {}
    properties.push(`${name} 360ms ease`);
  }
  document.body.style.setProperty('--theme-transition', properties.join(','));
}

const incoming = new WeakMap<HTMLElement, Animation>();
/** Snapshot outgoing artwork/copy at its current paint position before changing it. */
export function beginContentTransition(
  elements: HTMLElement[],
  animate: boolean,
): () => void {
  if (!animate || !motionEnabled()) return () => {};
  const theme = getComputedStyle(document.body);
  const variables = Array.from(document.body.style).filter((name) =>
    name.startsWith('--ui-'),
  );
  const visible = elements.filter(
    (element) => !element.hidden && element.getBoundingClientRect().height > 0,
  );
  for (const element of visible) {
    const rect = element.getBoundingClientRect();
    const copy = element.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.classList.add('content-ghost');
    for (const name of variables)
      copy.style.setProperty(name, theme.getPropertyValue(name));
    Object.assign(copy.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      maxWidth: 'none',
      transform: 'none',
      pointerEvents: 'none',
      zIndex: '3',
      opacity: getComputedStyle(element).opacity,
    });
    element.parentElement!.append(copy);
    const fade = copy.animate(
      [
        { opacity: copy.style.opacity, translate: '0 0' },
        { opacity: 0, translate: '0 -6px' },
      ],
      { duration: 250, easing: 'ease-out', fill: 'forwards' },
    );
    void fade.finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
    incoming.get(element)?.cancel();
  }
  return () => {
    for (const element of elements) {
      if (element.hidden) continue;
      const animation = element.animate(
        [
          { opacity: 0, translate: '0 7px' },
          { opacity: 1, translate: '0 0' },
        ],
        { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
      incoming.set(element, animation);
    }
  };
}

export class SelectedCaption {
  private frame = 0;
  private running = false;
  private selected: HTMLElement | null = null;
  constructor(
    private label: HTMLElement,
    rail: HTMLElement,
  ) {
    new ResizeObserver(() => {
      if (!this.running) this.align();
    }).observe(rail);
    rail.addEventListener('scroll', () => this.align());
    window.addEventListener('resize', () => this.align());
  }
  private center(): number {
    const rect = this.selected!.getBoundingClientRect();
    return (
      rect.left +
      rect.width / 2 -
      this.label.parentElement!.getBoundingClientRect().left
    );
  }
  private align(): void {
    if (this.selected) this.label.style.left = `${this.center()}px`;
  }
  select(tile: HTMLElement, animate: boolean): void {
    cancelAnimationFrame(this.frame);
    const previousRect = this.label.getBoundingClientRect();
    const previousCenter =
      previousRect.left +
      previousRect.width / 2 -
      this.label.parentElement!.getBoundingClientRect().left;
    this.selected = tile;
    if (!animate || !motionEnabled()) {
      this.running = false;
      this.align();
      return;
    }
    const firstCenter = this.center();
    const started = performance.now();
    this.running = true;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - started) / 330));
      this.label.style.left = `${this.center() + (previousCenter - firstCenter) * (1 - progress) ** 3}px`;
      if (progress < 1) this.frame = requestAnimationFrame(tick);
      else {
        this.running = false;
        this.align();
      }
    };
    this.frame = requestAnimationFrame(tick);
  }
}
