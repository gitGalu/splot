import { Prec, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { evaluateDateExpr } from "./date-calc";

/**
 * Apple Notes–style arithmetic preview. When a line ends with a valid
 * expression followed by `=` (optionally with trailing spaces), the result is
 * rendered as ghost text after the `=`. Tab inserts the result into the doc.
 *
 * Supports: + - * / % ^, parens, constants pi/e/tau, functions
 * (sqrt, abs, round, floor, ceil, ln, log, sin, cos, tan, min, max),
 * and contextual percent (`100+20%` → 120, `200-10%` → 180).
 *
 * Skips fenced/inline code regions (we look at the markdown syntax tree).
 */

// ---- Tokenizer + shunting-yard evaluator -------------------------------------

type OpName = "+" | "-" | "*" | "/" | "%" | "^" | "u-";

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; value: OpName }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "func"; name: string };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, { arity: number | "min1"; fn: (...a: number[]) => number }> = {
  sqrt: { arity: 1, fn: Math.sqrt },
  abs: { arity: 1, fn: Math.abs },
  round: { arity: 1, fn: Math.round },
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  ln: { arity: 1, fn: Math.log },
  log: { arity: 1, fn: Math.log10 },
  sin: { arity: 1, fn: Math.sin },
  cos: { arity: 1, fn: Math.cos },
  tan: { arity: 1, fn: Math.tan },
  min: { arity: "min1", fn: (...a) => Math.min(...a) },
  max: { arity: "min1", fn: (...a) => Math.max(...a) },
};

/**
 * Rewrite `<expr>+<num>%` and `<expr>-<num>%` into `<expr>*(1±<num>/100)` so
 * "100+20%" reads as "100 plus 20 percent of 100" rather than modulo. We only
 * touch trailing `+N%` / `-N%` chunks; bare `%` stays as modulo.
 */
function rewriteContextualPercent(input: string): string {
  // Repeatedly fold the last "<sign><number>%" into a multiplicative form.
  // We restrict the left side with a lookbehind so we don't match the sign of
  // a unary expression at the start.
  let s = input;
  for (let guard = 0; guard < 10; guard++) {
    const re = /([)\d.])\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%(?!\d)/;
    const m = re.exec(s);
    if (!m) break;
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + m[0].length);
    const sign = m[2] === "+" ? "+" : "-";
    // a +/- b%  →  a * (1 +/- b/100)
    s = `${before}${m[1]}*(1${sign}${m[3]}/100)${after}`;
  }
  return s;
}

function tokenize(input: string): Token[] | null {
  const expanded = rewriteContextualPercent(input);
  const tokens: Token[] = [];
  let i = 0;
  let prevWasValue = false;
  while (i < expanded.length) {
    const c = expanded[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen" });
      prevWasValue = false;
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen" });
      prevWasValue = true;
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ kind: "comma" });
      prevWasValue = false;
      i++;
      continue;
    }
    if (c === "^") {
      tokens.push({ kind: "op", value: "^" });
      prevWasValue = false;
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "%") {
      if ((c === "+" || c === "-") && !prevWasValue) {
        if (c === "-") tokens.push({ kind: "op", value: "u-" });
        i++;
        continue;
      }
      tokens.push({ kind: "op", value: c });
      prevWasValue = false;
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      let sawDot = false;
      while (j < expanded.length) {
        const d = expanded[j];
        if (d >= "0" && d <= "9") {
          j++;
        } else if (d === "." && !sawDot) {
          sawDot = true;
          j++;
        } else {
          break;
        }
      }
      const slice = expanded.slice(i, j);
      if (slice === ".") return null;
      const value = Number(slice);
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "num", value });
      prevWasValue = true;
      i = j;
      continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
      let j = i;
      while (j < expanded.length) {
        const d = expanded[j];
        if ((d >= "a" && d <= "z") || (d >= "A" && d <= "Z")) j++;
        else break;
      }
      const name = expanded.slice(i, j).toLowerCase();
      i = j;
      // Skip whitespace before deciding func vs constant.
      while (i < expanded.length && (expanded[i] === " " || expanded[i] === "\t")) i++;
      if (expanded[i] === "(" && FUNCTIONS[name]) {
        tokens.push({ kind: "func", name });
        prevWasValue = false;
        continue;
      }
      if (CONSTANTS[name] !== undefined) {
        tokens.push({ kind: "num", value: CONSTANTS[name] });
        prevWasValue = true;
        continue;
      }
      return null;
    }
    return null;
  }
  return tokens;
}

function precedence(op: Token & { kind: "op" }): number {
  switch (op.value) {
    case "^":
      return 5;
    case "u-":
      return 4;
    case "*":
    case "/":
    case "%":
      return 3;
    case "+":
    case "-":
      return 2;
  }
}

function isRightAssoc(op: Token & { kind: "op" }): boolean {
  return op.value === "u-" || op.value === "^";
}

function evaluate(input: string): number | null {
  const tokens = tokenize(input);
  if (!tokens || tokens.length === 0) return null;

  // Shunting-yard producing RPN; functions go on the op stack and pop on `)`.
  const output: Token[] = [];
  const ops: Token[] = [];
  // Argument count per open paren that follows a func; mirrors `ops`.
  const argCounts: number[] = [];

  for (const tok of tokens) {
    if (tok.kind === "num") {
      output.push(tok);
    } else if (tok.kind === "op") {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.kind === "func") {
          // Function call binds tighter than any operator outside its parens;
          // but we only pop functions on `)`, so leave it.
          break;
        }
        if (top.kind !== "op") break;
        const tp = precedence(top);
        const cp = precedence(tok);
        if (tp > cp || (tp === cp && !isRightAssoc(tok))) {
          output.push(ops.pop()!);
        } else {
          break;
        }
      }
      ops.push(tok);
    } else if (tok.kind === "func") {
      ops.push(tok);
      // The next token must be `(`, which will push a paren and bump argCount.
    } else if (tok.kind === "lparen") {
      ops.push(tok);
      // If this paren follows a func, start counting args at 1 (the first arg).
      const prev = ops.length >= 2 ? ops[ops.length - 2] : null;
      argCounts.push(prev && prev.kind === "func" ? 1 : 0);
    } else if (tok.kind === "comma") {
      while (ops.length && ops[ops.length - 1].kind !== "lparen") {
        output.push(ops.pop()!);
      }
      if (!ops.length) return null;
      if (argCounts.length === 0) return null;
      argCounts[argCounts.length - 1]++;
    } else {
      // rparen
      while (ops.length && ops[ops.length - 1].kind !== "lparen") {
        output.push(ops.pop()!);
      }
      if (!ops.length) return null;
      ops.pop(); // drop the lparen
      const args = argCounts.pop() ?? 0;
      const top = ops[ops.length - 1];
      if (top && top.kind === "func") {
        const fn = ops.pop() as Token & { kind: "func" };
        // Encode arity into the output stream as a number followed by func.
        output.push({ kind: "num", value: args });
        output.push(fn);
      }
    }
  }
  while (ops.length) {
    const t = ops.pop()!;
    if (t.kind === "lparen" || t.kind === "rparen") return null;
    output.push(t);
  }

  const stack: number[] = [];
  for (let k = 0; k < output.length; k++) {
    const t = output[k];
    if (t.kind === "num") {
      stack.push(t.value);
    } else if (t.kind === "func") {
      // Preceding stack value is the runtime arg count (we pushed it above).
      const n = stack.pop();
      if (n === undefined) return null;
      const spec = FUNCTIONS[t.name];
      if (!spec) return null;
      if (spec.arity !== "min1" && spec.arity !== n) return null;
      if (spec.arity === "min1" && n < 1) return null;
      if (stack.length < n) return null;
      const args = stack.splice(stack.length - n, n);
      const r = spec.fn(...args);
      if (!Number.isFinite(r)) return null;
      stack.push(r);
    } else if (t.kind === "op") {
      if (t.value === "u-") {
        if (!stack.length) return null;
        stack.push(-stack.pop()!);
        continue;
      }
      if (stack.length < 2) return null;
      const b = stack.pop()!;
      const a = stack.pop()!;
      let r: number;
      switch (t.value) {
        case "+":
          r = a + b;
          break;
        case "-":
          r = a - b;
          break;
        case "*":
          r = a * b;
          break;
        case "/":
          if (b === 0) return null;
          r = a / b;
          break;
        case "%":
          if (b === 0) return null;
          r = a % b;
          break;
        case "^":
          r = Math.pow(a, b);
          break;
      }
      stack.push(r);
    }
  }
  if (stack.length !== 1) return null;
  const result = stack[0];
  if (!Number.isFinite(result)) return null;
  return result;
}

function formatResult(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Up to 10 significant fractional digits, then strip trailing zeros.
  const s = n.toFixed(10);
  return s.replace(/\.?0+$/, "");
}

// ---- Expression detection ----------------------------------------------------

/** Characters allowed inside an expression. Includes Polish letters for date
 *  unit words (e.g. "miesiąc", "tydzień"). */
const EXPR_CHAR = /[0-9.()+\-*/%^,\sa-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

interface Match {
  /** Document offset where the `=` ends (insert ghost text right here). */
  pos: number;
  /** Already-formatted result string. */
  result: string;
}

/**
 * Find a trailing `<expr>=` at the end of `text`, allowing arbitrary prefix.
 * Walks back from the `=` collecting expression-shaped characters and tries
 * to evaluate each candidate, taking the longest one that parses cleanly.
 * That way `notatka: 2+2=` still produces `4`, but `abc 2+2=` doesn't fold
 * the unknown identifier into the expression — it just stops at `2+2`.
 */
function findMatchInLine(text: string): Match | null {
  // Strip trailing whitespace; the `=` must be the last non-space char.
  let end = text.length;
  while (end > 0 && (text[end - 1] === " " || text[end - 1] === "\t")) end--;
  if (end === 0 || text[end - 1] !== "=") return null;
  const eqIdx = end - 1;

  let bestResult: string | null = null;

  // Walk back from just before `=`, extending the candidate expression one
  // char at a time. Stop at the first non-expression character.
  let start = eqIdx;
  while (start > 0) {
    const c = text[start - 1];
    if (!EXPR_CHAR.test(c)) break;
    start--;
    const candidate = text.slice(start, eqIdx);
    // Try date arithmetic first — its inputs (e.g. "4.4.2024+6 dni") look
    // very different from regular math, so this is unambiguous in practice.
    if (/\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}/.test(candidate)) {
      const dr = evaluateDateExpr(candidate);
      if (dr !== null) {
        bestResult = dr;
        continue;
      }
    }
    // Otherwise: numeric expression. Cheap pre-filters first.
    const hasBinary = /[\d)a-zA-Z]\s*[+\-*/%^]\s*[\d(a-zA-Z]/.test(candidate);
    const hasFunc = /[a-zA-Z]+\s*\(/.test(candidate);
    if (!hasBinary && !hasFunc) continue;
    const v = evaluate(candidate);
    if (v !== null) {
      bestResult = formatResult(v);
    }
  }

  if (bestResult === null) return null;
  return { pos: eqIdx + 1, result: bestResult };
}

// ---- Widget ------------------------------------------------------------------

class CalcResultWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: CalcResultWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-inline-calc";
    span.textContent = " " + this.text;
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

// ---- Code-region detection ---------------------------------------------------

function isInCodeRegion(view: EditorView, pos: number): boolean {
  let inCode = false;
  syntaxTree(view.state).iterate({
    from: pos,
    to: pos,
    enter(node) {
      const name = node.name;
      if (
        name === "FencedCode" ||
        name === "CodeBlock" ||
        name === "InlineCode" ||
        name === "CodeText" ||
        name === "CodeMark"
      ) {
        inCode = true;
        return false;
      }
      return undefined;
    },
  });
  return inCode;
}

// ---- View plugin -------------------------------------------------------------

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const m = findMatchInLine(line.text);
      if (m) {
        const docPos = line.from + m.pos;
        if (!isInCodeRegion(view, line.from)) {
          builder.add(
            docPos,
            docPos,
            Decoration.widget({
              widget: new CalcResultWidget(m.result),
              side: 1,
            }),
          );
        }
      }
      pos = line.to + 1;
      if (pos > to) break;
    }
  }
  return builder.finish();
}

const inlineCalcPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// ---- Tab-to-accept keymap ----------------------------------------------------

const acceptKeymap = Prec.high(
  keymap.of([
    {
      key: "Tab",
      run: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) return false;
        const line = view.state.doc.lineAt(sel.head);
        const tail = line.text.slice(sel.head - line.from);
        if (tail.trim() !== "") return false;
        const m = findMatchInLine(line.text);
        if (!m) return false;
        if (isInCodeRegion(view, line.from)) return false;
        const insertText = " " + m.result;
        view.dispatch({
          changes: { from: sel.head, to: sel.head, insert: insertText },
          selection: { anchor: sel.head + insertText.length },
          userEvent: "input.complete",
        });
        return true;
      },
    },
  ]),
);

const inlineCalcTheme = EditorView.baseTheme({
  ".cm-inline-calc": {
    color: "var(--color-text-faint, var(--color-text-muted))",
    opacity: "0.7",
    pointerEvents: "none",
    userSelect: "none",
  },
});

export function inlineCalcExtension(): Extension {
  return [inlineCalcPlugin, acceptKeymap, inlineCalcTheme];
}
