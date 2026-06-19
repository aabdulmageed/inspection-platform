"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import { useI18n } from "../lib/i18n";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

export type PickedLocation = { latitude: number; longitude: number; address?: string };

/**
 * Click-to-pick location on an OpenStreetMap map; reverse-geocodes the point
 * via Nominatim to suggest an address (the user can still edit it manually).
 */
export function MapPicker({
  open,
  onClose,
  onPick,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (loc: PickedLocation) => void;
  initial?: { latitude: number; longitude: number } | null;
}) {
  const { t, lang } = useI18n();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!open || !mapEl.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current) return;

      const start = initial ?? { latitude: 33.3152, longitude: 44.3661 }; // Baghdad default
      const map = L.map(mapEl.current).setView([start.latitude, start.longitude], initial ? 16 : 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", async (e) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.circleMarker([lat, lng], {
          radius: 9,
          color: "#134486",
          fillColor: "#39b045",
          fillOpacity: 0.9,
          weight: 3,
        }).addTo(map);

        setPicked({ latitude: lat, longitude: lng });
        setResolving(true);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang}`,
          );
          const data = await res.json();
          setPicked({ latitude: lat, longitude: lng, address: data.display_name });
        } catch {
          /* keep coords without address */
        } finally {
          setResolving(false);
        }
      });

      mapRef.current = map;
      // The modal animates in; make sure tiles size correctly.
      setTimeout(() => map.invalidateSize(), 120);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Tear the map down when the modal closes so it can re-init cleanly.
  useEffect(() => {
    if (!open && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
      setPicked(null);
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={t("map.title")}>
      <div className="grid gap-3">
        <div ref={mapEl} className="h-72 w-full rounded-lg border border-line overflow-hidden" />
        <div className="text-xs text-muted min-h-8">
          {resolving ? t("common.loading") : picked?.address ?? t("map.hint")}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!picked} onClick={() => picked && onPick(picked)}>
            {t("map.use")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
