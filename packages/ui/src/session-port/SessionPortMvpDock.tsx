/**
 * Floating MVP-1 SessionPort dock — parallel to V4 chat; does not replace it.
 * Shown on desktop when Host exposes zerocodeSessionPortService.
 */

import type { CSSProperties } from "react";
import { SessionPortChatPanel } from "./SessionPortChatPanel.js";

const dockStyle: CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  width: 380,
  zIndex: 40,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

/**
 * Env gate: set ZEROWORK_MVP1_SESSION_PORT=0 to hide.
 * In renderer, prefer import.meta / process.env baked by bundler; also allow
 * window.__ZEROWORK_MVP1_SESSION_PORT__ = "0".
 */
function isMvpSessionPortEnabled(): boolean {
  try {
    const w = globalThis as { __ZEROWORK_MVP1_SESSION_PORT__?: string };
    if (w.__ZEROWORK_MVP1_SESSION_PORT__ === "0") return false;
  } catch {
    // ignore
  }
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (env?.ZEROWORK_MVP1_SESSION_PORT === "0") return false;
  } catch {
    // ignore
  }
  return true;
}

export function SessionPortMvpDock(props: {
  workspacePath: string | null | undefined;
  isDesktop?: boolean;
}) {
  if (!props.isDesktop) return null;
  if (!props.workspacePath?.trim()) return null;
  if (!isMvpSessionPortEnabled()) return null;

  return (
    <div style={dockStyle} data-testid="zerocode-session-port-dock">
      <SessionPortChatPanel workspacePath={props.workspacePath} />
    </div>
  );
}
