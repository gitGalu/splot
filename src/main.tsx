import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { isMac } from "./services/keyLabel";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

// Tag the document so CSS can branch on platform. On macOS we draw our own
// overlay titlebar area; on Windows/Linux the OS draws a native title bar, so
// we hide the placeholder spacing our macOS layout leaves for it.
document.documentElement.classList.add(isMac ? "platform-mac" : "platform-other");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
