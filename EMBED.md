# 户型设计（floorplan-3d）接入说明 EMBED

## 一、上游是什么

- 来源：`/Users/apple/Downloads/floorplan-3d-master`（MIT），单文件纯前端应用 `index.html`（约 185 KB / 2674 行）。
> 上游仓库：https://github.com/wy51ai/floorplan-3d
- 能力：2D 平面图编辑（墙体、房间、家具、尺寸标注、承重墙）+ 3D 场景实时同步（three.js r160）+ 鸟瞰/斜视/俯视/漫游四种视角 + 深浅色与中英繁体切换 + PNG 截图 / JSON 方案导入导出。
- 零后端：全部状态存在浏览器 `localStorage`。

## 二、接入方式（外挂子应用，非重写 UI）

| 项 | 取值 | 说明 |
| --- | --- | --- |
| appId | `floorplan-3d` | 目录 `$AGNX_HOME/apps/floorplan-3d/` |
| 挂载策略 | `ensureTool` + 受管静态服务 | 宿主按 manifest.sidecar 拉起 `ensure-floorplan-3d.mjs`，由它守护 `serve-static.mjs` |
| guest | `kind:"web"`, `auth:"none"`, `preferStrategy:"auto"` | 无鉴权纯静态站，直接 `direct-iframe` |
| 固定端口 | `5192` | **不可改**：上游把方案存在 `localStorage`，键按 origin（含端口）隔离，换端口等于丢方案 |
| 离线 | three.js 已本地化到 `node_modules/three@0.160.0` | importmap 改指向本地文件，不走 CDN |
| 平台 | desktop `supported` / web `partial` / mobile `unsupported` | 本轮只在桌面 Electron 验收 |

上游代码改动仅 3 处（其余原样保留）：

1. `importmap` 由 CDN 改为本地 `./node_modules/three/...`。
2. `toggleFullscreen()` 增加降级：`requestFullscreen` 不可用或被拒时切 `.pseudo-fs` 类（面板内伪全屏）。
3. CSS 增补 `.app.pseudo-fs{position:fixed;inset:0;...}`。

## 三、嵌页宿主能力缺口

| 上游能力 | 信号位置 | 嵌后风险 | 处置 (A–E) | 主路径 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 浏览器全屏 `requestFullscreen` | `toggleFullscreen()` / `#fullscreen` 按钮、`Shift+F` | iframe 未授权全屏时抛错，按钮无反应 | **D 已适配** | iframe `allow="fullscreen"` 生效，实测 `document.fullscreenElement` 为真（限制在子应用全屏元素内，不越出宿主 Tab）；异常时回落 `.pseudo-fs` 面板内伪全屏 | 桌面实测通过 |
| PNG 截图导出 / JSON 方案导出 | `download(name, blob)`（`<a download>`） | 跨域 iframe 中 `download` 可能被拦截 | **C 可接受** | iframe 为 `allow-same-origin` 沙箱，Chromium 允许 `<a download>` 同源下载 | 桌面 Electron 触发下载正常 |
| JSON 方案导入 | `<input type="file" id="fileIn" hidden>` | 需用户手势触发系统文件选择 | **C 可接受** | 原生 file input 在跨域 iframe 内可用；控制台有 `Blocked autofocusing on a <input> in a cross-origin subframe` 无害告警（上游 `focus()` 隐藏 input 所致） | 不影响功能 |
| 指针锁定（漫游模式） | `walkCtl.lock()`，失败回落 `startTouchWalk()` | iframe `allow` 未含 `pointer-lock` 时锁定失败 | **D 已适配** | 宿主 guest iframe 已声明 `pointer-lock`；即使失败上游自带触屏漫游降级 | 浏览器控制台对 `pointer-lock` 报 "Unrecognized feature" 属 Chromium 提示，非错误 |
| 键盘快捷键（T/V/M/X/R/F/Delete/方向键/`[`/`]`/WASD） | 全局 `keydown` 监听（约 1294 行） | 单键被宿主抢走或焦点不在 iframe | **D 已适配** | 面板开 `iframeShortcutCapture:true`；宿主 relay 只透传带修饰键的按键并放行 `Ctrl/Cmd+A/C/V/X/Z/Y/F`，单键全部进 iframe | 实测按 `T` 可在 2D/3D 间往返 |
| Cmd/Ctrl+Z / Cmd/Ctrl+D | 上游撤销/重做/复制 | 被宿主 relay 列为系统级组合键而放行，不注入 iframe | **C 可接受** | 使用界面「撤销 / 重做」按钮与选中栏「复制」等价入口 | 功能不丢失，仅键盘路径不同 |
| `Shift+F` 全屏快捷键 | 上游 keydown | 带 Shift 修饰键，若被宿主吞掉则无反应 | **C 可接受** | 顶部「全屏」按钮等价 | 同上 |
| 方案持久化 | `localStorage['huxing-design-v1']` / `huxing-panes` / `huxing-lang` | 走宿主 `host.storage` 需改上游全部读写 | **B 暂不迁** | 保留上游 `localStorage`，数据随 5192 origin 固化；清站点数据会丢方案 | 后续若要多端同步再桥接 `host.storage` |
| 窗口尺寸变化重排 | 上游**无** `resize` 监听 | 拖动宿主侧栏改宽时 3D 画布可能不重排 | **C 可接受** | 面板尺寸变化时 iframe 自身触发画布重建；极端拉伸需重新切视角 | 上游遗留问题，未改 |
| 触屏摇杆 | `bindJoystick()` 用 `setPointerCapture` + `pointerup/cancel` | 移动端手势与宿主冲突 | **E 不承接** | `platforms.mobile: "unsupported"`，本轮明确不做移动端 | — |

## 四、静态服务安全边界

`serve-static.mjs` 只读、仅绑 `127.0.0.1`：

- 允许路径前缀：`index.html`、`node_modules/three/`、`assets/`。
- 屏蔽段：`.agnx`、`.git`、`data`。
- 实测：`/../package.json`、`/.agnx/manifest.json`、`/package.json` 均 404。
- 响应头：CSP 限 `default-src 'self'`、`frame-ancestors *`、`nosniff`、`no-cache`。

## 五、已知与上游的差异

- 无功能删减：2D/3D、家具库、材质、属性面板、导出导入、简繁英切换全部保留。
- 唯一外观差异：面板内嵌时上游 `.app` 高度自适应，滚动交给 iframe 内部，不出现双滚动条。
