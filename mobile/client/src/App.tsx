import { useEffect, useMemo, useState } from "react";
import { useMobileRelay } from "./use-mobile-relay";
import type { MobilePermissions, TaskListItem, TranscriptMessage } from "./protocol";
import { selectTranscript } from "./mobile-state";
import "./styles.css";

const RELAY_URL_KEY = "pi-mobile-client.relayUrl";
const PAIR_TOKEN_KEY = "pi-mobile-client.pairToken";

export default function App() {
  const [relayUrl, setRelayUrl] = useState(() => localStorage.getItem(RELAY_URL_KEY) ?? "");
  const [pairToken, setPairToken] = useState(() => localStorage.getItem(PAIR_TOKEN_KEY) ?? "");
  const [enabled, setEnabled] = useState(() => Boolean(localStorage.getItem(RELAY_URL_KEY) && localStorage.getItem(PAIR_TOKEN_KEY)));
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [composerText, setComposerText] = useState("");
  const relay = useMobileRelay({
    enabled,
    relayUrl,
    pairToken,
    deviceName: "Mobile Web",
  });

  const selectedTask = useMemo(
    () => taskByKey(relay.tasks, selectedKey) ?? relay.currentTask,
    [relay.currentTask, relay.tasks, selectedKey],
  );
  const transcript = useMemo(
    () => selectTranscript(relay.state, selectedTask?.workspaceId, selectedTask?.sessionId),
    [relay.state, selectedTask?.sessionId, selectedTask?.workspaceId],
  );

  useEffect(() => {
    if (!selectedKey && relay.currentTask) {
      setSelectedKey(`${relay.currentTask.workspaceId}:${relay.currentTask.sessionId}`);
    }
  }, [relay.currentTask, selectedKey]);

  const connect = () => {
    const normalizedUrl = relayUrl.trim();
    const normalizedToken = pairToken.trim();
    setRelayUrl(normalizedUrl);
    setPairToken(normalizedToken);
    localStorage.setItem(RELAY_URL_KEY, normalizedUrl);
    localStorage.setItem(PAIR_TOKEN_KEY, normalizedToken);
    setEnabled(Boolean(normalizedUrl && normalizedToken));
    relay.commands.reconnect();
  };

  const sendMessage = () => {
    if (!selectedTask || !composerText.trim()) {
      return;
    }
    relay.commands.sendMessage({
      workspaceId: selectedTask.workspaceId,
      sessionId: selectedTask.sessionId,
      text: composerText.trim(),
    });
    setComposerText("");
  };

  const requestTranscript = () => {
    if (!selectedTask) {
      return;
    }
    relay.commands.requestTranscript({
      workspaceId: selectedTask.workspaceId,
      sessionId: selectedTask.sessionId,
    });
  };

  const stopRun = () => {
    if (!selectedTask) {
      return;
    }
    relay.commands.stopRun({
      workspaceId: selectedTask.workspaceId,
      sessionId: selectedTask.sessionId,
    });
  };

  return (
    <main className="mobile-shell">
      <section className="connect-panel" aria-label="连接设置">
        <div className="connect-panel__title-row">
          <div>
            <p className="eyebrow">pi-gui</p>
            <h1>移动端</h1>
          </div>
          <span className={`status-pill status-pill--${relay.state.connectionStatus}`}>
            {labelForStatus(relay.state.connectionStatus)}
          </span>
        </div>
        <label className="field">
          <span>服务器地址</span>
          <input
            aria-label="服务器地址"
            inputMode="url"
            placeholder="ws://server:8787/ws/mobile"
            value={relayUrl}
            onChange={(event) => setRelayUrl(event.target.value)}
          />
        </label>
        <label className="field">
          <span>配对 Token</span>
          <input
            aria-label="配对 Token"
            placeholder="pi_xxx"
            value={pairToken}
            onChange={(event) => setPairToken(event.target.value)}
          />
        </label>
        <div className="connect-panel__actions">
          <button className="primary-button" type="button" onClick={connect}>
            连接
          </button>
          <button className="secondary-button" type="button" onClick={() => relay.commands.reconnect()} disabled={!enabled}>
            重连
          </button>
        </div>
      </section>

      <NotificationStrip errors={relay.state.commandErrors} notifications={relay.state.notifications} lastError={relay.state.lastError} />

      <section className="workspace-grid">
        <TaskList
          tasks={relay.tasks}
          selectedTask={selectedTask}
          onSelect={(task) => {
            setSelectedKey(`${task.workspaceId}:${task.sessionId}`);
            relay.commands.selectTask({ workspaceId: task.workspaceId, sessionId: task.sessionId });
          }}
        />
        <ConversationDetail
          composerText={composerText}
          permissions={relay.state.permissions}
          selectedTask={selectedTask}
          transcript={transcript}
          onComposerTextChange={setComposerText}
          onRequestTranscript={requestTranscript}
          onSendMessage={sendMessage}
          onStopRun={stopRun}
        />
      </section>
    </main>
  );
}

function TaskList({
  tasks,
  selectedTask,
  onSelect,
}: {
  readonly tasks: readonly TaskListItem[];
  readonly selectedTask?: TaskListItem;
  readonly onSelect: (task: TaskListItem) => void;
}) {
  return (
    <section className="task-list" aria-label="任务列表">
      <div className="section-heading">
        <h2>任务</h2>
        <span>{tasks.length}</span>
      </div>
      {tasks.length === 0 ? <p className="empty-text">连接后会显示桌面端任务。</p> : null}
      <div className="task-list__items">
        {tasks.map((task) => {
          const selected = selectedTask?.workspaceId === task.workspaceId && selectedTask.sessionId === task.sessionId;
          return (
            <button
              key={`${task.workspaceId}:${task.sessionId}`}
              className={`task-row${selected ? " task-row--active" : ""}`}
              type="button"
              onClick={() => onSelect(task)}
            >
              <span className="task-row__topline">
                <span className="task-row__title">{task.title}</span>
                <span className={`task-status task-status--${task.status}`}>{labelForTaskStatus(task.status)}</span>
              </span>
              <span className="task-row__workspace">{task.workspaceName}</span>
              <span className="task-row__preview">{task.preview || "暂无预览"}</span>
              {task.hasUnseenUpdate ? <span className="task-row__unread">未读更新</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ConversationDetail({
  composerText,
  permissions,
  selectedTask,
  transcript,
  onComposerTextChange,
  onRequestTranscript,
  onSendMessage,
  onStopRun,
}: {
  readonly composerText: string;
  readonly permissions: MobilePermissions;
  readonly selectedTask?: TaskListItem;
  readonly transcript: readonly TranscriptMessage[];
  readonly onComposerTextChange: (text: string) => void;
  readonly onRequestTranscript: () => void;
  readonly onSendMessage: () => void;
  readonly onStopRun: () => void;
}) {
  return (
    <section className="conversation-detail" aria-label="对话详情">
      <div className="section-heading section-heading--detail">
        <div>
          <h2>{selectedTask?.title ?? "对话"}</h2>
          <p>{selectedTask ? `${selectedTask.workspaceName} · ${labelForTaskStatus(selectedTask.status)}` : "选择一个任务查看详情"}</p>
        </div>
        <div className="detail-actions">
          <button className="secondary-button" type="button" onClick={onRequestTranscript} disabled={!selectedTask || !permissions.conversationDetails}>
            请求详情
          </button>
          <button className="danger-button" type="button" onClick={onStopRun} disabled={!selectedTask || !permissions.stopRuns}>
            停止
          </button>
        </div>
      </div>
      <div className="message-list">
        {transcript.length === 0 ? <p className="empty-text">点击“请求详情”同步当前对话。</p> : null}
        {transcript.map((message, index) => (
          <article key={message.id ?? index} className={`message message--${message.role ?? "event"}`}>
            <span className="message__role">{labelForMessageRole(message.role, message.kind)}</span>
            <p>{message.text ?? message.title ?? message.status ?? "状态更新"}</p>
          </article>
        ))}
      </div>
      <div className="composer-bar">
        <label className="composer-field">
          <span>继续对话</span>
          <textarea
            aria-label="继续对话"
            placeholder={permissions.sendMessages ? "输入要发送给桌面端的消息" : "桌面端未授权手机发送消息"}
            value={composerText}
            onChange={(event) => onComposerTextChange(event.target.value)}
            disabled={!permissions.sendMessages}
          />
        </label>
        <button className="primary-button" type="button" onClick={onSendMessage} disabled={!selectedTask || !composerText.trim() || !permissions.sendMessages}>
          发送
        </button>
      </div>
    </section>
  );
}

function NotificationStrip({
  errors,
  lastError,
  notifications,
}: {
  readonly errors: readonly { readonly error: string }[];
  readonly lastError?: string;
  readonly notifications: readonly { readonly title?: string; readonly body?: string }[];
}) {
  const latestError = errors[0]?.error ?? lastError;
  const latestNotification = notifications[0];
  if (!latestError && !latestNotification) {
    return null;
  }
  return (
    <section className="notice-strip" aria-label="通知">
      {latestError ? <p className="notice-strip__error">{latestError}</p> : null}
      {latestNotification ? <p>{latestNotification.title ?? "通知"}{latestNotification.body ? `：${latestNotification.body}` : ""}</p> : null}
    </section>
  );
}

function taskByKey(tasks: readonly TaskListItem[], key?: string): TaskListItem | undefined {
  if (!key) {
    return undefined;
  }
  return tasks.find((task) => `${task.workspaceId}:${task.sessionId}` === key);
}

function labelForStatus(status: string): string {
  switch (status) {
    case "connecting":
      return "连接中";
    case "connected":
      return "已连接";
    case "disconnected":
      return "已断开";
    case "auth-failed":
      return "鉴权失败";
    default:
      return "未连接";
  }
}

function labelForTaskStatus(status: string): string {
  switch (status) {
    case "running":
      return "运行中";
    case "failed":
      return "失败";
    default:
      return "空闲";
  }
}

function labelForMessageRole(role?: string, kind?: string): string {
  if (role === "user") {
    return "我";
  }
  if (role === "assistant") {
    return "pi";
  }
  return kind === "tool" ? "工具" : "状态";
}
