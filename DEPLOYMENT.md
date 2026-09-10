# 发布到 Cloudflare Pages

当前项目采用 Astro 静态输出。GitHub 保存源码，Cloudflare Pages 安装依赖、构建并提供网站访问，游戏域名为 `games.galaxyrio.top`。

项目不需要 Cloudflare 适配器或单独的 Worker。成绩与设置目前存储在浏览器 localStorage；跨设备排行榜尚未接入，本地开发地址上的记录也不会自动出现在正式域名下。

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

选择 Save and Deploy，等待首次构建完成。先访问平台分配的 `https://项目名.pages.dev/`，检查首页和 `/chroma/`。流程与参数参照 [Cloudflare 的 Astro 部署说明](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)。

仓库的 `.node-version` 固定为 **26.5.1**，与当前本机验证构建的版本一致。Pages 支持读取这个文件；如果已有 `NODE_VERSION` 环境变量，则将它设为同一版本，避免配置冲突。项目使用 npm 和已提交的 package-lock.json，平台负责安装构建依赖。[Pages 构建环境说明](https://developers.cloudflare.com/pages/configuration/build-image/)

## 4. 绑定 games.galaxyrio.top

进入这个 Pages 项目的 **Custom domains → Set up a domain**，输入 `games.galaxyrio.top` 并继续。

如果 `galaxyrio.top` 的 DNS 已在同一个 Cloudflare 账户中管理，按向导确认，它会自动添加对应 CNAME。最终记录应类似：

| 类型  | 名称  | 目标                     |
| ----- | ----- | ------------------------ |
| CNAME | games | 你的实际项目名.pages.dev |

在 Cloudflare DNS 中使用代理记录时保留向导的代理设置；目标填域名，不带 `https://` 或路径。若已经有同名 games 记录，先核对它当前的用途，再按向导处理冲突。

如果 DNS 在其他服务商管理，先完成 Pages 的域名关联，再到该 DNS 服务商添加上面的 CNAME。子域名绑定本身不要求迁移整个主域名的 DNS。

必须先在 Pages 关联域名；只添加 CNAME 可能返回 522。已有的 `www` 主站记录无需更改。[Pages 自定义域名说明](https://developers.cloudflare.com/pages/configuration/custom-domains/)

等自定义域名显示 Active、HTTPS 证书就绪后，访问 [游戏主页](https://games.galaxyrio.top/) 和 [Chroma Dash](https://games.galaxyrio.top/chroma/)，检查图片、开始游戏、提交成绩以及三种模式。

## 5. 以后更新

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

`node_modules/`、`dist/`、`.astro/` 等目录继续留在本地，供开发使用；不要提交它们。源码、运行所需素材、配置、测试和 package-lock.json 应保留在仓库中。
