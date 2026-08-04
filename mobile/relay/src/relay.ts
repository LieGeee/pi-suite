import type {
  DesktopHelloEnvelope,
  JsonValue,
  MobileCommandEnvelope,
  MobileHelloEnvelope,
  RelayEnvelope,
  RelayPermissions,
} from "./protocol.js";
import { isObject } from "./protocol.js";
import type { RelayStore } from "./store.js";

export interface RelayPeer {
  sendEnvelope(envelope: RelayEnvelope): void;
  close(): void;
}

type PeerRole = "unknown" | "desktop" | "mobile";

interface PeerState {
  role: PeerRole;
  pairingId?: string;
  tokenHash?: string;
}

interface RelayRoom {
  readonly pairingId: string;
  readonly tokenHash: string;
  desktop?: RelayPeer;
  readonly mobiles: Set<RelayPeer>;
  permissions: RelayPermissions;
  readonly lastEnvelopeTypes: string[];
}

export interface RelayRoomDiagnostics {
  readonly ok: boolean;
  readonly error?: string;
  readonly pairingId?: string;
  readonly desktopOnline: boolean;
  readonly mobileOnlineCount: number;
  readonly hasLatestSnapshot: boolean;
  readonly recentNotificationCount: number;
  readonly permissions: RelayPermissions;
  readonly lastEnvelopeTypes: string[];
}

const DEFAULT_PERMISSIONS: Required<RelayPermissions> = {
  taskList: true,
  conversationDetails: true,
  notifications: true,
  sendMessages: true,
  stopRuns: true,
  createSessions: true,
};

export class RelayHub {
  private readonly peers = new WeakMap<RelayPeer, PeerState>();
  private readonly rooms = new Map<string, RelayRoom>();

  constructor(private readonly store: RelayStore) {}

  attachDesktop(peer: RelayPeer): void {
    this.peers.set(peer, { role: "desktop" });
  }

  attachMobile(peer: RelayPeer): void {
    this.peers.set(peer, { role: "mobile" });
  }

  disconnect(peer: RelayPeer): void {
    const state = this.peers.get(peer);
    if (!state?.tokenHash) {
      return;
    }
    const room = this.rooms.get(state.tokenHash);
    if (!room) {
      return;
    }
    if (room.desktop === peer) {
      room.desktop = undefined;
    }
    room.mobiles.delete(peer);
    if (!room.desktop && room.mobiles.size === 0) {
      this.rooms.delete(state.tokenHash);
    }
  }

  inspectPairToken(pairToken: string): RelayRoomDiagnostics {
    const pairing = this.store.verifyPairToken(pairToken);
    if (!pairing) {
      return {
        ok: false,
        error: "配对 Token 无效或已撤销。",
        desktopOnline: false,
        mobileOnlineCount: 0,
        hasLatestSnapshot: false,
        recentNotificationCount: 0,
        permissions: DEFAULT_PERMISSIONS,
        lastEnvelopeTypes: [],
      };
    }
    const room = this.rooms.get(pairing.tokenHash);
    return {
      ok: true,
      pairingId: pairing.id,
      desktopOnline: Boolean(room?.desktop),
      mobileOnlineCount: room?.mobiles.size ?? 0,
      hasLatestSnapshot: Boolean(this.store.getLatestSnapshot(pairing.id)),
      recentNotificationCount: this.store.getRecentNotifications(pairing.id).length,
      permissions: room?.permissions ?? DEFAULT_PERMISSIONS,
      lastEnvelopeTypes: [...(room?.lastEnvelopeTypes ?? [])],
    };
  }

  receive(peer: RelayPeer, envelope: RelayEnvelope): void {
    const state = this.peers.get(peer);
    if (!state) {
      return;
    }
    if (envelope.type === "desktop.hello" && state.role === "desktop") {
      this.handleDesktopHello(peer, envelope);
      return;
    }
    if (envelope.type === "mobile.hello" && state.role === "mobile") {
      this.handleMobileHello(peer, envelope);
      return;
    }

    if (!state.pairingId || !state.tokenHash) {
      this.sendAuthFailed(peer, "请先发送 hello 完成配对。");
      return;
    }

    if (state.role === "desktop") {
      this.handleDesktopEvent(peer, envelope, state);
      return;
    }

    if (state.role === "mobile") {
      this.handleMobileEvent(peer, envelope, state);
    }
  }

  private handleDesktopHello(peer: RelayPeer, envelope: RelayEnvelope): void {
    const hello = parseDesktopHello(envelope);
    if (!hello) {
      this.sendAuthFailed(peer, "desktop.hello 缺少 pairToken。");
      return;
    }
    const pairing = this.store.verifyPairToken(hello.payload.pairToken);
    if (!pairing) {
      this.sendAuthFailed(peer, "配对 Token 无效或已撤销。");
      return;
    }
    const tokenHash = pairing.tokenHash;
    const room = this.ensureRoom(pairing.id, tokenHash);
    room.desktop = peer;
    room.permissions = {
      ...DEFAULT_PERMISSIONS,
      ...hello.payload.permissions,
    };
    this.recordEnvelopeType(room, envelope.type);
    this.peers.set(peer, { role: "desktop", pairingId: pairing.id, tokenHash });
    peer.sendEnvelope({
      type: "server.ready",
      payload: {
        role: "desktop",
        pairingId: pairing.id,
      },
    });
  }

  private handleMobileHello(peer: RelayPeer, envelope: RelayEnvelope): void {
    const hello = parseMobileHello(envelope);
    if (!hello) {
      this.sendAuthFailed(peer, "mobile.hello 缺少 pairToken。");
      return;
    }
    const pairing = this.store.verifyPairToken(hello.payload.pairToken);
    if (!pairing) {
      this.sendAuthFailed(peer, "配对 Token 无效或已撤销。");
      return;
    }
    const tokenHash = pairing.tokenHash;
    const room = this.ensureRoom(pairing.id, tokenHash);
    room.mobiles.add(peer);
    this.recordEnvelopeType(room, envelope.type);
    this.peers.set(peer, { role: "mobile", pairingId: pairing.id, tokenHash });
    peer.sendEnvelope({
      type: "server.ready",
      payload: {
        role: "mobile",
        pairingId: pairing.id,
      },
    });

    const snapshot = this.store.getLatestSnapshot(pairing.id);
    if (snapshot) {
      peer.sendEnvelope({ type: "server.snapshot", payload: snapshot as unknown as JsonValue });
    }
    for (const notification of this.store.getRecentNotifications(pairing.id)) {
      peer.sendEnvelope({ type: "server.notification", payload: notification as unknown as JsonValue });
    }
  }

  private handleDesktopEvent(_peer: RelayPeer, envelope: RelayEnvelope, state: PeerState): void {
    if (!state.pairingId || !state.tokenHash) {
      return;
    }
    const room = this.rooms.get(state.tokenHash);
    if (room) {
      this.recordEnvelopeType(room, envelope.type);
    }
    if (envelope.type === "desktop.snapshot") {
      this.store.saveLatestSnapshot(state.pairingId, envelope);
    }
    if (envelope.type === "desktop.notification") {
      this.store.saveNotification(state.pairingId, envelope);
    }
    this.broadcastToMobiles(state.tokenHash, envelope);
  }

  private handleMobileEvent(peer: RelayPeer, envelope: RelayEnvelope, state: PeerState): void {
    if (envelope.type !== "mobile.command" || !state.pairingId || !state.tokenHash) {
      return;
    }
    const command = parseMobileCommand(envelope);
    if (!command) {
      peer.sendEnvelope(commandFailed("unknown", "mobile.command 缺少 commandId 或 command。"));
      return;
    }
    const room = this.rooms.get(state.tokenHash);
    if (room) {
      this.recordEnvelopeType(room, envelope.type);
    }
    if (!room?.desktop) {
      peer.sendEnvelope(commandFailed(command.commandId, "桌面端不在线"));
      return;
    }
    const permissionError = commandPermissionError(command.command, room.permissions);
    if (permissionError) {
      peer.sendEnvelope(commandFailed(command.commandId, permissionError));
      return;
    }
    if (!this.store.recordCommand(state.pairingId, command.commandId, command.command)) {
      peer.sendEnvelope(commandFailed(command.commandId, "重复 commandId 已忽略"));
      return;
    }
    room.desktop.sendEnvelope(envelope);
  }

  private ensureRoom(pairingId: string, tokenHash: string): RelayRoom {
    const existing = this.rooms.get(tokenHash);
    if (existing) {
      return existing;
    }
    const created: RelayRoom = {
      pairingId,
      tokenHash,
      mobiles: new Set(),
      permissions: DEFAULT_PERMISSIONS,
      lastEnvelopeTypes: [],
    };
    this.rooms.set(tokenHash, created);
    return created;
  }

  private recordEnvelopeType(room: RelayRoom, type: string): void {
    room.lastEnvelopeTypes.push(type);
    if (room.lastEnvelopeTypes.length > 20) {
      room.lastEnvelopeTypes.splice(0, room.lastEnvelopeTypes.length - 20);
    }
  }

  private broadcastToMobiles(tokenHash: string, envelope: RelayEnvelope): void {
    const room = this.rooms.get(tokenHash);
    if (!room) {
      return;
    }
    for (const mobile of room.mobiles) {
      mobile.sendEnvelope(envelope);
    }
  }

  private sendAuthFailed(peer: RelayPeer, message: string): void {
    peer.sendEnvelope({
      type: "server.authFailed",
      payload: { message },
    });
    peer.close();
  }
}

function parseDesktopHello(envelope: RelayEnvelope): DesktopHelloEnvelope | undefined {
  if (envelope.type !== "desktop.hello" || !isObject(envelope.payload)) {
    return undefined;
  }
  if (typeof envelope.payload.pairToken !== "string") {
    return undefined;
  }
  return envelope as DesktopHelloEnvelope;
}

function parseMobileHello(envelope: RelayEnvelope): MobileHelloEnvelope | undefined {
  if (envelope.type !== "mobile.hello" || !isObject(envelope.payload)) {
    return undefined;
  }
  if (typeof envelope.payload.pairToken !== "string") {
    return undefined;
  }
  return envelope as MobileHelloEnvelope;
}

function parseMobileCommand(envelope: RelayEnvelope): MobileCommandEnvelope | undefined {
  if (envelope.type !== "mobile.command") {
    return undefined;
  }
  const candidate = envelope as Partial<MobileCommandEnvelope>;
  if (typeof candidate.commandId !== "string" || typeof candidate.command !== "string") {
    return undefined;
  }
  return envelope as MobileCommandEnvelope;
}

function commandFailed(commandId: string, error: string): RelayEnvelope {
  return {
    type: "command.failed",
    payload: { commandId, error },
  };
}

function commandPermissionError(command: string, permissions: RelayPermissions): string | undefined {
  if (command === "command.sendMessage" && !permissions.sendMessages) {
    return "移动端没有发送消息权限";
  }
  if (command === "command.stopRun" && !permissions.stopRuns) {
    return "移动端没有停止任务权限";
  }
  if (command === "command.createSession" && !permissions.createSessions) {
    return "移动端没有新建任务权限";
  }
  if (command === "command.requestTranscript" && !permissions.conversationDetails) {
    return "移动端没有查看对话详情权限";
  }
  if ((command === "command.selectSession" || command === "command.markViewed") && !permissions.taskList) {
    return "移动端没有查看任务列表权限";
  }
  return undefined;
}
