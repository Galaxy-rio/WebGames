import type { Board, Database, Entry, Game, PlayerRow } from './types.ts';
import { fail } from './validation.ts';

type BoardRow = {
  id: string;
  game_id: string;
  name: string;
  sort_order: 'asc' | 'desc';
  score_scale: number;
  decimals: number;
  unit: string;
  min_score: number;
  max_score: number;
  enabled: number;
  metadata_fields: string;
};
type EntryRow = {
  id: string;
  game_id: string;
  board_id: string;
  nickname: string;
  website: string;
  score: number;
  metadata: string;
  created_at: number;
  updated_at: number;
  rank: number;
};
export function asBoard(row: BoardRow): Board {
  return {
    id: row.id,
    gameId: row.game_id,
    name: row.name,
    sortOrder: row.sort_order,
    scoreScale: row.score_scale,
    decimals: row.decimals,
    unit: row.unit,
    minScore: row.min_score,
    maxScore: row.max_score,
    enabled: !!row.enabled,
    metadataFields: JSON.parse(row.metadata_fields) as string[],
  };
}
export function asEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    nickname: row.nickname,
    website: row.website,
    score: row.score,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rank: row.rank,
  };
}
export async function getBoard(
  db: Database,
  gameId: string,
  boardId: string,
  requireEnabled = false,
): Promise<Board> {
  const row = await db
    .prepare(
      'SELECT b.*, g.enabled AS game_enabled FROM boards b JOIN games g ON g.id=b.game_id WHERE b.game_id=? AND b.id=?',
    )
    .bind(gameId, boardId)
    .first<BoardRow & { game_enabled: number }>();
  if (!row) fail(404, 'BOARD_NOT_FOUND', '没有找到这个排行榜。');
  if (requireEnabled && (!row.enabled || !row.game_enabled))
    fail(403, 'BOARD_CLOSED', '这个排行榜暂未开放。');
  return asBoard(row);
}
export async function getGames(
  db: Database,
  onlyEnabled = false,
): Promise<Game[]> {
  const [gameResults, boardResults] = await db.batch([
    db.prepare('SELECT id,name,enabled FROM games ORDER BY rowid'),
    db.prepare('SELECT * FROM boards ORDER BY rowid'),
  ]);
  const boards = (boardResults.results as unknown as BoardRow[]).map(asBoard);
  return (
    gameResults.results as unknown as {
      id: string;
      name: string;
      enabled: number;
    }[]
  )
    .filter((game) => !onlyEnabled || game.enabled)
    .map((game) => ({
      ...game,
      enabled: !!game.enabled,
      boards: boards.filter(
        (board) => board.gameId === game.id && (!onlyEnabled || board.enabled),
      ),
    }));
}
export async function protectedPlayer(
  db: Database,
  key: string,
): Promise<PlayerRow | null> {
  return db
    .prepare(
      'SELECT * FROM players WHERE nickname_key=? AND email_hash IS NOT NULL',
    )
    .bind(key)
    .first<PlayerRow>();
}
export async function resolvePlayer(
  db: Database,
  input: {
    guestId: string;
    nickname: string;
    nicknameKey: string;
    emailHash: string;
    website: string;
  },
): Promise<PlayerRow> {
  const { guestId, nickname, nicknameKey, emailHash, website } = input;
  const match = async (player: PlayerRow): Promise<PlayerRow> => {
    if (!emailHash || player.email_hash !== emailHash)
      fail(
        409,
        'NICKNAME_PROTECTED',
        '这个昵称已绑定邮箱，请填写相同邮箱，或换一个昵称。',
      );
    await db
      .prepare('UPDATE players SET nickname=?,website=? WHERE id=?')
      .bind(nickname, website, player.id)
      .run();
    return { ...player, nickname, website };
  };
  const existing = await protectedPlayer(db, nicknameKey);
  if (existing) return match(existing);
  try {
    if (emailHash) {
      // Upgrading is restricted to this browser's own guest record.
      const own = await db
        .prepare(
          'SELECT * FROM players WHERE guest_id=? AND nickname_key=? AND email_hash IS NULL',
        )
        .bind(guestId, nicknameKey)
        .first<PlayerRow>();
      if (own) {
        await db
          .prepare(
            'UPDATE players SET email_hash=?,nickname=?,website=? WHERE id=? AND email_hash IS NULL',
          )
          .bind(emailHash, nickname, website, own.id)
          .run();
      } else {
        await db
          .prepare(
            'INSERT INTO players(id,nickname,nickname_key,email_hash,guest_id,website,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            nickname,
            nicknameKey,
            emailHash,
            guestId,
            website,
            Date.now(),
          )
          .run();
      }
      const claimed = await protectedPlayer(db, nicknameKey);
      if (claimed) return match(claimed);
    } else {
      // This conditional statement also closes the "nickname was protected while submitting" race.
      const row = await db
        .prepare(
          `INSERT INTO players(id,nickname,nickname_key,email_hash,guest_id,website,created_at)
        SELECT ?,?,?,NULL,?,?,? WHERE NOT EXISTS(SELECT 1 FROM players WHERE nickname_key=? AND email_hash IS NOT NULL)
        ON CONFLICT(guest_id,nickname_key) WHERE guest_id IS NOT NULL
        DO UPDATE SET nickname=excluded.nickname,website=excluded.website WHERE players.email_hash IS NULL RETURNING *`,
        )
        .bind(
          crypto.randomUUID(),
          nickname,
          nicknameKey,
          guestId,
          website,
          Date.now(),
          nicknameKey,
        )
        .first<PlayerRow>();
      if (row) return row;
    }
  } catch (error) {
    // A unique index arbitrates simultaneous first registrations.
    const winner = await protectedPlayer(db, nicknameKey);
    if (winner) return match(winner);
    throw error;
  }
  fail(
    409,
    'NICKNAME_PROTECTED',
    '这个昵称刚刚绑定了邮箱，请填写相同邮箱，或换一个昵称。',
  );
}
export async function listEntries(
  db: Database,
  board: Board,
  limit: number,
  offset: number,
) {
  const order = board.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const comparison = board.sortOrder === 'asc' ? '<' : '>';
  // Only the first 50 ordered rows are public, including when a tie crosses the boundary.
  // Keep the requested page size in the response; the final page can contain fewer rows.
  const publicEntryLimit = 50;
  const visiblePageSize = Math.min(
    limit,
    Math.max(0, publicEntryLimit - offset),
  );
  const [rows, count] = await db.batch([
    db
      .prepare(
        `SELECT e.*,p.nickname,p.website,
      1+(SELECT COUNT(*) FROM entries better WHERE better.game_id=e.game_id AND better.board_id=e.board_id AND better.score ${comparison} e.score) AS rank
      FROM entries e JOIN players p ON p.id=e.player_id WHERE e.game_id=? AND e.board_id=?
      ORDER BY e.score ${order},e.updated_at ASC,e.id ASC LIMIT ? OFFSET ?`,
      )
      .bind(board.gameId, board.id, visiblePageSize, offset),
    db
      .prepare(
        'SELECT COUNT(*) AS total FROM (SELECT 1 FROM entries WHERE game_id=? AND board_id=? LIMIT ?)',
      )
      .bind(board.gameId, board.id, publicEntryLimit),
  ]);
  return {
    board,
    entries: (rows.results as unknown as EntryRow[]).map(asEntry),
    total: Number(count.results[0].total),
    limit,
    offset,
  };
}

type SubmissionRow = {
  id: string;
  request_hash: string;
  token: string;
  response_json: string | null;
  improved: number;
};
export async function existingSubmission(
  db: Database,
  submissionId: string,
): Promise<SubmissionRow | null> {
  return db
    .prepare(
      'SELECT id,request_hash,token,response_json,improved FROM submissions WHERE id=?',
    )
    .bind(submissionId)
    .first<SubmissionRow>();
}
export function submissionResponse(
  row: SubmissionRow,
  requestHash: string,
  duplicate: boolean,
) {
  if (row.request_hash !== requestHash)
    fail(
      409,
      'SUBMISSION_CONFLICT',
      '这局成绩已经提交过，不能用同一标识提交不同内容。',
    );
  return {
    entry: row.response_json ? (JSON.parse(row.response_json) as Entry) : null,
    improved: duplicate ? false : !!row.improved,
    duplicate,
  };
}
export async function saveScore(
  db: Database,
  board: Board,
  player: PlayerRow,
  input: {
    submissionId: string;
    requestHash: string;
    score: number;
    metadata: Record<string, unknown>;
    emailHash: string;
  },
) {
  const token = crypto.randomUUID();
  const now = Date.now();
  const comparison = board.sortOrder === 'asc' ? '<' : '>';
  // All four statements run as one D1 transaction. The claim token makes retries and concurrent
  // duplicate requests no-ops. The UPSERT predicate keeps only the best score under concurrent play.
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO submissions(id,request_hash,game_id,board_id,player_id,token,created_at)
      SELECT ?,?,?,?,?,?,? WHERE
      NOT EXISTS(SELECT 1 FROM players WHERE nickname_key=? AND email_hash IS NOT NULL)
      OR EXISTS(SELECT 1 FROM players WHERE id=? AND email_hash=?)
      ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        input.submissionId,
        input.requestHash,
        board.gameId,
        board.id,
        player.id,
        token,
        now,
        player.nickname_key,
        player.id,
        input.emailHash,
      ),
    db
      .prepare(
        `INSERT INTO entries(id,game_id,board_id,player_id,score,metadata,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND token=?)
      ON CONFLICT(game_id,board_id,player_id) DO UPDATE SET
      score=excluded.score,metadata=excluded.metadata,updated_at=excluded.updated_at
      WHERE excluded.score ${comparison} entries.score`,
      )
      .bind(
        crypto.randomUUID(),
        board.gameId,
        board.id,
        player.id,
        input.score,
        JSON.stringify(input.metadata),
        now,
        now,
        input.submissionId,
        token,
      ),
    db
      .prepare(
        `UPDATE submissions SET improved=changes(),
      entry_id=(SELECT id FROM entries WHERE game_id=? AND board_id=? AND player_id=?),
      response_json=(SELECT json_object(
        'id',e.id,'nickname',p.nickname,'website',p.website,'score',e.score,'metadata',json(e.metadata),
        'createdAt',e.created_at,'updatedAt',e.updated_at,
        'rank',1+(SELECT COUNT(*) FROM entries better WHERE better.game_id=e.game_id AND better.board_id=e.board_id AND better.score ${comparison} e.score))
        FROM entries e JOIN players p ON p.id=e.player_id WHERE e.game_id=? AND e.board_id=? AND e.player_id=?)
      WHERE id=? AND token=?`,
      )
      .bind(
        board.gameId,
        board.id,
        player.id,
        board.gameId,
        board.id,
        player.id,
        input.submissionId,
        token,
      ),
    db
      .prepare(
        'SELECT id,request_hash,token,response_json,improved FROM submissions WHERE id=?',
      )
      .bind(input.submissionId),
  ]);
  const row = results[3].results[0] as unknown as SubmissionRow | undefined;
  if (!row)
    fail(
      409,
      'NICKNAME_PROTECTED',
      '这个昵称已绑定邮箱，请填写相同邮箱，或换一个昵称。',
    );
  return submissionResponse(row, input.requestHash, row.token !== token);
}

export async function adminEntries(
  db: Database,
  filters: {
    gameId: string;
    boardId: string;
    query: string;
    limit: number;
    offset: number;
  },
) {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];
  if (filters.gameId) {
    clauses.push('e.game_id=?');
    bindings.push(filters.gameId);
  }
  if (filters.boardId) {
    clauses.push('e.board_id=?');
    bindings.push(filters.boardId);
  }
  if (filters.query) {
    clauses.push('instr(p.nickname_key,?)>0');
    bindings.push(filters.query);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const [rows, count] = await db.batch([
    db
      .prepare(
        `SELECT e.*,p.nickname,p.website,
      1+(SELECT COUNT(*) FROM entries better WHERE better.game_id=e.game_id AND better.board_id=e.board_id
        AND ((b.sort_order='asc' AND better.score<e.score) OR (b.sort_order='desc' AND better.score>e.score))) AS rank
      FROM entries e JOIN players p ON p.id=e.player_id JOIN boards b ON b.game_id=e.game_id AND b.id=e.board_id
      ${where} ORDER BY e.updated_at DESC,e.id ASC LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, filters.limit, filters.offset),
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM entries e JOIN players p ON p.id=e.player_id ${where}`,
      )
      .bind(...bindings),
  ]);
  return {
    entries: (rows.results as unknown as EntryRow[]).map((row) => ({
      ...asEntry(row),
      gameId: row.game_id,
      boardId: row.board_id,
    })),
    total: Number(count.results[0].total),
    limit: filters.limit,
    offset: filters.offset,
  };
}

export async function deleteEntries(
  db: Database,
  ids: string[],
): Promise<number> {
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.batch([
    db
      .prepare(
        `UPDATE submissions SET response_json=NULL WHERE entry_id IN (${placeholders})`,
      )
      .bind(...ids),
    db
      .prepare(`DELETE FROM entries WHERE id IN (${placeholders})`)
      .bind(...ids),
  ]);
  return result[1].meta.changes ?? 0;
}
