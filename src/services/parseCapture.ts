/**
 * Quick Capture input parser.
 *
 * Turns a raw capture string into a {@link ParsedCapture}: an optional target
 * directory (chosen via a leading-ish `@Folder`), a list of `#tags`, and the
 * cleaned body text. Pure and platform-free — no Tauri, no React — so it is
 * trivially testable and reusable on any bridge.
 *
 * Design choices worth calling out (the rules are subtle):
 *
 *  - `@Folder` selects the *destination* directory inside the workspace root.
 *    It is NOT a person mention and NOT a tag. Only the FIRST unescaped
 *    `@Folder` token counts; any later `@Something` stays verbatim in the body
 *    (rule 6 — keeping them as text avoids silently eating words that merely
 *    start with `@`, and a single destination is all the feature supports).
 *  - `#tag` tokens are lifted out of the body into the header, in order, with
 *    duplicates removed.
 *  - `\@Folder` and `\#tag` are escapes: the backslash is dropped and the
 *    literal `@Folder` / `#tag` stays in the body, never treated as metadata.
 *  - Only the control metadata (the chosen `@Folder` and the `#tag` tokens) is
 *    stripped. Ordinary punctuation, Unicode (Polish letters), and newlines in
 *    the body are preserved. We only collapse the whitespace left behind where
 *    a token was removed, so the body doesn't end up with double spaces.
 */

export type ParsedCapture = {
  /** Folder name inside the workspace root, or null for the global inbox. */
  targetDirectory: string | null;
  /** Tags including the leading `#`, e.g. `["#task", "#note"]`. De-duplicated. */
  tags: string[];
  /** Cleaned entry text with control metadata removed. */
  body: string;
};

/**
 * If the caret sits inside an unescaped `@token`, return the token's start
 * offset (index of the `@`) and the fragment typed so far. The `@` must be at
 * the start of the input or preceded by whitespace — mirroring the parser's
 * rule for what counts as a folder token — and must not be escaped with `\`.
 * Returns null when the caret isn't inside a folder token.
 *
 * Used by the Quick Capture UI to drive `@Folder` autocomplete; kept here next
 * to {@link parseCapture} so the two stay consistent and both are unit-tested.
 */
export function activeAtToken(
  text: string,
  caret: number,
): { start: number; fragment: string } | null {
  const before = text.slice(0, caret);
  // Trailing `@frag`, where frag is folder-name chars (possibly empty, right
  // after typing `@`). The capture group is the fragment.
  const m = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!m) return null;
  const atIndex = caret - m[2].length - 1;
  // Reject the escaped form `\@` — it's literal text, not a folder token.
  if (atIndex > 0 && text[atIndex - 1] === "\\") return null;
  return { start: atIndex, fragment: m[2] };
}

// A directory/tag name is a run of Unicode letters, digits, `_` and `-`.
// `\p{L}` covers Polish letters (ą, ć, ę, …) and any other script. We avoid
// `.` and path separators here on purpose — those are rejected later by the
// backend path validation, but keeping the token charset tight means
// `@Praca.` (folder followed by a period) parses as folder `Praca` + literal
// `.`, which is the intuitive reading.
const NAME = "[\\p{L}\\p{N}_-]+";
const DIR_TOKEN = new RegExp(`^@(${NAME})$`, "u");
const TAG_TOKEN = new RegExp(`^#(${NAME})$`, "u");

/**
 * Parse a raw capture string.
 *
 * The strategy is token-based: split on whitespace, but remember the original
 * separators so we can rebuild the body with its spacing (and newlines)
 * intact. Each token is classified once; recognised metadata is pulled out,
 * everything else (including escaped tokens, with the backslash removed) is
 * kept in the body.
 */
export function parseCapture(raw: string): ParsedCapture {
  let targetDirectory: string | null = null;
  const tags: string[] = [];
  const seenTags = new Set<string>();

  // Split into alternating [token, separator, token, separator, ...]. The
  // separators (spaces, tabs, newlines) are captured so the body keeps its
  // original whitespace, including Shift+Enter line breaks.
  const parts = raw.split(/(\s+)/);

  const bodyParts: string[] = [];
  for (const part of parts) {
    // Whitespace separators pass through untouched.
    if (part === "" || /^\s+$/.test(part)) {
      bodyParts.push(part);
      continue;
    }

    // Escapes: a leading backslash before @ or # means "literal" — drop the
    // backslash, keep the rest in the body, and never treat it as metadata.
    if (part.startsWith("\\@") || part.startsWith("\\#")) {
      bodyParts.push(part.slice(1));
      continue;
    }

    // Directory token: only the first one wins. A second `@Folder` is left as
    // body text (see header comment, rule 6).
    const dirMatch = DIR_TOKEN.exec(part);
    if (dirMatch && targetDirectory === null) {
      targetDirectory = dirMatch[1];
      continue; // removed from body
    }

    // Tag token: lift to header, de-duplicated, original `#name` preserved.
    const tagMatch = TAG_TOKEN.exec(part);
    if (tagMatch) {
      const tag = `#${tagMatch[1]}`;
      if (!seenTags.has(tag)) {
        seenTags.add(tag);
        tags.push(tag);
      }
      continue; // removed from body
    }

    // Anything else is ordinary text.
    bodyParts.push(part);
  }

  // Rejoin, then tidy the whitespace left where tokens were removed: collapse
  // runs of spaces/tabs that no longer sit between two words, and trim. We do
  // NOT touch newlines — multi-line captures keep their structure.
  let body = bodyParts.join("");
  // Collapse spaces/tabs around removed tokens, but preserve newlines: trim
  // horizontal whitespace at the start/end of each line and squeeze internal
  // runs of spaces/tabs to one.
  body = body
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/^ | $/g, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, ""); // drop leading/trailing blank lines

  return { targetDirectory, tags, body };
}
