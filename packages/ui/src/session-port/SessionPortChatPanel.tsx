/**
 * SessionPort chat panel — MVP-2 default main bubbles path (variant="main")
 * and optional compact dock (variant="dock"). No fake streaming text.
 * UI talks only Host IZeroCodeSessionPortService.
 */

import { useCallback, useState, type CSSProperties, type FormEvent } from "react";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useSessionPortChat } from "./useSessionPortChat.js";

export type SessionPortChatPanelVariant = "dock" | "main";

const dockPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: "1px solid var(--border-color, #333)",
  borderRadius: 8,
  background: "var(--panel-bg, rgba(0,0,0,0.04))",
  maxHeight: 420,
  minHeight: 240,
};

const mainPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: "1px solid var(--border-color, #333)",
  borderRadius: 8,
  background: "var(--panel-bg, rgba(0,0,0,0.04))",
  flex: 1,
  minHeight: "100%",
  maxHeight: "none",
  height: "100%",
  boxSizing: "border-box",
};

const listStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 13,
  lineHeight: 1.45,
};

const bubbleBase: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const errorStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  background: "rgba(180,40,40,0.15)",
  color: "var(--error-fg, #b42318)",
  fontSize: 12,
};

function panelTitle(variant: SessionPortChatPanelVariant): string {
  return variant === "main" ? "ZeroWork Session" : "ZeroCode SessionPort";
}

function unavailableState(variant: SessionPortChatPanelVariant) {
  const style = variant === "main" ? mainPanelStyle : dockPanelStyle;
  return (
    <section
      data-testid="zerocode-session-port-panel"
      data-variant={variant}
      aria-label="ZeroCode SessionPort unavailable"
      style={style}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <strong>{panelTitle(variant)}</strong>
        <span style={{ opacity: 0.7 }}>status=unavailable</span>
      </header>
      <div role="alert" style={errorStyle} data-testid="zerocode-session-port-unavailable">
        SessionPort service unavailable
      </div>
      <div style={{ ...listStyle, opacity: 0.55 }}>
        Host did not expose IZeroCodeSessionPortService. Default chat cannot start until the thin
        bridge is registered.
      </div>
    </section>
  );
}

export function SessionPortChatPanel(props: {
  workspacePath: string;
  /** When false, render nothing (feature gate). Default true when service exists. */
  enabled?: boolean;
  /** dock = compact floating; main = full-height default chat surface. */
  variant?: SessionPortChatPanelVariant;
}) {
  const variant: SessionPortChatPanelVariant = props.variant ?? "dock";
  const services = useOptionalServices();
  const service = services?.zerocodeSessionPortService;
  const enabled = props.enabled ?? true;

  const chat = useSessionPortChat({
    service,
    workspacePath: props.workspacePath,
  });

  const [draft, setDraft] = useState("");

  const onSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const text = draft;
      setDraft("");
      void chat.send(text);
    },
    [chat, draft],
  );

  if (!enabled) {
    return null;
  }

  if (!service) {
    // Main path must never blank-crash silently; dock may stay hidden.
    if (variant === "main") {
      return unavailableState(variant);
    }
    return null;
  }

  const panelStyle = variant === "main" ? mainPanelStyle : dockPanelStyle;

  return (
    <section
      data-testid="zerocode-session-port-panel"
      data-variant={variant}
      aria-label="ZeroCode SessionPort chat"
      style={panelStyle}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <strong>{panelTitle(variant)}</strong>
        <span style={{ opacity: 0.7 }}>
          status={chat.status}
          {chat.sessionId ? ` · ${chat.sessionId.slice(0, 8)}…` : ""}
        </span>
      </header>

      {chat.error ? (
        <div role="alert" style={errorStyle} data-testid="zerocode-session-port-error">
          <div>{chat.error}</div>
          <button type="button" onClick={chat.clearError} style={{ marginTop: 6, fontSize: 12 }}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div style={listStyle} data-testid="zerocode-session-port-bubbles">
        {chat.bubbles.length === 0 ? (
          <div style={{ opacity: 0.55 }}>Send a message via Host SessionPort (ask mode).</div>
        ) : (
          chat.bubbles.map((b) => (
            <div
              key={b.id}
              data-role={b.role}
              style={{
                ...bubbleBase,
                alignSelf: b.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "92%",
                background:
                  b.role === "user"
                    ? "rgba(37,99,235,0.15)"
                    : "rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>
                {b.role}
                {b.streaming ? " · streaming" : ""}
              </div>
              {b.text}
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message via SessionPort.prompt…"
          disabled={chat.busy}
          style={{ flex: 1, fontSize: 13, padding: "6px 8px" }}
          data-testid="zerocode-session-port-input"
        />
        <button type="submit" disabled={chat.busy || !draft.trim()} data-testid="zerocode-session-port-send">
          {chat.busy ? "…" : "Send"}
        </button>
      </form>
    </section>
  );
}
