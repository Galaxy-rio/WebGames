import {
  LeaderboardClient,
  LeaderboardError,
  safeWebsite,
  type ScoreSubmission,
  type LeaderboardPage,
} from '../../lib/leaderboard';
import type { FlightResult } from './challenge.ts';

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export function resultMetadata(
  result: FlightResult,
): Record<string, number | boolean> {
  const s = result.details;
  return {
    ruleVersion: 1,
    seed: result.seed,
    planetCount: result.planetCount,
    discovered: s.visited.length,
    flightSeconds: s.flightSeconds,
    fuelSeconds: s.fuelSeconds,
    speedBonus: s.speedBonus,
    angleBonus: s.angleBonus,
    sequenceBonus: s.sequenceBonus,
    impacts: s.impacts,
    completed: true,
    autopilot: !result.eligible,
  };
}

export class FlightLeaderboard {
  private board = el<HTMLDialogElement>('flight-leaderboard');
  private resultDialog = el<HTMLDialogElement>('flight-result');
  private client = new LeaderboardClient(this.board.dataset.apiUrl ?? '');
  private form = el<HTMLFormElement>('score-submit-form');
  private nickname = el<HTMLInputElement>('score-nickname');
  private email = el<HTMLInputElement>('score-email');
  private website = el<HTMLInputElement>('score-website');
  private remember = el<HTMLInputElement>('score-remember');
  private publish = el<HTMLButtonElement>('submit-score');
  private guestId: string = crypto.randomUUID();
  private result: FlightResult | null = null;
  private retry: ScoreSubmission | null = null;
  private submitting = false;
  private submitted = false;
  private page: LeaderboardPage | null = null;
  private offset = 0;
  private request = 0;
  private returnTo: HTMLDialogElement | null = null;

  constructor(onNext: () => void) {
    const admin = el<HTMLAnchorElement>('board-admin');
    if (this.client.configured) {
      admin.href = this.client.baseUrl + '/admin/';
      admin.hidden = false;
    }
    try {
      const guest = localStorage.getItem('galaxyrio.leaderboard.guest.v1');
      if (guest && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(guest))
        this.guestId = guest;
      localStorage.setItem('galaxyrio.leaderboard.guest.v1', this.guestId);
      const profile = JSON.parse(
        localStorage.getItem('galaxyrio.leaderboard.profile.v1') ?? 'null',
      );
      if (profile && typeof profile === 'object') {
        this.nickname.value =
          typeof profile.nickname === 'string' ? profile.nickname : '';
        this.email.value =
          typeof profile.email === 'string' ? profile.email : '';
        this.website.value =
          typeof profile.website === 'string' ? profile.website : '';
        this.remember.checked = true;
      }
    } catch {}
    this.remember.addEventListener('change', () => this.rememberProfile());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    el('next-system').addEventListener('click', () => {
      if (!this.submitting) onNext();
    });
    el('open-flight-leaderboard').addEventListener('click', () =>
      this.open(el<HTMLDialogElement>('flight-menu')),
    );
    el('result-leaderboard').addEventListener('click', () =>
      this.open(this.resultDialog),
    );
    el('board-refresh').addEventListener('click', () => void this.loadBoard());
    el('board-prev').addEventListener('click', () => {
      this.offset = Math.max(0, this.offset - 20);
      void this.loadBoard();
    });
    el('board-next').addEventListener('click', () => {
      if (this.page && this.offset + 20 < this.page.total) {
        this.offset += 20;
        void this.loadBoard();
      }
    });
    this.board.addEventListener('close', () => {
      const previous = this.returnTo;
      this.returnTo = null;
      if (previous && !previous.open) previous.showModal();
    });
  }
  reset(): void {
    this.returnTo = null;
    this.result = null;
    this.retry = null;
    this.submitted = false;
    this.resultDialog.close();
    this.lock(false);
    el('submit-status').textContent = '';
  }
  present(result: FlightResult, system: string): void {
    if (this.result?.id !== result.id) {
      this.result = result;
      this.retry = null;
      this.submitted = false;
      el('submit-status').textContent = this.client.configured
        ? ''
        : '排行榜还没有开放，成绩已保存在本机。';
    }
    el('result-system').textContent =
      `${system} · ${result.planetCount} / ${result.planetCount} 已探索`;
    el('result-score').textContent = result.eligible
      ? String(result.score)
      : '—';
    el('result-note').textContent = result.eligible
      ? '得分已结算。下一颗恒星，新的旅程。'
      : '本局已停止计分，可以前往新的星系重新开始。';
    const s = result.details;
    const rows: [string, number][] = [
      ['初始分数', 5000],
      ['探索星球', s.visited.length * 3000],
      ['着陆速度', s.speedBonus],
      ['着陆朝向', s.angleBonus],
      ['顺序探索', s.sequenceBonus],
      ['船头撞击', -s.impacts * 500],
      [
        '燃料与飞行时间',
        -Math.round(s.fuelSeconds * 100 + s.flightSeconds * 10),
      ],
    ];
    const breakdown = el('score-breakdown');
    breakdown.hidden = !result.eligible;
    breakdown.replaceChildren(
      ...rows.map(([name, value]) => {
        const row = document.createElement('div');
        const label = document.createElement('dt');
        label.textContent = name;
        const number = document.createElement('dd');
        number.textContent = (value > 0 ? '+' : '') + value;
        row.append(label, number);
        return row;
      }),
    );
    this.form.hidden = !result.eligible;
    this.publish.disabled =
      !result.eligible ||
      !this.client.configured ||
      this.submitting ||
      this.submitted;
    this.publish.textContent = this.submitted
      ? '本局已上传'
      : this.retry
        ? '重试上传'
        : '上传分数';
    if (!this.resultDialog.open) this.resultDialog.showModal();
  }
  private rememberProfile(): void {
    try {
      if (this.remember.checked)
        localStorage.setItem(
          'galaxyrio.leaderboard.profile.v1',
          JSON.stringify({
            nickname: this.nickname.value.trim(),
            email: this.email.value.trim(),
            website: this.website.value.trim(),
          }),
        );
      else localStorage.removeItem('galaxyrio.leaderboard.profile.v1');
    } catch {}
  }
  private lock(locked: boolean): void {
    for (const input of [
      this.nickname,
      this.email,
      this.website,
      this.remember,
    ])
      input.disabled = locked;
    el<HTMLButtonElement>('next-system').disabled = this.submitting;
  }
  private async submit(): Promise<void> {
    const result = this.result;
    if (
      !result?.eligible ||
      this.submitting ||
      this.submitted ||
      !this.client.configured ||
      (!this.retry && !this.form.reportValidity())
    )
      return;
    if (!this.retry) {
      this.rememberProfile();
      this.retry = {
        submissionId: result.id,
        guestId: this.guestId,
        nickname: this.nickname.value.trim(),
        email: this.email.value.trim(),
        website: this.website.value.trim(),
        score: result.score,
        metadata: resultMetadata(result),
      };
    }
    this.submitting = true;
    this.lock(true);
    this.publish.disabled = true;
    el('submit-status').textContent = '正在上传…';
    try {
      const response = await this.client.submit(
        'landroid-extended',
        'exploration',
        this.retry,
      );
      if (this.result?.id !== result.id) return;
      this.submitted = true;
      this.retry = null;
      el('submit-status').textContent = !response.entry
        ? '此局成绩已被管理员移除。'
        : response.duplicate
          ? '本局已经上传。'
          : response.improved
            ? '上传成功，最高得分已更新。'
            : '上传成功，排行榜保留了你更高的得分。';
      this.publish.textContent = '本局已上传';
    } catch (error) {
      if (this.result?.id !== result.id) return;
      const definitive =
        error instanceof LeaderboardError &&
        error.status >= 400 &&
        error.status < 500;
      if (definitive) this.retry = null;
      el('submit-status').textContent =
        (error instanceof Error ? error.message : '上传失败，请重试。') +
        (definitive ? '' : ' 重试会使用同一局成绩和填写信息。');
      this.publish.textContent = definitive ? '上传分数' : '重试上传';
    } finally {
      this.submitting = false;
      this.lock(this.retry !== null);
      this.publish.disabled =
        this.submitted || !this.result?.eligible || !this.client.configured;
    }
  }
  private open(from: HTMLDialogElement): void {
    this.returnTo = from;
    from.close();
    this.board.showModal();
    this.offset = 0;
    void this.loadBoard();
  }
  private pagination(loading = false): void {
    el<HTMLButtonElement>('board-prev').disabled = loading || this.offset === 0;
    el<HTMLButtonElement>('board-next').disabled =
      loading || !this.page || this.offset + 20 >= this.page.total;
    el('board-page').textContent =
      `第 ${Math.floor(this.offset / 20) + 1} 页${this.page ? ` · ${this.page.total} 位玩家` : ''}`;
  }
  private async loadBoard(): Promise<void> {
    const request = ++this.request;
    this.page = null;
    el('board-entries').replaceChildren();
    el('board-status').textContent = this.client.configured
      ? '正在读取…'
      : '排行榜还没有开放。';
    this.pagination(true);
    if (!this.client.configured) {
      this.pagination();
      return;
    }
    try {
      const page = await this.client.list(
        'landroid-extended',
        'exploration',
        this.offset,
        20,
      );
      if (request !== this.request) return;
      this.page = page;
      if (page.total > 0 && this.offset >= page.total) {
        this.offset = Math.floor((page.total - 1) / 20) * 20;
        return void this.loadBoard();
      }
      el('board-status').textContent = page.entries.length
        ? ''
        : '星图尚未留下名字，来完成第一段旅程。';
      el('board-entries').replaceChildren(
        ...page.entries.map((entry) => {
          const row = document.createElement('li');
          const rank = document.createElement('span');
          rank.className = 'board-rank';
          rank.textContent = String(entry.rank).padStart(2, '0');
          const player = document.createElement('div');
          const url = safeWebsite(entry.website);
          const name = document.createElement(url ? 'a' : 'span');
          name.textContent = entry.nickname;
          if (name instanceof HTMLAnchorElement && url) {
            name.href = url;
            name.target = '_blank';
            name.rel = 'noopener noreferrer nofollow';
          }
          const note = document.createElement('small');
          note.textContent = `${entry.metadata.planetCount ?? '—'} 颗星球 · ${new Date(entry.updatedAt).toLocaleDateString('zh-CN')}`;
          player.append(name, note);
          const score = document.createElement('strong');
          score.textContent = String(entry.score);
          row.append(rank, player, score);
          return row;
        }),
      );
    } catch (error) {
      if (request === this.request)
        el('board-status').textContent =
          error instanceof Error ? error.message : '读取失败，请重试。';
    } finally {
      if (request === this.request) this.pagination();
    }
  }
}
