/**
 * MVP-1 card 3 minimal SessionPort chat panel (parallel to V4 SessionPane).
 * Does not replace the main composer; no fake streaming text.
 */

import { useCallback, useState, type CSSProperties, type FormEvent } from "react";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useSessionPortChat } from "./useSessionPortChat.js";

const panelStyle: CSSProperties = {
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

export function SessionPortChatPanel(props: {
  workspacePath: string;
  /** When false, render nothing (feature gate). Default true when service exists. */
  enabled?: boolean;
}) {
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

  if (!enabled || !service) {
    return null;
  }

  return (
    <section
      data-testid="zerocode-session-port-panel"
      aria-label="ZeroCode SessionPort MVP chat"
      style={panelStyle}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <strong>ZeroCode SessionPort (MVP-1)</strong>
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
