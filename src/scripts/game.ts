import { ColorSession, type Attempt } from '../lib/session';
import { fromHex, toHex, type RGB } from '../lib/color';
import {
  isMode,
  modeLabels,
  saveRecord,
  formatAccuracy,
  formatDuration,
} from '../lib/storage';
import { sound } from '../lib/audio';
import {
  presentLeaderboardResult,
  resetLeaderboardResult,
  setLeaderboardMode,
} from './chroma-leaderboard';
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const requested = new URLSearchParams(location.search).get('mode');
let mode = isMode(requested) ? requested : 'accuracy';
let session = new ColorSession(mode);
let runId = '';
let saved = false;
let finishedPresented = false;
let actionLockedUntil = 0;
let lastFeedback: Attempt | null = null;
let penaltyTimeout: ReturnType<typeof setTimeout> | undefined;
const channelNames = ['r', 'g', 'b'] as const;
const ranges = channelNames.map((c) => el<HTMLInputElement>('range-' + c));
const numbers = channelNames.map((c) => el<HTMLInputElement>('number-' + c));
const hex = el<HTMLInputElement>('hex-input');
const form = el<HTMLFormElement>('mixer-form');
const summary = el<HTMLDialogElement>('summary-dialog');
const wallOrigin = Date.now(),
  monotonicOrigin = performance.now();
let lastNow = 0;
// Include background/sleep time, while keeping elapsed time from moving backwards.
function now() {
  lastNow = Math.max(
    lastNow,
    Date.now() - wallOrigin,
    performance.now() - monotonicOrigin,
  );
  return lastNow;
}
const modeDescriptions = {
  accuracy: '每关 30 秒，共 10 关；到时自动提交，最终成绩为平均准确率。',
  blind:
    '每关 30 秒，共 10 关；调色时隐藏你的颜色，提交或到时后揭晓，最终成绩为平均准确率。',
  speed:
    '10 关，不限时；准确率达到 85% 过关并显示答案，点击下一关继续，查看答案时暂停计时。未通过加罚 1 秒，总用时越低越好。',
};
function inputError(message = '') {
  el('input-error').textContent = message;
  el('input-error').hidden = !message;
  hex.setAttribute(
    'aria-invalid',
    String(Boolean(message) && !fromHex(hex.value)),
  );
}
function syncInputs(origin?: HTMLElement) {
  ranges.forEach((input, i) => (input.value = String(session.guess[i])));
  numbers.forEach((input, i) => {
    if (input !== origin) input.value = String(session.guess[i]);
  });
  if (hex !== origin) hex.value = toHex(session.guess);
}
function paintColors() {
  const ready = session.phase === 'ready';
  el('target-swatch').style.background = ready
    ? '#f3eddc'
    : 'rgb(' + session.target.join(',') + ')';
  const hideGuess = ready || session.isGuessHidden;
  el('guess-swatch').style.background = hideGuess
    ? '#f3eddc'
    : 'rgb(' + session.guess.join(',') + ')';
  el('target-cover').hidden = !ready;
  el('guess-cover').hidden = !hideGuess;
  el('guess-cover-label').textContent = session.isGuessHidden
    ? '提交后揭晓'
    : '等你来调色';
  el('target-swatch').classList.toggle('is-covered', ready);
  el('guess-swatch').classList.toggle('is-covered', hideGuess);
}
function paintAnswer() {
  const answer = session.revealedAnswer;
  channelNames.forEach((channel, index) => {
    const marker = el('answer-thumb-' + channel);
    const value = el('answer-value-' + channel);
    marker.hidden = !answer;
    value.hidden = !answer;
    value.textContent = answer ? String(answer[index]) : '';
    if (answer) {
      marker.style.setProperty(
        '--answer-position',
        (answer[index] / 255) * 100 + '%',
      );
      value.setAttribute(
        'aria-label',
        channel.toUpperCase() + ' 正确数值 ' + answer[index],
      );
    } else {
      marker.style.removeProperty('--answer-position');
      value.removeAttribute('aria-label');
    }
  });
}
function paintClock() {
  const current = now();
  el('score-label').textContent = mode === 'speed' ? '总用时' : '平均准度';
  el('total-score').textContent =
    mode === 'speed'
      ? formatDuration(session.totalTime(current))
      : session.results.length
        ? formatAccuracy(session.average)
        : '—';
  const timed = session.hasRoundTimer;
  const remaining = session.remaining(current);
  el('clock-unit').hidden = !timed;
  el('timer-track').hidden = !timed;
  el('clock-unit').classList.toggle(
    'urgent',
    timed && session.phase === 'playing' && remaining <= 5000,
  );
  el('timer').textContent =
    session.phase === 'reveal'
      ? '本关已结束'
      : session.phase === 'finished'
        ? '挑战完成'
        : timed
          ? (remaining / 1000).toFixed(1) + 's'
          : '';
  el('timer-progress').style.width = timed
    ? Math.min(100, (remaining / session.roundLimitMs) * 100) + '%'
    : '0%';
}
function resetFeedback() {
  lastFeedback = null;
  clearTimeout(penaltyTimeout);
  el('penalty-float').classList.remove('is-floating');
  el('penalty-float').textContent = '';
}
function floatPenalty(milliseconds: number) {
  const label = el('penalty-float');
  clearTimeout(penaltyTimeout);
  label.classList.remove('is-floating');
  label.textContent = '+' + milliseconds / 1000 + 's';
  // Restart the small, isolated animation for every rejected submission.
  void label.offsetWidth;
  label.classList.add('is-floating');
  penaltyTimeout = setTimeout(() => {
    label.classList.remove('is-floating');
    label.textContent = '';
  }, 1850);
}
function paintNotice() {
  const attempt = lastFeedback;
  el('attempt-accuracy').textContent = attempt ? attempt.score + '%' : '—';
  el('attempt-accuracy').classList.toggle('has-result', Boolean(attempt));
  const notice = el('attempt-notice');
  let message = '';
  if (attempt) {
    message = '上次提交准确率 ' + attempt.score + '%。';
    if (attempt.penaltyMs)
      message += '加罚 ' + attempt.penaltyMs / 1000 + ' 秒，请继续调色。';
    else if (attempt.timedOut) message += '时间到，已自动提交当前颜色。';
    else if (mode === 'speed' && attempt.passed) message += '已通过本关。';
  }
  if (notice.textContent !== message) notice.textContent = message;
}
function render() {
  document
    .querySelectorAll<HTMLButtonElement>('[data-mode]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode)),
    );
  el<HTMLFieldSetElement>('mixer-controls').disabled =
    session.phase !== 'playing';
  el<HTMLButtonElement>('reset-color').disabled = session.phase !== 'playing';
  el('submit-label').textContent = {
    ready: '开始调色！',
    playing: '提交',
    reveal: '下一关',
    finished: '查看成绩',
  }[session.phase];
  el('submit-hint').textContent = {
    ready: '开始本局',
    playing: '提交答案',
    reveal: '进入下一关',
    finished: '查看本局成绩',
  }[session.phase];
  el('mode-description').textContent = modeDescriptions[mode];
  const chips = el('round-chips');
  chips.replaceChildren();
  for (let i = 0; i < session.maxRounds; i++) {
    const chip = document.createElement('span');
    chip.className = 'round-chip';
    const result = session.results[i];
    if (result) {
      chip.classList.add('completed');
      chip.style.setProperty(
        '--chip-color',
        'rgb(' + result.target.join(',') + ')',
      );
      chip.textContent = String(result.score);
      chip.title =
        '第 ' +
        (i + 1) +
        ' 关：' +
        result.score +
        '%' +
        (result.timedOut ? '（自动提交）' : '');
    } else {
      chip.textContent = String(i + 1).padStart(2, '0');
      chip.title = '第 ' + (i + 1) + ' 关未完成';
      if (i === session.results.length && session.phase === 'playing')
        chip.classList.add('current');
    }
    chip.setAttribute('aria-label', chip.title);
    chips.append(chip);
  }
  el('average-label').textContent = session.results.length
    ? '平均准确率 ' + formatAccuracy(session.average)
    : '尚未完成关卡';
  syncInputs();
  paintColors();
  paintAnswer();
  paintClock();
  paintNotice();
}
function startSession() {
  resetLeaderboardResult();
  inputError();
  resetFeedback();
  runId = crypto.randomUUID();
  saved = false;
  finishedPresented = false;
  session.start(now());
  render();
  sound('tap');
}
function prepareSummary() {
  if (finishedPresented) return;
  finishedPresented = true;
  inputError();
  render();
  const current = now();
  const record = {
    id: runId,
    date: new Date().toISOString(),
    mode,
    total: session.total,
    average: session.average,
    best: session.best,
    rounds: session.results.length,
    elapsedMs: session.elapsed(current),
    penaltyMs: session.penaltyMs,
  };
  if (!saved) saved = saveRecord(record);
  presentLeaderboardResult(record);
  el('summary-mode').textContent = modeLabels[mode] + ' · 10 关完成';
  el('summary-total').textContent =
    mode === 'speed'
      ? formatDuration(session.totalTime(current))
      : formatAccuracy(session.average);
  el('summary-score-label').textContent =
    mode === 'speed' ? '总用时 · 越低越好' : '平均准确率 · 越高越好';
  el('summary-average').textContent = formatAccuracy(session.average);
  el('summary-best').textContent = session.best + '%';
  el('summary-rounds').textContent = session.results.length + ' / 10';
  el('summary-title').textContent =
    mode === 'speed'
      ? '十关通关！'
      : session.average >= 90
        ? '调色小天才！'
        : '挑战完成！';
  el('summary-time-detail').hidden = mode !== 'speed';
  el('summary-time-detail').textContent =
    '实际用时 ' +
    formatDuration(session.elapsed(current)) +
    ' + 罚时 ' +
    formatDuration(session.penaltyMs);
  el('summary-note').textContent = saved
    ? '已保存到本机游玩记录。'
    : '当前浏览器无法保存记录，本局成绩仍可查看。';
  document
    .querySelectorAll<HTMLDialogElement>('dialog[open]')
    .forEach((dialog) => {
      if (dialog !== summary) dialog.close();
    });
  pendingMode = null;
  sound('finish');
}
function refreshDeadline(current = now()) {
  const expired = session.tick(current);
  if (!expired) return false;
  lastFeedback = expired;
  inputError();
  if (session.isFinished) prepareSummary();
  else {
    render();
    sound('submit');
  }
  return true;
}
function commitInputs() {
  if (
    numbers.some(
      (input) =>
        input.value.trim() === '' ||
        !Number.isInteger(Number(input.value)) ||
        Number(input.value) < 0 ||
        Number(input.value) > 255,
    )
  ) {
    inputError('RGB 通道请输入 0–255 之间的整数。');
    return false;
  }
  const parsed = fromHex(hex.value);
  if (!parsed) {
    inputError('HEX 请输入六位十六进制颜色，例如 #68A7C4。');
    hex.focus();
    return false;
  }
  inputError();
  return true;
}

function action() {
  const current = now();
  if (current < actionLockedUntil) return;
  actionLockedUntil = current + 260;
  if (session.phase === 'finished') {
    if (!summary.open) summary.showModal();
    return;
  }
  if (session.phase === 'ready') {
    startSession();
    return;
  }
  if (session.phase === 'reveal') {
    resetFeedback();
    session.next(current);
    inputError();
    render();
    sound('tap');
    return;
  }
  if (refreshDeadline(current) || !commitInputs()) return;
  const attempt = session.submit(current);
  if (attempt) lastFeedback = attempt;
  if (session.isFinished) {
    prepareSummary();
    return;
  }
  render();
  if (attempt?.penaltyMs) floatPenalty(attempt.penaltyMs);
  if (attempt)
    sound(
      attempt.passed && (mode === 'speed' || attempt.score > 90)
        ? 'good'
        : 'submit',
    );
}
function applyGuess(rgb: RGB, origin?: HTMLElement) {
  const current = now();
  if (refreshDeadline(current)) return;
  if (session.setGuess(rgb, current)) {
    inputError();
    syncInputs(origin);
    paintColors();
    paintNotice();
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  action();
});
ranges.forEach((input, i) =>
  input.addEventListener('input', () => {
    const rgb: RGB = [...session.guess];
    rgb[i] = Number(input.value);
    applyGuess(rgb, input);
  }),
);
ranges.forEach((input) => input.addEventListener('change', () => sound('tap')));
numbers.forEach((input, i) => {
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (
      !input.value.trim() ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 255
    )
      return;
    const rgb: RGB = [...session.guess];
    rgb[i] = value;
    applyGuess(rgb, input);
  });
  input.addEventListener('change', () => {
    if (refreshDeadline()) return;
    if (!input.value.trim()) {
      inputError('RGB 通道不能为空。');
      return;
    }
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      inputError('RGB 通道请输入数字。');
      return;
    }
    const rgb: RGB = [...session.guess];
    rgb[i] = Math.max(0, Math.min(255, Math.round(value)));
    applyGuess(rgb);
  });
});
hex.addEventListener('input', () => {
  const rgb = fromHex(hex.value);
  if (rgb) applyGuess(rgb, hex);
});
hex.addEventListener('change', () => {
  if (refreshDeadline()) return;
  const rgb = fromHex(hex.value);
  if (!rgb) {
    inputError('HEX 请输入六位十六进制颜色，例如 #68A7C4。');
    return;
  }
  applyGuess(rgb);
});
el('reset-color').addEventListener('click', () => {
  applyGuess([128, 128, 128]);
  sound('tap');
});
let pendingMode: typeof mode | null = null;
function prepareMode(next: typeof mode) {
  resetFeedback();
  mode = next;
  setLeaderboardMode(next);
  resetLeaderboardResult();
  session = new ColorSession(mode);
  pendingMode = null;
  runId = '';
  saved = false;
  finishedPresented = false;
  history.replaceState(null, '', '?mode=' + mode);
  inputError();
  render();
}
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) =>
  button.addEventListener('click', () => {
    const next = button.dataset.mode;
    if (!isMode(next) || next === mode) return;
    if (session.phase === 'playing' || session.phase === 'reveal') {
      pendingMode = next;
      el('restart-title').textContent = '切换到' + modeLabels[next] + '？';
      el('confirm-restart').textContent = '切换';
      el<HTMLDialogElement>('restart-dialog').showModal();
    } else prepareMode(next);
    sound('tap');
  }),
);
el('restart-run').addEventListener('click', () => {
  if (session.phase === 'ready') return;
  pendingMode = null;
  el('restart-title').textContent = '重新开始这一局？';
  el('confirm-restart').textContent = '重新开始';
  el<HTMLDialogElement>('restart-dialog').showModal();
});
el('confirm-restart').addEventListener('click', () => {
  const next = pendingMode;
  el<HTMLDialogElement>('restart-dialog').close();
  prepareMode(next ?? mode);
  if (next === null) startSession();
});
el('play-again').addEventListener('click', () => {
  summary.close();
  startSession();
});
document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Enter' &&
    (event.target === document.body || event.target === el('main')) &&
    !document.querySelector('dialog[open]')
  ) {
    event.preventDefault();
    action();
  }
});

function updateTimer() {
  if (!refreshDeadline()) paintClock();
}
let timerId: ReturnType<typeof setInterval> | undefined;
function resumeTimer() {
  if (timerId !== undefined) clearInterval(timerId);
  updateTimer();
  timerId = setInterval(updateTimer, 50);
}
document.addEventListener('visibilitychange', updateTimer);
window.addEventListener('pagehide', () => {
  clearInterval(timerId);
  timerId = undefined;
});
window.addEventListener('pageshow', resumeTimer);
setLeaderboardMode(mode);
render();
resumeTimer();
