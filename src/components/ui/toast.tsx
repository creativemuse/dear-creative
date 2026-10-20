"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
  };
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const fallbackToast: ToastContextValue = {
  toast: {
    success: (msg: string) => console.log("[Toast Success]", msg),
    error: (msg: string) => console.error("[Toast Error]", msg),
    info: (msg: string) => console.log("[Toast Info]", msg),
    warning: (msg: string) => console.warn("[Toast Warning]", msg),
  },
  removeToast: () => {},
};

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? fallbackToast;
}


export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 4500) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = { id, type, message, duration };

      setToasts((prev) => [...prev.slice(-4), newToast]); // keep max 5 on screen

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (msg, dur) => addToast("success", msg, dur),
        error: (msg, dur) => addToast("error", msg, dur),
        info: (msg, dur) => addToast("info", msg, dur),
        warning: (msg, dur) => addToast("warning", msg, dur),
      },
      removeToast,
    }),
    [addToast, removeToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast Notification Container */}
      <div
        aria-live="polite"
        role="region"
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 ${
              t.type === "error"
                ? "border-red-500/30 bg-white/95 text-red-950 shadow-red-500/5 dark:border-red-900/50 dark:bg-zinc-900/95 dark:text-red-200"
                : t.type === "success"
                  ? "border-emerald-500/30 bg-white/95 text-emerald-950 shadow-emerald-500/5 dark:border-emerald-900/50 dark:bg-zinc-900/95 dark:text-emerald-200"
                  : t.type === "warning"
                    ? "border-amber-500/30 bg-white/95 text-amber-950 shadow-amber-500/5 dark:border-amber-900/50 dark:bg-zinc-900/95 dark:text-amber-200"
                    : "border-zinc-200/80 bg-white/95 text-zinc-900 shadow-zinc-500/5 dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-100"
            }`}
          >
            {/* Status Icon */}
            <div className="mt-0.5 shrink-0">
              {t.type === "error" ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/80 dark:text-red-400">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
              ) : t.type === "success" ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              ) : t.type === "warning" ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-950/80 dark:text-sky-400">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
              )}
            </div>

            {/* Message Body */}
            <div className="flex-1 text-xs font-medium leading-relaxed">
              {t.message}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="shrink-0 rounded-md p-1 text-zinc-400 opacity-70 transition-opacity hover:opacity-100 dark:text-zinc-500"
              title="Dismiss"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
