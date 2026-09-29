/**
 * MVP-1 card 3: map SessionPort projected events → chat bubbles.
 * UI talks only Host IZeroCodeSessionPortService — never ACP / JSON-RPC.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IZeroCodeSessionPortService,
  SessionUiEvent,
} from "@zcode/services";

export type SessionPortBubbleRole = "user" | "assistant" | "system";

export interface SessionPortBubble {
  id: string;
  role: SessionPortBubbleRole;
  text: string;
  streaming?: boolean;
}

export interface SessionPortChatState {
  bubbles: SessionPortBubble[];
  status: string;
  error: string | null;
  sessionId: string | null;
  busy: boolean;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useSessionPortChat(options: {
  service: IZeroCodeSessionPortService | null | undefined;
  workspacePath: string;
}): SessionPortChatState & {
  send: (text: string) => Promise<void>;
  clearError: () => void;
} {
  const { service, workspacePath } = options;
  const [bubbles, setBubbles] = useState<SessionPortBubble[]>([]);
  const [status, setStatus] = useState<string>("Idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const assistantBubbleIdRef = useRef<string | null>(null);
  const eventDisposableRef = useRef<{ dispose(): void } | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    return () => {
      eventDisposableRef.current?.dispose();
      eventDisposableRef.current = null;
    };
  }, []);

  const handleEvent = useCallback((ev: SessionUiEvent) => {
    switch (ev.type) {
      case "assistant_text_delta": {
        const delta = ev.text ?? "";
        if (!delta) return;
        setBubbles((prev) => {
          const id = assistantBubbleIdRef.current;
          if (id) {
            return prev.map((b) =>
              b.id === id ? { ...b, text: b.text + delta, streaming: true } : b,
            );
          }
          const newId = nextId("assistant");
          assistantBubbleIdRef.current = newId;
          return [...prev, { id: newId, role: "assistant", text: delta, streaming: true }];
        });
        break;
      }
      case "turn_completed": {
        assistantBubbleIdRef.current = null;
        setBubbles((prev) =>
          prev.map((b) => (b.streaming ? { ...b, streaming: false } : b)),
        );
        setBusy(false);
        if (ev.stopReason) {
          setStatus(`turn_completed:${ev.stopReason}`);
        } else {
          setStatus("turn_completed");
        }
        break;
      }
      case "error": {
        setError(ev.message);
        setBusy(false);
        assistantBubbleIdRef.current = null;
        setBubbles((prev) =>
          prev.map((b) => (b.streaming ? { ...b, streaming: false } : b)),
        );
        break;
      }
      case "agent_process_exited": {
        const code = ev.code === null ? "null" : String(ev.code);
        const signal = ev.signal ?? "null";
        setError(`Agent process exited (code=${code}, signal=${signal})`);
        setBusy(false);
        setStatus("Failed");
        assistantBubbleIdRef.current = null;
        break;
      }
      default:
        // Card 3 non-goals: thought / tool / permission / plan — ignore visibly.
        break;
    }
  }, []);

  const ensureSubscribed = useCallback(
    (id: string) => {
      if (!service) return;
      eventDisposableRef.current?.dispose();
      eventDisposableRef.current = service.onDynamicSessionUiEvent(id)(handleEvent);
    },
    [service, handleEvent],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!service) {
        setError("ZeroCode SessionPort service unavailable on this Host");
        return;
      }
      if (!workspacePath.trim()) {
        setError("Workspace path is empty");
        return;
      }

      setError(null);
      setBusy(true);
      setBubbles((prev) => [
        ...prev,
        { id: nextId("user"), role: "user", text: trimmed },
      ]);
      assistantBubbleIdRef.current = null;

      try {
        await service.ensureReady();
        setStatus(String(await Promise.resolve(service.getStatus())));

        let id = sessionIdRef.current;
        if (!id) {
          const handle = await service.openSession({
            workspacePath,
            permissionMode: "ask",
          });
          id = handle.sessionId;
          sessionIdRef.current = id;
          setSessionId(id);
        }

        ensureSubscribed(id);
        await service.prompt(id, { text: trimmed });
        setStatus(String(await Promise.resolve(service.getStatus())));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setBusy(false);
        try {
          setStatus(String(await Promise.resolve(service.getStatus())));
        } catch {
          setStatus("Failed");
        }
      }
    },
    [service, workspacePath, ensureSubscribed],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    bubbles,
    status,
    error,
    sessionId,
    busy,
    send,
    clearError,
  };
}
