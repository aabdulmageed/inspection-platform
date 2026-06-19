"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { FileText, PlusCircle, Users, Sun, Moon, Languages, LogOut, Menu, CalendarDays, ClipboardList } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="grid place-items-center h-9 w-9 rounded-lg border border-line text-fg hover:bg-surface-2 transition"
      aria-label="theme"
      suppressHydrationWarning
    >
      {mounted ? isDark ? <Sun size={17} /> : <Moon size={17} /> : <Moon size={17} />}
    </button>
  );
}

function LangToggle() {
  const { t, toggleLang } = useI18n();
  return (
    <button
      onClick={toggleLang}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line text-fg hover:bg-surface-2 transition text-sm font-semibold"
    >
      <Languages size={16} /> {t("lang.name")}
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, logout, token, authedFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [todayCount, setTodayCount] = useState(0);

  // Today's job count for the "My day" badge.
  useEffect(() => {
    if (!token) return;
    const today = new Date().toISOString().slice(0, 10);
    authedFetch(`/agenda?date=${today}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setTodayCount(Array.isArray(j) ? j.length : 0))
      .catch(() => {});
  }, [token, pathname]);

  // Login route: brand bar + centered content, no sidebar.
  if (pathname === "/login") {
    return (
      <div className="min-h-screen flex flex-col">
        <BrandBar right={<><LangToggle /><ThemeToggle /></>} />
        <div className="flex-1 grid place-items-center p-5">{children}</div>
      </div>
    );
  }

  const isStaff = user?.role === "ADMIN" || user?.role === "MANAGER";
  const nav = [
    { href: "/agenda", label: t("nav.agenda"), icon: CalendarDays, show: true, badge: todayCount },
    { href: "/", label: t("nav.dashboard"), icon: FileText, show: isStaff, badge: 0 },
    { href: "/new", label: t("nav.new"), icon: PlusCircle, show: isStaff, badge: 0 },
    { href: "/assign", label: t("assign.navTitle"), icon: ClipboardList, show: isStaff, badge: 0 },
    { href: "/users", label: t("nav.users"), icon: Users, show: isStaff, badge: 0 },
  ].filter((n) => n.show);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const SidebarInner = (
    <>
      <div className="bg-brand-gradient px-4 py-4 flex items-center">
        <Image src="/logo.png" alt="CHECK" width={30} height={38} className="h-9 w-auto logo-glow" priority />
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                active ? "bg-brand-gradient text-white" : "text-fg hover:bg-surface-2"
              }`}
            >
              <Icon size={18} /> <span className="flex-1">{n.label}</span>
              {n.badge > 0 && (
                <span className={`grid place-items-center min-w-5 h-5 px-1.5 rounded-full text-xs font-bold ${active ? "bg-white/25 text-white" : "bg-brand-gradient text-white"}`}>
                  {n.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="p-3 border-t border-line">
          <div className="px-2 pb-2">
            <div className="text-sm font-semibold text-fg truncate">{user.name}</div>
            <div className="text-xs text-muted">{t(`role.${user.role}`)}</div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-semibold text-muted hover:bg-surface-2 transition"
          >
            <LogOut size={16} /> {t("auth.logout")}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-surface border-e border-line">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 flex flex-col bg-surface border-e border-line animate-[fadeIn_.15s_ease]">{SidebarInner}</div>
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-4 bg-surface border-b border-line">
          <button className="md:hidden grid place-items-center h-9 w-9 rounded-lg border border-line" onClick={() => setOpen(true)} aria-label="menu">
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-5 md:p-8 w-full max-w-5xl mx-auto">{children}</main>
      </div>
    </div>
  );
}

function BrandBar({ right }: { right: React.ReactNode }) {
  return (
    <header className="bg-brand-gradient h-16 flex items-center justify-between px-5">
      <Image src="/logo.png" alt="CHECK" width={30} height={40} className="h-10 w-auto logo-glow" priority />
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
