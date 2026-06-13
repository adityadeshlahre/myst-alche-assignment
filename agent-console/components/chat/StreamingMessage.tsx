"use client";

import { memo, useEffect, useRef } from "react";
import { useStream } from "@/hooks/useStream";

export const StreamingMessage = memo(function StreamingMessage({
  text,
  animate = false,
}: {
  text: string;
  animate?: boolean;
}) {
  const contentRef = useRef("");
  const { stream, addPart } = useStream();

  useEffect(() => {
    if (!text || !animate) return;
    if (contentRef.current !== text) {
      const delta = text.slice(contentRef.current.length);
      if (delta) {
        addPart(delta);
      }
      contentRef.current = text;
    }
  }, [text, animate, addPart]);

  if (!animate) return <>{text}</>;

  return <>{stream}</>;
});
