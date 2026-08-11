"use client";

import Link from "next/link";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { GetRegraResponse, ReplaceFaixasResponse, UpdateRegraResponse } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Row = { qtd_ini: string; qtd_fim: string; vl_desconto: string };

function onlyIntLike(s: string) {
  return s.replace(/[^\d]/g, "");
}

function validateClientRows(rows: Row[]) {
  if (!rows.length) return "Você precisa ter ao menos 1 faixa.";

  const parsed = rows.map((r, i) => {
    const ini = Number(r.qtd_ini);
    const fim = Number(r.qtd_fim);
    const desc = Number(r.vl_desconto);

    if (!Number.isInteger(ini) || ini < 0) return `Faixa ${i + 1}: 'De' inválido.`;
    if (!Number.isInteger(fim) || fim < 0) return `Faixa ${i + 1}: 'Até' inválido.`;
    if (fim < ini) return `Faixa ${i + 1}: 'Até' menor que 'De'.`;
    if (!Number.isInteger(desc)) return `Faixa ${i + 1}: Desconto inválido (inteiro).`;

    return { ini, fim, desc };
  });

  const bad = parsed.find((x) => typeof x === "string");
  if (typeof bad === "string") return bad;

  const arr = parsed as Array<{ ini: number; fim: number; desc: number }>;
  arr.sort((a, b) => a.ini - b.ini);


  for (let i = 1; i < arr.length; i++) {
    const expected = arr[i - 1].fim + 1;
    if (arr[i].ini !== expected) {
      return `Faixas com buraco/sobreposição: a faixa ${i + 1} deveria começar em ${expected}.`;
    }
  }

  return null;
}

export default function RegraEditPage({ params }: { params: { id_regra: string } }) {
  const idRegra = Number(params.id_regra);
  const qc = useQueryClient();

  const regraQ = useQuery({
    queryKey: ["regras", "get", idRegra],
    queryFn: async () => apiFetch<GetRegraResponse>(`/regras/${idRegra}`),
    enabled: Number.isFinite(idRegra),
  });

  const regra = regraQ.data?.data;

  const [dsRegra, setDsRegra] = React.useState("");
  const [dsDescricao, setDsDescricao] = React.useState("");
  const [ativo, setAtivo] = React.useState(true);

  const [rows, setRows] = React.useState<Row[]>([]);

  React.useEffect(() => {
    if (!regra) return;
    setDsRegra(regra.ds_regra ?? "");
    setDsDescricao(regra.ds_descricao ?? "");
    setAtivo(Boolean(regra.ativo));

    const faixas = (regra.faixas ?? []).slice().sort((a, b) => Number(a.qtd_ini ?? 0) - Number(b.qtd_ini ?? 0));
    setRows(
      faixas.map((f) => ({
        qtd_ini: String(f.qtd_ini ?? ""),
        qtd_fim: String(f.qtd_fim ?? ""),
        vl_desconto: String(f.vl_desconto ?? 0),
      }))
    );
  }, [regra]);

  const patchRegra = useMutation({
    mutationFn: async () =>
      apiFetch<UpdateRegraResponse>(`/regras/${idRegra}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ds_regra: dsRegra, ds_descricao: dsDescricao, ativo }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["regras"] });
      await qc.invalidateQueries({ queryKey: ["regras", "get", idRegra] });
    },
  });

  const saveFaixas = useMutation({
    mutationFn: async () => {
      const err = validateClientRows(rows);
      if (err) throw new Error(err);

      return apiFetch<ReplaceFaixasResponse>(`/regras/${idRegra}/faixas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faixas: rows.map((r) => ({
            qtd_ini: Number(r.qtd_ini),
            qtd_fim: Number(r.qtd_fim),
            vl_desconto: Number(r.vl_desconto),
          })),
        }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["regras"] });
      await qc.invalidateQueries({ queryKey: ["regras", "get", idRegra] });
    },
  });

  function addRow() {
  if (!rows.length) {
    setRows([{ qtd_ini: "0", qtd_fim: "0", vl_desconto: "0" }]);
    return;
  }

  const sortedFims = rows
    .map((r) => Number(r.qtd_fim))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);

  const lastFim = sortedFims.length ? sortedFims[sortedFims.length - 1] : null;
  const ini = lastFim !== null ? lastFim + 1 : 0;

  setRows([...rows, { qtd_ini: String(ini), qtd_fim: String(ini), vl_desconto: "0" }]);
}

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  function setCell(idx: number, key: keyof Row, value: string) {
    const next = rows.slice();
    if (key !== "vl_desconto") value = onlyIntLike(value);
    next[idx] = { ...next[idx], [key]: value };
    setRows(next);
  }

  if (!Number.isFinite(idRegra)) {
    return <div className="text-sm text-red-600">ID inválido.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Editar Regra #{idRegra}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Ajuste texto/ativo e faixas. Salvar faixas substitui todas as faixas dessa regra (atômico).
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/configuracao/regras">
            <Button variant="ghost">Voltar</Button>
          </Link>
          <Button variant="secondary" onClick={() => regraQ.refetch()} disabled={regraQ.isFetching}>
            {regraQ.isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {regraQ.isLoading ? <div className="text-sm text-gray-500">Carregando...</div> : null}
      {regraQ.isError ? <div className="text-sm text-red-600">Falha: {String(regraQ.error)}</div> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Regra"
          subtitle={regra ? `${regra.tp_evento} • ${regra.tp_regra}` : ""}
          right={
            <Button onClick={() => patchRegra.mutate()} disabled={patchRegra.isPending}>
              {patchRegra.isPending ? "Salvando..." : "Salvar Regra"}
            </Button>
          }
        >
          {patchRegra.isError ? <div className="mb-3 text-sm text-red-600">{String(patchRegra.error)}</div> : null}

          <div className="space-y-3">
            <label className="block space-y-1">
              <div className="text-sm font-medium">Nome da regra</div>
              <input className="w-full rounded-md border px-3 py-2 text-sm" value={dsRegra} onChange={(e) => setDsRegra(e.target.value)} />
            </label>

            <label className="block space-y-1">
              <div className="text-sm font-medium">Descrição</div>
              <input className="w-full rounded-md border px-3 py-2 text-sm" value={dsDescricao} onChange={(e) => setDsDescricao(e.target.value)} />
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              Ativo
            </label>
          </div>
        </Card>

        <Card
          title="Faixas"
          subtitle="Validação: começa em 0 e sem buraco. 'Até' é inclusivo."
          right={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={addRow}>Adicionar faixa</Button>
              <Button onClick={() => saveFaixas.mutate()} disabled={saveFaixas.isPending}>
                {saveFaixas.isPending ? "Salvando..." : "Salvar faixas"}
              </Button>
            </div>
          }
        >
          {saveFaixas.isError ? <div className="mb-3 text-sm text-red-600">{String(saveFaixas.error)}</div> : null}
          {saveFaixas.isSuccess ? <div className="mb-3 text-sm text-gray-700">Faixas salvas.</div> : null}

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="py-2 pr-2">De</th>
                  <th className="py-2 pr-2">Até</th>
                  <th className="py-2 pr-2">Desconto</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="py-3 text-gray-600">Sem faixas. Adicione pelo botão acima.</td></tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-2">
                        <input className="w-28 rounded-md border px-2 py-1 font-mono text-sm" value={r.qtd_ini} onChange={(e) => setCell(idx, "qtd_ini", e.target.value)} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="w-28 rounded-md border px-2 py-1 font-mono text-sm" value={r.qtd_fim} onChange={(e) => setCell(idx, "qtd_fim", e.target.value)} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="w-28 rounded-md border px-2 py-1 font-mono text-sm" value={r.vl_desconto} onChange={(e) => setCell(idx, "vl_desconto", e.target.value)} />
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Button variant="ghost" onClick={() => removeRow(idx)}>Remover</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Dica: ordene e ajuste as faixas antes de salvar. O backend rejeita buraco e valor não-inteiro.
          </div>
        </Card>
      </div>
    </div>
  );
}