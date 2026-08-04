import { useCallback, useRef, useState } from "react";

interface WebPreviewProps {
  readonly onClose: () => void;
}

export function WebPreview({ onClose }: WebPreviewProps) {
  const [url, setUrl] = useState("https://");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [navHistory, setNavHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const navigate = useCallback((targetUrl: string) => {
    let normalized = targetUrl.trim();
    if (!normalized) return;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    setUrl(normalized);
    setLoadedUrl("");
    setIsLoading(true);
    setNavHistory((prev) => (prev[prev.length - 1] !== normalized ? [...prev, normalized] : prev));
    // Use setTimeout to reset the iframe and trigger a fresh load
    setTimeout(() => {
      setLoadedUrl(normalized);
    }, 50);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        navigate(url);
      }
    },
    [navigate, url],
  );

  const goBack = useCallback(() => {
    if (navHistory.length < 2) return;
    const prev = navHistory[navHistory.length - 2] as string;
    setNavHistory((h) => h.slice(0, -1));
    setUrl(prev);
    setIsLoading(true);
    setLoadedUrl("");
    setTimeout(() => setLoadedUrl(prev), 50);
  }, [navHistory]);

  const openExternal = useCallback(() => {
    if (loadedUrl) {
      window.open(loadedUrl, "_blank");
    }
  }, [loadedUrl]);

  return (
    <div className="web-preview">
      <div className="web-preview__toolbar">
        <button
          className="icon-button web-preview__nav-btn"
          type="button"
          disabled={navHistory.length < 2}
          onClick={goBack}
          aria-label="后退"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" width="16" height="16">
            <path d="m12 5-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        </button>
        <div className="web-preview__url-bar">
          <span className="web-preview__url-icon">
            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" width="14" height="14">
              <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3.5 10h13M10 3.5A11.5 11.5 0 0 1 13.5 10 11.5 11.5 0 0 1 10 16.5 11.5 11.5 0 0 1 6.5 10 11.5 11.5 0 0 1 10 3.5z" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </span>
          <input
            ref={inputRef}
            className="web-preview__url-input"
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入网址并按回车访问…"
          />
          {isLoading ? <span className="web-preview__spinner" /> : null}
        </div>
        <button
          className="icon-button web-preview__action-btn"
          type="button"
          onClick={openExternal}
          aria-label="在浏览器中打开"
          title="在系统浏览器中打开"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" width="16" height="16">
            <path d="M4 16 16 4M10 3.5h6.5V10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          className="icon-button web-preview__close-btn"
          type="button"
          onClick={onClose}
          aria-label="关闭预览"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" width="16" height="16">
            <path d="m6 6 8 8M14 6l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div className="web-preview__viewport">
        {loadedUrl ? (
          <iframe
            key={loadedUrl}
            className="web-preview__iframe"
            src={loadedUrl}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            onLoad={handleIframeLoad}
            title="网页预览"
          />
        ) : (
          <div className="web-preview__empty">
            <div className="web-preview__empty-icon">
              <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" width="32" height="32">
                <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M3.5 10h13M10 3.5A11.5 11.5 0 0 1 13.5 10 11.5 11.5 0 0 1 10 16.5 11.5 11.5 0 0 1 6.5 10 11.5 11.5 0 0 1 10 3.5z" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </div>
            <h3 className="web-preview__empty-title">网页预览</h3>
            <p className="web-preview__empty-desc">输入网址后按回车，pi 将在此加载网页。</p>
          </div>
        )}
      </div>
    </div>
  );
}
