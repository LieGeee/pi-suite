import { reactive } from 'vue'
import type {
  ConnectionStatus,
  DesktopSnapshotPayload,
  MobilePermissions,
  NotificationPayload,
  RelayEnvelope,
  TaskListItem,
  TranscriptMessage,
  TranscriptPayload,
  WorkspaceRecord,
  SessionCategoriesByWorkspace,
} from './protocol'
import { sessionKey } from './protocol'

// ---- Global reactive store ----

export interface RelayStore {
  connectionStatus: ConnectionStatus
  relayUrl: string
  pairToken: string
  selectedWorkspaceId?: string
  selectedSessionId?: string
  workspaces: WorkspaceRecord[]
  sessionCategoriesByWorkspace: SessionCategoriesByWorkspace
  permissions: MobilePermissions
  transcripts: Record<string, TranscriptMessage[]>
  notifications: NotificationPayload[]
  commandErrors: { commandId: string; error: string }[]
  lastError?: string
  revision?: number
  deviceName: string
}

function createInitialStore(): RelayStore {
  return {
    connectionStatus: 'idle',
    relayUrl: 'ws://localhost:8787/ws/mobile',
    pairToken: '',
    workspaces: [],
    sessionCategoriesByWorkspace: {},
    permissions: {
      taskList: true,
      conversationDetails: true,
      notifications: true,
      sendMessages: true,
      stopRuns: true,
      createSessions: true,
    },
    transcripts: {},
    notifications: [],
    commandErrors: [],
    deviceName: 'pi-mobile',
  }
}

export const store = reactive<RelayStore>(createInitialStore())

// ---- Computed helpers (plain functions, not Vue computed) ----

export function selectTasks(state: RelayStore): TaskListItem[] {
  const tasks: TaskListItem[] = []
  for (const workspace of state.workspaces) {
    for (const session of workspace.sessions ?? []) {
      tasks.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspacePath: workspace.path,
        sessionId: session.id,
        title: session.title || '未命名任务',
        preview: session.preview ?? '',
        status: session.status ?? 'idle',
        updatedAt: session.updatedAt ?? '',
        hasUnseenUpdate: Boolean(session.hasUnseenUpdate),
      })
    }
  }
  tasks.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return tasks
}

export function selectCurrentTask(state: RelayStore): TaskListItem | undefined {
  const tasks = selectTasks(state)
  if (state.selectedWorkspaceId && state.selectedSessionId) {
    return tasks.find(
      (t) => t.workspaceId === state.selectedWorkspaceId && t.sessionId === state.selectedSessionId
    )
  }
  return tasks[0]
}

export function selectTranscript(
  state: RelayStore,
  workspaceId?: string,
  sessionId?: string
): TranscriptMessage[] {
  if (!workspaceId || !sessionId) return []
  return state.transcripts[sessionKey(workspaceId, sessionId)] ?? []
}

// ---- Actions that mutate the store ----

function applySnapshot(payload?: DesktopSnapshotPayload) {
  if (!payload) return
  if (payload.selectedWorkspaceId !== undefined) store.selectedWorkspaceId = payload.selectedWorkspaceId
  if (payload.selectedSessionId !== undefined) store.selectedSessionId = payload.selectedSessionId
  if (payload.workspaces !== undefined) store.workspaces = payload.workspaces as WorkspaceRecord[]
  if (payload.sessionCategoriesByWorkspace !== undefined) {
    store.sessionCategoriesByWorkspace = payload.sessionCategoriesByWorkspace
  }
  if (payload.permissions) {
    Object.assign(store.permissions, payload.permissions)
  }
  if (payload.revision !== undefined) store.revision = payload.revision
}

function applyTranscript(payload?: TranscriptPayload) {
  if (!payload?.workspaceId || !payload.sessionId) return
  store.selectedWorkspaceId = payload.workspaceId
  store.selectedSessionId = payload.sessionId
  store.transcripts[sessionKey(payload.workspaceId, payload.sessionId)] = [...(payload.transcript ?? [])]
}

export function dispatchAction(envelope: RelayEnvelope) {
  switch (envelope.type) {
    case 'socket.status': {
      const s = (envelope.payload as { status?: ConnectionStatus } | undefined)?.status ?? 'idle'
      store.connectionStatus = s
      if (s === 'connected') store.lastError = undefined
      break
    }
    case 'server.ready':
      store.connectionStatus = 'connected'
      store.lastError = undefined
      break
    case 'server.snapshot': {
      const nested = envelope.payload as
        | { type?: string; payload?: DesktopSnapshotPayload }
        | undefined
      if (nested?.payload) applySnapshot(nested.payload)
      break
    }
    case 'desktop.snapshot':
      applySnapshot(envelope.payload as DesktopSnapshotPayload)
      break
    case 'desktop.transcript':
      applyTranscript(envelope.payload as TranscriptPayload)
      break
    case 'desktop.notification':
    case 'server.notification':
      store.notifications = [
        envelope.payload as NotificationPayload,
        ...store.notifications,
      ].slice(0, 50)
      break
    case 'command.failed': {
      const p = envelope.payload as { commandId?: string; error?: string } | undefined
      if (!p?.commandId || !p.error) break
      store.commandErrors = [
        { commandId: p.commandId, error: p.error },
        ...store.commandErrors,
      ].slice(0, 20)
      store.lastError = p.error
      break
    }
    case 'server.authFailed': {
      const p = envelope.payload as { message?: string } | undefined
      store.connectionStatus = 'auth-failed'
      store.lastError = p?.message ?? '配对鉴权失败'
      break
    }
  }
}

// ---- WebSocket management ----

let socketTask: UniApp.SocketTask | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let currentConnectionKey = ''
const RECONNECT_DELAY = 3000
const HEARTBEAT_INTERVAL = 30000

function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function startHeartbeat() {
  clearTimers()
  heartbeatTimer = setInterval(() => {
    sendRaw(JSON.stringify({ type: 'mobile.heartbeat', payload: { timestamp: new Date().toISOString() } }))
  }, HEARTBEAT_INTERVAL)
}

function sendRaw(data: string) {
  if (!socketTask) return
  try {
    socketTask.send({ data })
  } catch {
    // ignore
  }
}

function createCommandId(): string {
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function sendCommand(command: string, payload: unknown): string | undefined {
  if (!socketTask || store.connectionStatus !== 'connected') return undefined
  const commandId = createCommandId()
  const envelope = { type: 'mobile.command', commandId, command, payload }
  sendRaw(JSON.stringify(envelope))
  return commandId
}

export function connect(url: string, token: string, deviceName?: string) {
  const key = `${url}\n${token}`
  if (key === currentConnectionKey && store.connectionStatus === 'connected') return
  // Close existing before recording the new connection key.
  disconnect()
  currentConnectionKey = key

  store.relayUrl = url
  store.pairToken = token
  store.connectionStatus = 'connecting'

  socketTask = uni.connectSocket({
    url,
    success() {
      // Socket connecting
    },
    fail(err) {
      store.connectionStatus = 'disconnected'
      store.lastError = `连接失败: ${err.errMsg ?? JSON.stringify(err)}`
      scheduleReconnect(url, token, deviceName)
    },
  })

  socketTask.onOpen(() => {
    store.connectionStatus = 'connected'
    store.lastError = undefined
    startHeartbeat()
    sendRaw(
      JSON.stringify({
        type: 'mobile.hello',
        payload: {
          pairToken: token,
          deviceName: deviceName ?? 'pi-mobile',
        },
      })
    )
  })

  socketTask.onMessage((res) => {
    try {
      const envelope = JSON.parse(typeof res.data === 'string' ? res.data : String(res.data)) as RelayEnvelope
      dispatchAction(envelope)
    } catch {
      // ignore parse errors
    }
  })

  socketTask.onError(() => {
    store.connectionStatus = 'disconnected'
    scheduleReconnect(url, token, deviceName)
  })

  socketTask.onClose(() => {
    clearTimers()
    if (store.connectionStatus !== 'auth-failed') {
      store.connectionStatus = 'disconnected'
      scheduleReconnect(url, token, deviceName)
    }
  })
}

export function disconnect() {
  clearTimers()
  if (socketTask) {
    try {
      socketTask.close({ code: 1000, reason: 'user disconnect' })
    } catch {
      // ignore
    }
    socketTask = null
  }
  currentConnectionKey = ''
  store.connectionStatus = 'idle'
}

function scheduleReconnect(url: string, token: string, deviceName?: string) {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (currentConnectionKey && store.connectionStatus !== 'auth-failed') {
      connect(url, token, deviceName)
    }
  }, RECONNECT_DELAY)
}

export function reconnect() {
  const url = store.relayUrl
  const token = store.pairToken
  if (!url || !token) return
  disconnect()
  connect(url, token, store.deviceName)
}

// ---- Command helpers ----

export function requestTranscript(workspaceId: string, sessionId: string) {
  return sendCommand('command.requestTranscript', { workspaceId, sessionId })
}

export function sendMessage(workspaceId: string, sessionId: string, text: string) {
  return sendCommand('command.sendMessage', { workspaceId, sessionId, text })
}

export function stopRun(workspaceId: string, sessionId: string) {
  return sendCommand('command.stopRun', { workspaceId, sessionId })
}

export function createSession(workspaceId: string, title?: string, prompt?: string) {
  return sendCommand('command.createSession', { workspaceId, title, prompt })
}

export function selectTask(workspaceId: string, sessionId: string) {
  return sendCommand('command.selectSession', { workspaceId, sessionId })
}

export function clearMobileActivity() {
  store.notifications = []
  store.commandErrors = []
}

// ---- Persistence helpers ----

const STORAGE_RELAY_URL = 'pi-mobile.relayUrl'
const STORAGE_PAIR_TOKEN = 'pi-mobile.pairToken'
const STORAGE_DEVICE_NAME = 'pi-mobile.deviceName'

export function loadSettings() {
  try {
    const url = uni.getStorageSync(STORAGE_RELAY_URL)
    const token = uni.getStorageSync(STORAGE_PAIR_TOKEN)
    const name = uni.getStorageSync(STORAGE_DEVICE_NAME)
    if (url) store.relayUrl = url
    if (token) store.pairToken = token
    if (name) store.deviceName = name
  } catch {
    // ignore
  }
}

export function connectSavedSettings(): boolean {
  if (!store.relayUrl || !store.pairToken) return false
  connect(store.relayUrl, store.pairToken, store.deviceName)
  return true
}

export function saveSettings(url: string, token: string, deviceName?: string) {
  try {
    uni.setStorageSync(STORAGE_RELAY_URL, url)
    uni.setStorageSync(STORAGE_PAIR_TOKEN, token)
    if (deviceName) uni.setStorageSync(STORAGE_DEVICE_NAME, deviceName)
  } catch {
    // ignore
  }
}
