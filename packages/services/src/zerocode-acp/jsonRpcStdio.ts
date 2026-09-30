/**
 * Minimal line-delimited JSON-RPC 2.0 over child_process stdio.
 * stderr is log-only (never treated as a protocol channel).
 *
 * Card 2 skeleton: enough for initialize / session/* request-response and
 * notification fan-out. Not a full ACP SDK replacement.
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number | string;
  result: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number | string | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccess
  | JsonRpcFailure;

export class JsonRpcStdioError extends Error {
  constructor(
    message: string,
    readonly rpcError?: JsonRpcErrorObject,
  ) {
    super(message);
    this.name = "JsonRpcStdioError";
  }
}

export interface JsonRpcStdioTransportOptions {
  onStderrLine?: (line: string) => void;
  onNotification?: (method: string, params: unknown) => void;
  onClose?: (info: { code: number | null; signal: NodeJS.Signals | null; reason?: string }) => void;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export class JsonRpcStdioTransport {
  private readonly pending = new Map<number | string, Pending>();
  private readonly stdoutDecoder = new StringDecoder("utf8");
  private stdoutBuffer = "";
  private nextId = 1;
  private closed = false;
  private stderrBuffer = "";

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly options: JsonRpcStdioTransportOptions = {},
  ) {
    child.stdout.on("data", (chunk: Buffer | string) => this.onStdout(chunk));
    child.stdout.on("end", () => this.flushStdout());
    child.stderr.on("data", (chunk: Buffer | string) => this.onStderr(chunk));
    child.once("exit", (code, signal) => {
      this.handleClose({ code, signal });
    });
    child.once("error", (error) => {
      this.handleClose({ code: null, signal: null, reason: error.message });
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async request(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
    if (this.closed || !this.child.stdin.writable) {
      throw new JsonRpcStdioError("ACP stdio transport is closed");
    }
    const id = this.nextId++;
    const frame: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    const resultPromise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new JsonRpcStdioError(`ACP request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });

    await this.write(frame);
    return resultPromise;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (this.closed || !this.child.stdin.writable) {
      throw new JsonRpcStdioError("ACP stdio transport is closed");
    }
    const frame: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    };
    await this.write(frame);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [, p] of this.pending) {
      p.reject(new JsonRpcStdioError("ACP stdio transport disposed"));
    }
    this.pending.clear();
    try {
      this.child.stdin.end();
    } catch {
      // ignore
    }
  }

  private write(message: JsonRpcMessage): Promise<void> {
    const payload = `${JSON.stringify(message)}\n`;
    return new Promise((resolve, reject) => {
      this.child.stdin.write(payload, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private onStdout(chunk: Buffer | string): void {
    this.stdoutBuffer += this.stdoutDecoder.write(
      typeof chunk === "string" ? Buffer.from(chunk) : chunk,
    );
    this.consumeStdoutLines();
  }

  private flushStdout(): void {
    this.stdoutBuffer += this.stdoutDecoder.end();
    this.consumeStdoutLines();
  }

  private consumeStdoutLines(): void {
    // LF-only framing (same rationale as ZCodeStdioTransport).
    let idx: number;
    while ((idx = this.stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.stdoutBuffer.slice(0, idx).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (!line.trim()) continue;
      this.dispatchLine(line);
    }
  }

  private dispatchLine(line: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line) as JsonRpcMessage;
    } catch {
      // Ignore non-JSON noise on stdout; do not invent fake replies.
      return;
    }

    if ("id" in msg && msg.id !== null && msg.id !== undefined && !("method" in msg)) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if ("error" in msg && msg.error) {
        pending.reject(
          new JsonRpcStdioError(msg.error.message ?? "ACP JSON-RPC error", msg.error),
        );
      } else {
        pending.resolve("result" in msg ? msg.result : undefined);
      }
      return;
    }

    if ("method" in msg && typeof msg.method === "string" && !("id" in msg && msg.id != null)) {
      this.options.onNotification?.(msg.method, "params" in msg ? msg.params : undefined);
    }
  }

  private onStderr(chunk: Buffer | string): void {
    this.stderrBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let idx: number;
    while ((idx = this.stderrBuffer.indexOf("\n")) >= 0) {
      const line = this.stderrBuffer.slice(0, idx).replace(/\r$/, "");
      this.stderrBuffer = this.stderrBuffer.slice(idx + 1);
      if (line.length > 0) {
        this.options.onStderrLine?.(line);
      }
    }
  }

  private handleClose(info: {
    code: number | null;
    signal: NodeJS.Signals | null;
    reason?: string;
  }): void {
    if (this.closed) return;
    this.closed = true;
    for (const [, p] of this.pending) {
      p.reject(
        new JsonRpcStdioError(
          info.reason ??
            `ACP agent process exited (code=${info.code}, signal=${info.signal})`,
        ),
      );
    }
    this.pending.clear();
    this.options.onClose?.(info);
  }
}
