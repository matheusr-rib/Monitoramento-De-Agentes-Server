"use client";

import Link from "next/link";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import type { Agente, GetPendenciaResponse, SearchAgentesResponse } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function fmt(dtIso?: string | null) {
  if (!dtIso) return "-";
  const d = new Date(dtIso);
  return Number.isNaN(d.getTime()) ? String(dtIso) : d.toLocaleString("pt-BR");
}

export default function PendenciaDocumentoDetail({ params }: { params: { id_match: string } }) {
  const idMatch = Number(params.id_match);

  const [selectedAgente, setSelectedAgente] = React.useState<number | null>(null);

  // busca agente
  const [agentTyping, setAgentTyping] = React.useState<string>("");
  const [agentQ, setAgentQ] = React.useState<string>("");

  React.useEffect(() => {
    const t = setTimeout(() => setAgentQ(agentTyping.trim()), 300);
    return () => clearTimeout(t);
  }, [agentTyping]);

  const detail = useQuery({
    queryKey: ["pendencias", "documento", idMatch],
    queryFn: async () => apiFetch<GetPendenciaResponse>(`/pendencias/documentos/${idMatch}`),
    enabled: Number.isFinite(idMatch),
  });

  const data = detail.data?.data;
  const pend = data?.pendencia;
  const doc = data?.documento;
  const sugestoes = data?.sugestoesAgentes ?? [];

  // auto-seleciona se vier só 1 sugestão
  React.useEffect(() => {
    if (!detail.data) return;
    const s = detail.data.data.sugestoesAgentes ?? [];
    if (s.length === 1) setSelectedAgente(s[0].cd_agente);
  }, [detail.data]);

  const agentSearch = useQuery({
    queryKey: ["agentes", "search", agentQ],
    queryFn: async () => apiFetch<SearchAgentesResponse>(`/agentes/search?q=${encodeURIComponent(agentQ)}&limit=20`),
    enabled: agentQ.length > 0,
  });

  const listToShow: Agente[] = agentQ ? agentSearch.data?.data ?? [] : sugestoes;

  const resolve = useMutation({
    mutationFn: async () => {
      if (!selectedAgente) throw new Error("Selecione um agente.");
      return apiPost(`/pendencias/documentos/${idMatch}/resolve`, { cd_agente: selectedAgente });
    },
    onSuccess: () => {
      window.location.href = "/pendencias/documentos";
    },
  });

  const headerRight = (
    <div className="flex gap-2">
      <Link href="/pendencias/documentos">
        <Button variant="ghost">Voltar</Button>
      </Link>
      <Button variant="secondary" onClick={() => detail.refetch()} disabled={detail.isFetching}>
        {detail.isFetching ? "Atualizando..." : "Atualizar"}
      </Button>
    </div>
  );

  if (!Number.isFinite(idMatch)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Pendência</h1>
          <p className="mt-1 text-sm text-red-600">ID inválido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Pendência #{pend?.id_match ?? idMatch}</h1>
            <p className="mt-1 text-sm text-gray-600">
              CPF/CNPJ extraído: <span className="font-mono">{pend?.cpf_extraido || "-"}</span>
            </p>
          </div>
          {headerRight}
        </div>
      </div>

      {detail.isLoading ? <div className="text-sm text-gray-500">Carregando...</div> : null}
      {detail.isError ? (
        <div className="text-sm text-red-600">Falha ao carregar: {String(detail.error)}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Documento" subtitle="Dados da pendência + status no Clicksign (se encontrado)">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-600">Arquivo:</span> {pend?.filename || "-"}
            </div>
            <div>
              <span className="text-gray-600">Chave:</span>{" "}
              <span className="font-mono">{pend?.chave_origem || "-"}</span>
            </div>
            <div>
              <span className="text-gray-600">Data carga:</span> {pend?.dt_carga ? fmt(pend.dt_carga) : "-"}
            </div>
          </div>

          <div className="mt-4 rounded-lg border bg-gray-50 p-3">
            {!doc ? (
              <div className="text-sm text-gray-600">
                Documento não encontrado pela chave. Isso normalmente significa:
                <ul className="mt-2 list-disc pl-5 text-xs text-gray-600">
                  <li>a pendência tem chave_origem vazia, ou</li>
                  <li>o documento ainda não está em tb_documento_clicksign, ou</li>
                  <li>a chave foi registrada diferente (UUID vs texto com lixo).</li>
                </ul>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <div>
                  <span className="text-gray-600">status:</span> {doc.status || "-"}
                </div>
                <div>
                  <span className="text-gray-600">uploaded_at:</span> {fmt(doc.uploaded_at)}
                </div>
                <div>
                  <span className="text-gray-600">finished_at:</span> {fmt(doc.finished_at)}
                </div>
                <div>
                  <span className="text-gray-600">dt_assinatura:</span> {fmt(doc.dt_assinatura)}
                </div>
                <div>
                  <span className="text-gray-600">cd_agente atual:</span>{" "}
                  <span className="font-mono">{doc.cd_agente ?? "-"}</span>
                </div>
                <div>
                  <span className="text-gray-600">agente atual:</span> {doc.agente?.nome ?? "-"}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Resolver"
          subtitle="Selecione um agente e confirme. Isso seta tb_documento_clicksign.cd_agente e remove a pendência."
          right={
            <Button
              variant="primary"
              onClick={() => resolve.mutate()}
              disabled={resolve.isPending || !selectedAgente}
            >
              {resolve.isPending ? "Confirmando..." : "Confirmar match"}
            </Button>
          }
        >
          {resolve.isError ? (
            <div className="mb-3 text-sm text-red-600">{String(resolve.error)}</div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Busca de agente
            </div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={agentTyping}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAgentTyping(e.target.value)}
              placeholder="Nome, CPF/CNPJ ou código..."
            />
            <div className="text-xs text-gray-500">
              Se o CPF/CNPJ extraído bater com algum agente, ele aparece como sugestão automática.
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border">
            <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
              <div className="col-span-1">Sel</div>
              <div className="col-span-7">Agente</div>
              <div className="col-span-4">CPF/CNPJ</div>
            </div>

            {agentSearch.isFetching && agentQ ? (
              <div className="px-3 py-3 text-sm text-gray-500">Buscando...</div>
            ) : null}

            <div className="divide-y">
              {listToShow.map((a) => (
                <label
                  key={a.cd_agente}
                  className="grid cursor-pointer grid-cols-12 items-center px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <div className="col-span-1">
                    <input
                      type="radio"
                      name="agente"
                      checked={selectedAgente === a.cd_agente}
                      onChange={() => setSelectedAgente(a.cd_agente)}
                    />
                  </div>

                  <div className="col-span-7">
                    <div className="font-medium">{a.nome}</div>
                    <div className="text-xs text-gray-500">
                      <span className="font-mono">#{a.cd_agente}</span> • {a.ds_status}
                    </div>
                  </div>

                  <div className="col-span-4 font-mono">{a.cpf_cnpj || "-"}</div>
                </label>
              ))}

              {listToShow.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-gray-500">
                  Nenhum agente encontrado. Use a busca acima.
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}