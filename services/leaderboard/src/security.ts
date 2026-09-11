import type { Env } from './types.ts';
import { fail } from './validation.ts';

const encoder = new TextEncoder();
const COOKIE = 'galaxyrio_admin';
const SESSION_SECONDS = 8 * 60 * 60;

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(message)),
  );
  return [...signature]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function identitySecret(env: Env): string {
  if (!env.IDENTITY_SECRET || env.IDENTITY_SECRET.length < 32)
    fail(503, 'SERVICE_NOT_CONFIGURED', '排行榜尚未配置完成，请稍后再试。');
  return env.IDENTITY_SECRET;
}

export function adminSecret(env: Env): string {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12)
    fail(503, 'ADMIN_NOT_CONFIGURED', '请先配置至少 12 位的管理员密码。');
  return env.ADMIN_PASSWORD;
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++)
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function validPassword(
  env: Env,
  password: string,
): Promise<boolean> {
  const secret = identitySecret(env);
  return equal(
    await hmac(secret, 'admin-password:' + password),
    await hmac(secret, 'admin-password:' + adminSecret(env)),
  );
}

function cookieOptions(request: Request, maxAge: number): string {
  return `Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export async function sessionCookie(
  request: Request,
  env: Env,
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${crypto.randomUUID()}`;
  const signature = await hmac(
    identitySecret(env),
    `admin-session:${adminSecret(env)}:${payload}`,
  );
  return `${COOKIE}=${payload}.${signature}; ${cookieOptions(request, SESSION_SECONDS)}`;
}

export function logoutCookie(request: Request): string {
  return `${COOKIE}=; ${cookieOptions(request, 0)}`;
}

export async function authenticated(
  request: Request,
  env: Env,
): Promise<boolean> {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  if (!value || !env.ADMIN_PASSWORD || !env.IDENTITY_SECRET) return false;
  const match = /^(\d{10})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(value);
  if (
    !match ||
    Number(match[1]) <= Date.now() / 1000 ||
    Number(match[1]) > Date.now() / 1000 + SESSION_SECONDS + 60
  )
    return false;
  const expected = await hmac(
    identitySecret(env),
    `admin-session:${adminSecret(env)}:${match[1]}.${match[2]}`,
  );
  return equal(expected, match[3]);
}

export function sameOrigin(request: Request): void {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    fail(403, 'ORIGIN_DENIED', '管理操作只能从本站管理页面发起。');
  }
}

export function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (origin === new URL(request.url).origin || allowed.includes(origin))
    return origin;
  fail(403, 'ORIGIN_DENIED', '当前网站尚未被允许访问排行榜。');
}
