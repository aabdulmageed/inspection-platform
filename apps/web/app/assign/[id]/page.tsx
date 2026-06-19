"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Users as UsersIcon, Check, MapPin, CalendarDays } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../components/ui/Toast";
import { Card, Field, Select, Input, Skeleton } from "../../../components/ui/primitives";
import { Button } from "../../../components/ui/Button";

type U = { id: string; name: string; role: string; discipline: string | null };
type Detail = {
  id: string;
  scheduledAt: string | null;
  property: { address: string; client: { name: string } };
  assignments: { discipline: string; inspector: { id: string; name: string } }[];
};
const DISCIPLINES = ["CIVIL", "ELECTRICAL", "PLUMBING", "PEST_OTHER"];

export default function AssignPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { ready, token, authedFetch } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [job, setJob] = useState<Detail | null>(null);
  const [inspectors, setInspectors] = useState<U[]>([]);
  const [scheduledAt, setScheduledAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!token) return void router.replace("/login");
    authedFetch("/users").then((r) => (r.ok ? r.json() : [])).then((u: U[]) => setInspectors(u.filter((x) => x.role === "INSPECTOR"))).catch(() => {});
    authedFetch(`/inspections/${id}`).then((r) => (r.ok ? r.json() : null)).then((d: Detail | null) => {
      if (!d) return;
      setJob(d);
      if (d.scheduledAt) setScheduledAt(new Date(d.scheduledAt).toISOString().slice(0, 10));
      // Prefill existing assignments (for reschedule/reassign).
      setAssign(Object.fromEntries(d.assignments.map((a) => [a.discipline, a.inspector.id])));
    }).catch(() => {});
  }, [ready, token, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const assignments = Object.entries(assign).filter(([, v]) => v).map(([discipline, inspectorId]) => ({ discipline, inspectorId }));
    const res = await authedFetch(`/inspections/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt, assignments }),
    });
    setBusy(false);
    if (res.ok) {
      toast(t("assign.save") + " ✓");
      router.push(`/inspections/${id}`);
    }
  }

  if (!ready || !token || !job) return <Skeleton className="h-96" />;

  return (
    <form onSubmit={submit} className="max-w-xl grid gap-5">
      <h1 className="text-2xl font-bold">{t("assign.pageTitle")}</h1>

      {/* Which customer we're assigning for */}
      <Card className="p-4">
        <div className="font-bold">{job.property.client.name}</div>
        <div className="text-muted text-sm flex items-center gap-1 mt-0.5">
          <MapPin size={13} /> {job.property.address}
        </div>
      </Card>

      <Card className="p-5 grid gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy dark:text-white">
          <CalendarDays size={16} /> {t("new.scheduledDate")}
        </h2>
        <Input type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </Card>

      <Card className="p-5 grid gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy dark:text-white">
          <UsersIcon size={16} /> {t("new.assignTeam")}
        </h2>
        <p className="text-xs text-muted m-0">{t("new.assignHint")}</p>
        {DISCIPLINES.map((d) => (
          <Field key={d} label={t(`discipline.${d}`)}>
            <Select value={assign[d] ?? ""} onChange={(e) => setAssign({ ...assign, [d]: e.target.value })}>
              <option value="">{t("new.none")}</option>
              {inspectors.filter((i) => i.discipline === d).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
        ))}
      </Card>

      <Button type="submit" disabled={busy} className="w-full">
        <Check size={17} /> {busy ? t("assign.saving") : t("assign.save")}
      </Button>
    </form>
  );
}
