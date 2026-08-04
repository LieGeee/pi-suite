import { spawn, type ChildProcess } from "node:child_process";

const EXIT_STDIO_GRACE_MS = 3000;

export function buildWindowsTaskkillArgs(pid: number): string[] {
  return ["/F", "/T", "/PID", String(pid)];
}

export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      const killer = spawn("taskkill", buildWindowsTaskkillArgs(pid), {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      });
      killer.once("error", () => {});
      killer.unref();
    } catch {
      // The process may already have exited.
    }
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process may already have exited.
    }
  }
}

export function waitForChildProcess(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exited = false;
    let exitCode: number | null = null;
    let postExitTimer: NodeJS.Timeout | undefined;
    let stdoutEnded = child.stdout === null;
    let stderrEnded = child.stderr === null;

    const cleanup = () => {
      if (postExitTimer) clearTimeout(postExitTimer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout?.removeListener("end", onStdoutEnd);
      child.stderr?.removeListener("end", onStderrEnd);
      child.stdout?.removeListener("error", onStreamError);
      child.stderr?.removeListener("error", onStreamError);
    };

    const finalize = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(code ?? 1);
    };

    const maybeFinalizeAfterExit = () => {
      if (exited && stdoutEnded && stderrEnded) finalize(exitCode);
    };
    const onStdoutEnd = () => {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    };
    const onStderrEnd = () => {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };
    // A pipe error (e.g. EPIPE after the child is killed) must not become an
    // unhandled 'error' event that crashes the parent. Treat it as the end of
    // that stream; the child exit path settles the promise.
    // Only child-level 'error' (spawn failure, ENOENT) should reject the promise.
    const onStreamError = (error: Error) => {
      if (settled) return;
      if (child.stdout?.destroyed !== true) child.stdout?.destroy();
      if (child.stderr?.destroyed !== true) child.stderr?.destroy();
      stdoutEnded = true;
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null) => {
      exited = true;
      exitCode = code;
      maybeFinalizeAfterExit();
      if (!settled) postExitTimer = setTimeout(() => finalize(code), EXIT_STDIO_GRACE_MS);
    };
    const onClose = (code: number | null) => finalize(code);

    child.stdout?.once("end", onStdoutEnd);
    child.stderr?.once("end", onStderrEnd);
    child.stdout?.once("error", onStreamError);
    child.stderr?.once("error", onStreamError);
    child.once("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);
  });
}
