"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/Modal";
import { Card, Field, Input, Select, Badge, Skeleton } from "../../components/ui/primitives";
import { Button } from "../../components/ui/Button";

type U = { id: string; name: string; email: string; role: string; discipline: string | null };
const DISCIPLINES = ["CIVIL", "ELECTRICAL", "PLUMBING", "PEST_OTHER"];
const EMPTY = { name: "", email: "", password: "", role: "INSPECTOR", discipline: "CIVIL" };

export default function UsersPage() {
  const { t, dir } = useI18n();
  const { ready, token, user, authedFetch } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<U[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  function load() {
    authedFetch("/users").then((r) => (r.ok ? r.json() : [])).then(setUsers).catch(() => setUsers([]));
  }
  useEffect(() => {
    if (!ready) return;
    if (!token) return void router.replace("/login");
    load();
  }, [ready, token]);

  function startEdit(u: U) {
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, discipline: u.discipline ?? "CIVIL" });
  }
  function cancelEdit() { setEditingId(null); setForm({ ...EMPTY }); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body: any = { name: form.name, role: form.role };
    if (form.role === "INSPECTOR") body.discipline = form.discipline;
    if (form.password) body.password = form.password;
    let res: Response;
    if (editingId) {
      res = await authedFetch(`/users/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      body.email = form.email;
      res = await authedFetch("/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setBusy(false);
    if (res.ok) { toast(editingId ? t("common.save") + " ✓" : t("users.add") + " ✓"); cancelEdit(); load(); }
  }

  async function remove(u: U) {
    const ok = await confirm({ message: t("users.confirmDelete"), confirmLabel: t("common.delete"), cancelLabel: t("common.cancel") });
    if (!ok) return;
    const res = await authedFetch(`/users/${u.id}`, { method: "DELETE" });
    if (res.status === 409) return toast(t("users.deleteError"), "error");
    if (res.ok) { toast(t("common.delete") + " ✓"); load(); }
  }

  if (!ready || !token) return <Skeleton className="h-96" />;
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="grid gap-5 max-w-3xl">
      <h1 className="text-2xl font-bold">{t("users.title")}</h1>

      <Card className="overflow-hidden">
        <table className="w-full text-sm" style={{ textAlign: dir === "rtl" ? "right" : "left" }}>
          <thead>
            <tr className="text-muted text-xs border-b border-line">
              <th className="p-3 font-bold">{t("new.name")}</th>
              <th className="p-3 font-bold hidden sm:table-cell">{t("new.email")}</th>
              <th className="p-3 font-bold">{t("users.role")}</th>
              <th className="p-3 font-bold">{t("users.discipline")}</th>
              {isAdmin && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={5} className="p-4"><Skeleton className="h-6" /></td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="p-3 font-semibold">{u.name}</td>
                <td className="p-3 text-muted hidden sm:table-cell">{u.email}</td>
                <td className="p-3"><Badge>{t(`role.${u.role}`)}</Badge></td>
                <td className="p-3 text-muted">{u.discipline ? t(`discipline.${u.discipline}`) : "—"}</td>
                {isAdmin && (
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => startEdit(u)} className="grid place-items-center h-8 w-8 rounded-lg text-muted hover:bg-surface-2 transition" aria-label="edit"><Pencil size={15} /></button>
                      {u.id !== user?.id && (
                        <button onClick={() => remove(u)} className="grid place-items-center h-8 w-8 rounded-lg text-muted hover:text-issue hover:bg-issue/10 transition" aria-label="delete"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {isAdmin && (
        <Card className="p-5">
          <form onSubmit={submit} className="grid gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy dark:text-white">
              <UserPlus size={16} /> {editingId ? t("users.editTitle") : t("users.add")}
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t("new.name")}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label={t("new.email")}><Input type="email" required disabled={!!editingId} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label={editingId ? t("users.passwordKeep") : t("users.password")}>
                <Input type="password" required={!editingId} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
              <Field label={t("users.role")}>
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {["ADMIN", "MANAGER", "INSPECTOR"].map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                </Select>
              </Field>
              {form.role === "INSPECTOR" && (
                <Field label={t("users.discipline")}>
                  <Select value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}>
                    {DISCIPLINES.map((d) => <option key={d} value={d}>{t(`discipline.${d}`)}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>{busy ? t("users.adding") : editingId ? t("common.save") : t("users.add")}</Button>
              {editingId && <Button type="button" variant="outline" onClick={cancelEdit}>{t("common.cancel")}</Button>}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
