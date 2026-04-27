import { fuzzyMatch } from "./fuzzy";

export interface Heading {
  /** 1–6 (h1–h6). */
  level: number;
  /** Heading text without leading `#` markers. */
  title: string;
  /** 1-based line number in the document. */
  line: number;
  /** Byte offset of the line start within the document. */
  offset: number;
}

export interface HeadingSearchResult {
  heading: Heading;
  score: number;
  /** Character positions matched within `heading.title`, for highlighting. */
  positions: number[];
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Parse ATX-style Markdown headings from a document. Skips fenced code blocks
 * so `# foo` inside a ``` block isn't mistaken for a heading.
 */
export function parseHeadings(doc: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  let offset = 0;
  let line = 0;
  const lines = doc.split("\n");
  for (const text of lines) {
    line += 1;
    const trimmed = text.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
    } else if (!inFence) {
      const m = HEADING_RE.exec(text);
      if (m) {
        out.push({
          level: m[1].length,
          title: m[2].trim(),
          line,
          offset,
        });
      }
    }
    offset += text.length + 1; // +1 for the newline split removed
  }
  return out;
}

export function searchHeadings(
  headings: Heading[],
  query: string,
  limit = 50,
): HeadingSearchResult[] {
  const q = query.trim();
  if (!q) {
    return headings
      .slice(0, limit)
      .map((heading) => ({ heading, score: 0, positions: [] }));
  }
  const results: HeadingSearchResult[] = [];
  for (const heading of headings) {
    const m = fuzzyMatch(q, heading.title);
    if (!m) continue;
    results.push({ heading, score: m.score, positions: m.positions });
  }
  // Stable tie-break by document order (line number).
  results.sort((a, b) => b.score - a.score || a.heading.line - b.heading.line);
  return results.slice(0, limit);
}
