"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-gradient text-white border-transparent hover:opacity-95",
  outline: "bg-surface text-fg border-line hover:bg-surface-2",
  ghost: "bg-transparent text-muted border-transparent hover:bg-surface-2",
  danger: "bg-transparent text-issue border-issue hover:bg-issue/10",
};
const SIZES: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5 gap-1",
  md: "text-sm px-4 py-2.5 gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg border font-semibold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
