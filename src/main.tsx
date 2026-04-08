// Must be the very first import — patches window.__TAURI_INTERNALS__
// when running in a browser (outside of Tauri) so the UI can render.
import "./lib/initMocks";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// TODO(IMPROVE-025): Re-enable React.StrictMode after verifying that
// useTerminal cleanup handles double mount/unmount correctly and Monaco
// editor lifecycle doesn't leak resources. StrictMode is currently disabled
// because double mount/unmount causes PTY handle corruption and terminal
// resource leaks during view transitions.
// See: https://react.dev/reference/react/StrictMode
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
