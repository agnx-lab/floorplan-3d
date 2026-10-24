/**
 * 场景：Floorplan3D Sub App 入口 — 薄壳 Guest（auth:none）+ ensure 静态服务，Tab + 命令注册。
 */
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import {
  FLOORPLAN_APP_ID,
  FLOORPLAN_ENSURE_TOOL_REL,
  FLOORPLAN_OPEN_COMMAND_ID,
  FLOORPLAN_PANEL_ID,
} from "./constants";
import { FloorplanPanel, bindFloorplanHost } from "./panel";

export const appId = FLOORPLAN_APP_ID;

function openFloorplanTab(
  host: WorkspaceAppHostApi,
  context?: {
    serverId?: string;
    workspaceId?: string;
    currentPathname?: string | null;
  },
): void {
  host.openSubAppTab({
    appId: FLOORPLAN_APP_ID,
    panelId: FLOORPLAN_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname,
  });
}

export function activate(host: WorkspaceAppHostApi): void {
  bindFloorplanHost(host);

  host.registerMiniApp({
    id: FLOORPLAN_PANEL_ID,
    appId: FLOORPLAN_APP_ID,
    title: "户型设计",
    component: FloorplanPanel,
    iframeShortcutCapture: true,
    isolation: {
      mode: "iframe",
      sidecarTools: [FLOORPLAN_ENSURE_TOOL_REL],
      note: "Panel 通过 ensure 起本机静态服务（默认 127.0.0.1:5192），把 App 目录里的 index.html + 本地 three 交给 Guest iframe。",
    },
  });

  host.registerCommand({
    id: FLOORPLAN_OPEN_COMMAND_ID,
    appId: FLOORPLAN_APP_ID,
    title: "户型设计",
    keywords: ["floorplan", "户型", "平面图", "装修", "3d", "three", "设计"],
    sidebarAction: {
      defaultVisible: true,
      label: "户型设计",
      order: 74,
    },
    run: (context) => {
      openFloorplanTab(host, context);
    },
  });

  // 静态服务由宿主 sidecar 生命周期托管，activate 无需额外清理逻辑。
}

const moduleExport: WorkspaceAppModule = {
  appId: FLOORPLAN_APP_ID,
  activate,
};

export default moduleExport;

export {
  FLOORPLAN_APP_ID,
  FLOORPLAN_OPEN_COMMAND_ID,
  FLOORPLAN_PANEL_ID,
} from "./constants";
export { FloorplanPanel } from "./panel";
