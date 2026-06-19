"use client";

import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { Button } from "./Button";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface border border-line rounded-card shadow-card p-5 animate-[fadeIn_.15s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="text-lg font-bold text-fg mb-2">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/* ---- Imperative confirm() returning a Promise<boolean> ---- */
type ConfirmOpts = { title?: string; message: string; confirmLabel: string; cancelLabel: string };

const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const done = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => done(false)} title={opts?.title}>
        <p className="text-sm text-muted mb-5">{opts?.message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => done(false)}>{opts?.cancelLabel}</Button>
          <Button variant="danger" onClick={() => done(true)}>{opts?.confirmLabel}</Button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
