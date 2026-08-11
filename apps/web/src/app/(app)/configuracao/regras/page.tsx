"use client";

import Link from "next/link";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { ListRegrasResponse, Regra } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function RegrasPage() {
  const [q, setQ] = React.useState("");
  const [qDebounced, setQDebounced] = React.useState(q);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  React.useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => setPage(1), [qDebounced, pageSize]);

  const list = useQuery({
    queryKey: ["regras", { q: qDebounced, page, pageSize }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (qDebounced) qs.set("q", qDebounced);
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      return apiFetch<ListRegrasResponse>(`/regras?${qs.toString()}`);
    },
    refetchInterval: 15_000,
  });

  const rows: Regra[] = list.data?.data ?? [];
  const meta = list.data?.meta;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Regras</h1>
        <p className="mt-1 text-sm text-gray-600">
          Edite regras e suas faixas de desconto. Validação: sem buraco e sem sobreposição.
        </p>
      </div>

      <Card title="Filtro">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm font-medium">Busca</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="tp_evento, tp_regra, nome ou descrição..."
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm font-medium">Page size</div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => { setQ(""); setPage(1); }}>
              Limpar
            </Button>
          </div>
        </div>

        {list.isError ? (
          <div className="mt-3 text-sm text-red-600">{String(list.error)}</div>
        ) : null}
      </Card>

      <Card
        title="Lista"
        subtitle={meta ? `Total: ${meta.total} • Página ${meta.page}/${meta.totalPages}` : "Carregando..."}
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={!meta || meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Anterior
            </Button>
            <Button variant="secondary" disabled={!meta || meta.page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        }
      >
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="py-2 pr-2">ID</th>
                <th className="py-2 pr-2">Evento</th>
                <th className="py-2 pr-2">Tipo</th>
                <th className="py-2 pr-2">Regra</th>
                <th className="py-2 pr-2">Descrição</th>
                <th className="py-2 pr-2">Ativo</th>
                <th className="py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr><td colSpan={7} className="py-3 text-gray-600">Carregando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-3 text-gray-600">Nenhuma regra encontrada.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id_regra} className="border-b">
                    <td className="py-2 pr-2 font-mono">{r.id_regra}</td>
                    <td className="py-2 pr-2 font-mono">{r.tp_evento}</td>
                    <td className="py-2 pr-2 font-mono">{r.tp_regra}</td>
                    <td className="py-2 pr-2">{r.ds_regra}</td>
                    <td className="py-2 pr-2">{r.ds_descricao}</td>
                    <td className="py-2 pr-2">{r.ativo ? "Sim" : "Não"}</td>
                    <td className="py-2 pr-2 text-right">
                      <Link href={`/configuracao/regras/${r.id_regra}`}>
                        <Button variant="secondary">Editar</Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}