import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PiDesktopApi } from "./ipc";
import { RefreshIcon } from "./icons";
import { loadReviewed, pruneReviewed, saveReviewed } from "./reviewed-files-store";

type InspectorTab = "changes" | "review" | "files";

interface ChangedFile {
  readonly path: string;
  readonly status: "added" | "modified" | "deleted" | "untracked";
  readonly staged: boolean;
}

export interface DiffPanelFileRequest {
  readonly path: string;
  readonly nonce: number;
}

interface DiffPanelProps {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly api: PiDesktopApi;
  readonly sessionStatus: string | undefined;
  readonly fileRequest?: DiffPanelFileRequest | null;
  readonly onSelectChangedFile: (path: string | null) => void;
}

export function DiffPanel({
  workspaceId,
  sessionId,
  api,
  sessionStatus,
  fileRequest,
  onSelectChangedFile,
}: DiffPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("changes");
  const [files, setFiles] = useState<readonly ChangedFile[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<readonly string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedWorkspaceFile, setSelectedWorkspaceFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(() =>
    loadReviewed(workspaceId, sessionId),
  );

  useEffect(() => {
    setReviewed(loadReviewed(workspaceId, sessionId));
  }, [workspaceId, sessionId]);

  const refresh = useCallback(() => {
    setLoading(true);
    void Promise.all([api.getChangedFiles(workspaceId), api.listWorkspaceFiles(workspaceId)])
      .then(([changedFiles, discoveredFiles]) => {
        setFiles(changedFiles);
        setWorkspaceFiles(discoveredFiles);
        setSelectedFile((current) =>
          current && !changedFiles.some((f) => f.path === current) ? null : current,
        );
        setSelectedWorkspaceFile((current) =>
          current && !discoveredFiles.includes(current) ? null : current,
        );
        setReviewed((current) => {
          const pruned = pruneReviewed(current, changedFiles.map((f) => f.path));
          if (pruned !== current) {
            saveReviewed(workspaceId, sessionId, pruned);
          }
          return pruned;
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [api, workspaceId, sessionId]);

  const prevStatusRef = useRef(sessionStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = sessionStatus;
    if (prev === "running" && sessionStatus !== "running") {
      refresh();
    }
  }, [sessionStatus, refresh]);

  useEffect(() => {
    refresh();
  }, [workspaceId, sessionId, refresh]);

  useEffect(() => {
    if (!fileRequest) return;
    setActiveTab("changes");
    setSelectedFile(fileRequest.path);
  }, [fileRequest]);

  useEffect(() => {
    onSelectChangedFile(selectedFile);
  }, [onSelectChangedFile, selectedFile]);

  const fileListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedFile) return;
    const row = fileListRef.current?.querySelector<HTMLElement>(
      `[data-file-path="${CSS.escape(selectedFile)}"]`,
    );
    row?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [selectedFile, files, activeTab]);

  const handleStage = (filePath: string) => {
    void api.stageFile(workspaceId, filePath).then(refresh);
  };

  const toggleReviewed = useCallback(
    (filePath: string) => {
      setReviewed((current) => {
        const next = new Set(current);
        if (next.has(filePath)) {
          next.delete(filePath);
        } else {
          next.add(filePath);
        }
        saveReviewed(workspaceId, sessionId, next);
        return next;
      });
    },
    [workspaceId, sessionId],
  );

  const reviewedCount = useMemo(
    () => files.reduce((acc, f) => acc + (reviewed.has(f.path) ? 1 : 0), 0),
    [files, reviewed],
  );

  const unreviewedFiles = useMemo(
    () => files.filter((file) => !reviewed.has(file.path)),
    [files, reviewed],
  );

  const reviewedFiles = useMemo(
    () => files.filter((file) => reviewed.has(file.path)),
    [files, reviewed],
  );

  return (
    <aside className="diff-panel">
      <div className="diff-panel__header">
        <div className="diff-panel__header-copy">
          <h2 className="diff-panel__title">检查面板</h2>
          <span className="diff-panel__subtitle">把改动、审查和文件上下文集中放在右侧边栏。</span>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={refresh}
          aria-label="刷新"
          disabled={loading}
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="diff-panel__tabs" role="tablist" aria-label="检查器页签">
        <button
          role="tab"
          aria-selected={activeTab === "changes"}
          className={`diff-panel__tab ${activeTab === "changes" ? "diff-panel__tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("changes")}
        >
          改动
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "review"}
          className={`diff-panel__tab ${activeTab === "review" ? "diff-panel__tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("review")}
        >
          审查
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "files"}
          className={`diff-panel__tab ${activeTab === "files" ? "diff-panel__tab--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("files")}
        >
          文件
        </button>
      </div>

      <div className="diff-panel__content">
        {activeTab === "changes" ? (
          files.length === 0 ? (
            <div className="diff-panel__empty">暂无改动</div>
          ) : (
            <>
              <div className="diff-panel__meta-row">
                <span className="diff-panel__counter" data-testid="diff-panel-counter">
                  {`已审查 ${reviewedCount} / ${files.length}`}
                </span>
                <span className="diff-panel__meta-secondary">{`剩余 ${files.length - reviewedCount}`}</span>
              </div>
              <div className="diff-panel__file-list" ref={fileListRef}>
                {files.map((file) => {
                  const isReviewed = reviewed.has(file.path);
                  const isSelected = selectedFile === file.path;
                  const className = [
                    "diff-panel__file",
                    isSelected ? "diff-panel__file--selected" : "",
                    isReviewed ? "diff-panel__file--reviewed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div className={className} key={file.path} data-file-path={file.path}>
                      <input
                        aria-label={`将 ${file.path} 标记为已审查`}
                        className="diff-panel__reviewed-checkbox"
                        data-testid={`diff-panel-reviewed-${file.path}`}
                        type="checkbox"
                        checked={isReviewed}
                        onChange={() => toggleReviewed(file.path)}
                      />
                      <button
                        className="diff-panel__file-name"
                        type="button"
                        onClick={() => setSelectedFile(file.path === selectedFile ? null : file.path)}
                      >
                        <span className={`diff-panel__status-dot diff-panel__status-dot--${file.status}`} />
                        <span className="diff-panel__file-path">{file.path}</span>
                      </button>
                      <button
                        className="diff-panel__stage-btn"
                        type="button"
                        onClick={() => handleStage(file.path)}
                        disabled={file.staged}
                      >
                        {file.staged ? "已暂存" : "暂存"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {selectedFile ? (
                <div className="diff-panel__empty diff-panel__empty--secondary">
                  已在中间打开 diff：{selectedFile}
                </div>
              ) : (
                <div className="diff-panel__empty diff-panel__empty--secondary">选择一个改动文件查看 diff。</div>
              )}
            </>
          )
        ) : null}

        {activeTab === "review" ? (
          <div className="diff-panel__review-view">
            <div className="diff-panel__review-summary">
              <div className="diff-panel__summary-card">
                <span className="diff-panel__summary-label">进度</span>
                <strong>{`${reviewedCount}/${files.length}`}</strong>
                <span>{files.length === 0 ? "还没有改动文件" : `还剩 ${files.length - reviewedCount} 个文件`}</span>
              </div>
              <div className="diff-panel__summary-card">
                <span className="diff-panel__summary-label">当前关注</span>
                <strong>{unreviewedFiles.length > 0 ? unreviewedFiles[0]?.path : "全部已审查"}</strong>
                <span>{unreviewedFiles.length > 0 ? "下一个待审查文件" : "可以开始下一轮检查"}</span>
              </div>
            </div>

            <div className="diff-panel__review-columns">
              <div className="diff-panel__review-column">
                <h3>待审查</h3>
                {unreviewedFiles.length === 0 ? (
                  <p className="diff-panel__empty diff-panel__empty--inline">没有待处理项。</p>
                ) : (
                  <div className="diff-panel__review-list">
                    {unreviewedFiles.map((file) => (
                      <button
                        key={file.path}
                        type="button"
                        className="diff-panel__review-item"
                        onClick={() => {
                          setActiveTab("changes");
                          setSelectedFile(file.path);
                        }}
                      >
                        <span className={`diff-panel__status-dot diff-panel__status-dot--${file.status}`} />
                        <span>{file.path}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="diff-panel__review-column">
                <h3>已审查</h3>
                {reviewedFiles.length === 0 ? (
                  <p className="diff-panel__empty diff-panel__empty--inline">还没有已审查文件。</p>
                ) : (
                  <div className="diff-panel__review-list">
                    {reviewedFiles.map((file) => (
                      <button
                        key={file.path}
                        type="button"
                        className="diff-panel__review-item diff-panel__review-item--complete"
                        onClick={() => {
                          setActiveTab("changes");
                          setSelectedFile(file.path);
                        }}
                      >
                        <span className={`diff-panel__status-dot diff-panel__status-dot--${file.status}`} />
                        <span>{file.path}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "files" ? (
          <div className="diff-panel__files-view">
            <div className="diff-panel__meta-row">
              <span className="diff-panel__counter">{`工作区文件 ${workspaceFiles.length}`}</span>
              <span className="diff-panel__meta-secondary">{`改动 ${files.length}`}</span>
            </div>
            <div className="diff-panel__workspace-file-list">
              {workspaceFiles.length === 0 ? (
                <div className="diff-panel__empty diff-panel__empty--inline">未发现文件。</div>
              ) : (
                workspaceFiles.map((filePath) => {
                  const changed = files.find((entry) => entry.path === filePath);
                  const active = selectedWorkspaceFile === filePath;
                  return (
                    <button
                      key={filePath}
                      type="button"
                      className={`diff-panel__workspace-file ${active ? "diff-panel__workspace-file--active" : ""}`}
                      onClick={() => setSelectedWorkspaceFile(filePath)}
                    >
                      <span className={`diff-panel__status-dot ${changed ? `diff-panel__status-dot--${changed.status}` : "diff-panel__status-dot--unchanged"}`} />
                      <span className="diff-panel__file-path">{filePath}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
