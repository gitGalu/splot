/**
 * Thin, isolated wrapper over Tauri's `invoke`. UI code must not import
 * `@tauri-apps/api` directly — go through a typed service instead. This keeps
 * the platform boundary tight and makes alternative implementations
 * (web sandbox, tests, mobile) easy to swap in.
 */
import { invoke } from "@tauri-apps/api/core";

export interface CommandBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export const tauriBridge: CommandBridge = {
  invoke: (command, args) => invoke(command, args),
};
