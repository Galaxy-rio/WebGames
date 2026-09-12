# 发布到 Cloudflare Pages

当前项目采用 Astro 静态输出。GitHub 保存源码，Cloudflare Pages 安装依赖、构建并提供网站访问，游戏域名为 `games.galaxyrio.top`，排行榜接口为 `leaderboard.galaxyrio.top`。当前 Pages 项目名为 `web-games`。

游戏前端仍是纯静态输出，不需要 Cloudflare 适配器。现在已集成独立的 **Cloudflare Worker + D1 排行榜**：完成一局后可提交在线成绩，管理页面可以删除记录、配置游戏与榜单。设置与最近游玩记录仍保存在浏览器 localStorage，本地记录不会自动转为线上成绩。

本文件介绍静态游戏网站的发布。排行榜后端需要另外部署一次，完整步骤见 [排行榜服务部署指南](services/leaderboard/README.md#发布到-cloudflare-workers-与-d1)。两者可以放在同一个 GitHub 仓库，分别发布。

## 1. 在 GitHub 创建空仓库

打开 [GitHub 新建仓库](https://github.com/new)，填写仓库名，例如 `galaxyrio-play`。根据是否愿意公开源代码选择 Public 或 Private，并将 README、.gitignore 和 License 的自动初始化选项留空，因为本地已经有项目内容。

创建完成后，复制 Quick setup 中的 HTTPS 仓库地址。该步骤参照 [GitHub 导入本地仓库说明](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。

## 2. 推送本地仓库

本地仓库已初始化，分支为 `main`，首次提交已包含源码、素材、测试和部署说明。依赖、构建目录、缓存和私密环境文件由 .gitignore 排除。

在项目文件夹中打开 PowerShell，将下面的示例地址替换为刚刚复制的实际地址：

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git remote -v
git push -u origin main
```

如果 Git 弹出认证窗口，完成 GitHub 登录。推送成功后刷新仓库页面，确认能看到 `package.json`、`src/` 和 `public/`。源码应直接位于仓库根目录，不要再套一层项目文件夹。不需要开启 GitHub Pages。

## 3. 创建 Cloudflare Pages 项目

在 Cloudflare 控制台进入 **Workers & Pages → Create application → Pages → Import an existing Git repository**，连接 GitHub 并选择刚才的仓库。授权时只选择这个仓库即可。

在构建设置中填写：

| 设置                   | 值                                |
| ---------------------- | --------------------------------- |
| Project name           | 自选可用名称，例如 galaxyrio-play |
| Production branch      | main                              |
| Framework preset       | Astro                             |
| Root directory         | 留空，表示仓库根目录              |
| Build command          | npm run build                     |
| Build output directory | dist                              |

选择 Save and Deploy，等待首次构建完成，再按下一节绑定正式域名。平台同时提供一个默认的 `pages.dev` 地址，可用于首次检查；日常直接使用 `games.galaxyrio.top`。流程与参数参照 [Cloudflare 的 Astro 部署说明](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)。

如果创建页面只显示“部署命令 `npx wrangler deploy`”、API 令牌等选项，说明进入了 Worker 的创建流程；返回创建入口选择 Pages，再导入静态游戏仓库。排行榜 Worker 按单独的服务指南部署。

仓库的 `.node-version` 固定为 **26.5.1**，与当前本机验证构建的版本一致。Pages 支持读取这个文件；如果已有 `NODE_VERSION` 环境变量，则将它设为同一版本，避免配置冲突。项目使用 npm 和已提交的 package-lock.json，平台负责安装构建依赖。[Pages 构建环境说明](https://developers.cloudflare.com/pages/configuration/build-image/)

## 4. 绑定 games.galaxyrio.top

进入这个 Pages 项目的 **Custom domains → Set up a domain**，输入 `games.galaxyrio.top` 并继续。

如果 `galaxyrio.top` 的 DNS 已在同一个 Cloudflare 账户中管理，按向导确认，它会自动添加对应 CNAME。最终记录应类似：

| 类型  | 名称  | 目标                     |
| ----- | ----- | ------------------------ |
| CNAME | games | web-games-f3h.pages.dev |

**这是一条 DNS 别名，不是网页跳转，也不是额外创建的反向代理站点。** Pages 在同一个部署上直接响应 `games.galaxyrio.top`，浏览器地址保持正式域名。保留这条 CNAME；以后每次成功的生产部署会自动更新这个正式域名，无需再手动转发。新建其他项目时，CNAME 目标以该项目实际分配的地址为准。

在 Cloudflare DNS 中使用代理记录时保留向导的代理设置；目标填域名，不带 `https://` 或路径。若已经有同名 games 记录，先核对它当前的用途，再按向导处理冲突。

如果 DNS 在其他服务商管理，先完成 Pages 的域名关联，再到该 DNS 服务商添加上面的 CNAME。子域名绑定本身不要求迁移整个主域名的 DNS。

必须先在 Pages 关联域名；只添加 CNAME 可能返回 522。已有的 `www` 主站记录无需更改。[Pages 自定义域名说明](https://developers.cloudflare.com/pages/configuration/custom-domains/)

等自定义域名显示 Active、HTTPS 证书就绪后，访问 [游戏主页](https://games.galaxyrio.top/) 和 [Chroma Dash](https://games.galaxyrio.top/chroma/)，检查图片、开始游戏、提交成绩以及三种模式。

## 5. 接入在线排行榜

首次部署时，按 [排行榜服务 README](services/leaderboard/README.md#发布到-cloudflare-workers-与-d1) 完成 D1 创建、远程迁移、Worker 发布和密钥设置。Worker 的自定义域名使用 `leaderboard.galaxyrio.top`，已记录在 `services/leaderboard/wrangler.jsonc` 的 `routes` 中；不需要将它 CNAME 到 `workers.dev`。已有服务切换域名时沿用原数据库和密钥。

然后进入游戏 Pages 项目的 **Settings → Variables and Secrets**，为 Production 配置：

| 变量                     | 值                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `PUBLIC_LEADERBOARD_API` | `https://leaderboard.galaxyrio.top` |

地址不带 `/api` 或 `/admin`。这是公开接口地址，不是密钥；管理员密码与身份密钥应只设置在 Worker 的 Secret 中。

确认 Worker 的 `ALLOWED_ORIGINS` 包含 `https://games.galaxyrio.top`。若要从 Pages 默认域名访问榜单，也加入对应的 `https://项目名.pages.dev`。

保存 Pages 环境变量后，在 **Deployments → 当前 Production 部署 → Retry deployment（重试部署）** 重新构建；也可以推送一次代码更新。**只修改环境变量不会更新已经生成的静态页面，必须重新构建并部署前端。**生产构建未配置地址时，游戏仍能运行，但不会开放在线成绩提交。前端的构建命令仍为 `npm run build`，输出目录仍为 `dist`。

打开正式游戏，完成一局后填写昵称提交成绩，再到 [排行榜管理页面](https://leaderboard.galaxyrio.top/admin/) 登录，确认能找到并删除测试记录。线上 D1 和本地测试数据库互不混用。

### 已有排行榜服务，新增 Landroid 游戏

如果提交时报“没有找到这个排行榜”，说明前端已收到排行榜服务的响应，应检查云端是否已注册新榜单。可查看 `https://leaderboard.galaxyrio.top/api/v1/games`：需要包含游戏 `landroid-extended` 及其 `exploration` 榜单。

在项目根目录执行以下命令，应用 `0002_landroid_extended.sql` 并发布本次新增的服务端计分校验：

```powershell
npm.cmd --prefix services/leaderboard run db:migrate:remote
npm.cmd --prefix services/leaderboard run deploy
```

然后重新上传前端修改并等待 Pages 构建完成。Pages 的 Git 部署只发布游戏网页，新增云端榜单需要上述 D1 迁移；已经正确配置的 `PUBLIC_LEADERBOARD_API` 无需重复修改。

## 6. 以后更新

修改完成后，在项目文件夹中执行：

```powershell
npm.cmd test
npm.cmd run build
git status
git add .
git diff --cached --stat
git commit -m "Describe this update"
git push
```

每次推送到 main，Pages 会自动构建并更新正式站点；可在项目的 Deployments 中查看结果。新增游戏也沿用此流程。

管理页面新增游戏或榜单只写入 D1，不需要重新部署 Worker。修改排行榜后端代码或管理页面时，需要在 `services/leaderboard` 目录运行 `npm run deploy`；当前的 Pages 自动构建不会代替 Worker 发布。数据库结构更新先执行服务目录中的 `npm run db:migrate:remote`。

`node_modules/`、`dist/`、`.astro/` 等目录继续留在本地，供开发使用；不要提交它们。源码、运行所需素材、配置、测试和 package-lock.json 应保留在仓库中。
