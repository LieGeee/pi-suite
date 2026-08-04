import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { parseJsonEnvelope, type RelayEnvelope } from "./protocol.js";
import { RelayHub, type RelayPeer } from "./relay.js";
import type { RelayStore } from "./store.js";

export interface RelayHttpServerOptions {
  readonly store: RelayStore;
}

export interface RelayHttpServer {
  readonly server: Server;
  readonly hub: RelayHub;
  close(): Promise<void>;
}

export function createRelayHttpServer(options: RelayHttpServerOptions): RelayHttpServer {
  const hub = new RelayHub(options.store);
  const desktopWss = new WebSocketServer({ noServer: true });
  const mobileWss = new WebSocketServer({ noServer: true });

  const server = createServer((request, response) => {
    void handleHttpRequest(request, response, options.store, hub);
  });

  desktopWss.on("connection", (socket) => {
    const peer = new WebSocketRelayPeer(socket);
    hub.attachDesktop(peer);
    wirePeerMessages(socket, peer, hub);
  });

  mobileWss.on("connection", (socket) => {
    const peer = new WebSocketRelayPeer(socket);
    hub.attachMobile(peer);
    wirePeerMessages(socket, peer, hub);
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "/";
    const target = pathname === "/ws/desktop" ? desktopWss : pathname === "/ws/mobile" ? mobileWss : undefined;
    if (!target) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    target.handleUpgrade(request, socket, head, (webSocket) => {
      target.emit("connection", webSocket, request);
    });
  });

  return {
    server,
    hub,
    close: () => new Promise<void>((resolve, reject) => {
      desktopWss.close((desktopError) => {
        mobileWss.close((mobileError) => {
          server.close((serverError) => {
            const error = desktopError ?? mobileError ?? serverError;
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      });
    }),
  };
}

class WebSocketRelayPeer implements RelayPeer {
  constructor(private readonly socket: WebSocket) {}

  sendEnvelope(envelope: RelayEnvelope): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(envelope));
  }

  close(): void {
    this.socket.close();
  }
}

function wirePeerMessages(socket: WebSocket, peer: RelayPeer, hub: RelayHub): void {
  socket.on("message", (data) => {
    const envelope = parseJsonEnvelope(data.toString());
    if (!envelope) {
      peer.sendEnvelope({ type: "server.error", payload: { message: "消息不是有效 JSON envelope。" } });
      return;
    }
    hub.receive(peer, envelope);
  });
  socket.on("close", () => {
    hub.disconnect(peer);
  });
}

async function handleHttpRequest(request: IncomingMessage, response: ServerResponse, store: RelayStore, hub: RelayHub): Promise<void> {
  const method = request.method ?? "GET";
  const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "/";

  if (method === "GET" && pathname === "/api/health") {
    writeJson(response, 200, { ok: true, service: "pi-mobile-relay" });
    return;
  }

  if (method === "POST" && pathname === "/api/pair/create") {
    const body = await readJsonBody(request);
    const label = typeof body?.label === "string" ? body.label : "desktop";
    const created = store.createPairing({ label });
    writeJson(response, 200, created);
    return;
  }

  if (method === "POST" && pathname === "/api/pair/diagnostics") {
    const body = await readJsonBody(request);
    const pairToken = typeof body?.pairToken === "string" ? body.pairToken : "";
    if (!pairToken) {
      writeJson(response, 400, { ok: false, error: "pairToken is required" });
      return;
    }
    writeJson(response, 200, hub.inspectPairToken(pairToken));
    return;
  }

  if (method === "POST" && pathname === "/api/pair/revoke") {
    const body = await readJsonBody(request);
    const pairToken = typeof body?.pairToken === "string" ? body.pairToken : "";
    if (!pairToken) {
      writeJson(response, 400, { ok: false, error: "pairToken is required" });
      return;
    }
    writeJson(response, 200, { ok: store.revokePairToken(pairToken) });
    return;
  }

  writeJson(response, 404, { ok: false, error: "not found" });
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}
