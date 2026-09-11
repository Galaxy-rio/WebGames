import {
  LeaderboardClient,
  LeaderboardError,
  type ScoreSubmission,
  formatLeaderboardScore,
  safeWebsite,
  type LeaderboardPage,
} from '../lib/leaderboard';
import { isMode, modeLabels, type Mode, type GameRecord } from '../lib/storage';

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const dialog = el<HTMLDialogElement>('leaderboard-dialog');
const summary = el<HTMLDialogElement>('summary-dialog');
const client = new LeaderboardClient(dialog.dataset.apiUrl ?? '');
const form = el<HTMLFormElement>('leaderboard-submit-form');
const nickname = el<HTMLInputElement>('leaderboard-nickname');
const email = el<HTMLInputElement>('leaderboard-email');
const website = el<HTMLInputElement>('leaderboard-website');
const remember = el<HTMLInputElement>('leaderboard-remember');
const publish = el<HTMLButtonElement>('leaderboard-publish');
const profileKey = 'galaxyrio.leaderboard.profile.v1';
const guestKey = 'galaxyrio.leaderboard.guest.v1';
let guestId = crypto.randomUUID();
try {
  const saved = localStorage.getItem(guestKey);
  if (saved && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(saved))
    guestId = saved as typeof guestId;
  localStorage.setItem(guestKey, guestId);
  const values = JSON.parse(localStorage.getItem(profileKey) ?? 'null');
  if (values && typeof values === 'object') {
    nickname.value = typeof values.nickname === 'string' ? values.nickname : '';
    email.value = typeof values.email === 'string' ? values.email : '';
    website.value = typeof values.website === 'string' ? values.website : '';
    remember.checked = true;
  }
} catch {}
let mode: Mode = 'accuracy';
let offset = 0;
let requestId = 0;
let submitting = false;
let returnToSummary = false;
let retryPayload: ScoreSubmission | null = null;
function lockIdentity(locked: boolean) {
  [nickname, email, website, remember].forEach(
    (input) => (input.disabled = locked),
  );
}
let pending: GameRecord | null = null;
let page: LeaderboardPage | null = null;
const pageSize = 20;
const admin = el<HTMLAnchorElement>('leaderboard-admin');
if (client.configured) {
  admin.href = client.baseUrl + '/admin/';
  admin.hidden = false;
}
function status(message: string, error = false) {
  const label = el('leaderboard-submit-status');
  label.textContent = message;
  label.classList.toggle('is-error', error);
}
function rememberFields() {
  try {
    if (remember.checked)
      localStorage.setItem(
        profileKey,
        JSON.stringify({
          nickname: nickname.value.trim(),
          email: email.value.trim(),
          website: website.value.trim(),
        }),
      );
    else localStorage.removeItem(profileKey);
  } catch {}
}
remember.addEventListener('change', rememberFields);
function pagination(loading = false) {
  el<HTMLButtonElement>('leaderboard-prev').disabled = loading || offset === 0;
  el<HTMLButtonElement>('leaderboard-next').disabled =
    loading || !page || offset + pageSize >= page.total;
  el('leaderboard-page').textContent =
    '第 ' +
    (Math.floor(offset / pageSize) + 1) +
    ' 页' +
    (page ? ' · ' + page.total + ' 位玩家' : '');
}
async function loadBoard() {
  const currentRequest = ++requestId;
  const requestedMode = mode;
  el('leaderboard-list').replaceChildren();
  el('leaderboard-status').textContent = client.configured
    ? '正在翻开成绩册…'
    : '排行榜还没有开放。';
  page = null;
  pagination(true);
  document
    .querySelectorAll<HTMLButtonElement>('[data-board-mode]')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.boardMode === mode),
      ),
    );
  el('leaderboard-rule').textContent =
    modeLabels[mode] +
    ' · ' +
    (mode === 'speed' ? '总用时越低越好' : '平均准确率越高越好') +
    ' · 每人保留最佳';
  if (!client.configured) {
    pagination();
    return;
  }
  try {
    const result = await client.list('chroma', requestedMode, offset, pageSize);
    if (currentRequest !== requestId) return;
    page = result;
    if (result.total > 0 && offset >= result.total) {
      offset = Math.floor((result.total - 1) / pageSize) * pageSize;
      return void loadBoard();
    }
    el('leaderboard-status').textContent = result.entries.length
      ? ''
      : '这里还是空白，来留下第一抹颜色吧！';
    const list = el('leaderboard-list');
    for (const entry of result.entries) {
      const row = document.createElement('li');
      row.className = 'chroma-board-entry';
      if (entry.rank <= 3) row.classList.add('is-podium');
      const rank = document.createElement('span');
      rank.className = 'chroma-board-rank';
      rank.textContent = String(entry.rank).padStart(2, '0');
      const player = document.createElement('div');
      player.className = 'chroma-board-player';
      const url = safeWebsite(entry.website);
      const name = document.createElement(url ? 'a' : 'span');
      name.textContent = entry.nickname;
      if (name instanceof HTMLAnchorElement && url) {
        name.href = url;
        name.target = '_blank';
        name.rel = 'noopener noreferrer nofollow';
      }
      const date = document.createElement('time');
      date.dateTime = new Date(entry.updatedAt).toISOString();
      date.textContent = new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
      }).format(entry.updatedAt);
      player.append(name, date);
      const score = document.createElement('strong');
      score.textContent = formatLeaderboardScore(entry.score, result.board);
      row.append(rank, player, score);
      list.append(row);
    }
  } catch (error) {
    if (currentRequest !== requestId) return;
    el('leaderboard-status').textContent =
      error instanceof Error ? error.message : '读取失败，请重试。';
  } finally {
    if (currentRequest === requestId) pagination();
  }
}
export function setLeaderboardMode(value: Mode) {
  mode = value;
  offset = 0;
}
export function resetLeaderboardResult() {
  pending = null;
  retryPayload = null;
  lockIdentity(submitting);
  status('');
  publish.disabled = !client.configured || submitting;
  el<HTMLDetailsElement>('leaderboard-submit-panel').open = false;
}
export function presentLeaderboardResult(record: GameRecord) {
  pending = { ...record };
  if (isMode(record.mode)) setLeaderboardMode(record.mode);
  const score =
    record.mode === 'speed'
      ? ((record.elapsedMs + record.penaltyMs) / 1000).toFixed(1) + 's'
      : record.average.toFixed(1) + '%';
  el('leaderboard-submit-description').textContent = isMode(record.mode)
    ? modeLabels[record.mode] + ' · ' + score
    : score;
  publish.disabled = !client.configured || submitting;
  publish.textContent = '提交排行榜';
  status(client.configured ? '' : '排行榜还没有开放，成绩已保存在本机。');
}
function openBoard() {
  returnToSummary = summary.open;
  if (summary.open) summary.close();
  if (!dialog.open) dialog.showModal();
  offset = 0;
  void loadBoard();
}
dialog.addEventListener('close', () => {
  if (returnToSummary) {
    returnToSummary = false;
    if (!summary.open) summary.showModal();
  }
});
el('open-leaderboard').addEventListener('click', openBoard);
el('summary-view-leaderboard').addEventListener('click', openBoard);
el('leaderboard-refresh').addEventListener('click', () => void loadBoard());
el('leaderboard-prev').addEventListener('click', () => {
  offset = Math.max(0, offset - pageSize);
  void loadBoard();
});
el('leaderboard-next').addEventListener('click', () => {
  if (page && offset + pageSize < page.total) {
    offset += pageSize;
    void loadBoard();
  }
});
document
  .querySelectorAll<HTMLButtonElement>('[data-board-mode]')
  .forEach((button) =>
    button.addEventListener('click', () => {
      if (!isMode(button.dataset.boardMode)) return;
      setLeaderboardMode(button.dataset.boardMode);
      void loadBoard();
    }),
  );
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (
    !pending ||
    !isMode(pending.mode) ||
    submitting ||
    (!retryPayload && !form.reportValidity())
  )
    return;
  const record = pending;
  if (!retryPayload) {
    rememberFields();
    retryPayload = {
      submissionId: record.id,
      guestId,
      nickname: nickname.value.trim(),
      email: email.value.trim(),
      website: website.value.trim(),
      score:
        record.mode === 'speed'
          ? Math.round(record.elapsedMs + record.penaltyMs)
          : Math.round(record.average * 10),
      metadata: {
        rounds: record.rounds,
        penaltyMs: record.penaltyMs,
        bestRoundAccuracy: record.best,
        elapsedMs: Math.round(record.elapsedMs),
      },
    };
  }
  const payload = retryPayload;
  submitting = true;
  lockIdentity(true);
  publish.disabled = true;
  status('正在提交…');
  try {
    const result = await client.submit('chroma', record.mode, payload);
    if (pending?.id !== record.id) return;
    status(
      !result.entry
        ? '这局成绩已被管理员移除。'
        : result.duplicate
          ? '这局已经提交过啦。'
          : result.improved
            ? '已上榜！你的最佳成绩已更新。'
            : '已收到，排行榜保留了你更好的成绩。',
    );
    publish.textContent = '本局已提交';
    pending = null;
    retryPayload = null;
  } catch (error) {
    if (pending?.id === record.id) {
      const definitive =
        error instanceof LeaderboardError &&
        error.status >= 400 &&
        error.status < 500;
      if (definitive) retryPayload = null;
      publish.textContent = definitive ? '提交排行榜' : '重试提交';
      const message =
        error instanceof Error ? error.message : '提交失败，请重试。';
      status(message + (definitive ? '' : ' 重试会沿用本次填写信息。'), true);
    }
  } finally {
    submitting = false;
    lockIdentity(Boolean(retryPayload));
    publish.disabled = !client.configured || !pending;
  }
});
