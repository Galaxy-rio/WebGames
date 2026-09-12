import type { Board, Env } from './types.ts';
import { validateLandroidResult } from './landroid.ts';
import {
  ApiError,
  boardInput,
  boolean,
  email,
  fail,
  id,
  integer,
  metadata,
  pagination,
  readJson,
  text,
  uuid,
  website,
} from './validation.ts';
import {
  adminSecret,
  allowedOrigin,
  authenticated,
  hmac,
  identitySecret,
  logoutCookie,
  sameOrigin,
  sessionCookie,
  validPassword,
} from './security.ts';
import {
  adminEntries,
  deleteEntries,
  existingSubmission,
  getBoard,
  getGames,
  listEntries,
  resolvePlayer,
  saveScore,
  submissionResponse,
} from './repository.ts';

function json(
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}
function boardValues(board: Board): (string | number)[] {
  return [
    board.gameId,
    board.id,
    board.name,
    board.sortOrder,
    board.scoreScale,
    board.decimals,
    board.unit,
    board.minScore,
    board.maxScore,
    Number(board.enabled),
    JSON.stringify(board.metadataFields),
  ];
}
function stableMetadata(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]]),
    ),
  );
}

async function publicApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (url.pathname === '/api/v1/games' && request.method === 'GET')
    return json({ games: await getGames(env.DB, true) });
  const route = /^\/api\/v1\/games\/([^/]+)\/boards\/([^/]+)\/entries$/.exec(
    url.pathname,
  );
  if (!route) fail(404, 'NOT_FOUND', '没有找到这个接口。');
  const gameId = id(route[1]);
  const boardId = id(route[2]);
  const board = await getBoard(env.DB, gameId, boardId, true);
  if (request.method === 'GET') {
    const { limit, offset } = pagination(url);
    return json(await listEntries(env.DB, board, limit, offset));
  }
  if (request.method !== 'POST')
    fail(405, 'METHOD_NOT_ALLOWED', '这个接口不支持此操作。');
  const data = await readJson(request);
  const submissionId = uuid(data.submissionId);
  const guestId = uuid(data.guestId);
  const nickname = text(data.nickname, '昵称', 1, 32);
  const nicknameKey = nickname.toLowerCase();
  const emailValue = email(data.email);
  const emailHash = emailValue
    ? await hmac(identitySecret(env), 'email:' + emailValue)
    : '';
  const websiteValue = website(data.website);
  const score = integer(data.score, '成绩', board.minScore, board.maxScore);
  const details = metadata(data.metadata, board.metadataFields);
  if (gameId === 'landroid-extended' && boardId === 'exploration')
    validateLandroidResult(score, details);
  const requestHash = await hmac(
    identitySecret(env),
    JSON.stringify([
      gameId,
      boardId,
      guestId,
      nicknameKey,
      emailHash,
      websiteValue,
      score,
      stableMetadata(details),
    ]),
  );
  const previous = await existingSubmission(env.DB, submissionId);
  if (previous) return json(submissionResponse(previous, requestHash, true));
  const player = await resolvePlayer(env.DB, {
    guestId,
    nickname,
    nicknameKey,
    emailHash,
    website: websiteValue,
  });
  return json(
    await saveScore(env.DB, board, player, {
      submissionId,
      requestHash,
      score,
      metadata: details,
      emailHash,
    }),
  );
}

async function adminApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) sameOrigin(request);
  if (url.pathname === '/api/admin/login' && request.method === 'POST') {
    adminSecret(env);
    const data = await readJson(request);
    if (
      typeof data.password !== 'string' ||
      data.password.length > 256 ||
      !(await validPassword(env, data.password))
    ) {
      fail(401, 'INVALID_PASSWORD', '管理员密码不正确。');
    }
    return json({ ok: true }, 200, {
      'Set-Cookie': await sessionCookie(request, env),
    });
  }
  if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie(request) });
  }
  const loggedIn = await authenticated(request, env);
  if (url.pathname === '/api/admin/session' && request.method === 'GET')
    return json({ authenticated: loggedIn });
  if (!loggedIn) fail(401, 'UNAUTHORIZED', '请先登录管理页面。');
  if (url.pathname === '/api/admin/games' && request.method === 'GET')
    return json({ games: await getGames(env.DB) });
  const gameRoute = /^\/api\/admin\/games\/([^/]+)$/.exec(url.pathname);
  if (gameRoute && request.method === 'PUT') {
    const gameId = id(gameRoute[1]);
    const data = await readJson(request);
    const name = text(data.name, '游戏名称', 1, 80);
    const enabled = boolean(data.enabled);
    await env.DB.prepare(
      'INSERT INTO games(id,name,enabled) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,enabled=excluded.enabled',
    )
      .bind(gameId, name, Number(enabled))
      .run();
    return json({
      game: (await getGames(env.DB)).find((game) => game.id === gameId),
    });
  }
  const boardRoute = /^\/api\/admin\/games\/([^/]+)\/boards\/([^/]+)$/.exec(
    url.pathname,
  );
  if (boardRoute && request.method === 'PUT') {
    const gameId = id(boardRoute[1]);
    const boardId = id(boardRoute[2]);
    if (
      !(await env.DB.prepare('SELECT id FROM games WHERE id=?')
        .bind(gameId)
        .first())
    )
      fail(404, 'GAME_NOT_FOUND', '请先创建这个游戏。');
    const data = await readJson(request);
    const board = boardInput(data, gameId, boardId);
    // This SQL condition enforces the history lock atomically with the update.
    const row = await env.DB.prepare(
      `INSERT INTO boards(game_id,id,name,sort_order,score_scale,decimals,unit,min_score,max_score,enabled,metadata_fields)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_id,id) DO UPDATE SET
      name=excluded.name,sort_order=excluded.sort_order,score_scale=excluded.score_scale,decimals=excluded.decimals,
      unit=excluded.unit,min_score=excluded.min_score,max_score=excluded.max_score,enabled=excluded.enabled,metadata_fields=excluded.metadata_fields
      WHERE NOT EXISTS(SELECT 1 FROM submissions WHERE game_id=boards.game_id AND board_id=boards.id)
      OR (boards.sort_order=excluded.sort_order AND boards.score_scale=excluded.score_scale AND boards.decimals=excluded.decimals
        AND boards.unit=excluded.unit AND boards.min_score=excluded.min_score AND boards.max_score=excluded.max_score AND boards.metadata_fields=excluded.metadata_fields)
      RETURNING id`,
    )
      .bind(...boardValues(board))
      .first();
    if (!row)
      fail(
        409,
        'BOARD_RULES_LOCKED',
        '这个榜单已有提交历史，只能修改名称与开放状态。更换计分规则请创建新榜单。',
      );
    return json({ board: await getBoard(env.DB, gameId, boardId) });
  }
  if (url.pathname === '/api/admin/entries' && request.method === 'GET') {
    const gameId = url.searchParams.get('gameId') || '';
    const boardId = url.searchParams.get('boardId') || '';
    if (gameId) id(gameId);
    if (boardId) id(boardId);
    const query = text(
      url.searchParams.get('q') ?? '',
      '搜索内容',
      0,
      80,
    ).toLowerCase();
    return json(
      await adminEntries(env.DB, {
        gameId,
        boardId,
        query,
        ...pagination(url),
      }),
    );
  }
  if (
    url.pathname === '/api/admin/entries/delete' &&
    request.method === 'POST'
  ) {
    const data = await readJson(request);
    if (
      !Array.isArray(data.ids) ||
      data.ids.length < 1 ||
      data.ids.length > 100
    )
      fail(400, 'INVALID_INPUT', '请一次选择 1–100 条记录。');
    const ids = [...new Set(data.ids.map(uuid))];
    return json({ deleted: await deleteEntries(env.DB, ids) });
  }
  if (url.pathname === '/api/admin/players' && request.method === 'GET') {
    const { limit, offset } = pagination(url);
    const query = text(
      url.searchParams.get('q') ?? '',
      '搜索内容',
      0,
      80,
    ).toLowerCase();
    const [rows, count] = await env.DB.batch([
      env.DB.prepare(
        'SELECT id,nickname,(email_hash IS NOT NULL) AS protected,created_at AS createdAt FROM players WHERE instr(nickname_key,?)>0 ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?',
      ).bind(query, limit, offset),
      env.DB.prepare(
        'SELECT COUNT(*) AS total FROM players WHERE instr(nickname_key,?)>0',
      ).bind(query),
    ]);
    return json({
      players: rows.results.map((row) => ({
        ...row,
        protected: !!row.protected,
      })),
      total: Number(count.results[0].total),
      limit,
      offset,
    });
  }
  const unlockRoute = /^\/api\/admin\/players\/([^/]+)\/unlock$/.exec(
    url.pathname,
  );
  if (unlockRoute && request.method === 'POST') {
    const playerId = uuid(unlockRoute[1]);
    // Both links are detached: old protected records cannot be claimed by a new same-name visitor.
    const result = await env.DB.prepare(
      'UPDATE players SET email_hash=NULL,guest_id=NULL WHERE id=? AND email_hash IS NOT NULL',
    )
      .bind(playerId)
      .run();
    if (
      !result.meta.changes &&
      !(await env.DB.prepare('SELECT id FROM players WHERE id=?')
        .bind(playerId)
        .first())
    )
      fail(404, 'PLAYER_NOT_FOUND', '没有找到这个玩家。');
    return json({ ok: true });
  }
  fail(404, 'NOT_FOUND', '没有找到这个管理接口。');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let origin: string | null = null;
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (url.pathname === '/')
          return Response.redirect(new URL('/admin/', url), 302);
        if (env.ASSETS) return await env.ASSETS.fetch(request);
        return new Response('Not found', { status: 404 });
      }
      const isAdmin = url.pathname.startsWith('/api/admin/');
      if (!isAdmin) origin = allowedOrigin(request, env);
      if (request.method === 'OPTIONS') {
        if (isAdmin) sameOrigin(request);
        const headers: Record<string, string> = {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        };
        if (origin) headers['Access-Control-Allow-Origin'] = origin;
        return new Response(null, { status: 204, headers });
      }
      const response = await (isAdmin
        ? adminApi(request, env, url)
        : publicApi(request, env, url));
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'same-origin');
      if (!isAdmin) {
        headers.set('Vary', 'Origin');
        if (origin) headers.set('Access-Control-Allow-Origin', origin);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const known = error instanceof ApiError;
      const headers: Record<string, string> = {
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Origin',
      };
      if (origin) headers['Access-Control-Allow-Origin'] = origin;
      // Do not serialize D1 exceptions, requests, email values, or bindings into client responses/logs.
      return json(
        {
          error: {
            code: known ? error.code : 'INTERNAL_ERROR',
            message: known ? error.message : '排行榜暂时无法使用，请稍后重试。',
          },
        },
        known ? error.status : 500,
        headers,
      );
    }
  },
};
