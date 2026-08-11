"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };
type NavGroup = { title: string; items: NavItem[] };

const groups: NavGroup[] = [
  { title: "Geral", items: [{ href: "/dashboard", label: "Dashboard" }] },
  {
    title: "Operações",
    items: [
      { href: "/operacoes/loaders", label: "Loaders" },
      { href: "/operacoes/backfill", label: "Clicksign Backfill" },
      { href: "/operacoes/match", label: "Match de Documentos" },
      { href: "/operacoes/score", label: "Cálculo de Score" },
      { href: "/operacoes/jobs", label: "Jobs / Execuções" },
    ],
  },
  {
    title: "Pendências",
    items: [{ href: "/pendencias/documentos", label: "Documentos sem Match" }],
  },
  {
    title: "Cadastros",
    items: [
      { href: "/cadastros/agentes", label: "Agentes" },
    ],
  },
  {
    title: "Configuração",
    items: [
      { href: "/configuracao/regras", label: "Regras" },
    ],
  },
];

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[280px] border-r bg-white px-4 py-6">
      <div className="mb-6">
        <div className="text-sm font-semibold">Monitoramento</div>
        <div className="text-xs text-gray-500">Score Admin</div>
      </div>

      <nav className="space-y-6">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {g.title}
            </div>

            <div className="space-y-1">
              {g.items.map((it) => {
                const active =
                  pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cx(
                      "block rounded-md px-3 py-2 text-sm",
                      active
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

    </aside>
  );
}