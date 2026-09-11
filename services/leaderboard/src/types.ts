export interface QueryResult<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: { changes?: number; [key: string]: unknown };
}
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  run<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
}
export interface Database {
  prepare(query: string): Statement;
  batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<QueryResult<T>[]>;
}
export interface Env {
  DB: Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  ADMIN_PASSWORD?: string;
  IDENTITY_SECRET?: string;
  ALLOWED_ORIGINS?: string;
}
export interface Board {
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
export interface Game {
  id: string;
  name: string;
  enabled: boolean;
  boards: Board[];
}
export interface Entry {
  id: string;
  nickname: string;
  website: string;
  score: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  rank: number;
}
export interface PlayerRow {
  id: string;
  nickname: string;
  nickname_key: string;
  email_hash: string | null;
  guest_id: string | null;
  website: string;
  created_at: number;
}
