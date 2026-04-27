import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { FileIndex, FileSearchResult } from "../../services/fileIndex";
import type { ContentHit } from "../../types/workspace";
import {
  parseHeadings,
  searchHeadings,
  type Heading,
  type HeadingSearchResult,
} from "../../services/headings";
import { HighlightedText } from "./HighlightedText";
import { t } from "../../i18n/i18n";

interface Props {
  index: FileIndex;
  onSelect: (path: string) => void;
  onClose: () => void;
  searchContent: (query: string) => Promise<ContentHit[]>;
  onCreate: (path: string) => Promise<void>;
  /** Source of the currently open document, for symbol mode. */
  openDoc?: string;
  /** Jump to a heading in the open document. */
  onJumpToHeading?: (heading: Heading) => void;
  initialInput?: string;
}

const MAX_RESULTS = 50;
const CONTENT_DEBOUNCE_MS = 150;
const CONTENT_MIN_CHARS = 2;

type Mode = "files" | "content" | "new" | "symbol";

function parseQuery(raw: string): { mode: Mode; query: string } {
  if (raw.startsWith(">")) {
    return { mode: "content", query: raw.slice(1) };
  }
  if (raw.startsWith("@")) {
    return { mode: "symbol", query: raw.slice(1) };
  }
  if (raw.startsWith("+")) {
    const rest = raw.slice(1);
    return { mode: "new", query: rest.startsWith(" ") ? rest.slice(1) : rest };
  }
  return { mode: "files", query: raw };
}

export function QuickOpen({
  index,
  onSelect,
  onClose,
  searchContent,
  onCreate,
  openDoc,
  onJumpToHeading,
  initialInput = "",
}: Props) {
  const [input, setInput] = useState(initialInput);
  const [active, setActive] = useState(0);
  const [userMoved, setUserMoved] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { mode, query } = useMemo(() => parseQuery(input), [input]);

  const fileResults = useMemo<FileSearchResult[]>(
    () => (mode === "files" ? index.search(query, MAX_RESULTS) : []),
    [index, mode, query],
  );

  // Headings are parsed once per open-doc snapshot; cheap on real-world files.
  const headings = useMemo<Heading[]>(
    () => (openDoc != null ? parseHeadings(openDoc) : []),
    [openDoc],
  );
  const headingResults = useMemo<HeadingSearchResult[]>(
    () => (mode === "symbol" ? searchHeadings(headings, query, MAX_RESULTS) : []),
    [headings, mode, query],
  );

  const [contentHits, setContentHits] = useState<ContentHit[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mode !== "content") {
      setContentHits([]);
      setContentError(null);
      setContentLoading(false);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < CONTENT_MIN_CHARS) {
      setContentHits([]);
      setContentError(null);
      setContentLoading(false);
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    const handle = window.setTimeout(() => {
      searchContent(trimmed)
        .then((hits) => {
          if (cancelled) return;
          setContentHits(hits);
          setContentError(null);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setContentError(formatError(e));
          setContentHits([]);
        })
        .finally(() => {
          if (!cancelled) setContentLoading(false);
        });
    }, CONTENT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [mode, query, searchContent]);

  useEffect(() => {
    setCreateError(null);
    setUserMoved(false);
  }, [input]);

  const resultCount =
    mode === "files"
      ? fileResults.length
      : mode === "content"
        ? contentHits.length
        : mode === "symbol"
          ? headingResults.length
          : 0;

  useEffect(() => {
    // Empty query + no keyboard navigation yet → no row is highlighted.
    // Enter falls through as a no-op in that state; users must type or press
    // Arrow keys to pick something. Keeps the palette calm on open.
    if (!userMoved && mode === "files" && !query.trim()) {
      setActive(-1);
      return;
    }
    setActive((a) =>
      resultCount === 0 ? -1 : a < 0 ? 0 : Math.min(a, resultCount - 1),
    );
  }, [resultCount, mode, query, userMoved]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-index="${active}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = useCallback(
    async (idx: number) => {
      if (mode === "files") {
        const r = fileResults[idx];
        if (r) onSelect(r.file.path);
        return;
      }
      if (mode === "content") {
        const h = contentHits[idx];
        if (h) onSelect(h.path);
        return;
      }
      if (mode === "symbol") {
        const h = headingResults[idx];
        if (h && onJumpToHeading) {
          onJumpToHeading(h.heading);
          onClose();
        }
        return;
      }
      // mode === "new"
      const trimmed = query.trim();
      if (!trimmed || creating) return;
      setCreating(true);
      setCreateError(null);
      try {
        await onCreate(trimmed);
      } catch (e) {
        setCreateError(formatError(e));
      } finally {
        setCreating(false);
      }
    },
    [
      mode,
      fileResults,
      contentHits,
      headingResults,
      onSelect,
      onJumpToHeading,
      onClose,
      onCreate,
      query,
      creating,
    ],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setUserMoved(true);
          setActive((a) =>
            resultCount === 0 ? -1 : a < 0 ? 0 : (a + 1) % resultCount,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setUserMoved(true);
          setActive((a) =>
            resultCount === 0
              ? -1
              : a < 0
                ? resultCount - 1
                : (a - 1 + resultCount) % resultCount,
          );
          break;
        case "Enter":
          e.preventDefault();
          // "new" mode commits on Enter regardless of selection — the query
          // itself is the payload. For files/content, a row must be picked.
          if (mode === "new" || active >= 0) commit(active);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [active, commit, mode, onClose, resultCount],
  );

  return (
    <div
      className="qo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Quick open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`qo-panel qo-panel--${mode}`} onKeyDown={onKeyDown}>
        <div className="qo-input-row">
          <span className="qo-mode" aria-hidden>
            {mode === "content"
              ? t("qo.mode.content")
              : mode === "new"
                ? t("qo.mode.new")
                : mode === "symbol"
                  ? t("qo.mode.symbol")
                  : t("qo.mode.files")}
          </span>
          <input
            ref={inputRef}
            className="qo-input"
            type="text"
            placeholder={
              mode === "content"
                ? t("qo.placeholder.content")
                : mode === "new"
                  ? t("qo.placeholder.new")
                  : mode === "symbol"
                    ? t("qo.placeholder.symbol")
                    : t("qo.placeholder.files")
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={mode === "content" ? "Content search" : "File search"}
          />
        </div>
        {renderBody({
          mode,
          query,
          fileResults,
          contentHits,
          contentLoading,
          contentError,
          createError,
          creating,
          headingResults,
          hasOpenDoc: openDoc != null,
          active,
          listRef,
          setActive,
          commit,
        })}
        <div className="qo-hint">
          {mode === "content" ? (
            <>{contentHintWithKbd()}</>
          ) : mode === "symbol" ? (
            <>{symbolHintWithKbd()}</>
          ) : mode === "new" ? (
            <>
              <kbd>Enter</kbd>
              {t("qo.hint.new1")}
              <kbd>/</kbd>
              {t("qo.hint.new2")}
              <kbd>/</kbd>
              {t("qo.hint.new3")}
              <code>.md</code>
              {t("qo.hint.new4")}
            </>
          ) : (
            <>
              <kbd>&gt;</kbd>
              {t("qo.hint.files1")}
              <kbd>+</kbd>
              {t("qo.hint.files2")}
              {t("qo.hint.files3")}
              <kbd>@</kbd>
              {t("qo.hint.files4")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface BodyArgs {
  mode: Mode;
  query: string;
  fileResults: FileSearchResult[];
  contentHits: ContentHit[];
  contentLoading: boolean;
  contentError: string | null;
  createError: string | null;
  creating: boolean;
  headingResults: HeadingSearchResult[];
  hasOpenDoc: boolean;
  active: number;
  listRef: React.MutableRefObject<HTMLUListElement | null>;
  setActive: (idx: number) => void;
  commit: (idx: number) => void;
}

function renderBody(args: BodyArgs) {
  const {
    mode,
    query,
    fileResults,
    contentHits,
    contentLoading,
    contentError,
    createError,
    creating,
    headingResults,
    hasOpenDoc,
    active,
    listRef,
    setActive,
    commit,
  } = args;

  if (mode === "new") {
    return renderNewBody({ query, createError, creating });
  }

  if (mode === "symbol") {
    if (!hasOpenDoc) {
      return <div className="qo-empty">{t("qo.empty.noFile")}</div>;
    }
    if (headingResults.length === 0) {
      return (
        <div className="qo-empty">
          {query.trim() ? t("qo.empty.noMatches") : t("qo.empty.noHeadings")}
        </div>
      );
    }
    return (
      <ul className="qo-list" ref={listRef} role="listbox">
        {headingResults.map((r, idx) => (
          <li
            key={`${r.heading.line}:${r.heading.offset}`}
            data-index={idx}
            role="option"
            aria-selected={idx === active}
            className={`qo-row qo-row--symbol ${idx === active ? "is-active" : ""}`}
            onMouseEnter={() => setActive(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              commit(idx);
            }}
          >
            <span className={`qo-symbol-level qo-symbol-level--${r.heading.level}`}>
              {"#".repeat(r.heading.level)}
            </span>
            <span className="qo-name">
              <HighlightedText text={r.heading.title} positions={r.positions} />
            </span>
            <span className="qo-path">:{r.heading.line}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (mode === "content") {
    if (contentError) {
      return <div className="qo-empty qo-empty--error">{contentError}</div>;
    }
    if (query.trim().length < CONTENT_MIN_CHARS) {
      return <div className="qo-empty">{t("qo.empty.minChars", { n: CONTENT_MIN_CHARS })}</div>;
    }
    if (contentLoading && contentHits.length === 0) {
      return <div className="qo-empty">{t("qo.empty.searching")}</div>;
    }
    if (contentHits.length === 0) {
      return <div className="qo-empty">{t("qo.empty.noMatches")}</div>;
    }
    return (
      <ul className="qo-list" ref={listRef} role="listbox">
        {contentHits.map((hit, idx) => (
          <li
            key={`${hit.path}:${hit.line}:${idx}`}
            data-index={idx}
            role="option"
            aria-selected={idx === active}
            className={`qo-row qo-row--content ${idx === active ? "is-active" : ""}`}
            onMouseEnter={() => setActive(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              commit(idx);
            }}
          >
            <div className="qo-content-snippet">
              <HighlightedText
                text={hit.snippet}
                positions={expandRanges(hit.positions)}
              />
            </div>
            <div className="qo-content-meta">
              <span className="qo-content-path">{hit.path}</span>
              <span className="qo-content-line">:{hit.line}</span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (fileResults.length === 0) {
    return (
      <div className="qo-empty">
        {query.trim() ? t("qo.empty.noMatches") : t("qo.empty.typeToSearch")}
      </div>
    );
  }
  return (
    <ul className="qo-list" ref={listRef} role="listbox">
      {fileResults.map((r, idx) => (
        <li
          key={r.file.path}
          data-index={idx}
          role="option"
          aria-selected={idx === active}
          className={`qo-row ${idx === active ? "is-active" : ""}`}
          onMouseEnter={() => setActive(idx)}
          onMouseDown={(e) => {
            e.preventDefault();
            commit(idx);
          }}
        >
          <span className="qo-name">
            <HighlightedText text={r.file.name} positions={r.namePositions} />
          </span>
          <span className="qo-path">
            <HighlightedText
              text={parentPath(r.file.path)}
              positions={clipPositions(r.pathPositions, parentPath(r.file.path).length)}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function renderNewBody(args: {
  query: string;
  createError: string | null;
  creating: boolean;
}): ReactElement {
  const { query, createError, creating } = args;
  const trimmed = query.trim();
  if (!trimmed) {
    const parts = t("qo.empty.typeName", { slash: "\u0000" }).split("\u0000");
    return (
      <div className="qo-empty">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 ? <code>/</code> : null}
          </span>
        ))}
      </div>
    );
  }
  if (createError) {
    return <div className="qo-empty qo-empty--error">{createError}</div>;
  }
  const preview = previewPath(trimmed);
  return (
    <div className="qo-new-preview">
      <span className="qo-new-action">
        {creating
          ? t("qo.new.creating")
          : preview.isDir
            ? t("qo.new.createFolder")
            : t("qo.new.createFile")}
      </span>
      <span className="qo-new-path">{preview.display}</span>
    </div>
  );
}

function previewPath(raw: string): { display: string; isDir: boolean } {
  const isDir = raw.endsWith("/") || raw.endsWith("\\");
  const segments = raw
    .split(/[\\/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return { display: "", isDir };
  if (!isDir) {
    const last = segments[segments.length - 1];
    if (!/\.[^./\\]+$/.test(last)) {
      segments[segments.length - 1] = `${last}.md`;
    }
  }
  return { display: segments.join("/") + (isDir ? "/" : ""), isDir };
}

function contentHintWithKbd(): ReactElement[] {
  const parts = t("qo.hint.content", { prefix: "\u0000" }).split("\u0000");
  const out: ReactElement[] = [];
  parts.forEach((p, i) => {
    out.push(<span key={`t${i}`}>{p}</span>);
    if (i < parts.length - 1) out.push(<kbd key={`k${i}`}>&gt;</kbd>);
  });
  return out;
}

function symbolHintWithKbd(): ReactElement[] {
  const parts = t("qo.hint.symbol", { prefix: "\u0000" }).split("\u0000");
  const out: ReactElement[] = [];
  parts.forEach((p, i) => {
    out.push(<span key={`t${i}`}>{p}</span>);
    if (i < parts.length - 1) out.push(<kbd key={`k${i}`}>@</kbd>);
  });
  return out;
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function clipPositions(positions: number[], maxExclusive: number): number[] {
  return positions.filter((p) => p < maxExclusive);
}

/** Expand `[start, end)` ranges into a flat list of indices for HighlightedText. */
function expandRanges(ranges: Array<[number, number]>): number[] {
  const out: number[] = [];
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) out.push(i);
  }
  return out;
}

function formatError(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as { message?: string; kind?: string };
    if (anyE.message) return anyE.message;
    if (anyE.kind) return anyE.kind;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
