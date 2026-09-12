import { dailySeed, Universe } from './engine.ts';
import { RULES, angle, clamp, distance, length, sub, vec } from './physics.ts';
import { Renderer } from './renderer.ts';
import { load, save, rememberResult } from './storage.ts';
import { FlightLeaderboard } from './leaderboard';

const get = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const capitalized = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
const signed = (n: number) =>
  `${n < 0 ? '-' : '+'}${Math.abs(Math.round(n))}`.padStart(7, ' ');

export function startGame(): void {
  const canvas = get<HTMLCanvasElement>('universe');
  const root = get('flight');
  const dialog = get<HTMLDialogElement>('flight-menu');
  const autoConfirm = get<HTMLDialogElement>('auto-confirm');
  const flightDialogs = Array.from(
    document.querySelectorAll<HTMLDialogElement>('dialog'),
  );
  const paused = () =>
    document.hidden || flightDialogs.some((item) => item.open);
  const starCatalog = get('star-catalog');
  const bodyCatalog = get('body-catalog');
  const telemetry = get('ship-telemetry');
  const autopilotTelemetry = get('autopilot-telemetry');
  const autopilotButton = get<HTMLButtonElement>('autopilot-button');
  const seedInput = get<HTMLInputElement>('seed-input');
  const hint = get('flight-help');
  let u: Universe;
  const query = new URLSearchParams(location.search);
  const requestedSeed = query.get('seed');
  const seed =
    requestedSeed && /^\d{1,10}$/.test(requestedSeed)
      ? Number(requestedSeed)
      : null;
  const stored = seed === null ? load() : null;
  u =
    seed !== null
      ? new Universe(seed)
      : stored && !stored.challenge.data.legacy
        ? stored
        : new Universe(stored?.seed ?? 20260324);
  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas, get<HTMLCanvasElement>('planet-guides'));
  } catch (error) {
    get('failure').hidden = false;
    get('failure-text').textContent = String(error);
    return;
  }
  if (u.autopilot.enabled) {
    const p = u.closest();
    renderer.zoom = clamp(
      500 / Math.max(1, distance(p.position, u.ship.position) - p.radius * 1.2),
      0.00125,
      5,
    );
  }
  let accumulator = 0;
  let previous = performance.now();
  let telemetryClock = 0;
  let saveClock = 0;
  let announceTimer: ReturnType<typeof setTimeout>;
  let immersive = false;
  let stickId: number | null = null;
  let completedId: string | null = null;
  const scores = new FlightLeaderboard(() =>
    newUniverse(crypto.getRandomValues(new Uint32Array(1))[0]!),
  );

  const announce = (message: string) => {
    clearTimeout(announceTimer);
    get('announcement').textContent = message;
    announceTimer = setTimeout(() => {
      get('announcement').textContent = '';
    }, 3200);
  };
  const persist = () => {
    get('save-state').textContent = save(u)
      ? '进度已保存在当前浏览器'
      : '浏览器存储不可用，本次仍可游玩';
  };
  const dismissHint = () => {
    hint.classList.add('dismissed');
  };
  let removeListener = () => {};
  const bindEvents = () => {
    removeListener();
    removeListener = u.on((event) => {
      if (event.type === 'discovery')
        announce(`DISCOVERED · ${event.planet.name}`);
      if (event.type === 'launch') announce('LIFTOFF');
      if (
        event.type === 'impact' &&
        event.headOn &&
        event.newContact &&
        u.challenge.eligible
      )
        announce('IMPACT · −500');
      if (event.type === 'land' || event.type === 'autopilot') persist();
      // Future objectives can subscribe to this typed engine event without changing physics.
      root.dispatchEvent(new CustomEvent('landroid:event', { detail: event }));
    });
  };
  bindEvents();

  const clearInput = () => {
    const previousPointer = stickId;
    renderer.stick = null;
    stickId = null;
    if (previousPointer !== null && canvas.hasPointerCapture(previousPointer))
      canvas.releasePointerCapture(previousPointer);
    if (!u.autopilot.enabled) u.ship.thrust = 0;
  };
  const toggleHud = () => {
    immersive = !immersive;
    renderer.showGuides = !immersive;
    root.dataset.immersive = String(immersive);
    get('hide-hud-button').textContent = immersive ? '显示界面' : '隐藏界面';
    if (immersive) announce('点击右上角菜单可恢复界面');
  };
  const toggleAuto = () => {
    clearInput();
    dismissHint();
    if (u.autopilot.enabled) u.autopilot.setEnabled(false);
    else {
      get('auto-warning').textContent =
        u.challenge.finished && u.challenge.eligible
          ? '本星系已完成。开启自动驾驶可继续观光，已结算的得分保持不变。'
          : '开启后，本局将停止计分，无法上传排行榜。恢复手动驾驶也不会重新计分；前往下一个星系可开始新的计分对局。';
      autoConfirm.showModal();
    }
    updateTelemetry();
  };
  const fullscreen = async () => {
    // Fullscreen is entered from a paused dialog. Close it before the request,
    // while the original pointer activation still authorizes browser fullscreen.
    closeMenu();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else announce('当前浏览器不支持全屏，可添加到主屏幕游玩。');
    } catch {
      announce('当前浏览器未能进入全屏。');
    }
  };
  const openMenu = () => {
    clearInput();
    persist();
    seedInput.value = String(u.seed);
    get('current-system').textContent =
      `${u.star.name} · ${u.planets.filter((p) => p.explored).length} / ${u.planets.length} 已探索`;
    dialog.showModal();
  };
  const closeMenu = () => {
    dialog.close();
    clearInput();
    previous = performance.now();
    canvas.focus({ preventScroll: true });
  };
  const newUniverse = (nextSeed: number) => {
    clearInput();
    scores.reset();
    for (const item of flightDialogs) item.close();
    u = new Universe(nextSeed);
    completedId = null;
    get('show-flight-result').hidden = true;
    bindEvents();
    renderer.zoom = 1;
    accumulator = 0;
    // The explicit seed is for a fresh flight; refreshes resume the saved flight.
    history.replaceState(null, '', location.pathname);
    closeMenu();
    persist();
    updateTelemetry();
    announce(`ENTERING · ${u.star.name}`);
  };

  get('menu-button').addEventListener('click', openMenu);
  get('confirm-auto').addEventListener('click', () => {
    autoConfirm.close();
    clearInput();
    u.autopilot.setEnabled(true);
    previous = performance.now();
    updateTelemetry();
  });
  get('new-flight').addEventListener('click', () =>
    newUniverse(crypto.getRandomValues(new Uint32Array(1))[0]!),
  );
  get('show-flight-result').addEventListener('click', () => {
    closeMenu();
    const result = u.challenge.result(u.seed);
    if (result) scores.present(result, u.star.name);
  });
  get('resume-button').addEventListener('click', closeMenu);
  get('fullscreen-button').addEventListener('click', () => {
    void fullscreen();
  });
  get('hide-hud-button').addEventListener('click', () => {
    closeMenu();
    toggleHud();
  });
  autopilotButton.addEventListener('click', toggleAuto);
  get('grid-setting').addEventListener('change', (event) => {
    renderer.showGrid = (event.target as HTMLInputElement).checked;
  });
  get('gravity-setting').addEventListener('change', (event) => {
    renderer.showGravity = (event.target as HTMLInputElement).checked;
  });
  get('seed-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (/^\d{1,10}$/.test(seedInput.value))
      newUniverse(Number(seedInput.value));
  });
  get('daily-system').addEventListener('click', () => newUniverse(dailySeed()));
  get('random-system').addEventListener('click', () =>
    newUniverse(crypto.getRandomValues(new Uint32Array(1))[0]!),
  );
  for (const item of flightDialogs)
    item.addEventListener('close', () => {
      clearInput();
      accumulator = 0;
      previous = performance.now();
    });

  window.addEventListener('blur', () => {
    clearInput();
    persist();
  });
  document.addEventListener('visibilitychange', () => {
    clearInput();
    previous = performance.now();
    if (document.hidden) persist();
  });
  window.addEventListener('pagehide', persist);
  document.addEventListener('fullscreenchange', () => {
    // Do not accumulate the browser's transition time or retain stale input.
    clearInput();
    accumulator = 0;
    previous = performance.now();
    renderer.resize();
    get('fullscreen-button').textContent = document.fullscreenElement
      ? '退出全屏'
      : '全屏';
  });

  const position = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return vec(event.clientX - rect.left, event.clientY - rect.top);
  };
  const updateStick = () => {
    const stick = renderer.stick;
    if (!stick) return;
    const delta = sub(stick.current, stick.origin);
    const magnitude = length(delta);
    u.manual(
      magnitude > 0 ? angle(delta) : undefined,
      clamp((magnitude - stick.min) / (stick.max - stick.min), 0, 1),
    );
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || paused() || stickId !== null)
      return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    dismissHint();
    stickId = event.pointerId;
    renderer.stick = {
      origin: position(event),
      current: position(event),
      min: 50,
      max: 100,
    };
    u.manual(undefined, 0);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (stickId === event.pointerId && renderer.stick) {
      renderer.stick.current = position(event);
      updateStick();
    }
  });
  const releasePointer = (event: PointerEvent) => {
    if (stickId === event.pointerId) clearInput();
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  window.addEventListener('resize', () => renderer.resize());

  function updateTelemetry(): void {
    const explored = u.planets.filter((p) => p.explored);
    const star = u.star;
    starCatalog.textContent = `  STAR: ${star.name} (17-${u.seed % 100_000})\n CLASS: ${star.classification}\nRADIUS: ${Math.floor(star.radius)}\n  MASS: ${star.mass.toExponential(2)}\nBODIES: ${explored.length} / ${u.planets.length}`;
    const catalog = explored
      .map(
        (p) =>
          `  BODY: ${p.name}\n  TYPE: ${capitalized(p.description)}\n  ATMO: ${capitalized(p.atmosphere)}\n FAUNA: ${capitalized(p.fauna)}\n FLORA: ${capitalized(p.flora)}`,
      )
      .join('\n\n');
    if (bodyCatalog.textContent !== catalog) bodyCatalog.textContent = catalog;
    const ship = u.ship;
    const closest = u.closest();
    const altitude = Math.floor(
      distance(ship.position, closest.position) - closest.radius,
    );
    const lines: string[] = [];
    if (ship.landing)
      lines.push(
        `LND: ${u.planets[ship.landing.planetId]!.name.toUpperCase()}`,
        `JOB: ${ship.landing.job}`,
      );
    else if (altitude < 10_000) lines.push(`ALT: ${altitude}`);
    lines.push(
      `THR: ${Math.round(ship.thrust * 100)}%`,
      `POS: < ${signed(ship.position.x)}, ${signed(ship.position.y)}>`,
      `VEL: ${Math.round(length(ship.velocity))}`,
    );
    telemetry.textContent = lines.join('\n');
    const auto = u.autopilot;
    autopilotTelemetry.hidden = !auto.enabled;
    if (auto.enabled) {
      const target =
        auto.targetId !== null
          ? u.planets[auto.targetId]!.name.toUpperCase()
          : 'SELECTING...';
      const debug =
        auto.targetId !== null
          ? ` (DV=${Math.round(auto.relativeSpeed)} D=${Math.round(auto.altitude)})`
          : '';
      autopilotTelemetry.textContent = `---- AUTOPILOT ENGAGED ----\nTGT: ${target}\nEXE: ${auto.strategy}${debug}`;
    }
    autopilotButton.setAttribute('aria-pressed', String(auto.enabled));
    updateScore();
  }

  function updateScore(): void {
    const value = u.challenge.eligible ? String(u.challenge.score) : '—';
    if (get('score-value').textContent !== value)
      get('score-value').textContent = value;
    get('flight-score').dataset.inactive = String(!u.challenge.eligible);
    get('flight-score').title = u.challenge.eligible
      ? '当前得分'
      : '本局已停止计分';
  }
  function finishFlight(): void {
    if (!u.challenge.finished || completedId === u.challenge.data.id) return;
    completedId = u.challenge.data.id;
    clearInput();
    persist();
    const result = u.challenge.result(u.seed)!;
    rememberResult(result);
    get('show-flight-result').hidden = false;
    scores.present(result, u.star.name);
    updateScore();
  }

  const frame = (now: number) => {
    const elapsed = Math.min(Math.max(0, (now - previous) / 1000), 0.1);
    previous = now;
    if (!paused()) {
      accumulator += elapsed;
      while (accumulator >= RULES.fixedStep && !paused()) {
        const wasLanded = !!u.ship.landing;
        u.step(RULES.fixedStep);
        if (!wasLanded && u.ship.landing) {
          clearInput();
        }
        accumulator -= RULES.fixedStep;
        finishFlight();
      }
      saveClock += elapsed;
      if (saveClock > 3) {
        persist();
        saveClock = 0;
      }
    }
    renderer.render(u, elapsed);
    updateScore();
    telemetryClock += elapsed;
    if (telemetryClock > 0.08) {
      updateTelemetry();
      telemetryClock = 0;
    }
    requestAnimationFrame(frame);
  };
  updateTelemetry();
  persist();
  finishFlight();
  if (seed !== null) history.replaceState(null, '', location.pathname);
  setTimeout(dismissHint, 15_000);
  requestAnimationFrame(frame);
}
