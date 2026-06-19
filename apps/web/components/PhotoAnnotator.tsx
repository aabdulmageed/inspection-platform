"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, Eraser } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

type Stroke = { x: number; y: number }[];

/**
 * Lets the inspector draw red marks over a photo to point at the issue.
 * The marks are composited into the JPEG, so reports show the annotated image.
 */
export function PhotoAnnotator({
  file,
  onDone,
  onCancel,
}: {
  file: File | null;
  onDone: (annotated: Blob) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [hasMarks, setHasMarks] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the chosen file into the canvas, downscaled to a sane size.
  useEffect(() => {
    if (!file) return;
    strokes.current = [];
    setHasMarks(false);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current!;
      const maxW = 1280;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      redraw();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file]);

  function redraw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e02020";
    ctx.lineWidth = Math.max(3, canvas.width / 220);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  /** Map a pointer event to canvas-bitmap coordinates (canvas is CSS-scaled). */
  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    current.current = [pos(e)];
    strokes.current.push(current.current);
  }
  function move(e: React.PointerEvent) {
    if (!current.current) return;
    current.current.push(pos(e));
    redraw();
  }
  function up() {
    if (current.current && current.current.length > 1) setHasMarks(true);
    else if (current.current) strokes.current.pop(); // discard accidental taps
    current.current = null;
    redraw();
  }

  function undo() {
    strokes.current.pop();
    setHasMarks(strokes.current.length > 0);
    redraw();
  }
  function clear() {
    strokes.current = [];
    setHasMarks(false);
    redraw();
  }

  async function save(skipMarks: boolean) {
    setSaving(true);
    if (skipMarks) clear();
    redraw();
    canvasRef.current!.toBlob(
      (blob) => {
        setSaving(false);
        if (blob) onDone(blob);
      },
      "image/jpeg",
      0.88,
    );
  }

  return (
    <Modal open={!!file} onClose={onCancel} title={t("annotate.title")}>
      <div className="grid gap-3">
        <p className="text-xs text-muted m-0">{t("annotate.hint")}</p>
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="w-full rounded-lg border border-line cursor-crosshair touch-none"
        />
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={undo} disabled={!hasMarks}>
              <Undo2 size={14} /> {t("annotate.undo")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasMarks}>
              <Eraser size={14} /> {t("annotate.clear")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => save(true)} disabled={saving}>
              {t("annotate.skip")}
            </Button>
            <Button type="button" size="sm" onClick={() => save(false)} disabled={saving}>
              {saving ? t("common.loading") : t("annotate.save")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
