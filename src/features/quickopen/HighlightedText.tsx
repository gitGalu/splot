interface Props {
  text: string;
  positions: number[];
}

/**
 * Renders `text` with characters at `positions` wrapped in <mark>.
 * `positions` must be sorted ascending.
 */
export function HighlightedText({ text, positions }: Props) {
  if (positions.length === 0) return <>{text}</>;

  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  let i = 0;

  while (i < positions.length) {
    // Accumulate a run of consecutive matched positions
    const start = positions[i];
    let end = start;
    while (i + 1 < positions.length && positions[i + 1] === end + 1) {
      i++;
      end = positions[i];
    }

    if (cursor < start) {
      parts.push({ text: text.slice(cursor, start), match: false });
    }
    parts.push({ text: text.slice(start, end + 1), match: true });
    cursor = end + 1;
    i++;
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }

  return (
    <>
      {parts.map((p, idx) =>
        p.match ? (
          <mark key={idx} className="qo-match">
            {p.text}
          </mark>
        ) : (
          <span key={idx}>{p.text}</span>
        ),
      )}
    </>
  );
}
