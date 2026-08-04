export const TERMINAL_REPLAY_BUFFER_LENGTH = 1_000_000;

export interface TerminalReplayUpdate {
  readonly replay: string;
  readonly truncated: boolean;
}

export function appendTerminalReplay(
  replay: string,
  data: string,
  alreadyTruncated = false,
): TerminalReplayUpdate {
  const nextReplay = replay + data;
  if (nextReplay.length <= TERMINAL_REPLAY_BUFFER_LENGTH) {
    return { replay: nextReplay, truncated: alreadyTruncated };
  }

  return {
    replay: nextReplay.slice(-TERMINAL_REPLAY_BUFFER_LENGTH),
    truncated: true,
  };
}

export function appendTerminalReplayChunks(
  replay: string,
  chunks: readonly string[],
  alreadyTruncated = false,
): TerminalReplayUpdate {
  if (chunks.length === 0) {
    return { replay, truncated: alreadyTruncated };
  }
  return appendTerminalReplay(replay, chunks.join(""), alreadyTruncated);
}
