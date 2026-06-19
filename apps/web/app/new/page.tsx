"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Home, MapPin, ArrowRight, ArrowLeft } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/ui/Toast";
import { Card, Field, Input, Select } from "../../components/ui/primitives";
import { Button } from "../../components/ui/Button";
import { MapPicker } from "../../components/MapPicker";

const PROPERTY_TYPES = ["APARTMENT", "HOUSE"];

/** Page 1 — enter the customer & property only. Creates a draft job, then
 *  sends the manager to the separate assignment page. */
export default function NewCustomer() {
  const { t, dir } = useI18n();
  const { authedFetch } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [property, setProperty] = useState({ address: "", type: "" });
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [type, setType] = useState("pre-purchase");

  const valid = customer.name.trim() && property.address.trim() && property.type && type.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await authedFetch("/inspections/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer, property: { ...property, ...(coords ?? {}) }, type }),
    });
    setBusy(false);
    if (res.ok) {
      const insp = await res.json();
      toast(t("new.saveCustomer") + " ✓");
      router.push(`/assign/${insp.id}`); // → separate assignment page
    }
  }

  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <form onSubmit={submit} className="max-w-xl grid gap-5">
      <h1 className="text-2xl font-bold">{t("new.title")}</h1>

      <Card className="p-5 grid gap-3">
        <SectionTitle icon={<User size={16} />}>{t("new.customer")}</SectionTitle>
        <Field label={t("new.name")}><Input required value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("new.phone")}><Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
          <Field label={t("new.email")}><Input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></Field>
        </div>
      </Card>

      <Card className="p-5 grid gap-3">
        <SectionTitle icon={<Home size={16} />}>{t("new.property")}</SectionTitle>
        <Field label={t("new.address")}>
          <div className="flex gap-2">
            <Input required value={property.address} onChange={(e) => setProperty({ ...property, address: e.target.value })} />
            <Button type="button" variant="outline" onClick={() => setMapOpen(true)} className="shrink-0">
              <MapPin size={15} /> {t("map.pick")}
            </Button>
          </div>
          {coords && <span className="text-xs text-muted">📍 {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}</span>}
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("new.propertyType")}>
            <Select value={property.type} onChange={(e) => setProperty({ ...property, type: e.target.value })}>
              <option value="" disabled>{t("ptype.placeholder")}</option>
              {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{t(`ptype.${p}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("new.inspectionType")}><Input required value={type} onChange={(e) => setType(e.target.value)} /></Field>
        </div>
      </Card>

      <Button type="submit" disabled={!valid || busy} className="w-full">
        {busy ? t("new.creating") : t("new.saveCustomer")} <Arrow size={16} />
      </Button>

      <MapPicker
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={coords}
        onPick={(loc) => {
          setCoords({ latitude: loc.latitude, longitude: loc.longitude });
          if (loc.address) setProperty((p) => ({ ...p, address: loc.address! }));
          setMapOpen(false);
        }}
      />
    </form>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <h2 className="flex items-center gap-2 text-sm font-bold text-navy dark:text-white">{icon}{children}</h2>;
}
