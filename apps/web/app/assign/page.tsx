"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, ArrowRight, ArrowLeft } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";
import { Card, Skeleton } from "../../components/ui/primitives";

type Job = {
  id: string;
  status: string;
  property: { address: string; client: { name: string } };
};

export default function AssignList() {
  const { t, dir } = useI18n();
  const { ready, token, authedFetch } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) return void router.replace("/login");
    authedFetch("/inspections")
      .then((r) => (r.ok ? r.json() : []))
      .then((all: Job[]) => setJobs(all.filter((j) => j.status === "DRAFT")))
      .catch(() => setJobs([]));
  }, [ready, token]);

  if (!ready || !token) return <Skeleton className="h-96" />;
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-bold">{t("assign.pendingTitle")}</h1>
      {jobs === null ? (
        <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : jobs.length === 0 ? (
        <Card className="p-10 text-center text-muted text-sm">{t("assign.pendingEmpty")}</Card>
      ) : (
        <div className="grid gap-3">
          {jobs.map((j) => (
            <Link key={j.id} href={`/assign/${j.id}`}>
              <Card className="p-4 flex items-center justify-between gap-3 hover:border-navy/40 transition">
                <div className="min-w-0">
                  <div className="font-bold truncate">{j.property.client.name}</div>
                  <div className="text-muted text-sm flex items-center gap-1 mt-0.5">
                    <MapPin size={13} /> <span className="truncate">{j.property.address}</span>
                  </div>
                </div>
                <Arrow size={18} className="text-muted shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
