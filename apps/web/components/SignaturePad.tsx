"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { Button } from "./ui/Button";

/** Canvas signature pad (mouse + touch). Returns a PNG data URI on save. */
export function SignaturePad({ onSave, saving }: { onSave: (dataUri: string) => void; saving?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const canvas = canvasRef.current!;
    // Match the canvas bitmap to its CSS size for crisp strokes.
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#16202c";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setDirty(true);
  }
  function up() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setDirty(false);
  }

  return (
    <div className="grid gap-3">
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full h-40 bg-white rounded-lg border border-line cursor-crosshair touch-none"
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={clear}>{t("sig.clear")}</Button>
        <Button
          type="button"
          disabled={!dirty || saving}
          onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}
        >
          {saving ? t("common.loading") : t("sig.save")}
        </Button>
      </div>
    </div>
  );
}
