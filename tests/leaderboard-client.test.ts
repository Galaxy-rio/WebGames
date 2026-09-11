import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LeaderboardClient,
  LeaderboardError,
  formatLeaderboardScore,
  safeWebsite,
} from '../src/lib/leaderboard.ts';

test('score formatting respects each game board scale and unit', () => {
  assert.equal(
    formatLeaderboardScore(954, { scoreScale: 10, decimals: 1, unit: '%' }),
    '95.4%',
  );
  assert.equal(
    formatLeaderboardScore(12345, { scoreScale: 1000, decimals: 3, unit: 's' }),
    '12.345s',
  );
});
test('website links only allow HTTP and HTTPS', () => {
  assert.equal(safeWebsite('javascript:alert(1)'), null);
  assert.equal(safeWebsite('data:text/html,test'), null);
  assert.equal(safeWebsite('invalid'), null);
  assert.equal(safeWebsite('https://example.com'), 'https://example.com/');
});
test('unconfigured production client avoids network calls', async () => {
  const client = new LeaderboardClient('', async () => {
    throw new Error('must not fetch');
  });
  await assert.rejects(
    client.games(),
    (error: unknown) =>
      error instanceof LeaderboardError && error.code === 'NOT_CONFIGURED',
  );
});
test('API paths isolate games, clamp pages and omit admin credentials', async () => {
  let seen = '';
  const client = new LeaderboardClient(
    'https://example.com/',
    async (url, options) => {
      seen = String(url);
      assert.equal(options?.credentials, 'omit');
      return Response.json({ entries: [] });
    },
  );
  await client.list('a/b', 'c d', -5, 1000);
  assert.equal(
    seen,
    'https://example.com/api/v1/games/a%2Fb/boards/c%20d/entries?offset=0&limit=100',
  );
});
test('friendly backend identity errors survive the client', async () => {
  const client = new LeaderboardClient('https://example.com', async () =>
    Response.json(
      { error: { code: 'EMAIL_MISMATCH', message: '请填写相同邮箱。' } },
      { status: 403 },
    ),
  );
  await assert.rejects(
    client.submit('chroma', 'accuracy', {
      submissionId: 'test',
      guestId: 'guest',
      nickname: 'Test',
      score: 954,
    }),
    (error: unknown) =>
      error instanceof LeaderboardError &&
      error.code === 'EMAIL_MISMATCH' &&
      error.message === '请填写相同邮箱。',
  );
});
test('retry uses the same submission ID rather than generating a new run', async () => {
  const payloads: string[] = [];
  const client = new LeaderboardClient(
    'https://example.com',
    async (_, options) => {
      payloads.push(String(options?.body));
      return Response.json({ entry: null, improved: false, duplicate: true });
    },
  );
  const payload = {
    submissionId: 'same-run',
    guestId: 'guest',
    nickname: 'Test',
    score: 954,
  };
  await client.submit('chroma', 'accuracy', payload);
  await client.submit('chroma', 'accuracy', payload);
  assert.equal(payloads[0], payloads[1]);
});
test('non-JSON service errors do not leak HTML to game UI', async () => {
  const client = new LeaderboardClient(
    'https://example.com',
    async () => new Response('<h1>proxy error</h1>', { status: 502 }),
  );
  await assert.rejects(
    client.games(),
    (error: unknown) =>
      error instanceof LeaderboardError && error.code === 'INVALID_RESPONSE',
  );
});

test('default browser fetch retains the global receiver', async (context) => {
  context.mock.method(globalThis, 'fetch', async function (this: unknown) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Response.json({ games: [] });
  });
  const client = new LeaderboardClient('https://example.com');
  assert.deepEqual(await client.games(), { games: [] });
});
