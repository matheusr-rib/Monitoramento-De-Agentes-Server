import React from "react";

export function Card({
  title,
  subtitle,
  children,
  right,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      {(title || subtitle || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title ? <div className="text-sm font-semibold">{title}</div> : null}
            {subtitle ? (
              <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
            ) : null}
          </div>
          {right ? <div>{right}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}