"use client";

import React from "react";

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-gray-900 text-white hover:bg-gray-800"
      : variant === "secondary"
      ? "border bg-white text-gray-900 hover:bg-gray-50"
      : "text-gray-700 hover:bg-gray-50";

  return (
    <button {...props} className={cx(base, styles, props.className)}>
      {children}
    </button>
  );
}