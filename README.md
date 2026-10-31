# dsh-plugin-usage-stats

DSH Web GUI 客户端插件：在**左侧栏新增「使用统计」面板**，展示本机 DSH 会话的 Token 使用情况
（累计/峰值、聊天时长、连续天数、月份活动图、每日趋势、模型用量占比），并提供手动刷新。

数据**全部来自本机会话日志**，不联网、不调用模型、不上传任何内容。

## 功能

- **侧栏入口**：`sidebar.panellist` 列表项（图标 + 「使用统计」），排在「插件」之后（order 10），
  收起态显示同名 tooltip；点击后打开全局面板（root `main` keyed slot，key `usage-stats`）。
- **概览指标**：累计 Token 数、峰值 Token 数（单日最高）、最长聊天时长（会话内 `Σ(step/end − step/start)`）、
  当前连续天数、最长连续天数（按"有 usage 的本地自然日"计）。
- **Token 活动**：近 12 个月，支持 `每日 / 每周 / 累计` 三种聚合，悬停显示日期与 token 数。
- **时间范围**：`近7日 / 近30日` 切换趋势图与模型用量的统计窗口。
- **每日 Token 趋势图**：按模型堆叠的柱状图 + 图例 + X 轴日期，悬停显示当日分模型明细。
- **模型用量**：环形图（中心为该窗口总量）+ 每模型行（占比 + token 数），悬停高亮扇区。
- **刷新**：右下角按钮，请求期间显示「刷新中…」并禁用；失败保留旧数据并提示重试。
- 浅色 / 深色主题跟随宿主；`prefers-reduced-motion` 下关闭旋转动效。

## 安装

插件目录即本包目录。安装到某个 profile（示例为 `desktop`）：

```powershell
$env:DSH_HOME = "$env:USERPROFILE\.dsh"
dsh plugin --profile desktop add "<本目录绝对路径>"
```

安装后**重启 DSH 应用**（或重启 `dsh web` 实例）并刷新页面，左侧栏「插件」下方会出现「使用统计」。

> Electron 桌面端的 `desktop` profile 由应用独占管理，`dsh --profile desktop --dump-config` 会被拒绝；
> 用 `~/.dsh/profiles/desktop/package.json` 里的 `dependencies` 与 `dsh.profile.bundles` 确认安装结果。

## 卸载

```powershell
dsh plugin --profile desktop remove dsh-plugin-usage-stats
```

或只在 profile 的 `cordis.patch.yml` 中禁用 Loader 行（id `ui-usage-stats`）：

```yaml
- id: ui-usage-stats
  disabled: true
```

## 实现要点

| 文件 | 作用 |
|---|---|
| `package.json` | 包名、`dsh.bundle.patch` → `cordis.patch.yml`、`dsh.client.platform: web`、`exports["./client"]` |
| `cordis.patch.yml` | `insert` 一行 `ui-usage-stats`，让 Loader 挂载本插件并让 `dsh-client-modules` 发现浏览器 bundle |
| `lib/index.js` | **Host 半侧**：在 `webServer` 服务上注册命名路由 `/dsh-usage-stats/data`（含 `?force=1` 强制重算、`/health` 诊断），60s TTL 缓存 |
| `lib/host/scan.js` | 枚举 `DSH_HOME/sessions/**/session.v4.jsonl.zstd`、解压、解析事件，容错（坏文件进 `errors[]`） |
| `lib/host/zstd.js` | **多帧 zstd 解压**：DSH 每次追加写一个 zstd frame，而随 DSH 附带的 Node 24 只解第一帧；本模块解析 frame/block 头逐帧解压后拼接 |
| `lib/host/fold.js` | 纯函数折叠成 payload（本地时区日桶、模型归并与展示名映射、streak、7d/30d 窗口、峰值、最长聊天时长） |
| `lib/host/stats.js` | `collectUsageStats({ homeDir, now, tz, ttlMs, force })` 单一入口；DSH_HOME 解析顺序：参数 > `$DSH_HOME` > `~/.dsh` |
| `lib/client.js` | **浏览器半侧**：手写 CJS bundle（`window.__ModuleLoader__.load`），注册侧栏入口 + 主面板，渲染页面（内联 CSS，仅 `require('react')`） |
| `lib/host/selftest.mjs` | 自检入口：默认跑合成 fixture 套件；`--real` 跑本机 `~/.dsh` 数据并输出 `selftest.real.json` |
| `lib/host/selftest.fixtures.mjs` | 合成 fixture 套件：按 `fixtures/manifest.json` 造临时 DSH home，断言口径（日桶、模型归并、容错、streak、chat 时长） |

## 自检

```powershell
node lib/host/selftest.mjs          # 合成 fixture 套件（不碰本机数据，46 项断言）
node lib/host/selftest.mjs --real   # 本机真实数据 + 基线对账，写出 lib/host/selftest.real.json
```

`--real` 写出的 `selftest.real.json` 是本机真实用量快照，已在 `.gitignore` 中排除。

### 为什么用 HTTP 路由而不是 Typert remote

第三方（profile 安装）插件的 import 从**插件目录**解析，无法 `import '@deepseek-ai/dsh-typert-protocol'`
（该包只存在于打包后的运行时里，插件加载器的 resolve 钩子也只重定向 Office 引擎）。
`webServer` 的命名路由是纯 `node:http` + `ctx` 服务，无需平台包导入；浏览器 bundle 与页面同源，
桌面端与 Web 端都用 `http://127.0.0.1:<port>` 加载 GUI，因此同源 `fetch()` 两边都可达。

### 数据口径

- 用量事件：`type === 'assistant/message'` 且带 `data.usage`；`tokens = usage.totalTokens ?? inputTokens + outputTokens`；
  模型取 `data.message.source.{provider, model}`；时间取事件 `time`。
- 日桶用 Host 进程本地时区；`days[]` 覆盖最近 365 天（含空日）。
- 模型先做展示名映射，再按展示名二次归并（例如多种 `deepseek-v4.1-flash` 变体合并为一条曲线）。
- `longestChatMs` = 单会话 `Σ(step/end.time − step/start.time)` 的最大值；`latestSessionSpanMs` 另存首尾差值。

## 已知限制

- 数据只覆盖**本机** `DSH_HOME/sessions` 下的会话；删除过的会话不出现。
- 首次请求需要解压全部会话日志（本机 27 个会话 / 约 13MB 压缩 ≈ 0.45s），之后 60s 内走缓存。
- 面板一次性渲染整年活动图（约 365 个矩形）；超过数千会话的机器仍可用，但首屏解析时间随日志量线性增长。
- 仅适配 Web/Electron 桌面端；TUI 等无 `webServer` 的宿主里 Host 半侧会跳过路由注册（不报错）。
