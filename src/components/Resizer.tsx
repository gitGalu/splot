import { useCallback, useRef } from "react";

interface Props {
  onResize: (delta: number) => void;
}

export function Resizer({ onResize }: Props) {
  const startX = useRef(0);
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startX.current = e.clientX;
      dragging.current = true;
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      if (delta !== 0) {
        onResize(delta);
        startX.current = e.clientX;
      }
    },
    [onResize],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [],
  );

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
