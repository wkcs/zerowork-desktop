/**
 * Floating SessionPort dock — MVP-2 opt-in debug overlay (default OFF).
 * Main chat bubbles use SessionPort via V4ChatPane; this dock is no longer default.
 */

import type { CSSProperties } from "react";
import { SessionPortChatPanel } from "./SessionPortChatPanel.js";
import { isSessionPortDockEnabled } from "./sessionPortGates.js";

const dockStyle: CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  width: 380,
  zIndex: 40,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

export function SessionPortMvpDock(props: {
  workspacePath: string | null | undefined;
  isDesktop?: boolean;
}) {
  if (!props.isDesktop) return null;
  if (!props.workspacePath?.trim()) return null;
  if (!isSessionPortDockEnabled()) return null;

  return (
    <div style={dockStyle} data-testid="zerocode-session-port-dock">
      <SessionPortChatPanel workspacePath={props.workspacePath} variant="dock" />
    </div>
  );
}
