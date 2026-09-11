/** UI-free client shared by games. No dependency on Chroma Dash or Twikoo. */
export interface LeaderboardBoard {
  id: string;
  gameId: string;
  name: string;
  sortOrder: 'asc' | 'desc';
  scoreScale: number;
  decimals: number;
  unit: string;
  minScore: number;
  maxScore: number;
  enabled: boolean;
  metadataFields: string[];
}
export interface LeaderboardGame {
  id: string;
  name: string;
  enabled: boolean;
  boards: LeaderboardBoard[];
}
export interface LeaderboardEntry {
  id: string;
  nickname: string;
  website: string;
  score: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  rank: number;
}
export interface LeaderboardPage {
  board: LeaderboardBoard;
  entries: LeaderboardEntry[];
  total: number;
  limit: number;
  offset: number;
}
export interface ScoreSubmission {
  submissionId: string;
  guestId: string;
  nickname: string;
  email?: string;
  website?: string;
  score: number;
  metadata?: Record<string, unknown>;
}
export interface SubmissionResult {
  entry: LeaderboardEntry | null;
  improved: boolean;
  duplicate: boolean;
}
export class LeaderboardError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code = 'REQUEST_FAILED', status = 0) {
    super(message);
    this.name = 'LeaderboardError';
    this.code = code;
    this.status = status;
  }
}
export function formatLeaderboardScore(
  score: number,
  board: Pick<LeaderboardBoard, 'scoreScale' | 'decimals' | 'unit'>,
) {
  return (score / board.scoreScale).toFixed(board.decimals) + board.unit;
}
export function safeWebsite(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export class LeaderboardClient {
  readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  constructor(
    baseUrl: string,
    fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
    this.fetcher = fetcher;
  }
  get configured() {
    return this.baseUrl.length > 0;
  }
  private path(gameId: string, boardId: string) {
    return (
      '/api/v1/games/' +
      encodeURIComponent(gameId) +
      '/boards/' +
      encodeURIComponent(boardId) +
      '/entries'
    );
  }
  private async request<T>(path: string, body?: unknown): Promise<T> {
    if (!this.configured)
      throw new LeaderboardError(
        '排行榜还没有开放，成绩已保存在本机。',
        'NOT_CONFIGURED',
      );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await this.fetcher(this.baseUrl + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers:
          body === undefined
            ? { Accept: 'application/json' }
            : {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let result: any;
      try {
        result = await response.json();
      } catch {
        throw new LeaderboardError(
          '排行榜服务暂时没有响应，请稍后重试。',
          'INVALID_RESPONSE',
          response.status,
        );
      }
      if (!response.ok) {
        const message =
          typeof result?.error?.message === 'string'
            ? result.error.message
            : '操作没有成功，请稍后重试。';
        throw new LeaderboardError(
          message,
          result?.error?.code ?? 'REQUEST_FAILED',
          response.status,
        );
      }
      return result as T;
    } catch (error) {
      if (error instanceof LeaderboardError) throw error;
      throw new LeaderboardError(
        controller.signal.aborted
          ? '连接超时，请重试；本机成绩不会丢失。'
          : '暂时连不上排行榜，请检查网络后重试。',
        controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  games() {
    return this.request<{ games: LeaderboardGame[] }>('/api/v1/games');
  }
  list(gameId: string, boardId: string, offset = 0, limit = 20) {
    const params = new URLSearchParams({
      offset: String(Math.max(0, Math.trunc(offset))),
      limit: String(Math.max(1, Math.min(100, Math.trunc(limit)))),
    });
    return this.request<LeaderboardPage>(
      this.path(gameId, boardId) + '?' + params,
    );
  }
  submit(gameId: string, boardId: string, value: ScoreSubmission) {
    return this.request<SubmissionResult>(this.path(gameId, boardId), value);
  }
}
