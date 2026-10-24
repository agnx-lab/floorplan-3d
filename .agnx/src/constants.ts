/**
 * 场景：Floorplan3D 子应用常量 — Tab / 命令 / 静态服务端口与 ensure 工具路径。
 */
export const FLOORPLAN_APP_ID = "floorplan-3d";
export const FLOORPLAN_PANEL_ID = "floorplan-3d.main";
export const FLOORPLAN_OPEN_COMMAND_ID = "floorplan-3d.open";

/** ensure 工具（相对 App 根）— 起一个只读静态服务，把整仓 index.html + three 交给 Guest iframe。 */
export const FLOORPLAN_ENSURE_TOOL_REL = ".agnx/tools/ensure-floorplan-3d.mjs";

/**
 * 端口必须钉死：上游把方案存 localStorage（键 huxing-design-v1），
 * 而 localStorage 按 origin（含端口）隔离 —— 换端口等于丢方案。
 */
export const FLOORPLAN_DEFAULT_PORT = 5192;

/** 首进 3D 要下载并初始化整包 three（本地化后仍约 1.5MB 解析），放宽就绪超时。 */
export const FLOORPLAN_SURFACE_READY_TIMEOUT_MS = 60_000;
export const FLOORPLAN_ENSURE_TIMEOUT_MS = 60_000;
