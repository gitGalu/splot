import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { QuickCaptureApp } from "./QuickCaptureApp";
import { isMac } from "../../services/keyLabel";
import { reloadSettings, watchThemeClass } from "../../services/settings";
import "../../styles/tokens.css";
import "./quickcapture.css";

document.documentElement.classList.add(isMac ? "platform-mac" : "platform-other");

// Follow Splot's theme (system / light / dark). The setting lives in the
// shared localStorage; watchThemeClass applies it now and on any change made
// within this window.
watchThemeClass();

// The theme can also change in the main window while this one is hidden. Each
// webview has its own JS context, so re-read the shared settings whenever we
// regain focus — reloadSettings emits, and the theme watcher re-applies.
void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (focused) reloadSettings();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuickCaptureApp />
  </React.StrictMode>,
);
