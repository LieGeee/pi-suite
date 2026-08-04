export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface RelayEnvelope<TPayload = unknown> {
  readonly type: string;
  readonly payload?: TPayload;
  readonly [key: string]: unknown;
}

export interface DesktopHelloEnvelope extends RelayEnvelope {
  readonly type: "desktop.hello";
  readonly payload: {
    readonly version: number;
    readonly pairToken: string;
    readonly permissions?: RelayPermissions;
    readonly desktopTime?: string;
  };
}

export interface MobileHelloEnvelope extends RelayEnvelope {
  readonly type: "mobile.hello";
  readonly payload: {
    readonly pairToken: string;
    readonly deviceName?: string;
  };
}

export interface RelayPermissions {
  readonly taskList?: boolean;
  readonly conversationDetails?: boolean;
  readonly notifications?: boolean;
  readonly sendMessages?: boolean;
  readonly stopRuns?: boolean;
  readonly createSessions?: boolean;
}

export interface MobileCommandEnvelope extends RelayEnvelope {
  readonly type: "mobile.command";
  readonly commandId: string;
  readonly command: string;
  readonly payload?: JsonValue;
}

export interface CommandResultEnvelope extends RelayEnvelope {
  readonly type: "command.completed" | "command.failed";
  readonly payload: {
    readonly commandId: string;
    readonly error?: string;
  };
}

export type RelayStoredEnvelope = RelayEnvelope;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonEnvelope(raw: string): RelayEnvelope | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || typeof parsed.type !== "string") {
      return undefined;
    }
    return parsed as unknown as RelayEnvelope;
  } catch {
    return undefined;
  }
}
