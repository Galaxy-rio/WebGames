# galaxyrio · 游乐场

独立的 Astro 静态网页游戏项目。主页面采用主机游戏库布局，目前包括 **Chroma Dash** 和 **Landroid extended**。项目另含独立的 Cloudflare Workers + D1 排行榜服务和管理页面，各游戏共用 API、自行控制排行榜界面。

## 本地运行

需要 Node.js 22.12 或更新版本；发布构建通过 .node-version 固定为本机已验证的 26.5.1。

```powershell
npm.cmd install
npm.cmd run dev
```

本地地址：`http://127.0.0.1:4322/`

- 游戏库：`/`
- Chroma Dash：`/chroma/`
- Landroid extended：`/landroid-extended/`
- 指定玩法：`/chroma/?mode=accuracy`、`speed`、`blind`

Astro 7 开发服务在后台运行，可以用 `npx.cmd astro dev status` 查看，`npx.cmd astro dev stop` 停止。

## 检查与构建

```powershell
npm.cmd test
npm.cmd run build
```

静态产物输出到 `dist/`。游戏玩法和本机记录可以独立运行；在线排行榜由 `services/leaderboard/` 中的 Worker + D1 提供，排行榜服务不可用时仍可继续游戏。

## 在线排行榜

已接入 Chroma Dash 的准度挑战、速度挑战、盲猜模式，以及 Landroid extended 的星系探索榜单。完成一局后可填写昵称提交，邮箱和网址选填；填写邮箱后，使用这个昵称需要匹配同一邮箱。每位玩家在每张榜单保留最佳成绩。

首次本地准备，在项目根目录执行：

```powershell
npm.cmd --prefix services/leaderboard ci
npm.cmd run leaderboard:setup
npm.cmd run leaderboard:dev
```

另外打开一个终端运行 `npm.cmd run dev`。游戏开发页面会自动连接 `http://127.0.0.1:8787`；管理入口是 `http://127.0.0.1:8787/admin/`，本地密码由初始化脚本生成并保存在不受 Git 追踪的 `services/leaderboard/.dev.vars`。

管理员可筛选、单删或批量删除成绩，添加游戏和榜单，解除昵称邮箱绑定。新增游戏和榜单通过管理页面完成，不必重新部署 Worker。

线上需要单独部署排行榜 Worker，并在 Pages 设置 `PUBLIC_LEADERBOARD_API` 后重新构建。完整功能说明、本地运行、Cloudflare Workers + D1 逐步部署和 API 接入方式见 [排行榜服务 README](services/leaderboard/README.md)。

## 玩法

**Landroid extended** 移植 Android 17 Landroid 太空彩蛋，保留 Android 14–17 的探索飞行玩法与原版矢量画风。使用鼠标或单指拖动推进，松手惯性滑行，船头朝外着陆；支持屏幕边缘星球指引和本地存档，保留原版镜头。每个新星系从 5000 分开始，首次探索和着陆质量加分，燃料、飞行时间和船头撞击扣分。探索完全部星球后结算，可上传排行榜或前往随机新星系。开启 AUTO 需确认，并停止本局计分。完整规则、实现依据和扩展入口见 [太空游戏说明](src/games/landroid-extended/README.md)。

下文为 Chroma Dash 的规则。

每局 10 关。准度挑战每关 30 秒，到时自动提交当前有效颜色；查看答案时暂停，点击下一关重新计时。最终成绩为十关平均准确率，保留一位小数，越高越好。

盲猜模式沿用准度挑战的计时和评分规则。调色过程中隐藏你的颜色，提交或倒计时结束后揭晓；下一关重新遮住颜色。

速度挑战每关不限时，共 10 关。准确率大于等于 85% 后展示本关正确的 RGB 数值与滑块位置，查看答案期间暂停计时，点击下一关继续；低于 85% 加罚 1 秒，保留当前目标与调色继续尝试，不展示答案。第十关通过后保留本关答案并冻结计时，可点击查看成绩。总用时 = 实际调色时间（不含查看答案时间）+ 累计罚时，越低越好。

准确率使用 CIEDE2000 感知色差映射到 0–100%，仅完全相同的 RGB 获得 100%。提示框或切到其他标签页不会暂停正在进行的挑战；速度结果包含累计罚时，结束后冻结计时。

支持触摸、鼠标、键盘、RGB 数值和 HEX 输入。本机设置与最近 30 局记录保存在 localStorage；存储不可用时游戏仍可运行。新版记录使用独立的 v2 存储键，旧记录保留在本机存储中，不参与新挑战的最佳成绩比较；首页仅展示当前游戏提供的最佳成绩。

## 项目结构

- `src/data/games.ts`：游戏注册表
- `src/games/chroma/info.ts`：Chroma Dash 自己提供的名称、素材、简介、标签、玩法说明和成绩读取
- `src/lib/game-library.ts`：通用游戏信息类型与选择逻辑
- `src/pages/index.astro`：游戏库
- `src/pages/chroma/index.astro`：Chroma Dash 游戏界面
- `src/lib/color.ts`：色彩转换与评分
- `src/lib/session.ts`：回合、计时与状态管理
- `src/lib/storage.ts`：浏览器本地记录与设置
- `src/lib/leaderboard.ts`：不含 UI 的通用排行榜客户端
- `src/scripts/chroma-leaderboard.ts`：Chroma Dash 排行榜与成绩提交交互
- `services/leaderboard/`：独立 Worker、D1 迁移、管理页面与服务测试
- `src/scripts/`：页面交互
- `src/styles/`：共享、游戏库、游戏样式
- `public/images/`：原创游戏封面与背景
- `tests/game.test.ts`：色彩、游戏规则、存储测试

首页是通用游戏库框架。新增游戏时：

1. 建立游戏页面，并在 `src/games/<游戏 ID>/info.ts` 导出一份 `GameDefinition`。
2. 提供唯一 `id`、名称 `name`、入口 `href`、封面 `cover`、透明 Logo `logo`、背景 `background`、描述 `description`、标签 `tags` 和玩法说明 `instructions`；可选设置 `backgroundPosition`、底色 `backgroundColor`、默认浅色 / 深色配色 `theme`，以及独立的 `ui` 颜色配置。
3. 在 `src/data/games.ts` 导入并注册。首页的游戏卡片、背景、Logo、文字、开始入口、说明和收藏数量会自动使用游戏信息。

可选的 `stats` 提供标题和浏览器端成绩读取函数；未提供则隐藏成绩面板。框架不包含任何 Chroma Dash 专用成绩字段。方向键选择游戏，Enter 启动当前游戏；横向列表支持更多游戏，`/?game=<id>` 可直接选中指定游戏。

### 每个游戏的 UI 配色

公共界面统一使用主机风格的圆角、细边框、柔和阴影与半透明背景模糊。游戏只提供颜色，不覆盖布局、圆角、边框厚度或模糊强度。

在游戏自己的 `info.ts` 中配置：

```ts
theme: 'light',
backgroundColor: '#f5ead5',
ui: {
  text: '#494b43',
  muted: '#686b62',
  accent: '#61796e',
  button: '#ddb29a73',
  buttonText: '#303a36',
  panel: '#fffaf073',
  selection: '#708279',
  overlay: '#f5ead508',
  mobileOverlay: '#f5ead5e6',
  dialog: '#faf7efdb',
},
```

颜色支持带透明度的八位 HEX。可配置项：

| 字段                        | 作用                              |
| --------------------------- | --------------------------------- |
| `text` / `muted`            | 主要文字 / 次要文字               |
| `accent` / `selection`      | 图标和焦点强调色 / 当前游戏选中框 |
| `button` / `buttonText`     | 开始游戏按钮底色 / 文字色         |
| `panel` / `border`          | 半透明面板底色 / 通用细边框色     |
| `overlay` / `mobileOverlay` | 背景遮罩 / 窄屏文字区域遮罩       |
| `dialog` / `backdrop`       | 弹窗底色 / 弹窗外遮罩             |
| `shadow`                    | 公共柔和阴影的颜色                |

所有项目均可省略，按 `theme` 回退到默认配色。服务端首次渲染和浏览器切换游戏使用同一个解析器 `src/lib/library-theme.ts`，每次完整更新配色，避免上一款游戏的颜色残留。

游戏切换时，图标尺寸与圆角连续过渡，图标下的标题随当前图标保持居中；新背景连同自身遮罩从选中图标背后以柔边圆形展开。Logo、简介、标签与成绩淡入淡出，其余控件颜色平滑过渡。快速连续切换会保留前一帧已显示的背景，最新选择展开完成后清理旧图层。遵循站内“减少动态效果”设置，尚未读取站内设置时回退到系统偏好。

## 部署

Cloudflare Pages：构建命令 `npm run build`，输出目录 `dist`。创建 GitHub 仓库、推送、连接 Pages、绑定 `games.galaxyrio.top` 和后续更新的完整步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。依赖、构建产物、缓存和私密环境文件由 .gitignore 排除；源代码、素材及 package-lock.json 保留追踪。

排行榜 API 和管理页面发布到一个独立 Worker，使用一个 D1 数据库；具体命令和配置见 [排行榜部署说明](services/leaderboard/README.md#发布到-cloudflare-workers-与-d1)。Pages 只构建静态游戏网站，不会自动发布此 Worker。

## 素材

Chroma Dash 的游戏库背景是原创奶油色手绘调色场景，封面裁切自同一插画，Logo 复用透明彩色字标。背景与封面均使用压缩后的 WebP；选中此游戏时，首页使用该游戏提供的浅色 UI 配色，公共控件样式保持统一。游戏本体使用 CSS/SVG，音效使用 Web Audio 合成。素材与生成提示词见 `ASSETS.md`。
