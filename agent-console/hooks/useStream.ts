"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TYPING_SPEED = 10;

export function useStream() {
  const [parts, setParts] = useState<string[]>([]);
  const [stream, setStream] = useState("");

  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const indexRef = useRef(0);

  const addPart = useCallback((part: string) => {
    if (part) {
      setParts((prev) => [...prev, part]);
    }
  }, []);

  const reset = useCallback(() => {
    setParts([]);
    setStream("");
    indexRef.current = 0;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    lastTimeRef.current = 0;
  }, []);

  useEffect(() => {
    const fullText = parts.join("");

    if (indexRef.current >= fullText.length) {
      setStream(fullText);
      return;
    }

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    const animate = (time: number) => {
      if (indexRef.current < fullText.length) {
        if (time - lastTimeRef.current > TYPING_SPEED) {
          indexRef.current++;
          setStream(fullText.slice(0, indexRef.current));
          lastTimeRef.current = time;
        }
        frameRef.current = requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [parts]);

  return { stream, addPart, reset };
}
