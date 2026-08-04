import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

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

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to relay, renders tasks, loads transcript, and sends commands", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("服务器地址"), { target: { value: "ws://relay.test/ws/mobile" } });
    fireEvent.change(screen.getByLabelText("配对 Token"), { target: { value: "pi_pair" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));

    expect(FakeWebSocket.instances[0]?.url).toBe("ws://relay.test/ws/mobile");
    act(() => FakeWebSocket.instances[0]?.open());
    await waitFor(() => expect(screen.getByText("已连接")).toBeInTheDocument());

    act(() => FakeWebSocket.instances[0]?.receive({
      type: "desktop.snapshot",
      payload: {
        permissions: { sendMessages: true, stopRuns: true, createSessions: true },
        workspaces: [{
          id: "w1",
          name: "工作区",
          path: "S:/repo",
          sessions: [{
            id: "s1",
            title: "手机任务",
            preview: "等待处理",
            status: "running",
            updatedAt: "2026-07-02T00:00:00Z",
            hasUnseenUpdate: true,
          }],
        }],
      },
    }));

    await waitFor(() => expect(screen.getByRole("button", { name: /手机任务/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /手机任务/ }));
    fireEvent.click(screen.getByRole("button", { name: "请求详情" }));
    expect(JSON.parse(FakeWebSocket.instances[0]!.sent.at(-1)!)).toMatchObject({
      type: "mobile.command",
      command: "command.requestTranscript",
      payload: { workspaceId: "w1", sessionId: "s1" },
    });

    act(() => FakeWebSocket.instances[0]?.receive({
      type: "desktop.transcript",
      payload: {
        workspaceId: "w1",
        sessionId: "s1",
        transcript: [
          { kind: "message", id: "m1", role: "user", text: "继续优化" },
          { kind: "message", id: "m2", role: "assistant", text: "已继续" },
        ],
      },
    }));
    await waitFor(() => expect(screen.getByText("已继续")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("继续对话"), { target: { value: "手机端追问" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(JSON.parse(FakeWebSocket.instances[0]!.sent.at(-1)!)).toMatchObject({
      type: "mobile.command",
      command: "command.sendMessage",
      payload: { workspaceId: "w1", sessionId: "s1", text: "手机端追问" },
    });

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(JSON.parse(FakeWebSocket.instances[0]!.sent.at(-1)!)).toMatchObject({
      type: "mobile.command",
      command: "command.stopRun",
      payload: { workspaceId: "w1", sessionId: "s1" },
    });
  });
});
