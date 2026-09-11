import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workerRoot = fileURLToPath(new URL('../', import.meta.url));
const varsPath = path.join(workerRoot, '.dev.vars');
const cliPath = path.join(workerRoot, 'node_modules/wrangler/bin/wrangler.js');
if (!existsSync(cliPath)) {
  console.error('请先运行 npm.cmd install --prefix services/leaderboard');
  process.exit(1);
}
if (!existsSync(varsPath)) {
  const password = 'local-' + randomBytes(6).toString('hex');
  writeFileSync(
    varsPath,
    '# Local development only. This file is ignored by Git.\n' +
      'ADMIN_PASSWORD="' +
      password +
      '"\n' +
      'IDENTITY_SECRET="' +
      randomBytes(32).toString('hex') +
      '"\n',
    { flag: 'wx' },
  );
  console.log('本地管理员密码：' + password);
} else
  console.log(
    '保留现有本地密码和身份密钥。管理员密码可在 services/leaderboard/.dev.vars 查看。',
  );
const result = spawnSync(
  process.execPath,
  [cliPath, 'd1', 'migrations', 'apply', 'DB', '--local'],
  {
    cwd: workerRoot,
    stdio: 'inherit',
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
  },
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  '本地数据库已准备好。运行 npm.cmd run leaderboard:dev 后打开 http://127.0.0.1:8787/admin/',
);
