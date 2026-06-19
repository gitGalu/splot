/**
 * Vitest setup. The jsdom environment provides window + document, but on
 * Node 26 a built-in experimental `localStorage` global (unusable without
 * --localstorage-file) shadows jsdom's window-backed one, leaving the bare
 * `localStorage` identifier the app uses pointing at nothing. Install a small
 * in-memory localStorage on both globalThis and window so the app's
 * `localStorage.getItem(...)` works, then reset it between tests.
 */
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

const storage = new MemoryStorage();
for (const target of [globalThis, globalThis.window].filter(Boolean) as object[]) {
  Object.defineProperty(target, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  cleanup();
});
