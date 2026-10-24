/**
 * 场景：Floorplan3D 薄壳 Panel — host.guest.mount 起静态服务（ensure）后整幅嵌入上游 UI；首帧品牌遮罩。
 * 上游是纯静态单页（2D 平面 + three 3D），无鉴权、无后台，guest.auth=none → direct-iframe。
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
} from "react";
import type {
  WorkspaceAppBrandLogoLoaderPanelProps,
  WorkspaceAppHostApi,
} from "@agnx-lab/app-sdk";
import {
  FLOORPLAN_APP_ID,
  FLOORPLAN_DEFAULT_PORT,
  FLOORPLAN_ENSURE_TIMEOUT_MS,
  FLOORPLAN_ENSURE_TOOL_REL,
  FLOORPLAN_SURFACE_READY_TIMEOUT_MS,
} from "./constants";

/** 满铺：上游自己管 padding/滚动，宿主容器不得再留边。 */
const WEB_ROOT_STYLE: CSSProperties = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  backgroundColor: "transparent",
};

const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const BOOT_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  background: "rgb(9, 9, 11)",
};

const ERROR_LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  display: "flex",
  flexDirection: "column",
  background: "rgba(9,9,11,0.88)",
};

const ERROR_FALLBACK_STYLE: CSSProperties = {
  ...ERROR_LAYER_STYLE,
  alignItems: "center",
  justifyContent: "center",
  color: "#a1a1aa",
  padding: 24,
  textAlign: "center",
};

let boundHost: WorkspaceAppHostApi | null = null;

export function bindFloorplanHost(host: WorkspaceAppHostApi): void {
  boundHost = host;
}

function getHost(): WorkspaceAppHostApi {
  if (!boundHost) {
    throw new Error("Floorplan3D host 未绑定");
  }
  return boundHost;
}

function canUseGuestSurface(): boolean {
  return typeof document !== "undefined" && getHost().platform.isWeb;
}

export function FloorplanPanel(_props: {
  appId?: string;
  panelId?: string;
  entityId?: string;
}): ReactElement {
  const guestHostRef = useRef<HTMLDivElement | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseGuestSurface()) {
      setBooting(false);
      setError("当前平台暂不支持嵌入户型设计（桌面端与网页端可用）。");
      return;
    }
    const host = getHost();
    if (!host.guest?.mount) {
      setBooting(false);
      setError("宿主未提供 host.guest.mount（需升级 Agnx）");
      return;
    }
    const container = guestHostRef.current;
    if (!container) {
      return;
    }
    const unmount = host.guest.mount({
      container,
      ensureTool: FLOORPLAN_ENSURE_TOOL_REL,
      ensureArgs: ["--port", String(FLOORPLAN_DEFAULT_PORT)],
      timeoutMs: FLOORPLAN_ENSURE_TIMEOUT_MS,
      surfaceReadyTimeoutMs: FLOORPLAN_SURFACE_READY_TIMEOUT_MS,
      bootOverlay: false,
      onReady: () => {
        setError(null);
        window.setTimeout(() => setBooting(false), 320);
      },
      onError: (detail) => {
        setBooting(false);
        setError(`${detail.code}: ${detail.message}`);
      },
    });
    return unmount;
  }, []);

  const BrandPanel = getHost().ui?.BrandLogoLoaderPanel as
    | ComponentType<WorkspaceAppBrandLogoLoaderPanelProps>
    | undefined;

  return (
    <div style={WEB_ROOT_STYLE} aria-label="Floorplan3D panel">
      <div
        ref={guestHostRef}
        data-agnx-guest-surface-host="true"
        data-testid="workspace-mini-app-floorplan-3d-root"
        style={GUEST_HOST_STYLE}
      />
      {booting && !error && BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={BOOT_LAYER_STYLE} role="status">
          <BrandPanel
            title="正在启动户型设计…"
            description="加载平面布置与 3D 场景。"
            testID="floorplan-3d-boot-overlay"
          />
        </div>
      ) : null}
      {booting && !error && !BrandPanel ? (
        <div data-agnx-guest-boot-overlay="true" style={ERROR_FALLBACK_STYLE} role="status">
          正在启动户型设计…
        </div>
      ) : null}
      {error && BrandPanel ? (
        <div style={ERROR_LAYER_STYLE} role="alert">
          <BrandPanel
            title={error}
            description="打开命令面板 → 户型设计 → 详情，复制 Guest Surface 贴给 AI。静态服务端口默认 5192。"
            testID="floorplan-3d-mount-error"
          />
        </div>
      ) : null}
      {error && !BrandPanel ? (
        <div style={ERROR_FALLBACK_STYLE} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

void FLOORPLAN_APP_ID;
