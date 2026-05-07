import type { CommandBridge } from "./bridge";
import { tauriBridge } from "./bridge";
import type {
  ContentHit,
  FileContent,
  WorkspaceEntry,
  WorkspaceNode,
  WorkspaceRef,
  WorkspaceRegistry,
  WorkspaceTree,
} from "../types/workspace";

/**
 * Abstracts how the app obtains a workspace and its files. The MVP has a
 * single Tauri-backed implementation, but the interface is designed so that
 * future providers (user-picked folders, cloud-backed, in-memory test, mobile
 * sandbox) slot in without UI changes.
 */
export interface WorkspaceProvider {
  getWorkspace(): Promise<WorkspaceRef>;
  listTree(showTrash?: boolean): Promise<WorkspaceNode[]>;
  readFile(path: string): Promise<FileContent>;
  writeFile(path: string, contents: string): Promise<void>;
  searchContent(query: string): Promise<ContentHit[]>;
  listWorkspaces(): Promise<WorkspaceRegistry>;
  addWorkspace(path: string, name?: string): Promise<WorkspaceEntry>;
  switchWorkspace(path: string): Promise<WorkspaceRef>;
  removeWorkspace(path: string): Promise<WorkspaceRegistry>;
  createEntry(path: string): Promise<CreatedEntry>;
  trashEntry(path: string): Promise<string>;
  moveEntry(from: string, toDir: string): Promise<string>;
  renameEntry(from: string, newName: string): Promise<string>;
  watchFile(path: string): Promise<void>;
  unwatchFile(): Promise<void>;
}

export interface CreatedEntry {
  path: string;
  kind: "file" | "directory";
}

export function createTauriWorkspaceProvider(
  bridge: CommandBridge = tauriBridge,
): WorkspaceProvider {
  return {
    async getWorkspace() {
      return bridge.invoke<WorkspaceRef>("cmd_workspace_info");
    },
    async listTree(showTrash = false) {
      return bridge.invoke<WorkspaceNode[]>("cmd_list_workspace", {
        showTrash,
      });
    },
    async readFile(path) {
      const text = await bridge.invoke<string>("cmd_read_file", { path });
      return { path, text };
    },
    async writeFile(path, contents) {
      await bridge.invoke<void>("cmd_write_file", { path, contents });
    },
    async searchContent(query) {
      const raw = await bridge.invoke<
        Array<{ path: string; line: number; snippet: string; positions: Array<[number, number]> }>
      >("cmd_search_content", { query });
      return raw as ContentHit[];
    },
    async listWorkspaces() {
      return bridge.invoke<WorkspaceRegistry>("cmd_list_workspaces");
    },
    async addWorkspace(path, name) {
      return bridge.invoke<WorkspaceEntry>("cmd_add_workspace", { path, name });
    },
    async switchWorkspace(path) {
      return bridge.invoke<WorkspaceRef>("cmd_switch_workspace", { path });
    },
    async removeWorkspace(path) {
      return bridge.invoke<WorkspaceRegistry>("cmd_remove_workspace", { path });
    },
    async createEntry(path) {
      return bridge.invoke<CreatedEntry>("cmd_create_entry", { path });
    },
    async trashEntry(path) {
      return bridge.invoke<string>("cmd_trash_entry", { path });
    },
    async moveEntry(from, toDir) {
      return bridge.invoke<string>("cmd_move_entry", { from, toDir });
    },
    async renameEntry(from, newName) {
      return bridge.invoke<string>("cmd_rename_entry", { from, newName });
    },
    async watchFile(path) {
      await bridge.invoke<void>("cmd_watch_file", { path });
    },
    async unwatchFile() {
      await bridge.invoke<void>("cmd_unwatch_file");
    },
  };
}

export async function loadWorkspaceTree(
  provider: WorkspaceProvider,
  showTrash = false,
): Promise<WorkspaceTree> {
  const [workspace, roots] = await Promise.all([
    provider.getWorkspace(),
    provider.listTree(showTrash),
  ]);
  return { workspace, roots };
}
