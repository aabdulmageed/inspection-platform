"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Trash2, AlertTriangle, MapPin } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Modal";
import { Card, Badge, Skeleton, Select } from "../components/ui/primitives";
import { Button } from "../components/ui/Button";

type Inspection = {
  id: string;
  type: string;
  status: string;
  itemsCount: number;
  issuesCount: number;
  property: { address: string; client: { name: string } };
  assignments: { discipline: string; status: string; inspector: { name: string } }[];
};

const STATUSES = ["DRAFT", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "REPORTED"];

export default function Dashboard() {
  const { t, dir } = useI18n();
  const { ready, token, user, authedFetch } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Inspection[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";

  useEffect(() => {
    if (!ready) return;
    if (!token) return void router.replace("/login");
    // Inspectors work from their daily to-do, not the full report list.
    if (user?.role === "INSPECTOR") return void router.replace("/agenda");
    authedFetch("/inspections").then((r) => (r.ok ? r.json() : [])).then(setData).catch(() => setData([]));
  }, [ready, token]);

  const stats = useMemo(() => {
    const d = data ?? [];
    return {
      total: d.length,
      inProgress: d.filter((i) => i.status === "IN_PROGRESS").length,
      completed: d.filter((i) => i.status === "COMPLETED" || i.status === "REPORTED").length,
      issues: d.reduce((s, i) => s + (i.issuesCount ?? 0), 0),
    };
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((i) => {
      const matchesQ =
        !q ||
        i.property.client.name.toLowerCase().includes(q.toLowerCase()) ||
        i.property.address.toLowerCase().includes(q.toLowerCase());
      const matchesF = !filter || i.status === filter;
      return matchesQ && matchesF;
    });
  }, [data, q, filter]);

  async function remove(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      message: t("reports.confirmDelete"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    const res = await authedFetch(`/inspections/${id}`, { method: "DELETE" });
    if (res.ok) {
      setData((d) => (d ? d.filter((x) => x.id !== id) : d));
      toast(t("common.delete") + " ✓");
    }
  }

  if (!ready || !token) return <DashSkeleton />;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
          <p className="text-muted text-sm mt-0.5">{t("dashboard.subtitle")}</p>
        </div>
        {canManage && (
          <Link href="/new">
            <Button><Plus size={17} /> {t("dashboard.newBtn")}</Button>
          </Link>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t("stat.total")} value={stats.total} />
        <Stat label={t("stat.inProgress")} value={stats.inProgress} />
        <Stat label={t("stat.completed")} value={stats.completed} />
        <Stat label={t("stat.issues")} value={stats.issues} tone="issue" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("dashboard.search")}
            className="w-full bg-surface border border-line rounded-lg ps-9 pe-3 py-2.5 text-sm outline-none focus:border-navy transition"
          />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto!">
          <option value="">{t("dashboard.filterAll")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
      </div>

      {/* List */}
      {data === null ? (
        <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-fg font-semibold">{t("dashboard.empty")}</div>
          <div className="text-muted text-sm mt-1">{t("dashboard.empty.hint")}</div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((i) => {
            const signed = i.assignments.filter((a) => a.status === "SIGNED").length;
            const total = i.assignments.length || 1;
            return (
              <Link key={i.id} href={`/inspections/${i.id}`}>
                <Card className="p-4 hover:border-navy/40 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{i.property.client.name}</div>
                      <div className="text-muted text-sm flex items-center gap-1 mt-0.5 min-w-0">
                        <MapPin size={13} className="shrink-0" /> <span className="truncate">{i.property.address}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone="brand">{t(`status.${i.status}`)}</Badge>
                      {canManage && (
                        <button onClick={(e) => remove(e, i.id)} className="grid place-items-center h-8 w-8 rounded-lg text-muted hover:text-issue hover:bg-issue/10 transition" aria-label="delete">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3 flex-wrap" style={{ flexDirection: dir === "rtl" ? "row-reverse" : "row" }}>
                    {i.assignments.map((a) => (
                      <span key={a.discipline} className="text-xs text-muted">
                        <b className="text-fg">{t(`discipline.${a.discipline}`)}</b> · {t(`assign.${a.status}`)}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full bg-brand-gradient" style={{ width: `${(signed / total) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted shrink-0">{signed}/{total} {t("card.signed")}</span>
                    {i.issuesCount > 0 && (
                      <Badge tone="issue"><AlertTriangle size={12} /> {i.issuesCount} {t("card.issues")}</Badge>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "issue" }) {
  return (
    <Card className="p-4">
      <div className={`text-3xl font-extrabold ${tone === "issue" && value > 0 ? "text-issue" : "text-navy dark:text-white"}`}>{value}</div>
      <div className="text-muted text-xs font-semibold mt-1">{label}</div>
    </Card>
  );
}

function DashSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
    </div>
  );
}
