import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./dev-reload-hook";
import "./styles.css";
import { ErrorBoundary } from "./error-boundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Catch top-level runtime errors that React ErrorBoundary can't
window.addEventListener("error", (event) => {
  console.error("[top-level error]", event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandled rejection]", event.reason);
});
