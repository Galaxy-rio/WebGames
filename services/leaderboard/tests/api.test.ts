import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.ts';
import type { Database, Env, QueryResult, Statement } from '../src/types.ts';

class LocalStatement implements Statement {
  database: DatabaseSync;
  query: string;
  values: (string | number | null)[];
  constructor(
    database: DatabaseSync,
    query: string,
    values: (string | number | null)[] = [],
  ) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values: (string | number | null)[]): LocalStatement {
    return new LocalStatement(this.database, this.query, values);
  }
  execute<T>(): QueryResult<T> {
    const results = this.database
      .prepare(this.query)
      .all(...this.values) as T[];
    const count = this.database.prepare('SELECT changes() AS count').get() as {
      count: number;
    };
    return { success: true, results, meta: { changes: count.count } };
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.execute<Record<string, unknown>>().results[0];
    return row ? ((column ? row[column] : row) as T) : null;
  }
  async all<T>(): Promise<QueryResult<T>> {
    return this.execute<T>();
  }
  async run<T>(): Promise<QueryResult<T>> {
    return this.execute<T>();
  }
}
class LocalDatabase implements Database {
  sqlite: DatabaseSync;
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(
      readFileSync(
        new URL('../migrations/0001_initial.sql', import.meta.url),
        'utf8',
      ),
    );
  }
  prepare(query: string): LocalStatement {
    return new LocalStatement(this.sqlite, query);
  }
  async batch<T>(statements: Statement[]): Promise<QueryResult<T>[]> {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) =>
        (statement as LocalStatement).execute<T>(),
      );
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const ORIGIN = 'http://127.0.0.1:8787';
const GAME_ORIGIN = 'http://127.0.0.1:4322';
const entryPath = (game = 'chroma', board = 'accuracy') =>
  `/api/v1/games/${game}/boards/${board}/entries`;
type Json = Record<string, any>;
function setup(t: { after(fn: () => void): void }) {
  const DB = new LocalDatabase();
  t.after(() => DB.sqlite.close());
  const env: Env = {
    DB,
    ADMIN_PASSWORD: 'local-admin-password-for-tests',
    IDENTITY_SECRET: 'local-identity-secret-for-tests-at-least-32',
    ALLOWED_ORIGINS: GAME_ORIGIN + ',https://games.galaxyrio.top',
  };
  async function call(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      origin?: string | null;
      headers?: Record<string, string>;
    } = {},
  ) {
    const method =
      options.method ?? (options.body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined)
      headers['Content-Type'] = 'application/json';
    if (options.origin !== null)
      headers.Origin =
        options.origin ??
        (path.startsWith('/api/admin/') ? ORIGIN : GAME_ORIGIN);
    if (options.cookie) headers.Cookie = options.cookie;
    const response = await worker.fetch(
      new Request(ORIGIN + path, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
      env,
    );
    const data =
      response.status === 204 ? null : ((await response.json()) as Json);
    return { response, data };
  }
  async function login() {
    const result = await call('/api/admin/login', {
      body: { password: env.ADMIN_PASSWORD },
    });
    assert.equal(result.response.status, 200);
    return result.response.headers.get('set-cookie')!.split(';')[0];
  }
  function score(overrides: Json = {}) {
    return {
      submissionId: crypto.randomUUID(),
      guestId: crypto.randomUUID(),
      nickname: '游客',
      score: 900,
      metadata: { rounds: 10 },
      ...overrides,
    };
  }
  return { DB, env, call, login, score };
}

test('seed exposes only the three expected Chroma boards and supports pagination', async (t) => {
  const { call } = setup(t);
  const { data } = await call('/api/v1/games');
  assert.equal(data.games[0].id, 'chroma');
  assert.deepEqual(
    data.games[0].boards.map((b: Json) => b.id),
    ['accuracy', 'speed', 'blind'],
  );
  const result = await call(entryPath() + '?limit=3&offset=0');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.entries, []);
  assert.equal(result.data.total, 0);
});

test('descending scores, tied ranks, and pagination stay consistent', async (t) => {
  const { call, score } = setup(t);
  for (const value of [800, 950, 950, 600])
    assert.equal(
      (await call(entryPath(), { body: score({ score: value }) })).response
        .status,
      200,
    );
  const { data } = await call(entryPath());
  assert.deepEqual(
    data.entries.map((e: Json) => e.score),
    [950, 950, 800, 600],
  );
  assert.deepEqual(
    data.entries.map((e: Json) => e.rank),
    [1, 1, 3, 4],
  );
  const page = await call(entryPath() + '?limit=2&offset=2');
  assert.deepEqual(
    page.data.entries.map((e: Json) => e.rank),
    [3, 4],
  );
  assert.equal(page.data.total, 4);
});

test('ascending boards preserve the lowest score per player', async (t) => {
  const { call, score } = setup(t);
  const guestId = crypto.randomUUID();
  for (const value of [23000, 26000, 14000]) {
    const { data } = await call(entryPath('chroma', 'speed'), {
      body: score({ guestId, score: value }),
    });
    assert.equal(data.improved, value !== 26000);
  }
  const { data } = await call(entryPath('chroma', 'speed'));
  assert.equal(data.entries.length, 1);
  assert.equal(data.entries[0].score, 14000);
});

test('same-name guests stay separate and only their own best score is replaced', async (t) => {
  const { call, score } = setup(t);
  const firstGuest = crypto.randomUUID();
  const secondGuest = crypto.randomUUID();
  await call(entryPath(), { body: score({ guestId: firstGuest, score: 700 }) });
  await call(entryPath(), {
    body: score({ guestId: secondGuest, score: 950 }),
  });
  await call(entryPath(), { body: score({ guestId: firstGuest, score: 800 }) });
  const { data } = await call(entryPath());
  assert.equal(data.entries.length, 2);
  assert.deepEqual(
    data.entries.map((e: Json) => e.score),
    [950, 800],
  );
});

test('email protects normalized nickname across browsers without exposing email or digest', async (t) => {
  const { DB, call, score } = setup(t);
  await call(entryPath(), {
    body: score({
      nickname: ' Ｒｉｏ ',
      email: ' Player@Example.COM ',
      score: 700,
    }),
  });
  const missing = await call(entryPath(), { body: score({ nickname: 'rio' }) });
  const wrong = await call(entryPath(), {
    body: score({ nickname: 'RIO', email: 'wrong@example.com' }),
  });
  assert.equal(missing.response.status, 409);
  assert.equal(wrong.data.error.code, 'NICKNAME_PROTECTED');
  const correct = await call(entryPath(), {
    body: score({ nickname: 'Rio', email: 'player@example.com', score: 950 }),
  });
  assert.equal(correct.response.status, 200);
  const publicResult = await call(entryPath());
  assert.equal(publicResult.data.total, 1);
  assert.equal(publicResult.data.entries[0].score, 950);
  const serialized =
    JSON.stringify(publicResult.data) + JSON.stringify(correct.data);
  assert.equal(serialized.includes('example.com'), false);
  assert.equal(serialized.includes('email'), false);
  const row = DB.sqlite.prepare('SELECT email_hash FROM players').get() as {
    email_hash: string;
  };
  assert.match(row.email_hash, /^[0-9a-f]{64}$/);
  assert.equal(serialized.includes(row.email_hash), false);
  assert.equal(
    JSON.stringify(
      DB.sqlite.prepare('SELECT * FROM submissions').all(),
    ).includes('player@example.com'),
    false,
  );
});

test('first email binding upgrades only this browser and cannot adopt a same-name guest', async (t) => {
  const { DB, call, score } = setup(t);
  const ownGuest = crypto.randomUUID();
  await call(entryPath(), { body: score({ guestId: ownGuest, score: 800 }) });
  await call(entryPath(), { body: score({ score: 990 }) });
  const ownBefore = DB.sqlite
    .prepare('SELECT id FROM players WHERE guest_id=?')
    .get(ownGuest) as { id: string };
  await call(entryPath(), {
    body: score({ guestId: ownGuest, email: 'owner@example.com', score: 900 }),
  });
  const { data } = await call(entryPath());
  assert.equal(data.entries.length, 2);
  assert.deepEqual(
    data.entries.map((e: Json) => e.score),
    [990, 900],
  );
  const protectedId = DB.sqlite
    .prepare('SELECT id FROM players WHERE email_hash IS NOT NULL')
    .get() as { id: string };
  assert.equal(protectedId.id, ownBefore.id);
});

test('simultaneous first bindings have exactly one winner when emails differ', async (t) => {
  const { DB, call, score } = setup(t);
  const results = await Promise.all([
    call(entryPath(), {
      body: score({ nickname: '同名', email: 'one@example.com' }),
    }),
    call(entryPath(), {
      body: score({ nickname: '同名', email: 'two@example.com' }),
    }),
  ]);
  assert.deepEqual(results.map((r) => r.response.status).sort(), [200, 409]);
  const count = DB.sqlite
    .prepare(
      'SELECT COUNT(*) AS count FROM players WHERE email_hash IS NOT NULL',
    )
    .get() as { count: number };
  assert.equal(count.count, 1);
});

test('simultaneous improvements atomically retain the maximum', async (t) => {
  const { call, score } = setup(t);
  const guestId = crypto.randomUUID();
  const payloads = [450, 980, 600, 720, 990, 870].map((value) =>
    score({ guestId, score: value }),
  );
  const responses = await Promise.all(
    payloads.map((body) => call(entryPath(), { body })),
  );
  assert.ok(responses.every((r) => r.response.status === 200));
  const { data } = await call(entryPath());
  assert.equal(data.total, 1);
  assert.equal(data.entries[0].score, 990);
});

test('retry is idempotent and the same submission cannot be rewritten', async (t) => {
  const { DB, call, score } = setup(t);
  const body = score();
  const first = await call(entryPath(), { body });
  const second = await call(entryPath(), { body });
  assert.equal(first.data.duplicate, false);
  assert.equal(first.data.improved, true);
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.improved, false);
  assert.equal(second.data.entry.id, first.data.entry.id);
  const changed = await call(entryPath(), { body: { ...body, score: 950 } });
  assert.equal(changed.response.status, 409);
  assert.equal(changed.data.error.code, 'SUBMISSION_CONFLICT');
  const count = DB.sqlite
    .prepare('SELECT COUNT(*) AS count FROM submissions')
    .get() as { count: number };
  assert.equal(count.count, 1);
});

test('simultaneous identical submissions make one claim', async (t) => {
  const { call, score } = setup(t);
  const body = score();
  const results = await Promise.all([
    call(entryPath(), { body }),
    call(entryPath(), { body }),
  ]);
  assert.ok(results.every((r) => r.response.status === 200));
  assert.deepEqual(results.map((r) => r.data.duplicate).sort(), [false, true]);
  assert.equal(results[0].data.entry.id, results[1].data.entry.id);
});

test('deleting an entry preserves retry tombstones, including previous weaker submissions', async (t) => {
  const { call, score, login } = setup(t);
  const guestId = crypto.randomUUID();
  const firstBody = score({ guestId, score: 900 });
  const weakBody = score({ guestId, score: 800 });
  const original = await call(entryPath(), { body: firstBody });
  await call(entryPath(), { body: weakBody });
  const cookie = await login();
  const deleted = await call('/api/admin/entries/delete', {
    cookie,
    body: { ids: [original.data.entry.id] },
  });
  assert.equal(deleted.data.deleted, 1);
  for (const body of [firstBody, weakBody]) {
    const retry = await call(entryPath(), { body });
    assert.equal(retry.response.status, 200);
    assert.equal(retry.data.duplicate, true);
    assert.equal(retry.data.entry, null);
  }
  assert.equal((await call(entryPath())).data.total, 0);
  assert.equal(
    (await call(entryPath(), { body: score({ guestId }) })).response.status,
    200,
  );
  assert.equal((await call(entryPath())).data.total, 1);
});

test('admin auth requires password, signed cookie, and same-origin writes', async (t) => {
  const { call, login } = setup(t);
  assert.equal((await call('/api/admin/games')).response.status, 401);
  assert.equal((await call('/api/admin/session')).data.authenticated, false);
  assert.equal(
    (await call('/api/admin/login', { body: { password: 'wrong' } })).response
      .status,
    401,
  );
  assert.equal(
    (
      await call('/api/admin/login', {
        origin: 'https://evil.example',
        body: { password: 'local-admin-password-for-tests' },
      })
    ).response.status,
    403,
  );
  assert.equal(
    (
      await call('/api/admin/login', {
        origin: null,
        body: { password: 'local-admin-password-for-tests' },
      })
    ).response.status,
    403,
  );
  const cookie = await login();
  assert.equal(
    (await call('/api/admin/session', { cookie })).data.authenticated,
    true,
  );
  assert.equal(
    (await call('/api/admin/games', { cookie })).response.status,
    200,
  );
  assert.equal(
    (await call('/api/admin/games', { cookie: cookie.slice(0, -2) + 'xx' }))
      .response.status,
    401,
  );
  const blocked = await call('/api/admin/games/demo', {
    cookie,
    origin: GAME_ORIGIN,
    method: 'PUT',
    body: { name: '演示', enabled: true },
  });
  assert.equal(blocked.response.status, 403);
  const logout = await call('/api/admin/logout', { cookie, method: 'POST' });
  assert.match(logout.response.headers.get('set-cookie')!, /Max-Age=0/);
});

test('admin can add games and boards without code changes; rankings remain isolated', async (t) => {
  const { call, score, login } = setup(t);
  const cookie = await login();
  const game = await call('/api/admin/games/puzzle', {
    cookie,
    method: 'PUT',
    body: { name: 'Puzzle', enabled: true },
  });
  assert.equal(game.data.game.id, 'puzzle');
  const board = {
    name: '最快',
    sortOrder: 'asc',
    scoreScale: 1000,
    decimals: 2,
    unit: 's',
    minScore: 0,
    maxScore: 999999,
    enabled: true,
    metadataFields: ['moves'],
  };
  assert.equal(
    (
      await call('/api/admin/games/puzzle/boards/time', {
        cookie,
        method: 'PUT',
        body: board,
      })
    ).response.status,
    200,
  );
  const guestId = crypto.randomUUID();
  await call(entryPath('puzzle', 'time'), {
    body: score({
      guestId,
      email: 'shared@example.com',
      score: 10000,
      metadata: { moves: 20 },
    }),
  });
  await call(entryPath(), {
    body: score({ guestId, email: 'shared@example.com', score: 980 }),
  });
  assert.equal(
    (await call(entryPath('puzzle', 'time'))).data.entries[0].score,
    10000,
  );
  assert.equal((await call(entryPath())).data.entries[0].score, 980);
  assert.equal((await call(entryPath('chroma', 'blind'))).data.total, 0);
  const filtered = await call(
    '/api/admin/entries?gameId=puzzle&boardId=time&q=游客',
    { cookie },
  );
  assert.equal(filtered.data.total, 1);
  assert.equal(filtered.data.entries[0].gameId, 'puzzle');
});

test('board rules lock after submissions while name and enabled remain editable', async (t) => {
  const { call, score, login } = setup(t);
  await call(entryPath(), { body: score() });
  const cookie = await login();
  const board = (await call(entryPath())).data.board;
  const wrong = await call('/api/admin/games/chroma/boards/accuracy', {
    cookie,
    method: 'PUT',
    body: { ...board, sortOrder: 'asc' },
  });
  assert.equal(wrong.response.status, 409);
  assert.equal(wrong.data.error.code, 'BOARD_RULES_LOCKED');
  const good = await call('/api/admin/games/chroma/boards/accuracy', {
    cookie,
    method: 'PUT',
    body: { ...board, name: '新名称', enabled: false },
  });
  assert.equal(good.response.status, 200);
  assert.equal(
    (await call(entryPath(), { body: score() })).response.status,
    403,
  );
  assert.equal((await call('/api/v1/games')).data.games[0].boards.length, 2);
});

test('unlock leaves historical protected records detached from a new same-name player', async (t) => {
  const { call, score, login } = setup(t);
  const guestId = crypto.randomUUID();
  await call(entryPath(), {
    body: score({ guestId, email: 'old@example.com', score: 980 }),
  });
  const cookie = await login();
  const players = await call('/api/admin/players?q=游客', { cookie });
  const player = players.data.players[0];
  assert.equal(player.protected, true);
  assert.equal(JSON.stringify(players.data).includes('email'), false);
  assert.equal(
    (
      await call('/api/admin/players/' + player.id + '/unlock', {
        cookie,
        method: 'POST',
      })
    ).response.status,
    200,
  );
  await call(entryPath(), {
    body: score({ guestId, email: 'new@example.com', score: 700 }),
  });
  const publicResult = await call(entryPath());
  assert.equal(publicResult.data.total, 2);
  assert.deepEqual(
    publicResult.data.entries.map((e: Json) => e.score),
    [980, 700],
  );
});

test('CORS permits configured games, rejects other origins, and does not enable admin CORS', async (t) => {
  const { call } = setup(t);
  const allowed = await call(entryPath(), { method: 'OPTIONS' });
  assert.equal(allowed.response.status, 204);
  assert.equal(
    allowed.response.headers.get('access-control-allow-origin'),
    GAME_ORIGIN,
  );
  assert.equal(
    allowed.response.headers.get('access-control-allow-credentials'),
    null,
  );
  const blocked = await call(entryPath(), { origin: 'https://evil.example' });
  assert.equal(blocked.response.status, 403);
  assert.equal(
    blocked.response.headers.get('access-control-allow-origin'),
    null,
  );
  const admin = await call('/api/admin/session', { origin: GAME_ORIGIN });
  assert.equal(admin.response.headers.get('access-control-allow-origin'), null);
});

test('invalid scores, URLs, metadata, identifiers, and oversized input are rejected', async (t) => {
  const { call, score } = setup(t);
  const invalid = [
    { score: -1 },
    { score: 1001 },
    { score: 90.5 },
    { score: '900' },
    { nickname: ' ' },
    { nickname: 'n'.repeat(33) },
    { email: 'bad' },
    { website: 'javascript:alert(1)' },
    { website: 'https://user:pass@example.com' },
    { metadata: { email: 'private@example.com' } },
    { metadata: { rounds: { hidden: 'data' } } },
    { metadata: { rounds: 'x'.repeat(600) } },
    { guestId: 'invalid' },
  ];
  for (const value of invalid) {
    const result = await call(entryPath(), { body: score(value) });
    assert.equal(result.response.status, 400, JSON.stringify(value));
    assert.ok(result.data.error.message);
  }
  assert.equal((await call(entryPath() + '?limit=101')).response.status, 400);
  assert.equal((await call(entryPath() + '?offset=-1')).response.status, 400);
  assert.equal(
    (await call(entryPath(), { body: score({ website: 'x'.repeat(20000) }) }))
      .response.status,
    413,
  );
  assert.equal(
    (await call('/api/v1/games/MALFORMED/boards/accuracy/entries')).response
      .status,
    400,
  );
});

test('metadata remains small flat public data and websites accept http/https only', async (t) => {
  const { call, score } = setup(t);
  const result = await call(entryPath(), {
    body: score({
      website: 'https://example.com/about',
      metadata: {
        rounds: 10,
        penaltyMs: 1000,
        bestRoundAccuracy: 98.4,
        elapsedMs: 24000,
      },
    }),
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.entry.metadata, {
    rounds: 10,
    penaltyMs: 1000,
    bestRoundAccuracy: 98.4,
    elapsedMs: 24000,
  });
  assert.equal(result.data.entry.website, 'https://example.com/about');
});

test('missing secrets fail gracefully and database exceptions cannot leak SQL or bindings', async (t) => {
  const { env, score } = setup(t);
  const request = () =>
    new Request(ORIGIN + entryPath(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(score()),
    });
  const missing = await worker.fetch(request(), {
    ...env,
    IDENTITY_SECRET: '',
  });
  assert.equal(missing.status, 503);
  const brokenDB = {
    prepare() {
      throw new Error(
        'SELECT secret_password FROM private_table; secret@example.com',
      );
    },
    batch() {
      throw new Error('DB broken');
    },
  };
  const broken = await worker.fetch(new Request(ORIGIN + entryPath()), {
    ...env,
    DB: brokenDB as unknown as Database,
  });
  assert.equal(broken.status, 500);
  const body = await broken.text();
  assert.equal(body.includes('private_table'), false);
  assert.equal(body.includes('example.com'), false);
});

test('admin cookie is HttpOnly and Secure on HTTPS; changing password invalidates sessions', async (t) => {
  const { env } = setup(t);
  const login = await worker.fetch(
    new Request('https://leaderboard.example/api/admin/login', {
      method: 'POST',
      headers: {
        Origin: 'https://leaderboard.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
    }),
    env,
  );
  const cookie = login.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  const session = await worker.fetch(
    new Request('https://leaderboard.example/api/admin/session', {
      headers: { Cookie: cookie.split(';')[0] },
    }),
    {
      ...env,
      ADMIN_PASSWORD: 'a-different-admin-password',
    },
  );
  assert.equal(((await session.json()) as Json).authenticated, false);
});

for (const { boardId, scoreForIndex, sqlOrder } of [
  {
    boardId: 'accuracy',
    scoreForIndex: (index: number) => 1000 - index,
    sqlOrder: 'DESC',
  },
  {
    boardId: 'speed',
    scoreForIndex: (index: number) => 10000 + index * 100,
    sqlOrder: 'ASC',
  },
]) {
  test(`public ${boardId} keeps exactly the top 50 across pages and boundary ties while admin retains every record`, async (t) => {
    const { DB, call, score, login } = setup(t);
    const path = entryPath('chroma', boardId);
    const submissions: Json[] = [];
    for (let index = 0; index < 65; index++) {
      // Five equal scores straddle the cutoff: positions 49–53 all have rank 49.
      const scoreIndex = index >= 48 && index <= 52 ? 48 : index;
      const result = await call(path, {
        body: score({
          nickname: `top50-${boardId}-${index}`,
          score: scoreForIndex(scoreIndex),
        }),
      });
      assert.equal(result.response.status, 200);
      assert.equal(result.data.improved, true);
      submissions.push(result.data.entry);
    }

    const expected = DB.sqlite
      .prepare(
        `SELECT id,score FROM entries WHERE game_id='chroma' AND board_id=?
       ORDER BY score ${sqlOrder},updated_at ASC,id ASC LIMIT 50`,
      )
      .all(boardId) as { id: string; score: number }[];

    const pageResults = [];
    for (const offset of [0, 20, 40]) {
      const page = await call(path + '?limit=20&offset=' + offset);
      assert.equal(page.response.status, 200);
      assert.equal(page.data.total, 50);
      assert.equal(page.data.limit, 20);
      assert.equal(page.data.offset, offset);
      pageResults.push(page.data.entries);
    }
    assert.deepEqual(
      pageResults.map((entries) => entries.length),
      [20, 20, 10],
    );
    const publicEntries = pageResults.flat();
    assert.equal(
      new Set(publicEntries.map((entry: Json) => entry.id)).size,
      50,
    );
    assert.deepEqual(
      publicEntries.map((entry: Json) => entry.id),
      expected.map((entry) => entry.id),
    );
    assert.deepEqual(
      publicEntries.slice(48).map((entry: Json) => entry.rank),
      [49, 49],
    );

    const largePage = await call(path + '?limit=100&offset=0');
    assert.equal(largePage.data.total, 50);
    assert.equal(largePage.data.entries.length, 50);
    assert.deepEqual(
      largePage.data.entries.map((entry: Json) => entry.id),
      expected.map((entry) => entry.id),
    );
    const lastEntry = await call(path + '?limit=100&offset=49');
    assert.equal(lastEntry.data.entries.length, 1);
    assert.equal(lastEntry.data.entries[0].id, expected[49].id);
    for (const offset of [50, 51, 64, 1000000]) {
      const outside = await call(path + '?limit=100&offset=' + offset);
      assert.equal(outside.response.status, 200);
      assert.equal(outside.data.total, 50);
      assert.deepEqual(outside.data.entries, []);
    }
    assert.equal(
      (await call(path + '?limit=1000000&offset=0')).response.status,
      400,
    );

    const cookie = await login();
    const adminPath = '/api/admin/entries?gameId=chroma&boardId=' + boardId;
    const all = await call(adminPath + '&limit=100', { cookie });
    assert.equal(all.response.status, 200);
    assert.equal(all.data.total, 65);
    assert.equal(all.data.entries.length, 65);
    assert.deepEqual(
      all.data.entries.map((entry: Json) => entry.id).sort(),
      submissions.map((entry) => entry.id).sort(),
    );
    assert.equal(
      all.data.entries.filter((entry: Json) => entry.rank === 49).length,
      5,
    );
    const adminTail = await call(adminPath + '&limit=20&offset=50', { cookie });
    assert.equal(adminTail.data.total, 65);
    assert.equal(adminTail.data.entries.length, 15);
    assert.equal(
      (
        DB.sqlite
          .prepare('SELECT COUNT(*) AS count FROM entries WHERE board_id=?')
          .get(boardId) as { count: number }
      ).count,
      65,
    );
  });
}
