// Must be the very first import — patches window.__TAURI_INTERNALS__
// when running in a browser (outside of Tauri) so the UI can render.
import "./lib/initMocks";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // StrictMode disabled: double mount/unmount causes PTY handle corruption
  // and terminal resource leaks during view transitions. Re-enable after
  // fixing cleanup in useTerminal and Monaco editor lifecycle.
  <App />,
);
