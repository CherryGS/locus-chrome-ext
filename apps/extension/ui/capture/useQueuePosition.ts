import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

/** Page-session placement only: navigation never carries another site's position. */
export function useQueuePosition(visible: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>();
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const bound = (x: number, y: number) => {
    const rect = ref.current?.getBoundingClientRect();
    return {
      x: Math.max(8, Math.min(x, innerWidth - (rect?.width ?? 48) - 8)),
      y: Math.max(8, Math.min(y, innerHeight - (rect?.height ?? 48) - 8)),
    };
  };
  useLayoutEffect(() => {
    const element = ref.current;
    if (!visible || !element) return;
    const clamp = () =>
      setPosition((previous) => {
        const rect = element.getBoundingClientRect();
        const next = bound(previous?.x ?? rect.x, previous?.y ?? rect.y);
        return previous?.x === next.x && previous.y === next.y
          ? previous
          : next;
      });
    clamp();
    const observer = new ResizeObserver(clamp);
    observer.observe(element);
    addEventListener("resize", clamp);
    return () => {
      observer.disconnect();
      removeEventListener("resize", clamp);
      drag.current = null;
      suppressClick.current = false;
    };
  }, [visible]);
  const end = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (drag.current?.id !== event.pointerId) return;
    suppressClick.current = cancelled || drag.current.moved;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    ref,
    style: position
      ? { left: position.x, top: position.y }
      : { right: 16, bottom: 16 },
    consumeClick: (detail: number) => {
      const blocked = detail !== 0 && suppressClick.current;
      suppressClick.current = false;
      return blocked;
    },
    handlers: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (
          !event.nativeEvent.isTrusted ||
          !event.isPrimary ||
          event.button !== 0
        )
          return;
        const rect = event.currentTarget.getBoundingClientRect();
        suppressClick.current = false;
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 6) return;
        start.moved = true;
        event.preventDefault();
        setPosition(bound(start.left + dx, start.top + dy));
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => end(event),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) =>
        end(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) =>
        end(event, true),
    },
  };
}
