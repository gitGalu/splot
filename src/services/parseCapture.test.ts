/**
 * Unit tests for the Quick Capture parser. Run via `npm test` (Vitest).
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { activeAtToken, parseCapture } from "./parseCapture";

test("plain body with a trailing tag", () => {
  assert.deepEqual(parseCapture("Zadzwonić do księgowej jutro rano #task"), {
    targetDirectory: null,
    tags: ["#task"],
    body: "Zadzwonić do księgowej jutro rano",
  });
});

test("leading @Folder selects the directory", () => {
  assert.deepEqual(
    parseCapture("@Praca Przygotować listę tematów na spotkanie #task"),
    {
      targetDirectory: "Praca",
      tags: ["#task"],
      body: "Przygotować listę tematów na spotkanie",
    },
  );
});

test("\\@ escape keeps a literal @Folder in the body", () => {
  assert.deepEqual(parseCapture("\\@Praca to ma zostać w tekście #note"), {
    targetDirectory: null,
    tags: ["#note"],
    body: "@Praca to ma zostać w tekście",
  });
});

test("\\# escape keeps a literal #tag in the body", () => {
  assert.deepEqual(
    parseCapture("@Klienci \\#nie-tag To jest fragment o składni."),
    {
      targetDirectory: "Klienci",
      tags: [],
      body: "#nie-tag To jest fragment o składni.",
    },
  );
});

test("first @Folder wins, later @Something stays as text", () => {
  assert.deepEqual(parseCapture("@Praca @Klienci Porównać dwa procesy #note"), {
    targetDirectory: "Praca",
    tags: ["#note"],
    body: "@Klienci Porównać dwa procesy",
  });
});

test("multiple tags are lifted in order and de-duplicated", () => {
  assert.deepEqual(
    parseCapture("Notatka #task #meeting #task ze spotkania"),
    {
      targetDirectory: null,
      tags: ["#task", "#meeting"],
      body: "Notatka ze spotkania",
    },
  );
});

test("a tag in the middle is removed cleanly, no double spaces", () => {
  assert.deepEqual(parseCapture("Kupić #zakupy mleko i chleb"), {
    targetDirectory: null,
    tags: ["#zakupy"],
    body: "Kupić mleko i chleb",
  });
});

test("@Folder may appear mid-string and still select", () => {
  // Only the *first* @token selects; here it is the first token overall.
  assert.deepEqual(parseCapture("@Notatki Pomysł na potem"), {
    targetDirectory: "Notatki",
    tags: [],
    body: "Pomysł na potem",
  });
});

test("Polish letters are valid in folder and tag names", () => {
  assert.deepEqual(parseCapture("@Książki #zażółć przeczytać"), {
    targetDirectory: "Książki",
    tags: ["#zażółć"],
    body: "przeczytać",
  });
});

test("ordinary punctuation in the body is preserved", () => {
  assert.deepEqual(
    parseCapture("Czy to działa? Tak — na pewno! #task"),
    {
      targetDirectory: null,
      tags: ["#task"],
      body: "Czy to działa? Tak — na pewno!",
    },
  );
});

test("newlines (Shift+Enter) are preserved in the body", () => {
  assert.deepEqual(parseCapture("@Praca Pierwsza linia\nDruga linia #note"), {
    targetDirectory: "Praca",
    tags: ["#note"],
    body: "Pierwsza linia\nDruga linia",
  });
});

test("an email-like token is not a folder (contains @ but not at start)", () => {
  // "kontakt@firma.pl" doesn't match the @Folder pattern (the @ isn't the
  // token start), so it stays verbatim.
  assert.deepEqual(parseCapture("Napisać do kontakt@firma.pl jutro"), {
    targetDirectory: null,
    tags: [],
    body: "Napisać do kontakt@firma.pl jutro",
  });
});

test("empty / whitespace-only input yields empty body", () => {
  assert.deepEqual(parseCapture("   \n  "), {
    targetDirectory: null,
    tags: [],
    body: "",
  });
});

test("only metadata yields empty body (caller must reject)", () => {
  assert.deepEqual(parseCapture("@Praca #task"), {
    targetDirectory: "Praca",
    tags: ["#task"],
    body: "",
  });
});

// ── activeAtToken (autocomplete cursor detection) ──────────────────────────

test("activeAtToken: caret right after a bare @ gives an empty fragment", () => {
  assert.deepEqual(activeAtToken("@", 1), { start: 0, fragment: "" });
});

test("activeAtToken: caret inside a partial @frag", () => {
  assert.deepEqual(activeAtToken("@Pra", 4), { start: 0, fragment: "Pra" });
});

test("activeAtToken: @ after whitespace mid-text", () => {
  assert.deepEqual(activeAtToken("notatka @Kli", 12), {
    start: 8,
    fragment: "Kli",
  });
});

test("activeAtToken: Polish letters in the fragment", () => {
  assert.deepEqual(activeAtToken("@Książ", 6), { start: 0, fragment: "Książ" });
});

test("activeAtToken: escaped \\@ is not a token", () => {
  assert.equal(activeAtToken("\\@Pra", 5), null);
});

test("activeAtToken: caret not at the end of the token returns null", () => {
  // A space already follows the token, so the caret (at end) isn't in it.
  assert.equal(activeAtToken("@Praca tekst", 12), null);
});

test("activeAtToken: plain text without @ returns null", () => {
  assert.equal(activeAtToken("zwykły tekst", 12), null);
});

test("activeAtToken: @ not at a word boundary (email) returns null", () => {
  assert.equal(activeAtToken("kontakt@firma", 13), null);
});
