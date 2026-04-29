/**
 * Date arithmetic for inline-calc. Handles Polish date formats
 *   D.M.YYYY  D-M-YYYY  D/M/YYYY  (DMY order)
 *   YYYY-MM-DD                     (ISO)
 * with operations:
 *   <date> +/- <n> <unit>   →  <date> (formatted like the first date in the expr)
 *   <date> - <date>         →  "<n> dni" (Polish-pluralized)
 *
 * Months and years are resolved on calendar components with day-clamping
 * (e.g. 31.01 + 1 mies → 28/29.02). Days/weeks use plain UTC math.
 */

interface ParsedDate {
  /** Calendar year. */
  y: number;
  /** Calendar month, 1–12. */
  m: number;
  /** Day of month. */
  d: number;
  /** Original separator so we can format the result the same way. */
  sep: string;
  /** Whether the input was ISO order (YYYY-MM-DD). */
  iso: boolean;
}

type Unit = "day" | "week" | "month" | "year";

const UNIT_WORDS: Array<[RegExp, Unit]> = [
  // Order matters: longer/more-specific words first so "miesiąc" doesn't get
  // stolen by a "mies" prefix matcher.
  [/^(miesi[ąa]ce|miesi[ęe]cy|miesi[ąa]c|miesi[ęe]cu|mies)$/i, "month"],
  [/^(tygodni(?:e|u)?|tydzie[ńn]|tyg)$/i, "week"],
  [/^(dni|dzie[ńn]|dnia|dni[a-z]*)$/i, "day"],
  [/^(lat[a]?|roku|rok|lata)$/i, "year"],
];

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(y: number, m: number): number {
  if (m === 2 && isLeap(y)) return 29;
  return DAYS_IN_MONTH[m - 1];
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false;
  if (d < 1) return false;
  if (d > daysInMonth(y, m)) return false;
  return true;
}

/**
 * Convert a calendar date to a UTC epoch-day count. Range-safe for any year
 * the user is likely to write; we use Date.UTC and divide.
 */
function toEpochDay(p: ParsedDate): number {
  const ms = Date.UTC(p.y, p.m - 1, p.d);
  return Math.floor(ms / 86400000);
}

function fromEpochDay(days: number): { y: number; m: number; d: number } {
  const ms = days * 86400000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function addMonths(p: ParsedDate, months: number): ParsedDate {
  const total = p.y * 12 + (p.m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  const nd = Math.min(p.d, daysInMonth(ny, nm));
  return { y: ny, m: nm, d: nd, sep: p.sep, iso: p.iso };
}

function format(p: ParsedDate): string {
  const yyyy = String(p.y).padStart(4, "0");
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  if (p.iso) return `${yyyy}-${mm}-${dd}`;
  return `${dd}${p.sep}${mm}${p.sep}${yyyy}`;
}

/** Polish plural for "day". 1 → "1 dzień", 2–4 → "N dni", else → "N dni". */
function pluralizeDays(n: number): string {
  const abs = Math.abs(n);
  if (abs === 1) return `${n} dzień`;
  return `${n} dni`;
}

// ---- Tokens ------------------------------------------------------------------

type Tok =
  | { kind: "date"; date: ParsedDate; from: number; to: number }
  | { kind: "num"; value: number; from: number; to: number }
  | { kind: "unit"; unit: Unit; from: number; to: number }
  | { kind: "op"; value: "+" | "-"; from: number; to: number };

const DATE_RE = /(\d{1,4})([.\-/])(\d{1,2})\2(\d{1,4})/g;
const NUM_RE = /\d+/g;
const WORD_RE = /[a-zA-Ząćęłńóśźż]+/gi;

interface TokenizeResult {
  tokens: Tok[];
  /** Spans not consumed by date/num/word/op/space — if any, we bail. */
  unknown: boolean;
}

function tokenizeDateExpr(s: string): TokenizeResult | null {
  // We allow only: date / number / unit-word / + - / whitespace.
  // Walk left-to-right, picking the longest valid token at each position.
  const tokens: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "+" || c === "-") {
      tokens.push({ kind: "op", value: c, from: i, to: i + 1 });
      i++;
      continue;
    }
    // Try date first (greedy).
    DATE_RE.lastIndex = i;
    const dm = DATE_RE.exec(s);
    if (dm && dm.index === i) {
      const a = Number(dm[1]);
      const sep = dm[2];
      const b = Number(dm[3]);
      const c2 = Number(dm[4]);
      let y: number, m: number, d: number, iso: boolean;
      if (dm[1].length === 4) {
        // ISO YYYY-MM-DD
        y = a;
        m = b;
        d = c2;
        iso = true;
      } else {
        // DMY
        d = a;
        m = b;
        y = c2;
        iso = false;
      }
      if (!isValidYMD(y, m, d)) return null;
      tokens.push({
        kind: "date",
        date: { y, m, d, sep, iso },
        from: i,
        to: i + dm[0].length,
      });
      i += dm[0].length;
      continue;
    }
    // Number?
    NUM_RE.lastIndex = i;
    const nm = NUM_RE.exec(s);
    if (nm && nm.index === i) {
      tokens.push({
        kind: "num",
        value: Number(nm[0]),
        from: i,
        to: i + nm[0].length,
      });
      i += nm[0].length;
      continue;
    }
    // Word (must be a recognized unit).
    WORD_RE.lastIndex = i;
    const wm = WORD_RE.exec(s);
    if (wm && wm.index === i) {
      const word = wm[0];
      let matched: Unit | null = null;
      for (const [re, unit] of UNIT_WORDS) {
        if (re.test(word)) {
          matched = unit;
          break;
        }
      }
      if (!matched) return null;
      tokens.push({
        kind: "unit",
        unit: matched,
        from: i,
        to: i + word.length,
      });
      i += word.length;
      continue;
    }
    return null;
  }
  return { tokens, unknown: false };
}

// ---- Evaluator ---------------------------------------------------------------

/**
 * Evaluate a date expression. Returns the formatted result, or null if the
 * expression isn't a recognizable date computation. This is intentionally
 * narrow — we want clear "date-shaped" inputs, not anything number-ish.
 */
export function evaluateDateExpr(s: string): string | null {
  const r = tokenizeDateExpr(s);
  if (!r) return null;
  const { tokens } = r;
  if (!tokens.length) return null;

  // Must start with a date.
  if (tokens[0].kind !== "date") return null;
  const firstDate = tokens[0].date;

  // Two recognized shapes:
  //   1) date (op num unit)+        → date
  //   2) date - date                → "<n> dni"
  if (tokens.length === 3 && tokens[1].kind === "op" && tokens[1].value === "-" && tokens[2].kind === "date") {
    const a = toEpochDay(tokens[0].date);
    const b = toEpochDay(tokens[2].date);
    return pluralizeDays(a - b);
  }

  // Walk operations: each must be (op num unit).
  let cur = { ...firstDate };
  let i = 1;
  let didAny = false;
  while (i < tokens.length) {
    const op = tokens[i];
    const num = tokens[i + 1];
    const unit = tokens[i + 2];
    if (
      !op || op.kind !== "op" ||
      !num || num.kind !== "num" ||
      !unit || unit.kind !== "unit"
    ) {
      return null;
    }
    const sign = op.value === "+" ? 1 : -1;
    const n = sign * num.value;
    if (unit.unit === "day") {
      const d = toEpochDay(cur) + n;
      const out = fromEpochDay(d);
      cur = { ...cur, ...out };
    } else if (unit.unit === "week") {
      const d = toEpochDay(cur) + n * 7;
      const out = fromEpochDay(d);
      cur = { ...cur, ...out };
    } else if (unit.unit === "month") {
      cur = addMonths(cur, n);
    } else if (unit.unit === "year") {
      cur = addMonths(cur, n * 12);
    }
    didAny = true;
    i += 3;
  }
  if (!didAny) return null;
  return format(cur);
}
