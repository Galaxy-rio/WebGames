import type { Board } from './types.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(400, 'INVALID_INPUT', '请填写正确的数据。');
  return value as Record<string, unknown>;
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    fail(415, 'JSON_REQUIRED', '请使用 JSON 格式提交。');
  }
  if (Number(request.headers.get('content-length')) > 16384)
    fail(413, 'BODY_TOO_LARGE', '提交内容过大。');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'INVALID_JSON', '提交内容不能为空。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      fail(413, 'BODY_TOO_LARGE', '提交内容过大。');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, 'INVALID_JSON', '提交内容不是有效的 JSON。');
  }
  return object(value);
}

export function text(
  value: unknown,
  label: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string')
    fail(400, 'INVALID_INPUT', `${label}格式不正确。`);
  const normalized = value.normalize('NFKC').trim();
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    fail(400, 'INVALID_INPUT', `${label}需为 ${min}–${max} 个字符。`);
  }
  return normalized;
}

export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value)) {
    fail(400, 'INVALID_ID', '标识需为 1–48 位小写字母、数字、连字符或下划线。');
  }
  return value;
}

export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    fail(400, 'INVALID_ID', '本次提交标识无效，请刷新后重试。');
  }
  return value.toLowerCase();
}

export function email(value: unknown): string {
  if (value === undefined || value === '') return '';
  const result = text(value, '邮箱', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    fail(400, 'INVALID_EMAIL', '请填写完整的邮箱地址。');
  return result;
}

export function website(value: unknown): string {
  if (value === undefined || value === '') return '';
  const raw = text(value, '网址', 1, 500);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail(400, 'INVALID_WEBSITE', '网址需以 https:// 或 http:// 开头。');
  }
  if (
    !['https:', 'http:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    fail(
      400,
      'INVALID_WEBSITE',
      '网址需以 https:// 或 http:// 开头，且不包含登录信息。',
    );
  }
  return parsed.href;
}

export function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    fail(400, 'INVALID_INPUT', `${label}需为 ${min}–${max} 范围内的整数。`);
  }
  return value;
}

export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean')
    fail(400, 'INVALID_INPUT', '开放状态需为布尔值。');
  return value;
}

export function pagination(url: URL): { limit: number; offset: number } {
  const limit = url.searchParams.get('limit') ?? '20';
  const offset = url.searchParams.get('offset') ?? '0';
  if (!/^\d+$/.test(limit) || !/^\d+$/.test(offset))
    fail(400, 'INVALID_PAGINATION', '分页参数不正确。');
  return {
    limit: integer(Number(limit), '每页数量', 1, 100),
    offset: integer(Number(offset), '起始位置', 0, 1000000),
  };
}

export function metadata(
  value: unknown,
  fields: string[],
): Record<string, unknown> {
  if (value === undefined) return {};
  const data = object(value);
  const encoded = JSON.stringify(data);
  if (new TextEncoder().encode(encoded).byteLength > 4096)
    fail(400, 'INVALID_METADATA', '附加信息不能超过 4 KB。');
  // Only allow configured, flat primitive fields. Nested objects cannot hide personal information.
  for (const [key, item] of Object.entries(data)) {
    if (
      !fields.includes(key) ||
      ['__proto__', 'constructor', 'prototype'].includes(key) ||
      (!['string', 'number', 'boolean'].includes(typeof item) &&
        item !== null) ||
      (typeof item === 'number' && !Number.isFinite(item)) ||
      (typeof item === 'string' &&
        (item.length > 500 || /[\u0000-\u001f\u007f]/u.test(item)))
    ) {
      fail(400, 'INVALID_METADATA', '附加信息包含不允许的字段或内容。');
    }
  }
  return data;
}

export function boardInput(
  data: Record<string, unknown>,
  gameId: string,
  boardId: string,
): Board {
  if (data.sortOrder !== 'asc' && data.sortOrder !== 'desc')
    fail(400, 'INVALID_INPUT', '排序方向需为 asc 或 desc。');
  if (
    !Array.isArray(data.metadataFields) ||
    data.metadataFields.length > 20 ||
    !data.metadataFields.every(
      (field) =>
        typeof field === 'string' &&
        /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(field) &&
        ![
          'email',
          'password',
          'token',
          'secret',
          'constructor',
          'prototype',
        ].includes(field.toLowerCase()),
    ) ||
    new Set(data.metadataFields).size !== data.metadataFields.length
  ) {
    fail(
      400,
      'INVALID_INPUT',
      '请填写最多 20 个不重复的附加信息字段，不能包含邮箱、密码或密钥字段。',
    );
  }
  const minScore = integer(
    data.minScore,
    '最低值',
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
  return {
    gameId,
    id: boardId,
    name: text(data.name, '榜单名称', 1, 60),
    sortOrder: data.sortOrder,
    scoreScale: integer(data.scoreScale, '缩放系数', 1, 1000000000),
    decimals: integer(data.decimals, '小数位数', 0, 6),
    unit: text(data.unit, '单位', 0, 12),
    minScore,
    maxScore: integer(
      data.maxScore,
      '最高值',
      minScore,
      Number.MAX_SAFE_INTEGER,
    ),
    enabled: boolean(data.enabled),
    metadataFields: data.metadataFields as string[],
  };
}
