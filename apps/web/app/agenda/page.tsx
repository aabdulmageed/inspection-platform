"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";
import { Card, Badge, Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/Button";

type Job = {
  id: string;
  status: string;
  myStatus: string | null;
  scheduledAt: string | null;
  property: { address: string; client: { name: string } };
  assignments: { discipline: string; status: string; inspector: { name: string } }[];
};

const todayStr = () => new Date().toISOString().slice(0, 10);
function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AgendaPage() {
  const { t, dir, lang } = useI18n();
  const { ready, token, user, authedFetch } = useAuth();
  const router = useRouter();
  const [date, setDate] = useState(todayStr());
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) return void router.replace("/login");
    setJobs(null);
    authedFetch(`/agenda?date=${date}`).then((r) => (r.ok ? r.json() : [])).then(setJobs).catch(() => setJobs([]));
  }, [ready, token, date]);

  if (!ready || !token) return <Skeleton className="h-96" />;

  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const pretty = new Date(`${date}T00:00:00.000Z`).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays size={22} className="text-navy dark:text-white" />
        <h1 className="text-2xl font-bold flex-1">{t("agenda.title")}</h1>
        <Button variant="outline" size="sm" onClick={() => setDate(todayStr())}>{t("agenda.today")}</Button>
      </div>

      {/* Date navigation */}
      <Card className="p-3 flex items-center gap-3">
        <button onClick={() => setDate(shift(date, -1))} className="grid place-items-center h-9 w-9 rounded-lg border border-line hover:bg-surface-2 transition" aria-label="previous day">
          <Prev size={18} />
        </button>
        <div className="flex-1 text-center font-semibold">{pretty}</div>
        <button onClick={() => setDate(shift(date, 1))} className="grid place-items-center h-9 w-9 rounded-lg border border-line hover:bg-surface-2 transition" aria-label="next day">
          <Next size={18} />
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="bg-bg border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:border-navy"
        />
      </Card>

      {jobs === null ? (
        <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : jobs.length === 0 ? (
        <Card className="p-10 text-center text-muted text-sm">{t("agenda.empty")}</Card>
      ) : (
        <div className="grid gap-3">
          {jobs.map((j) => (
            <Link key={j.id} href={`/inspections/${j.id}`}>
              <Card className="p-4 hover:border-navy/40 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{j.property.client.name}</div>
                    <div className="text-muted text-sm flex items-center gap-1 mt-0.5 min-w-0">
                      <MapPin size={13} className="shrink-0" /> <span className="truncate">{j.property.address}</span>
                    </div>
                  </div>
                  {/* Inspector sees their own task status; staff see overall status. */}
                  <Badge tone={j.myStatus === "SIGNED" ? "good" : "brand"}>
                    {t(`${j.myStatus ? "assign" : "status"}.${j.myStatus ?? j.status}`)}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {j.assignments.map((a) => (
                    <span key={a.discipline} className="text-xs text-muted">
                      <b className="text-fg">{t(`discipline.${a.discipline}`)}</b> · {a.inspector.name}
                    </span>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
