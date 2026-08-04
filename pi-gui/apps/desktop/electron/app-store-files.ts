import { execFile } from "node:child_process";

const fileCache = new Map<string, { files: string[]; timestamp: number }>();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 20;
const DEFAULT_WORKSPACE_FILE_LIMIT = 2_000;

export function listWorkspaceFiles(workspacePath: string, limit = DEFAULT_WORKSPACE_FILE_LIMIT): Promise<string[]> {
  const cached = fileCache.get(workspacePath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.files);
  }

  return new Promise((resolve) => {
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: workspacePath, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        const files = limitWorkspaceFilesForRenderer(stdout.split("\n"), limit);
        if (fileCache.size >= CACHE_MAX_ENTRIES) {
          const oldest = fileCache.keys().next().value;
          if (oldest !== undefined) {
            fileCache.delete(oldest);
          }
        }
        fileCache.set(workspacePath, { files, timestamp: Date.now() });
        resolve(files);
      },
    );
  });
}

export function limitWorkspaceFilesForRenderer(files: readonly string[], limit = DEFAULT_WORKSPACE_FILE_LIMIT): string[] {
  return files
    .map((line) => line.trim())
    .filter(Boolean)
    .sort()
    .slice(0, Math.max(0, limit));
}
