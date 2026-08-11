"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Agente, ListAgentesResponse, UpdateAgenteResponse } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

function formatCpfCnpj(v: string | null) {
  if (!v) return "-";
  // mantém simples (sem máscara), porque seu banco é string de dígitos
  return v;
}

export default function AgentesPage() {
  const qc = useQueryClient();

  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  // seleção / edição
  const [selected, setSelected] = React.useState<Agente | null>(null);
  const [cpfCnpj, setCpfCnpj] = React.useState<string>("");

  // debounce simples para busca
  const [qDebounced, setQDebounced] = React.useState(q);
  React.useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    setPage(1);
  }, [qDebounced, pageSize]);

  const listQuery = useQuery({
    queryKey: ["agentes", { q: qDebounced, page, pageSize }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (qDebounced.trim()) qs.set("q", qDebounced.trim());
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));

      const r = await apiFetch<ListAgentesResponse>(`/agentes?${qs.toString()}`);
      return r;
    },
    refetchInterval: 10_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { cd_agente: number; cpf_cnpj: string | null; runMatch: boolean }) => {
      const r = await apiFetch<UpdateAgenteResponse>(`/agentes/${input.cd_agente}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf_cnpj: input.cpf_cnpj, runMatch: input.runMatch }),
      });
      return r;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["agentes"] });
    },
  });

  function openEdit(a: Agente) {
    setSelected(a);
    setCpfCnpj(a.cpf_cnpj ?? "");
  }

  async function save(runMatch: boolean) {
    if (!selected) return;

    const normalized = onlyDigits(cpfCnpj);
    const value = normalized ? normalized : null;

    // validação mínima consistente com backend: 11 (CPF) ou 14 (CNPJ) ou null
    if (value !== null && value.length !== 11 && value.length !== 14) {
      alert("CPF/CNPJ inválido: deve ter 11 ou 14 dígitos (ou vazio para limpar).");
      return;
    }

    await updateMutation.mutateAsync({
      cd_agente: selected.cd_agente,
      cpf_cnpj: value,
      runMatch,
    });

    // atualiza seleção local com o retorno mais recente
    const data = listQuery.data?.data?.find((x) => x.cd_agente === selected.cd_agente) ?? null;
    setSelected(data ?? null);
  }

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Agentes</h1>
        <p className="mt-1 text-sm text-gray-600">
          Lista de agentes e correção de CPF/CNPJ. Opcionalmente enfileira o match para tentar resolver pendências.
        </p>
      </div>

      <Card title="Filtro">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm font-medium">Busca</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="cd_agente, nome ou cpf/cnpj..."
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

        {listQuery.isError ? (
          <div className="mt-3 text-sm text-red-600">{String(listQuery.error)}</div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card
            title="Tabela de Agentes"
            subtitle={
              meta
                ? `Total: ${meta.total} • Página ${meta.page}/${meta.totalPages}`
                : "Carregando..."
            }
            right={
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={!meta || meta.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={!meta || meta.page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            }
          >
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="py-2 pr-2">CD_AGENTE</th>
                    <th className="py-2 pr-2">Nome</th>
                    <th className="py-2 pr-2">CPF/CNPJ</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Atualização</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {listQuery.isLoading ? (
                    <tr>
                      <td className="py-3 text-gray-600" colSpan={6}>
                        Carregando...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-gray-600" colSpan={6}>
                        Nenhum agente encontrado.
                      </td>
                    </tr>
                  ) : (
                    rows.map((a) => {
                      const active = selected?.cd_agente === a.cd_agente;
                      return (
                        <tr key={a.cd_agente} className="border-b">
                          <td className="py-2 pr-2 font-mono">{a.cd_agente}</td>
                          <td className="py-2 pr-2">{a.nome}</td>
                          <td className="py-2 pr-2 font-mono">{formatCpfCnpj(a.cpf_cnpj)}</td>
                          <td className="py-2 pr-2">{a.ds_status}</td>
                          <td className="py-2 pr-2">
                            {a.dt_atualizacao ? new Date(a.dt_atualizacao).toLocaleString() : "-"}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <Button
                              variant={active ? "primary" : "secondary"}
                              onClick={() => openEdit(a)}
                            >
                              Editar
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Editar CPF/CNPJ"
            subtitle={
              selected
                ? `Agente: ${selected.nome} (cd_agente ${selected.cd_agente})`
                : "Selecione um agente na tabela"
            }
          >
            {!selected ? (
              <div className="text-sm text-gray-600">Nenhum agente selecionado.</div>
            ) : (
              <div className="space-y-3">
                <label className="space-y-1 block">
                  <div className="text-sm font-medium">CPF/CNPJ</div>
                  <input
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(e.target.value)}
                    placeholder="Somente dígitos (11 ou 14). Vazio = limpar."
                    className="w-full rounded-md border px-3 py-2 text-sm font-mono"
                  />
                  <div className="text-xs text-gray-500">
                    Valor enviado normalizado (somente dígitos). O match automático só atua em documentos sem cd_agente.
                  </div>
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={updateMutation.isPending}
                    onClick={() => save(false)}
                  >
                    {updateMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>

                  <Button
                    variant="secondary"
                    disabled={updateMutation.isPending}
                    onClick={() => save(true)}
                  >
                    {updateMutation.isPending ? "Salvando..." : "Salvar e rodar Match"}
                  </Button>
                </div>

                {updateMutation.isError ? (
                  <div className="text-sm text-red-600">{String(updateMutation.error)}</div>
                ) : null}

                {updateMutation.isSuccess && updateMutation.data?.jobId ? (
                  <div className="text-sm text-gray-700">
                    Match enfileirado. Job:{" "}
                    <span className="font-mono">#{updateMutation.data.jobId}</span>
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <Card title="Comportamento do Match" subtitle="Pra não ter surpresa">
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
              <li>
                O match automático só atualiza documentos com <span className="font-mono">cd_agente IS NULL</span>.
              </li>
              <li>
                Corrigir <span className="font-mono">tb_agente.cpf_cnpj</span> + rodar match ajuda a reduzir pendências.
              </li>
              <li>
                Documentos já vinculados (manual ou automático) não são sobrescritos.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}