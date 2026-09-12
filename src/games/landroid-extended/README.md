# Landroid extended

游戏入口：`/landroid-extended/`。已经注册为游乐场的第二款游戏。

这是 Android 14–17 所沿用的 **Landroid** 太空彩蛋的浏览器移植，以 **Android 17 正式版**的画面和内容为基准。在原版自由飞行的基础上增加整局计分、探索结算和排行榜，游戏内不另行显示模式名称。

## 运行与操作

在项目根目录运行 `npm.cmd run dev`，访问 `http://127.0.0.1:4322/landroid-extended/`。也可使用项目原有的 `启动游戏.cmd`。

- 鼠标或单指按住任意空白位置拖动：内圈只转向，50–100 CSS 像素之间线性增加推力。
- 点击 AUTO：确认后开启自动驾驶，并停止本局计分。鼠标或单指拖动可随时接管，但不会恢复计分。
- 点击右上角三点：暂停菜单，可继续飞行、切换全屏或隐藏界面。切换全屏后关闭菜单并恢复飞行。
- 仅保留原版手动固定镜头 / AUTO 动态镜头；没有键盘驾驶、滚轮缩放、双指缩放或额外星图。
- 屏幕边缘的小三角标注屏幕外行星的方向与编号；行星进入画面后隐藏对应指引。引导绘制在独立的顶层 Canvas，覆盖遥测和星球列表，同侧相近方向自动错开。
- 引导按飞船到星球表面的距离分三档：≥20,000 为单层三角，10,000–20,000 为双层三角，<10,000 再增加两侧短线；颜色和编号继续对应原星球。
- 星球列表采用与顶栏名称相同的小字号；超长时可上下滚动，始终隐藏滚动条。
- 着陆时船头朝离开地表的方向（偏差小于 45°），无需额外按着陆按钮。原版没有着陆速度上限。
- 着陆后持续推进一秒起飞。AUTO 停留观光 15 秒后自动出发。

首次启动使用截图星系种子 **20260324**，从原版随机飞船起点开始，已探索数量为零。之后自动恢复当前浏览器的 `landroid-extended:v2` 存档，包含计分与 AUTO 状态。升级前的存档保留在原键中，并以相同种子开始新的计分对局，避免给旧探索记录补算分数。菜单支持指定种子、今日星系和随机星系。`?seed=20260324` 可以开始一段新的指定种子旅程；进入后移除参数，让刷新继续存档。

## 计分与排行榜

每个新星系默认计分，初始 **5000** 分，分数显示在顶栏名称右侧。星球数量保留原版随机的 1–10 颗，编号从 1 开始。

| 事件 | 计分 |
| --- | --- |
| 首次探索一颗星球 | +3000 |
| 首次着陆的相对速度 | `max(0, 1000 − 相对速度) × 3` |
| 首次着陆的朝向 | `cos(船头与地表向外法线的夹角) × 3000` |
| 按编号从 1 到最后一颗完成全部首次探索 | 完成时一次性 +2000 |
| 船头撞击 | 每次独立撞击 −500 |
| 飞行燃料 | 满推力每秒 −100，按实际推力比例计算 |
| 空中飞行时间 | 每秒 −10，从启动开始；停在星球上不扣 |

重复着陆不再获得探索、速度或朝向奖励。速度和夹角取自动着陆对齐前的相对速度与朝向；船头朝向地表（与向外法线夹角大于 90°）的撞击扣分，同一次持续接触不按帧重复扣分。

时间和燃料在每个 120 Hz 物理更新中累计小数，合计扣分时四舍五入；每次着陆奖励取整，显示及上传均为整数，允许负分。切到后台或打开菜单、确认、结算和排行榜窗口时暂停，不计离开期间的时间。飞行计时包含零推力惯性滑行，零推力不产生燃料扣分。

开启 AUTO 前会弹出确认。本局停止计分后，切回手动或刷新页面都不会恢复；完成后的分数已经冻结，再开启 AUTO 观光不影响已结算成绩。前往下一个随机星系会重新开始计分。

探索完所有星球时自动弹出得分、各项加减分和上传表单。昵称必填，邮箱及网址选填，勾选后可记住填写信息；身份与 Chroma Dash 共享。排行榜每人保留最高分，公开前 50 位并分页查看。可关闭结算继续观光，也可在菜单中重新打开本局得分。最近 20 局有效成绩保存在 `landroid-extended:results:v1`，首页展示本机最高分。

复用 `services/leaderboard/` 的 Worker + D1 服务，游戏 ID 为 `landroid-extended`、榜单 ID 为 `exploration`。迁移 `0002_landroid_extended.sql` 注册新榜单；服务端校验完成条件、AUTO 标记、奖励范围与计分算式，不包含服务器飞行回放验真。本地服务运行方式见根目录说明；发布时需执行新增 D1 迁移、更新 Worker，并在前端配置 `PUBLIC_LEADERBOARD_API`。

## 已核对的原版细节

直接读取了 Google AOSP `android17-release` 的源码，而不是根据新闻截图猜测几何图形。2026-09-12 查阅的 `landroid` 目录树为 `b109310281432b902ef52597b51143973e0dbcc9`。

- 原版深色 `#16161D`，遥测 `#B7B7FF`，轨迹 `#34A853`，自动驾驶 `#4285F4`，旗帜 `#C6FF00`。
- 原版 `DroidSansMono.ttf`，白色 U 形飞船、着陆支脚、橙色推力、绿色断续轨迹、荧光黄旗帜。
- Android 17 的已探索天体彩色轮廓、10 种原版矢量地表纹理及依半径选取和旋转纹理的算法。
- 网格、轨道、红色引力场、旋转的恒星锯齿轮廓和系统外边界。
- `STAR / CLASS / RADIUS / MASS / BODIES`、着陆后 `BODY / TYPE / ATMO / FAUNA / FLORA`，以及 `LND / JOB / ALT / THR / POS / VEL`。
- Kotlin `Random(Long)` 的 XorWow 算法、随机袋洗牌、完整命名与活动词库，以及星系创建时的随机调用次序。
- 原版 1–10 个天体、200,000 的宇宙半径、1,000 的主引擎加速度、5,000 的限速、星体和飞船之间的引力、移动行星与着陆后的跟随。

截图数据已作为回归测试：种子生成 `Lollipop.W 4696`，B 类，半径取整 5186，质量显示 `2.19e+11`，共 6 个天体。第二颗为 `compact ploonet / skunky / slender / communal`，第三颗为 `crowded planetoid / toxic / enormous / alien`，与截图一致。

官方原始资源：

- [Universe.kt — 物理、星系和着陆](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/src/com/android/egg/landroid/Universe.kt)
- [VisibleUniverse.kt — 颜色应用、天体和轨道绘制](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/src/com/android/egg/landroid/VisibleUniverse.kt)
- [Assets.kt — 飞船和行星的 SVG 路径](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/src/com/android/egg/landroid/Assets.kt)
- [MainActivity.kt — 遥测、手势和镜头](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/src/com/android/egg/landroid/MainActivity.kt)
- [Autopilot.kt](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/src/com/android/egg/landroid/Autopilot.kt)、[Namer.kt](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/src/com/android/egg/landroid/Namer.kt)、[Randomness.kt](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/src/com/android/egg/landroid/Randomness.kt)
- [landroid_strings.xml — 完整英文词库](https://android.googlesource.com/platform/frameworks/base/+/android17-release/packages/EasterEgg/res/values/landroid_strings.xml)
- [DroidSansMono.ttf](https://android.googlesource.com/platform/frameworks/base/+/android17-release/data/fonts/DroidSansMono.ttf)
- [Kotlin XorWowRandom](https://github.com/JetBrains/kotlin/blob/master/libraries/stdlib/src/kotlin/random/XorWowRandom.kt)

授权及修改声明随静态站点一起输出到 `public/licenses/landroid-extended.txt`。没有复制截图水印。

## 网页适配的差异

这是可继续修改的网页实现，并非 Android APK 的逐帧仿真。保留原版玩法、参数和图形，增加星球边缘指引、中文菜单、本地存档、计分和排行榜。没有模拟 Android 系统设置入口、17 的连星解锁界面、系统通知或屏保注册。

物理使用 120 Hz 固定步长和解析圆周位置，加入扫掠碰撞防止穿过小行星，并修复跨越 ±π 时的着陆朝向判断。AUTO 沿用寻找未探索天体、追赶、接近、着陆、观光、起飞的流程，加入相对速度修正和引力补偿，避免长期绕目标打转。粒子使用独立 RNG，刷新恢复后活动随机序列可能与手机不同。浏览器字体渲染、CSS 像素与设备密度也会导致少量视觉差异。

默认静音，与原版飞行界面一致。页面隐藏或菜单打开时暂停物理，不补算离开期间的时间；每 3 秒及关键事件存档。存储不可用或数据损坏仍可游玩。

## 继续扩展

| 文件                   | 职责                                     |
| ---------------------- | ---------------------------------------- |
| `physics.ts`           | 集中的参数、向量运算与碰撞辅助           |
| `engine.ts`            | 星系、飞船、着陆和类型化事件；不依赖 DOM |
| `challenge.ts`         | 计分、首次着陆顺序、AUTO 资格与结果快照 |
| `autopilot.ts`         | 自动驾驶控制器                           |
| `renderer.ts`          | Canvas 绘图、原版镜头和星球方向标记      |
| `navigation.ts`        | 星球方位与屏幕边缘交点、编号避让         |
| `client.ts`            | 鼠标／单指拖动、遥测、菜单和暂停生命周期 |
| `storage.ts`           | 带版本号和数据校验的本地存档             |
| `leaderboard.ts`       | 成绩上传、身份信息和排行榜分页           |
| `Dialogs.astro`        | AUTO 确认、结算和排行榜窗口              |
| `random.ts / words.ts` | 原版随机数和完整词库                     |
| `art.ts`               | 提取自官方 Assets.kt 的矢量路径          |
| `info.ts`              | 游戏库资料、封面及探索进度               |
| `style.css`            | 游戏页面的独立样式                       |

`Universe.on(listener)` 提供 `discovery`、`land`、`launch`、`impact`、`autopilot` 事件。新增目标时可在独立模块订阅，不必混入绘图或物理：

```ts
const unsubscribe = universe.on((event) => {
  if (event.type === 'discovery') {
    // 根据 event.planet.id、description、flora 等推进自定义目标。
  }
});
```

浏览器的 `#flight` 元素同时派发 `landroid:event` CustomEvent；负载是同一类型化事件。新任务需要持久化时，在 `storage.ts` 中明确升级存档版本。

## 验证与资源再生成

`npm.cmd test` 包含太空游戏回归测试，覆盖截图数据、引力惯性、撞击、着陆、起飞、自动探索、保存恢复、损坏数据、方向指引、存档升级、计分、顺序奖励与不同刷新率下的费用一致性。`npm.cmd run test:leaderboard` 验证结果提交、重试、排名及不合法成绩拒绝。`npm.cmd run build` 同时做类型检查和静态构建。

`scripts/import-landroid-extended.mjs` 可从本地缓存的 `.cache/android-aosp/17/Assets.kt` 和 `landroid_strings.xml` 重新提取资源。缓存不入 Git，生成的 `art.ts`、`words.ts`、字体和授权文件均随项目保存，因此正常运行和部署无需下载源码。

`scripts/create-landroid-extended-logo.py` 将原版字体转为 Logo 的 SVG 轮廓，避免跨浏览器字体回退。仅在重新生成 Logo 时需要 Python 和 fonttools（可用 `python -m pip install --target .cache/font-tools fonttools` 安装到缓存）；游戏运行不需要 Python。

`node --experimental-strip-types scripts/create-landroid-extended-art.mjs` 重新生成首页背景和封面：复用原版曲线等高线纹理与飞船，旗帜使用等比例的径向旗杆和三角旗面，地貌保持薄荷绿。
