import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "error";

export type Toast = {
  /** Increments on every call, so repeating the same message re-triggers it. */
  id: number;
  message: string;
  tone: ToastTone;
};

/**
 * Transient status message with an auto-dismiss.
 *
 * The id matters: keying only on the message means showing the same text twice
 * in a row leaves state unchanged, the dismiss effect never re-runs, and the
 * second toast either vanishes early or never appears.
 */
export function useToast(durationMs = 2400) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextIdRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    nextIdRef.current += 1;
    setToast({ id: nextIdRef.current, message, tone });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return undefined;
    timerRef.current = window.setTimeout(() => setToast(null), durationMs);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [toast, durationMs]);

  return { toast, showToast, clearToast };
}
