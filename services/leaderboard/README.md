# galaxyrio 排行榜服务

这是项目独立开发的通用排行榜，使用一个 Cloudflare Worker 和一个 D1 数据库。各游戏自行绘制排行榜界面，后台只提供 JSON API；管理页面与 API 一同部署到 Worker。服务没有 Twikoo 依赖，仅借鉴昵称、可选邮箱与管理面板的使用方式。

已有 Chroma Dash 的准度、速度、盲猜三个榜单。服务不设赛季，也不包含反作弊或逐局服务器验分系统。

## 功能与规则

- **游戏 → 榜单 → 成绩**：游戏用稳定 ID 归类，展示名称可以修改。每个游戏可配置多个榜单，支持数值从高到低或从低到高排序。
- **每人最佳成绩**：同一玩家在同一榜单只展示一条最佳成绩，较差成绩不会覆盖它。相同成绩按 `1、1、3` 并列排名，列表内部按先达到该成绩的时间排列。
- **昵称必填，邮箱和网址选填**：邮箱用于轻量的昵称匹配，不发验证邮件。后台保存带服务密钥的摘要，不保存邮箱原文，公开及管理接口均不返回邮箱或摘要。
- **无邮箱的游客**：浏览器生成并保存 `guestId`。不同浏览器可以使用相同的未保护昵称，各自拥有成绩。清除浏览器存储后会得到新的游客身份。
- **填写邮箱后保护昵称**：同一浏览器的同名游客身份可以绑定邮箱；已有受保护昵称必须填写同一邮箱才能使用。保护在所有游戏间共享，其他同名游客的旧成绩不会并入这个身份。昵称与邮箱匹配会统一大小写和兼容字符格式。
- **可选记住信息**：游戏表单明确勾选后，才将填写的昵称、邮箱和网址保存在当前浏览器。取消勾选会移除已保存的填写信息。
- **辅助信息**：每张榜单配置允许的字段，成绩可附带回合数、罚时等数据。
- **删除与重试**：管理页面可以单删或批量删除。后台保留提交标识，删除后重试同一局不会重新恢复成绩；以后完成新的一局仍可提交。

### 默认榜单

| 游戏 ID  | 榜单 ID    | 展示名称 | 数值方向 | 存储值与显示           | 有效存储范围   |
| -------- | ---------- | -------- | -------- | ---------------------- | -------------- |
| `chroma` | `accuracy` | 准度挑战 | 越大越好 | `954` → `95.4%`        | `0`–`1000`     |
| `chroma` | `speed`    | 速度挑战 | 越小越好 | `12345` 毫秒 → `12.3s` | `0`–`86400000` |
| `chroma` | `blind`    | 盲猜模式 | 越大越好 | `921` → `92.1%`        | `0`–`1000`     |

速度成绩包含罚时。排序比较完整存储整数，所以两条都显示为 `12.3s` 的成绩，实际毫秒数仍可能不同；只有存储数值完全相同才并列。

## 本地运行

以下命令使用 Windows PowerShell。在其他终端中可以将 `npm.cmd`、`npx.cmd` 写成 `npm`、`npx`。

### 1. 安装与初始化

在项目根目录运行：

如果已有排行榜开发服务运行，先在运行 `leaderboard:dev` 的终端按 `Ctrl+C`，等待服务退出，再安装依赖。Windows 下正在运行的 Wrangler 可能占用 `node_modules` 中的文件，导致 `npm ci` 报 `EBUSY`。

```powershell
Set-Location -LiteralPath 'C:\Users\galaxyrio\Curio\web\web game'
npm.cmd ci
npm.cmd --prefix services/leaderboard ci
npm.cmd run leaderboard:setup
```

`leaderboard:setup` 会在 `services/leaderboard/.dev.vars` 生成仅用于本地的随机管理员密码和身份密钥，并对本地 D1 执行迁移，建立表与三个默认榜单。首次生成的密码会显示在终端；以后可以在本地 `.dev.vars` 文件中查看。重复执行会保留已有密码、密钥和数据库数据。

这一步使用 Wrangler 的本地数据库，不创建云端数据库，也不需要先发布 Worker。本地 D1 与云端 D1 分开管理。[D1 本地开发说明](https://developers.cloudflare.com/d1/get-started/)

### 2. 启动两个开发服务

第一个终端：

```powershell
npm.cmd run leaderboard:dev
```

第二个终端，在同一项目根目录：

```powershell
npm.cmd run dev
```

| 页面               | 本地地址                             |
| ------------------ | ------------------------------------ |
| 游戏首页           | `http://127.0.0.1:4322/`             |
| Chroma Dash        | `http://127.0.0.1:4322/chroma/`      |
| 排行榜管理         | `http://127.0.0.1:8787/admin/`       |
| 游戏与榜单配置接口 | `http://127.0.0.1:8787/api/v1/games` |

Astro 开发模式未配置 `PUBLIC_LEADERBOARD_API` 时，会自动连接 `http://127.0.0.1:8787`。如果根目录已有 `.env` 或 `.env.local` 设置了其他接口地址，应先核对它；修改后重启 Astro。静态预览 `npm run preview` 使用构建时写入的接口地址，不使用开发模式回退。

打开游戏，完成一局后展开“把成绩留在排行榜”，填写昵称并提交。进入管理页面，用本地管理员密码登录，即可查看及删除该记录。

### 3. 运行检查

在项目根目录：

```powershell
npm.cmd test
npm.cmd run build
npm.cmd --prefix services/leaderboard run check
npm.cmd run test:leaderboard
```

前端构建产物仍在根目录 `dist/`。Worker 源码由 Wrangler 打包；管理页面是 `public/admin/` 中的静态文件，无需单独运行前端构建。

## 发布到 Cloudflare Workers 与 D1

推荐首次使用下面的 Wrangler 命令完成发布。它会同时上传 API 和管理页面，并按项目配置绑定 D1。现有游戏网站继续托管于 Pages，排行榜作为另一个独立 Worker 运行。

### 1. 进入服务目录并登录 Cloudflare

如果已完成前面的本地初始化，且依赖文件没有变化，直接使用已有依赖登录，无需重复安装。新机器、缺少依赖或依赖文件有变化时，先进入下方服务目录，在排行榜开发服务停止后执行 `npm.cmd ci`，安装成功再执行登录命令。若此前安装中途失败，也必须先完整执行一次成功的 `npm.cmd ci`，再继续部署。

```powershell
Set-Location -LiteralPath 'C:\Users\galaxyrio\Curio\web\web game\services\leaderboard'
npx.cmd wrangler login
```

完成浏览器中的 Cloudflare 登录与授权。如果账户下有多个 Cloudflare 账户，选择游戏网站所属的账户。后续本节命令均在此目录执行。

### 2. 创建云端 D1 数据库

```powershell
npx.cmd wrangler d1 create galaxyrio-leaderboard
```

记录命令返回的 `database_id`，它是一串 UUID。若 Wrangler 询问是否自动添加数据库绑定，可以选择不自动添加，下一步直接修改项目已有的配置。[D1 创建与绑定说明](https://developers.cloudflare.com/d1/get-started/)

打开本目录的 `wrangler.jsonc`，将现有 `d1_databases` 中全零占位 ID 替换为刚才得到的 ID：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "galaxyrio-leaderboard",
    "database_id": "替换为你的数据库 UUID",
    "migrations_dir": "migrations"
  }
]
```

保留绑定名 **`DB`**，保持只有这一份数据库绑定。数据库 ID 本身是配置标识，可以提交到 Git。若数据库已在控制台创建过，直接复制已有 ID，跳过创建命令。

### 3. 配置允许访问的游戏网站

仍在 `wrangler.jsonc` 中，检查 `vars.ALLOWED_ORIGINS`：

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://games.galaxyrio.top,http://127.0.0.1:4322,http://localhost:4322"
}
```

填写实际网站的 **协议 + 域名 + 可选端口**，用英文逗号分隔，不带路径或末尾斜杠。如果还要从 Pages 默认地址测试，追加该站点的完整来源，例如 `https://YOUR_PROJECT.pages.dev`。这里采用精确匹配，不支持 `*.pages.dev` 通配符；每个预览地址需要单独允许。

以后增加同一网站中的游戏路径，例如 `/another-game/`，不需要调整来源列表。增加新的网站域名时，需要修改此配置并重新发布 Worker。

### 4. 初始化云端数据库

```powershell
npm.cmd run db:migrate:remote
```

按提示确认待执行的迁移。首次会创建表和 Chroma Dash 三个榜单；以后只运行尚未应用的迁移。`--remote` 对应云端，之前本地试玩产生的记录不会自动上传。[D1 迁移说明](https://developers.cloudflare.com/d1/reference/migrations/)

### 5. 发布 Worker 与管理页面

```powershell
npm.cmd run deploy
```

成功后终端会显示真实访问地址，形如：

```text
https://galaxyrio-leaderboard.YOUR_SUBDOMAIN.workers.dev
```

复制该地址。项目已经配置 `assets.directory: "./public"`，因此管理页面随 Worker 一起上传，不需要另外创建管理站点或上传 HTML。[Workers 静态资源配置](https://developers.cloudflare.com/workers/static-assets/binding/)

### 6. 设置两个云端密钥

分别运行下面两条命令，在交互提示中输入对应值：

```powershell
npx.cmd wrangler secret put ADMIN_PASSWORD
npx.cmd wrangler secret put IDENTITY_SECRET
```

| 名称              | 用途与填写方式                                          |
| ----------------- | ------------------------------------------------------- |
| `ADMIN_PASSWORD`  | 自己设置至少 12 个字符的管理员密码；用于 `/admin/` 登录 |
| `IDENTITY_SECRET` | 至少 32 个字符的随机字符串；用于邮箱摘要与管理会话签名  |

可以在另一个本地终端生成随机身份密钥，再将生成结果复制到 `IDENTITY_SECRET` 的输入提示中：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

将这两个值保存到自己的密码管理工具。**身份密钥需要长期保持一致**：正常更新代码不更换它，否则已有邮箱无法匹配原昵称。管理员密码可以通过同一条 `secret put ADMIN_PASSWORD` 命令修改，旧登录会话随之失效。

也可以在控制台进入 **Workers & Pages → 这个 Worker → Settings → Variables and Secrets → Add**，类型选 **Secret**，分别填写上述名称和值，最后选择 **Deploy**。`wrangler secret put` 会直接创建并部署含新密钥的版本。[Workers 密钥配置说明](https://developers.cloudflare.com/workers/configuration/secrets/)

两个密钥都不应放进 `wrangler.jsonc`、GitHub 源码或 Pages 的 `PUBLIC_` 环境变量。项目中的 `.dev.vars` 只供本地运行，不会因发布 Worker 自动成为线上密钥。

### 7. 打开管理页面并确认服务

访问实际 Worker 地址加 `/admin/`，例如：

```text
https://galaxyrio-leaderboard.YOUR_SUBDOMAIN.workers.dev/admin/
```

使用刚设置的云端管理员密码登录。切换到“游戏与榜单”，应能看到 Chroma Dash 和三个默认榜单。首次线上成绩列表为空是正常现象。

控制台的 **Workers & Pages → 这个 Worker → Bindings** 中应有名为 `DB` 的 D1 绑定。如果登录提示尚未配置，检查两个 Secret 是否都已部署，而不只是填进了本地文件。

### 8. 将 Pages 游戏前端连接到 Worker

进入现有游戏 Pages 项目的 **Settings → Variables and Secrets**，为 Production 添加：

| 环境变量                 | 值                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `PUBLIC_LEADERBOARD_API` | 第 5 步返回的 Worker 基础地址，例如 `https://galaxyrio-leaderboard.YOUR_SUBDOMAIN.workers.dev` |

地址不带 `/api` 或 `/admin`。这个变量是公开的接口地址，不是密码。若要在 Preview 构建中使用，同样设置 Preview 环境，并同步允许相应网站来源。

保存后，在 Pages 的 Deployments 中重新执行生产构建，或推送一次前端代码更新。**必须重新构建**，因为 Astro 会在静态构建时读取 `PUBLIC_LEADERBOARD_API`。Pages 的构建命令仍是 `npm run build`，输出仍是 `dist`。[Pages 构建与环境变量说明](https://developers.cloudflare.com/pages/configuration/build-configuration/)

打开正式游戏网站，完成一局并提交；用另一个浏览器打开同一榜单，确认能看到成绩。然后在管理页面删除测试成绩，刷新游戏排行榜确认移除。完成后服务即可使用，无需给排行榜另配域名。

## 日常管理与更新

### 使用管理页面

- **成绩记录**：按游戏、榜单与昵称筛选；每页 20 条；支持单条和勾选批量删除，删除前有确认。
- **游戏与榜单**：新增游戏、修改展示名称和开放状态；为游戏新增榜单并设置升降序、单位、缩放、小数位、数值上下限与辅助字段。
- **昵称管理**：搜索玩家，查看是否绑定邮箱，按需解除绑定。解绑保留成绩，但原身份不再受邮箱保护；以后同名新玩家不会自动继承旧成绩。

管理会话约 8 小时有效，以 HttpOnly Cookie 保存。退出后清除管理界面与会话。无需在网页源码或浏览器 localStorage 保存管理员密码。

已产生提交历史的榜单只允许修改名称和开放状态。排序、缩放、单位、上下限等计分配置保持固定，避免把不同规则的成绩混排；即使已删除展示记录，此限制仍有效。需要更换计分规则时，在同一游戏下创建新的榜单 ID。

### 新增游戏，不重新部署 Worker

1. 在管理页面添加游戏，填写稳定 `id` 和展示名称。
2. 为它添加一个或多个榜单。
3. 新游戏页面使用下面的公共客户端，按自己的风格绘制列表与提交表单。
4. 发布游戏前端代码。

游戏和榜单配置存放在 D1，不写死在 Worker 路由中，因此以上操作不需要修改或重新部署后端。只有改变后端功能、增加允许访问的网站来源、更新管理页面或数据库结构时，才需要发布服务更新。

### 更新后端代码

在 `services/leaderboard` 目录执行。只有 `package.json` / `package-lock.json` 发生变化或依赖缺失时，才需先重新安装：在运行排行榜开发服务的终端按 `Ctrl+C`，等待退出，再运行 `npm.cmd ci`。如果安装中途失败，先解决文件占用并重新运行，确认安装完整成功后再继续下面的命令。

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run db:migrate:remote
npm.cmd run deploy
```

保留数据库 ID 与两个云端 Secret。提交更新的源码和迁移文件，不提交 `node_modules/`、`.wrangler/`、`.dev.vars`、日志或任何实际密码。

当前推荐的是本地 Wrangler 发布流程；仅向 GitHub 推送，不会自动发布这个 Worker，除非以后另外配置 Workers Git 构建。Pages 前端仍可沿用现有的 Git 自动部署。

## 公共 API 与游戏接入

接口基础地址就是 Worker 地址。公共请求不使用管理 Cookie；浏览器跨域请求的来源需要在 `ALLOWED_ORIGINS` 中。

### 公共接口

| 方法与路径                                                            | 作用                                       |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `GET /api/v1/games`                                                   | 返回开放的游戏与榜单配置：`{ games }`      |
| `GET /api/v1/games/:gameId/boards/:boardId/entries?limit=20&offset=0` | 返回榜单、成绩列表、总数和分页信息         |
| `POST /api/v1/games/:gameId/boards/:boardId/entries`                  | 提交一局成绩；只在更优时更新玩家的榜单成绩 |

`limit` 为 `1`–`100`，`offset` 为非负整数。关闭的游戏或榜单不再提供公开读取和提交。

提交使用 `Content-Type: application/json`：

```json
{
  "submissionId": "2d0cd759-317b-4c74-bc28-d66d283e13ba",
  "guestId": "89c89144-cf42-4f92-859f-7840cebb9a02",
  "nickname": "小画家",
  "email": "",
  "website": "",
  "score": 954,
  "metadata": {
    "rounds": 10,
    "penaltyMs": 0,
    "bestRoundAccuracy": 99,
    "elapsedMs": 85000
  }
}
```

- `submissionId`：每局生成一次 UUID，重试同一局沿用同一个值；不要每次点击提交都生成新值。
- `guestId`：浏览器身份 UUID，在同一浏览器和各游戏间复用。示例中的 UUID 仅演示结构，游戏应使用 `crypto.randomUUID()` 生成。
- `nickname`：1–32 个字符；邮箱和网址可省略或传空字符串。网址仅接受完整的 HTTP/HTTPS 地址。
- `score`：JavaScript 安全整数，必须位于榜单配置的范围内。前端显示值为 `score / scoreScale`，按 `decimals` 保留小数，再加上 `unit`。
- `metadata`：对象，只能含该榜单允许的字段。值支持字符串、有限数值、布尔值或 `null`，不支持数组或嵌套对象；整体最多 4 KB，每个字符串最多 500 字符。

成功响应：

```json
{
  "entry": {
    "id": "成绩记录 UUID",
    "nickname": "小画家",
    "website": "",
    "score": 954,
    "metadata": { "rounds": 10 },
    "createdAt": 1789123200000,
    "updatedAt": 1789123200000,
    "rank": 1
  },
  "improved": true,
  "duplicate": false
}
```

`improved` 表示是否建立或更新最佳成绩。相同提交重试返回 `duplicate: true`；记录被管理员删除后，重试返回 `entry: null`。较差成绩提交成功时，`entry` 仍是保留的最佳成绩，而非本次较差成绩。

列表响应结构：

```ts
{
  board: {
    gameId, id, name,
    sortOrder, scoreScale, decimals, unit,
    minScore, maxScore, enabled, metadataFields
  },
  entries: [/* 与上面 entry 相同的结构 */],
  total: 42,
  limit: 20,
  offset: 0
}
```

`createdAt` 与 `updatedAt` 为 Unix 毫秒时间戳，`rank` 从 1 开始。

### 使用项目公共客户端

前端已提供无 UI 依赖的 [`src/lib/leaderboard.ts`](../../src/lib/leaderboard.ts)，包含 `LeaderboardClient`、类型、成绩格式化与网址检查工具。游戏可自行绘制卡通、像素或其他风格的页面。

```ts
import {
  LeaderboardClient,
  formatLeaderboardScore,
} from '../../lib/leaderboard';

const client = new LeaderboardClient(apiBaseUrl);
const page = await client.list('your-game', 'best-score', 0, 20);

for (const entry of page.entries) {
  const displayScore = formatLeaderboardScore(entry.score, page.board);
  // 将 entry.nickname、entry.rank、displayScore 写入游戏自己的 UI。
}

const result = await client.submit('your-game', 'best-score', {
  submissionId: currentRunId,
  guestId: browserGuestId,
  nickname: enteredNickname,
  email: enteredEmail,
  website: enteredWebsite,
  score: integerScore,
  metadata: { rounds: completedRounds },
});
```

示例中的变量由游戏提供；`rounds` 需要事先写进榜单的辅助字段配置。网络超时后保留同一局的提交 ID 和原始数据重试。对显示的昵称等玩家内容使用 `textContent`，网址通过 `safeWebsite()` 检查。

### 管理接口

管理接口用于本站管理页面；修改请求要求同源 `Origin`，登录成功后用 HttpOnly Cookie 认证。前端采用 `credentials: 'same-origin'`，不需要手动保存令牌。

| 方法与路径                                                     | 请求 / 返回                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POST /api/admin/login`                                        | `{ password }` → `{ ok: true }`，设置会话 Cookie                                           |
| `GET /api/admin/session`                                       | `{ authenticated: boolean }`                                                               |
| `POST /api/admin/logout`                                       | 清除 Cookie，返回 `{ ok: true }`                                                           |
| `GET /api/admin/games`                                         | `{ games }`，包含关闭的游戏和榜单                                                          |
| `PUT /api/admin/games/:id`                                     | `{ name, enabled }` → `{ game }`                                                           |
| `PUT /api/admin/games/:gameId/boards/:id`                      | 完整榜单配置 → `{ board }`                                                                 |
| `GET /api/admin/entries?gameId=&boardId=&q=&limit=20&offset=0` | `{ entries, total, limit, offset }`；成绩额外包含 `gameId`、`boardId`                      |
| `POST /api/admin/entries/delete`                               | `{ ids: [记录ID] }` → `{ deleted }`，一次最多 100 条                                       |
| `GET /api/admin/players?q=&limit=20&offset=0`                  | `{ players, total, limit, offset }`；玩家字段为 `id`、`nickname`、`protected`、`createdAt` |
| `POST /api/admin/players/:id/unlock`                           | 解除邮箱绑定，返回 `{ ok: true }`                                                          |

游戏 ID 与榜单 ID 为 1–48 位小写字母、数字、短横线或下划线，以字母或数字开头。游戏展示名最多 80 字，榜单展示名最多 60 字。

完整榜单配置示例：

```json
{
  "name": "最高分",
  "sortOrder": "desc",
  "scoreScale": 1,
  "decimals": 0,
  "unit": "分",
  "minScore": 0,
  "maxScore": 1000000,
  "enabled": true,
  "metadataFields": ["rounds"]
}
```

`sortOrder` 为 `asc` 或 `desc`；缩放系数为 `1`–`1000000000` 的整数，小数位为 `0`–`6`，单位最多 12 字，数值上下限均必填。辅助字段最多 20 个，以英文字母开头，可含数字与下划线，每个不超过 40 位；邮箱、密码、密钥等保留字段不能加入辅助信息。

### 错误格式

```json
{
  "error": {
    "code": "NICKNAME_PROTECTED",
    "message": "这个昵称已绑定邮箱，请填写相同邮箱，或换一个昵称。"
  }
}
```

常见错误包括 `NICKNAME_PROTECTED`（昵称需匹配邮箱）、`SUBMISSION_CONFLICT`（同一提交 ID 携带不同内容）、`BOARD_RULES_LOCKED`（已有历史不能改计分规则）、`BOARD_CLOSED`（榜单关闭）、`ORIGIN_DENIED`（网站来源未允许）以及 `UNAUTHORIZED`（管理登录失效）。接口不会把 D1 内部错误或邮箱原文返回前端。

## 常见问题

| 现象                                    | 检查位置                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 正式游戏提示排行榜还未开放              | Pages 是否配置 `PUBLIC_LEADERBOARD_API`，配置后是否重新构建                                                                      |
| 本地游戏能玩，但排行榜连接失败          | `npm run leaderboard:dev` 是否运行；是否完成 `leaderboard:setup`                                                                 |
| `npm ci` 报 `EBUSY`，路径含 `miniflare` | 在排行榜开发终端按 `Ctrl+C`，等服务退出后重新运行 `npm.cmd ci`。失败的安装可能只完成了一部分，必须安装成功后再启动开发服务或部署 |
| Worker 能直接打开，游戏网页却连接失败   | `ALLOWED_ORIGINS` 是否包含游戏网页的精确来源，修改后是否发布                                                                     |
| 管理登录提示尚未配置                    | Worker 上是否存在且已部署 `ADMIN_PASSWORD`、`IDENTITY_SECRET` 两个 Secret                                                        |
| 接口统一返回暂不可用                    | `DB` 绑定是否正确，是否对云端执行 `db:migrate:remote`                                                                            |
| 已在本地建表，线上仍没有榜单            | 本地与远程 D1 独立，需执行远程迁移                                                                                               |
| 忘记管理员密码                          | 用 Cloudflare 控制台或 `wrangler secret put ADMIN_PASSWORD` 设置新值                                                             |
| 玩家忘记绑定邮箱                        | 管理页面搜索昵称并解除绑定；旧成绩保留，新身份不自动继承                                                                         |
| 删除后提交旧请求没有恢复记录            | 这是预期行为；需完成新的一局使用新的提交 ID                                                                                      |
| 改了 Worker 源码但线上没变化            | 运行服务目录的 `npm run deploy`；Pages 前端部署不会代替它                                                                        |

## 文件说明

```text
services/leaderboard/
├─ src/                  Worker 路由、校验、身份、数据库逻辑
├─ migrations/           D1 表结构与默认榜单
├─ public/admin/         独立管理页面
├─ tests/                Worker 逻辑与数据库行为测试
├─ scripts/setup-local.mjs  本地密钥和数据库初始化
├─ wrangler.jsonc        Worker、D1、静态页面与来源配置
├─ .dev.vars.example     本地密钥格式示例，不含实际秘密
└─ package.json          独立依赖与运行命令
```

前端对应文件为 `src/lib/leaderboard.ts`、`src/scripts/chroma-leaderboard.ts`、`src/components/ChromaLeaderboard.astro`、`src/components/ChromaScoreForm.astro` 与 `src/styles/chroma-leaderboard.css`。静态游戏站的发布步骤见 [根目录 DEPLOYMENT.md](../../DEPLOYMENT.md)。
