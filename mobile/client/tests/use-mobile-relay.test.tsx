import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileRelay } from "../src/use-mobile-relay";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe("useMobileRelay", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to relay and sends mobile hello", async () => {
    const { result } = renderHook(() => useMobileRelay({
      enabled: true,
      relayUrl: "ws://relay.test/ws/mobile",
      pairToken: "pi_pair",
      deviceName: "Test Phone",
    }));

    expect(FakeWebSocket.instances[0]?.url).toBe("ws://relay.test/ws/mobile");
    act(() => FakeWebSocket.instances[0]?.open());

    await waitFor(() => expect(result.current.state.connectionStatus).toBe("connected"));
    expect(JSON.parse(FakeWebSocket.instances[0]!.sent[0]!)).toEqual({
      type: "mobile.hello",
      payload: {
        pairToken: "pi_pair",
        deviceName: "Test Phone",
      },
    });
  });

  it("dispatches relay snapshots and sends command helpers", async () => {
    const { result } = renderHook(() => useMobileRelay({
      enabled: true,
      relayUrl: "ws://relay.test/ws/mobile",
      pairToken: "pi_pair",
      deviceName: "Test Phone",
    }));
    act(() => FakeWebSocket.instances[0]?.open());
    act(() => FakeWebSocket.instances[0]?.receive({
      type: "desktop.snapshot",
      payload: {
        workspaces: [{
          id: "w1",
          name: "工作区",
          sessions: [{ id: "s1", title: "手机任务", status: "idle", updatedAt: "2026-07-02T00:00:00Z" }],
        }],
      },
    }));

    await waitFor(() => expect(result.current.tasks[0]?.title).toBe("手机任务"));

    act(() => result.current.commands.sendMessage({ workspaceId: "w1", sessionId: "s1", text: "继续" }));
    const command = JSON.parse(FakeWebSocket.instances[0]!.sent.at(-1)!);
    expect(command.type).toBe("mobile.command");
    expect(command.command).toBe("command.sendMessage");
    expect(command.payload.text).toBe("继续");
  });
});
