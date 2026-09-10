import { loadPreferences, savePreferences } from '../lib/storage';
import { sound } from '../lib/audio';
let toastTimeout: ReturnType<typeof setTimeout>;
export function notify(message: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    el.hidden = true;
  }, 3500);
}
const prefs = loadPreferences();
document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion);
const soundInput = document.getElementById(
  'sound-setting',
) as HTMLInputElement | null;
const volumeInput = document.getElementById(
  'volume-setting',
) as HTMLInputElement | null;
const motionInput = document.getElementById(
  'motion-setting',
) as HTMLInputElement | null;
if (soundInput) soundInput.checked = prefs.sound;
if (volumeInput) volumeInput.value = String(prefs.volume * 100);
if (motionInput) motionInput.checked = prefs.reducedMotion;
function syncSoundButtons() {
  document
    .querySelectorAll<HTMLButtonElement>('[data-sound-toggle]')
    .forEach((b) => {
      b.setAttribute('aria-pressed', String(prefs.sound));
      b.setAttribute('aria-label', prefs.sound ? '关闭音效' : '开启音效');
      b.classList.toggle('is-muted', !prefs.sound);
    });
}
syncSoundButtons();
soundInput?.addEventListener('change', () => {
  prefs.sound = soundInput.checked;
  savePreferences(prefs);
  syncSoundButtons();
  sound('tap');
});
volumeInput?.addEventListener('change', () => {
  prefs.volume = Number(volumeInput.value) / 100;
  savePreferences(prefs);
  sound('tap');
});
motionInput?.addEventListener('change', () => {
  prefs.reducedMotion = motionInput.checked;
  document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion);
  savePreferences(prefs);
});
document
  .querySelectorAll<HTMLButtonElement>('[data-sound-toggle]')
  .forEach((b) =>
    b.addEventListener('click', () => {
      prefs.sound = !prefs.sound;
      if (soundInput) soundInput.checked = prefs.sound;
      savePreferences(prefs);
      syncSoundButtons();
      sound('tap');
    }),
  );
document.querySelectorAll<HTMLElement>('[data-open-dialog]').forEach((b) =>
  b.addEventListener('click', () => {
    const dialog = document.getElementById(
      b.dataset.openDialog!,
    ) as HTMLDialogElement | null;
    dialog?.showModal();
    sound('tap');
  }),
);
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  dialog
    .querySelectorAll('[data-close-dialog]')
    .forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  });
});
document.querySelectorAll('[data-fullscreen]').forEach((b) =>
  b.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('当前浏览器暂不支持全屏，可使用浏览器的全屏功能。');
    }
  }),
);
function updateClock() {
  document.querySelectorAll<HTMLTimeElement>('[data-clock]').forEach((el) => {
    el.textContent = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    el.dateTime = new Date().toISOString();
  });
}
let clockId: ReturnType<typeof setInterval> | undefined;
function resumeClock() {
  if (clockId !== undefined) clearInterval(clockId);
  updateClock();
  clockId = setInterval(updateClock, 15000);
}
resumeClock();
window.addEventListener('pagehide', () => {
  clearInterval(clockId);
  clockId = undefined;
});
window.addEventListener('pageshow', resumeClock);
