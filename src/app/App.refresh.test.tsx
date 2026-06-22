/**
 * Integration tests for the "an action refreshes the file tree" contract.
 *
 * These guard the regression class the user hit: a mutation happens but the
 * sidebar tree doesn't reload. We render the real <App/> against a faked Tauri
 * `invoke`, drive an action, and assert the backend was asked to re-list the
 * workspace (`cmd_list_workspace`) afterwards.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";

// ── Fakes for the Tauri boundary ───────────────────────────────────────────

type InvokeArgs = Record<string, unknown> | undefined;
const invokeCalls: Array<{ cmd: string; args: InvokeArgs }> = [];
const listenHandlers: Record<string, (e: { payload: unknown }) => void> = {};

// When > 0, the next N calls to the startup-list commands reject with the
// retryable `NotInitialized` error, simulating the backend's pre-init window.
let pendingInitRejections = 0;

function fakeInvoke(cmd: string, args?: InvokeArgs): Promise<unknown> {
  invokeCalls.push({ cmd, args });
  if (
    pendingInitRejections > 0 &&
    (cmd === "cmd_list_workspaces" || cmd === "cmd_list_workspace")
  ) {
    pendingInitRejections--;
    return Promise.reject({ kind: "NotInitialized" });
  }
  switch (cmd) {
    case "cmd_workspace_info":
      return Promise.resolve({ name: "Test", root: "/ws" });
    case "cmd_list_workspace":
      return Promise.resolve([
        { kind: "file", name: "note.md", path: "note.md", extension: "md", size: 4 },
      ]);
    case "cmd_list_workspaces":
      return Promise.resolve({ active: "/ws", workspaces: [{ name: "Test", path: "/ws" }] });
    case "cmd_read_file":
      return Promise.resolve("file body");
    case "cmd_create_entry":
      return Promise.resolve({ path: "new.md", kind: "file" });
    case "cmd_trash_entry":
      return Promise.resolve(".trash/note.md");
    case "cmd_move_entry":
      return Promise.resolve("sub/note.md");
    case "cmd_rename_entry":
      return Promise.resolve("renamed.md");
    default:
      return Promise.resolve(undefined);
  }
}

function countCmd(cmd: string): number {
  return invokeCalls.filter((c) => c.cmd === cmd).length;
}

// Mock the Tauri modules App and its services import. vi.mock is hoisted above
// the imports below, so these are in place before <App/> loads.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: InvokeArgs) => fakeInvoke(cmd, args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (event: string, handler: (e: { payload: unknown }) => void) => {
    listenHandlers[event] = handler;
    return () => {
      delete listenHandlers[event];
    };
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: async () => true,
  open: async () => null,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: async () => {},
}));

import { App } from "./App";

beforeEach(() => {
  invokeCalls.length = 0;
  pendingInitRejections = 0;
  for (const k of Object.keys(listenHandlers)) delete listenHandlers[k];
});

describe("file tree refresh", () => {
  test("lists the workspace on mount", async () => {
    render(React.createElement(App));
    await waitFor(() => expect(countCmd("cmd_list_workspace")).toBeGreaterThanOrEqual(1));
  });

  test("retries the startup load while the backend reports NotInitialized", async () => {
    // Reproduce the Windows-after-update race: the webview calls workspace
    // commands before the backend's `setup` has filled in the managed state, so
    // the first calls reject with the retryable `NotInitialized` error. The app
    // should keep retrying and recover once the backend is ready — not surface
    // an error to the user.
    pendingInitRejections = 4; // a couple of rejections on each startup command

    render(React.createElement(App));

    // Despite the early NotInitialized rejections, the workspace eventually
    // lists successfully — the retry backed off and re-called until the fake
    // backend stopped rejecting.
    await waitFor(
      () => {
        expect(pendingInitRejections).toBe(0);
        const ok = invokeCalls.filter((c) => c.cmd === "cmd_list_workspace").length;
        // At least one rejected call + one that succeeded.
        expect(ok).toBeGreaterThanOrEqual(2);
      },
      { timeout: 2000 },
    );
  });

  test("workspace:changed event triggers a tree refresh", async () => {
    render(React.createElement(App));
    // Wait for the listener to register and the initial list to settle.
    await waitFor(() => expect(listenHandlers["workspace:changed"]).toBeTypeOf("function"));
    const before = countCmd("cmd_list_workspace");

    // Simulate the backend directory watcher firing (Quick Capture wrote a new
    // Inbox.md, or a file changed on disk).
    listenHandlers["workspace:changed"]({ payload: undefined });

    // The handler debounces ~150ms before re-listing.
    await waitFor(() => expect(countCmd("cmd_list_workspace")).toBeGreaterThan(before), {
      timeout: 1000,
    });
  });
});
