/**
 * MVP-2 card A env / window gates for SessionPort default path vs docks / V4 escape.
 * Renderer-only; Host runtime selection is Integration's job.
 */

type GateWindow = {
  __ZEROWORK_SESSION_PORT_DOCK__?: string;
  __ZEROWORK_MVP1_SESSION_PORT__?: string;
  __ZEROWORK_V4_SESSION_PANE__?: string;
};

function readImportMetaEnv(): Record<string, string | undefined> | undefined {
  try {
    return (import.meta as { env?: Record<string, string | undefined> }).env;
  } catch {
    return undefined;
  }
}

function readWindowGates(): GateWindow {
  try {
    return globalThis as GateWindow;
  } catch {
    return {};
  }
}

/**
 * Floating SessionPort dock: default OFF.
 * Opt-in: ZEROWORK_SESSION_PORT_DOCK=1 or window.__ZEROWORK_SESSION_PORT_DOCK__ === "1".
 * Compat: ZEROWORK_MVP1_SESSION_PORT=0 / window.__ZEROWORK_MVP1_SESSION_PORT__ === "0" still hides.
 */
export function isSessionPortDockEnabled(): boolean {
  const w = readWindowGates();
  if (w.__ZEROWORK_MVP1_SESSION_PORT__ === "0") return false;
  const env = readImportMetaEnv();
  if (env?.ZEROWORK_MVP1_SESSION_PORT === "0") return false;

  if (w.__ZEROWORK_SESSION_PORT_DOCK__ === "1") return true;
  if (env?.ZEROWORK_SESSION_PORT_DOCK === "1") return true;

  return false;
}

/**
 * Escape hatch: force legacy V4 SessionPane on desktop instead of SessionPort main.
 * ZEROWORK_V4_SESSION_PANE=1 or window.__ZEROWORK_V4_SESSION_PANE__ === "1".
 */
export function shouldForceV4SessionPane(): boolean {
  const w = readWindowGates();
  if (w.__ZEROWORK_V4_SESSION_PANE__ === "1") return true;
  const env = readImportMetaEnv();
  if (env?.ZEROWORK_V4_SESSION_PANE === "1") return true;
  return false;
}

/** Desktop default bubbles path = SessionPort unless V4 escape hatch is set. */
export function shouldUseSessionPortMainChat(isDesktop: boolean): boolean {
  return Boolean(isDesktop) && !shouldForceV4SessionPane();
}
