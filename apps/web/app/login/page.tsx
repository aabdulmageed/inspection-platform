"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { Card, Field, Input } from "../../components/ui/primitives";
import { Button } from "../../components/ui/Button";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setBusy(true);
    try {
      await login(email, password);
      router.push("/");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm p-7">
      <h1 className="text-xl font-bold">{t("login.title")}</h1>
      <p className="text-muted text-sm mt-0.5 mb-5">{t("login.subtitle")}</p>
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label={t("login.email")}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label={t("login.password")}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        {error && <div className="text-issue text-sm">{t("login.error")}</div>}
        <Button type="submit" disabled={busy} className="w-full">
          <LogIn size={16} /> {busy ? t("common.loading") : t("login.submit")}
        </Button>
        <div className="text-muted text-xs text-center">{t("login.hint")}</div>
      </form>
    </Card>
  );
}
