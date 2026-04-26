/**
 * Lightweight fuzzy subsequence scorer. Case-insensitive.
 *
 * Returns null if `query` is not a subsequence of `text`. Otherwise returns a
 * score (higher is better) and the list of matched character indices in
 * `text`, suitable for highlighting.
 *
 * Heuristics:
 *   + contiguous runs score more than scattered ones
 *   + matches at word/path boundaries score more
 *   + matches at the start of the string score most
 *   + later, unmatched tail characters cost a little
 */
export interface FuzzyMatch {
  score: number;
  positions: number[];
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim();
  if (!q) return { score: 0, positions: [] };
  if (!text) return null;

  const ql = q.toLowerCase();
  const tl = text.toLowerCase();

  const positions: number[] = [];
  let score = 0;
  let run = 0;
  let qi = 0;
  let prev = -1;

  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] !== ql[qi]) {
      run = 0;
      continue;
    }

    let bonus = 1;
    // Exact-case match sweetener
    if (text[ti] === q[qi]) bonus += 0.5;

    // Start of string
    if (ti === 0) bonus += 4;
    // Boundary: after path separator, space, underscore, dot, dash
    else if (isBoundary(text[ti - 1])) bonus += 3;
    // CamelCase: lower-to-upper transition
    else if (
      isLower(text[ti - 1]) &&
      isUpper(text[ti]) &&
      q[qi].toLowerCase() === text[ti].toLowerCase()
    ) {
      bonus += 2;
    }

    // Contiguous run compounding
    if (prev === ti - 1) {
      run += 1;
      bonus += run * 1.5;
    } else {
      run = 0;
    }

    score += bonus;
    positions.push(ti);
    prev = ti;
    qi++;
  }

  if (qi < ql.length) return null;

  // Prefer shorter strings on ties, mildly
  score -= tl.length * 0.01;

  return { score, positions };
}

function isBoundary(ch: string): boolean {
  return ch === "/" || ch === "\\" || ch === " " || ch === "_" || ch === "-" || ch === ".";
}

function isLower(ch: string): boolean {
  return ch >= "a" && ch <= "z";
}

function isUpper(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}
