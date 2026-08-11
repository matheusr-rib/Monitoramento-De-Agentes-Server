"use client";

import Link from "next/link";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { ListPendenciasResponse, MatchPendente } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function fmt(dtIso?: string) {
  if (!dtIso) return "-";
  const d = new Date(dtIso);
  return Number.isNaN(d.getTime()) ? dtIso : d.toLocaleString("pt-BR");
}

export default function PendenciasDocsPage() {
  const [typing, setTyping] = React.useState<string>("");
  const [q, setQ] = React.useState<string>("");
  const [page, setPage] = React.useState<number>(1);
  const pageSize = 25;

  // debounce
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQ(typing.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [typing]);

  const query = useQuery({
    queryKey: ["pendencias", "documentos", { q, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("origem", "CLICKSIGN");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (q) params.set("q", q);

      return apiFetch<ListPendenciasResponse>(`/pendencias/documentos?${params.toString()}`);
    },
    refetchInterval: 10_000,
  });

  const rows: MatchPendente[] = query.data?.data ?? [];
  const meta = query.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Documentos sem Match</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pendências geradas pelo match (Clicksign). Total: <span className="font-mono">{total}</span>
        </p>
      </div>

      <Card
        title="Busca"
        subtitle="Filtra por CPF/CNPJ extraído, filename ou chave (clicksign_document_key)."
        right={
          <Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        }
      >
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={typing}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTyping(e.target.value)}
          placeholder="Ex.: 12345678901, contrato.pdf, 6f3c... (UUID)"
        />
        <div className="mt-2 text-xs text-gray-500">
          Dica: se você colar um UUID completo aqui, normalmente a pendência certa cai na primeira página.
        </div>
      </Card>

      <Card
        title="Pendências"
        subtitle={`Página ${page} de ${totalPages}`}
        right={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              disabled={page >= totalPages || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        }
      >
        {query.isLoading ? <div className="text-sm text-gray-500">Carregando...</div> : null}
        {query.isError ? (
          <div className="text-sm text-red-600">Falha ao carregar: {String(query.error)}</div>
        ) : null}

        <div className="mt-2 overflow-hidden rounded-lg border">
          <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
            <div className="col-span-1">ID</div>
            <div className="col-span-3">CPF/CNPJ extraído</div>
            <div className="col-span-5">Arquivo</div>
            <div className="col-span-2">Data carga</div>
            <div className="col-span-1 text-right">Ação</div>
          </div>

          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.id_match} className="grid grid-cols-12 items-center px-3 py-2 text-sm">
                <div className="col-span-1 font-mono">{r.id_match}</div>
                <div className="col-span-3 font-mono">{r.cpf_extraido || "-"}</div>
                <div className="col-span-5 truncate">{r.filename || "-"}</div>
                <div className="col-span-2 text-xs text-gray-600">{fmt(r.dt_carga)}</div>
                <div className="col-span-1 flex justify-end">
                  <Link href={`/pendencias/documentos/${r.id_match}`}>
                    <Button variant="secondary">Ver</Button>
                  </Link>
                </div>
              </div>
            ))}

            {!query.isFetching && rows.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-gray-500">Nenhuma pendência encontrada.</div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}