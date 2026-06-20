"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileDown, ImagePlus, MapPin, Mail, PenLine, Lock, CalendarDays, Plus, Camera } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../components/ui/Toast";
import { Modal, useConfirm } from "../../../components/ui/Modal";
import { Card, Badge, Select, Skeleton } from "../../../components/ui/primitives";
import { Button } from "../../../components/ui/Button";
import { SignaturePad } from "../../../components/SignaturePad";
import { PhotoAnnotator } from "../../../components/PhotoAnnotator";

type Item = {
  id: string; discipline: string; component: string;
  status: string | null; note: string | null; photos: { id: string; url: string }[];
};
type Room = { id: string; name: string; items: Item[] };
type Detail = {
  id: string; type: string; status: string;
  property: { address: string; client: { name: string } };
  assignments: { discipline: string; status: string; inspector: { name: string } }[];
  rooms: Room[];
  signatures: { id: string; discipline: string | null; isManager: boolean; imageUrl: string }[];
  reviewComments: { id: string; authorName: string; discipline: string | null; text: string; createdAt: string }[];
  report: { pdfUrl: string; lang: string; generatedAt: string } | null;
};
const STATUS_OPTIONS = ["", "GOOD", "ISSUE", "NA"];

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, dir, lang } = useI18n();
  const { ready, token, user, authedFetch } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [data, setData] = useState<Detail | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [signTarget, setSignTarget] = useState<"self" | "manager" | null>(null);
  const [annotating, setAnnotating] = useState<{ item: Item; file: File } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewTarget, setReviewTarget] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [checkRoomId, setCheckRoomId] = useState<string | null>(null);
  const [checkName, setCheckName] = useState("");
  const [checkDiscipline, setCheckDiscipline] = useState("CIVIL");
  const [signSaving, setSignSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);

  function load() {
    authedFetch(`/inspections/${id}`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }
  useEffect(() => {
    if (!ready) return;
    if (!token) return void router.replace("/login");
    load();
  }, [ready, token, id]);

  function patchLocal(itemId: string, patch: Partial<Item>) {
    setData((d) => d ? { ...d, rooms: d.rooms.map((r) => ({ ...r, items: r.items.map((it) => it.id === itemId ? { ...it, ...patch } : it) })) } : d);
  }

  async function patchItem(item: Item, patch: { status?: string; note?: string }) {
    patchLocal(item.id, patch as Partial<Item>);
    const body: any = { ...patch };
    if (body.status === "") delete body.status;
    await authedFetch(`/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  async function uploadPhoto(item: Item, file: Blob) {
    const form = new FormData();
    form.append("file", file, "photo.jpg");
    const res = await authedFetch(`/items/${item.id}/photos`, { method: "POST", body: form });
    if (!res.ok) return toast(t("login.error"), "error");
    const photo = await res.json();
    patchLocal(item.id, { photos: [...item.photos, photo] });
    toast(t("detail.addPhoto").replace("+ ", "") + " ✓");
  }

  async function generateReport() {
    setGenerating(true);
    const before = data?.report?.generatedAt ?? null;
    const res = await authedFetch(`/inspections/${id}/report?lang=${lang}`, { method: "POST" });
    if (!res.ok) {
      setGenerating(false);
      return toast(t("detail.reportError"), "error");
    }
    toast(t("report.queuedToast"), "info");
    // Poll until the worker stores the new report.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const d: Detail | null = await authedFetch(`/inspections/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (d?.report && d.report.generatedAt !== before) {
        setData(d);
        setGenerating(false);
        toast(t("report.ready"));
        return;
      }
    }
    setGenerating(false);
    toast(t("detail.reportError"), "error");
  }

  async function saveSignature(dataUri: string) {
    setSignSaving(true);
    const res = await authedFetch(`/inspections/${id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: dataUri }),
    });
    setSignSaving(false);
    if (!res.ok) return toast(t("login.error"), "error");
    setSignTarget(null);
    toast(t("sig.signed"));
    load();
  }

  async function sendBack() {
    const res = await authedFetch(`/inspections/${id}/request-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reviewText, ...(reviewTarget ? { discipline: reviewTarget } : {}) }),
    });
    if (!res.ok) return toast(t("detail.reportError"), "error");
    setReviewOpen(false);
    setReviewText("");
    setReviewTarget("");
    toast(t("review.sent"));
    load();
  }

  async function removePhoto(item: Item, photoId: string) {
    const ok = await confirmDialog({
      message: t("photo.confirmDelete"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    const res = await authedFetch(`/photos/${photoId}`, { method: "DELETE" });
    if (!res.ok) return toast(t("login.error"), "error");
    patchLocal(item.id, { photos: item.photos.filter((p) => p.id !== photoId) });
    toast(t("common.delete") + " ✓");
  }

  async function addRoom() {
    const res = await authedFetch(`/inspections/${id}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName.trim() }),
    });
    if (!res.ok) return toast(t("login.error"), "error");
    const room = await res.json();
    setData((d) => (d ? { ...d, rooms: [...d.rooms, { ...room, items: [] }] } : d));
    setActiveRoomId(room.id);
    setRoomModalOpen(false);
    setRoomName("");
    toast(t("room.add") + " ✓");
  }

  async function addCheck() {
    if (!checkRoomId) return;
    const body: any = { component: checkName.trim() };
    if (canManage) body.discipline = checkDiscipline;
    const res = await authedFetch(`/rooms/${checkRoomId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return toast(t("login.error"), "error");
    const item = await res.json();
    setData((d) =>
      d ? { ...d, rooms: d.rooms.map((r) => (r.id === checkRoomId ? { ...r, items: [...r.items, item] } : r)) } : d,
    );
    setCheckRoomId(null);
    setCheckName("");
    toast(t("check.add") + " ✓");
  }

  async function emailReport() {
    setEmailing(true);
    const res = await authedFetch(`/inspections/${id}/email-report?lang=${lang}`, { method: "POST" });
    setEmailing(false);
    if (!res.ok) return toast(t("report.emailError"), "error");
    toast(t("report.emailSent"));
  }

  if (!ready || !token || !data) return <Skeleton className="h-96" />;

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const locked = data.status === "COMPLETED" || data.status === "REPORTED";
  const canEdit = (item: Item) => !locked && (canManage || user?.discipline === item.discipline);
  const assignedMe = data.assignments.some((a) => a.discipline === user?.discipline);
  const canContribute = !locked && (canManage || (user?.role === "INSPECTOR" && assignedMe));
  // Admin can approve at any stage (override); manager only once in review.
  const canApprove = !locked && (user?.role === "ADMIN" || (user?.role === "MANAGER" && data.status === "IN_REVIEW"));

  // Inspectors only see checks for their own discipline; managers see everything.
  const isInspector = user?.role === "INSPECTOR";
  const visibleRooms = isInspector
    ? data.rooms
        .map((r) => ({ ...r, items: r.items.filter((i) => i.discipline === user?.discipline) }))
        .filter((r) => r.items.length > 0 || r.id === activeRoomId)
    : data.rooms;
  const activeRoom = visibleRooms.find((r) => r.id === activeRoomId) ?? visibleRooms[0];
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className="grid gap-5">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg transition w-fit">
        <Back size={15} /> {t("detail.back").replace(/[←→]\s*/, "")}
      </Link>

      {locked && (
        <div className="flex items-center gap-2 rounded-card border border-good/40 bg-good/10 text-good px-4 py-3 text-sm font-semibold">
          <Lock size={16} /> {t("lock.banner")}
        </div>
      )}

      {/* Header card */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words">{data.property.client.name}</h1>
            <div className="text-muted text-sm flex items-center gap-1 mt-1 min-w-0"><MapPin size={14} className="shrink-0" /> <span className="truncate">{data.property.address}</span></div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="brand">{t(`status.${data.status}`)}</Badge>
            {canManage && (
              <Button onClick={generateReport} disabled={generating}>
                <FileDown size={16} /> {generating ? t("common.loading") : t("detail.generateReport")}
              </Button>
            )}
            {canManage && !locked && (
              <Link href={`/assign/${id}`}>
                <Button variant="outline"><CalendarDays size={16} /> {t("assign.editTeam")}</Button>
              </Link>
            )}
            {data.report && (
              <a href={data.report.pdfUrl} target="_blank" rel="noreferrer">
                <Button variant="outline"><FileDown size={16} /> {t("report.download")}</Button>
              </a>
            )}
            {canManage && data.report && (
              <Button variant="outline" onClick={emailReport} disabled={emailing}>
                <Mail size={16} /> {emailing ? t("common.loading") : t("report.email")}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {data.assignments.map((a) => (
            <span key={a.discipline} className="inline-flex items-center gap-1.5 bg-surface-2 border border-line rounded-lg px-2.5 py-1 text-xs">
              <b>{t(`discipline.${a.discipline}`)}</b> · {a.inspector.name}
              <Badge tone={a.status === "SIGNED" ? "good" : "neutral"}>{t(`assign.${a.status}`)}</Badge>
            </span>
          ))}
        </div>
      </Card>

      {/* Signatures */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy dark:text-white mb-3">
          <PenLine size={16} /> {t("sig.heading")}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.assignments.map((a) => {
            const sig = data.signatures.find((s) => s.discipline === a.discipline);
            const isMine = user?.role === "INSPECTOR" && user.discipline === a.discipline;
            return (
              <div key={a.discipline} className="border border-line rounded-lg p-3 grid gap-2">
                <div className="text-xs font-bold">{t(`discipline.${a.discipline}`)}</div>
                <div className="text-xs text-muted truncate">{a.inspector.name}</div>
                {sig ? (
                  <SigPreview url={sig.imageUrl} />
                ) : isMine ? (
                  <Button size="sm" onClick={() => setSignTarget("self")}><PenLine size={13} /> {t("sig.sign")}</Button>
                ) : (
                  <Badge>{t(`assign.${a.status}`)}</Badge>
                )}
              </div>
            );
          })}
          {/* Manager approval — always the final signature */}
          <div className="border border-line rounded-lg p-3 grid gap-2">
            <div className="text-xs font-bold">{t("sig.manager")}</div>
            <div className="text-xs text-muted truncate">{user?.role !== "INSPECTOR" ? user?.name : "—"}</div>
            {(() => {
              const sig = data.signatures.find((s) => s.isManager);
              if (sig) return <SigPreview url={sig.imageUrl} />;
              if (canApprove)
                return <Button size="sm" onClick={() => setSignTarget("manager")}><PenLine size={13} /> {t("sig.approve")}</Button>;
              return <Badge>{t(`status.${data.status}`)}</Badge>;
            })()}
          </div>
        </div>
        {canManage && data.status === "IN_REVIEW" && (
          <div className="mt-3">
            <Button variant="danger" size="sm" onClick={() => setReviewOpen(true)}>
              {t("review.requestChanges")}
            </Button>
          </div>
        )}
      </Card>

      {/* Review comments from the manager */}
      {data.reviewComments.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-navy dark:text-white mb-3">{t("review.comments")}</h2>
          <div className="grid gap-2">
            {data.reviewComments.map((c) => (
              <div key={c.id} className="border border-line rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <b className="text-xs">{c.authorName}</b>
                  <span className="text-xs text-muted">
                    {c.discipline ? t(`discipline.${c.discipline}`) : t("review.all")} ·{" "}
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                {c.text}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Room selector — pick the room to work on */}
      <div className="flex flex-wrap gap-2">
        {visibleRooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setActiveRoomId(r.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              activeRoom?.id === r.id ? "bg-brand-gradient text-white" : "bg-surface border border-line text-fg hover:bg-surface-2"
            }`}
          >
            {r.name}
          </button>
        ))}
        {canContribute && (
          <button
            onClick={() => { setRoomName(""); setRoomModalOpen(true); }}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-dashed border-line text-muted hover:bg-surface-2 inline-flex items-center gap-1"
          >
            <Plus size={14} /> {t("room.add")}
          </button>
        )}
      </div>

      {/* Active room's checks */}
      {activeRoom && (
        <div key={activeRoom.id} className="grid gap-2">
          <div className="bg-brand-gradient text-white font-bold px-4 py-2 rounded-lg">{activeRoom.name}</div>
          {activeRoom.items.map((item) => (
            <Card key={item.id} className={`p-4 ${item.status === "ISSUE" ? "border-t-[3px] border-t-issue" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">
                  {item.component} <span className="text-xs text-muted font-normal">· {t(`discipline.${item.discipline}`)}</span>
                </div>
                <Select
                  value={item.status ?? ""}
                  disabled={!canEdit(item)}
                  onChange={(e) => patchItem(item, { status: e.target.value })}
                  className={`w-auto! py-1.5! font-bold ${item.status === "ISSUE" ? "text-issue" : item.status === "GOOD" ? "text-good" : ""}`}
                >
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`itemStatus.${s}`)}</option>)}
                </Select>
              </div>
              <input
                defaultValue={item.note ?? ""}
                disabled={!canEdit(item)}
                placeholder={t("detail.notePlaceholder")}
                onBlur={(e) => e.target.value !== (item.note ?? "") && patchItem(item, { note: e.target.value })}
                className="w-full mt-3 bg-bg border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-navy transition"
              />
              <div className="flex flex-wrap gap-2 items-center mt-3">
                {item.photos.map((p) => (
                  <div key={p.id} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" onClick={() => setLightbox(p.url)}
                      className="w-20 h-16 object-cover rounded-lg border border-line cursor-pointer hover:opacity-90 transition" />
                    {canEdit(item) && (
                      <button
                        onClick={() => removePhoto(item, p.id)}
                        aria-label="remove photo"
                        className="absolute -top-1.5 -end-1.5 grid place-items-center h-5 w-5 rounded-full bg-issue text-white text-[11px] leading-none opacity-0 group-hover:opacity-100 transition"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {canEdit(item) && (
                  <>
                    {/* Camera — opens the device camera on phones/tablets. */}
                    <label title={t("photo.camera")} className="grid place-items-center gap-0.5 w-20 h-16 rounded-lg border border-dashed border-line text-muted hover:bg-surface-2 cursor-pointer transition">
                      <Camera size={18} />
                      <span className="text-[10px] leading-none">{t("photo.camera")}</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) setAnnotating({ item, file: f }); e.target.value = ""; }} />
                    </label>
                    {/* Gallery — pick an existing photo. */}
                    <label title={t("photo.gallery")} className="grid place-items-center gap-0.5 w-20 h-16 rounded-lg border border-dashed border-line text-muted hover:bg-surface-2 cursor-pointer transition">
                      <ImagePlus size={18} />
                      <span className="text-[10px] leading-none">{t("photo.gallery")}</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) setAnnotating({ item, file: f }); e.target.value = ""; }} />
                    </label>
                  </>
                )}
              </div>
            </Card>
          ))}
          {canContribute && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCheckName(""); setCheckDiscipline(user?.discipline ?? "CIVIL"); setCheckRoomId(activeRoom.id); }}
              className="w-fit"
            >
              <Plus size={14} /> {t("check.add")}
            </Button>
          )}
        </div>
      )}

      {/* Photo lightbox */}
      <Modal open={!!lightbox} onClose={() => setLightbox(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {lightbox && <img src={lightbox} alt="" className="w-full rounded-lg" />}
      </Modal>

      {/* Photo annotation before upload */}
      <PhotoAnnotator
        file={annotating?.file ?? null}
        onCancel={() => setAnnotating(null)}
        onDone={(blob) => {
          const target = annotating!.item;
          setAnnotating(null);
          uploadPhoto(target, blob);
        }}
      />

      {/* Signature modal */}
      <Modal
        open={!!signTarget}
        onClose={() => setSignTarget(null)}
        title={signTarget === "manager" ? t("sig.approve") : t("sig.modalTitle")}
      >
        <SignaturePad onSave={saveSignature} saving={signSaving} />
      </Modal>

      {/* Request-changes modal */}
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={t("review.requestChanges")}>
        <div className="grid gap-3">
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder={t("review.placeholder")}
            rows={4}
            className="w-full bg-bg text-fg border border-line rounded-lg px-3 py-2.5 text-sm outline-none focus:border-navy transition resize-none"
          />
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted">{t("review.target")}</span>
            <Select value={reviewTarget} onChange={(e) => setReviewTarget(e.target.value)}>
              <option value="">{t("review.all")}</option>
              {data.assignments.map((a) => (
                <option key={a.discipline} value={a.discipline}>{t(`discipline.${a.discipline}`)}</option>
              ))}
            </Select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="danger" disabled={!reviewText.trim()} onClick={sendBack}>{t("review.send")}</Button>
          </div>
        </div>
      </Modal>

      {/* Add room modal */}
      <Modal open={roomModalOpen} onClose={() => setRoomModalOpen(false)} title={t("room.addTitle")}>
        <div className="grid gap-3">
          <input
            autoFocus
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder={t("room.placeholder")}
            className="w-full bg-bg border border-line rounded-lg px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRoomModalOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={!roomName.trim()} onClick={addRoom}>{t("common.add")}</Button>
          </div>
        </div>
      </Modal>

      {/* Add check modal */}
      <Modal open={!!checkRoomId} onClose={() => setCheckRoomId(null)} title={t("check.addTitle")}>
        <div className="grid gap-3">
          <input
            autoFocus
            value={checkName}
            onChange={(e) => setCheckName(e.target.value)}
            placeholder={t("check.placeholder")}
            className="w-full bg-bg border border-line rounded-lg px-3 py-2.5 text-sm outline-none focus:border-navy"
          />
          {canManage && (
            <Select value={checkDiscipline} onChange={(e) => setCheckDiscipline(e.target.value)}>
              {["CIVIL", "ELECTRICAL", "PLUMBING", "PEST_OTHER"].map((d) => (
                <option key={d} value={d}>{t(`discipline.${d}`)}</option>
              ))}
            </Select>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCheckRoomId(null)}>{t("common.cancel")}</Button>
            <Button disabled={!checkName.trim()} onClick={addCheck}>{t("common.add")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SigPreview({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="signature" className="h-12 w-full object-contain bg-white rounded border border-line" />
  );
}
