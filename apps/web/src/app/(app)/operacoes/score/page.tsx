"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useJobStream } from "@/hooks/useJobStream";

type ScoreRange = {
  dtInicio: string;
  dtFim: string;
};

const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmdLocal(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getLastDayOfMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0);
}

function buildScoreRange(year: number, month1to12: number): ScoreRange {
  const dtInicio = `${year}-${pad2(month1to12)}-01`;
  const dtFim = formatYmdLocal(getLastDayOfMonth(year, month1to12));

  return { dtInicio, dtFim };
}

export default function ScorePage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [activeJobId, setActiveJobId] = React.useState<number | null>(null);
  const stream = useJobStream(activeJobId);

  const [year, setYear] = React.useState<number>(currentYear);
  const [month, setMonth] = React.useState<number>(currentMonth);

  const range = React.useMemo(() => buildScoreRange(year, month), [year, month]);

  const yearOptions = React.useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const run = useMutation({
    mutationFn: async () => {
      const r = await apiPost<{ jobId: string }>("/procedures/calc-score", {
        dtInicio: range.dtInicio,
        dtFim: range.dtFim,
      });
      return Number(r.jobId);
    },
    onSuccess: (jobId) => setActiveJobId(jobId),
  });

  const selectedMonthLabel =
    MONTH_OPTIONS.find((m) => m.value === month)?.label ?? String(month);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cálculo de Score</h1>
        <p className="mt-1 text-sm text-gray-600">
          Selecione ano e mês. O período é calculado automaticamente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Executar"
          subtitle="Início = primeiro dia do mês. Fim = último dia do mês. A mesma competência sempre usa o mesmo período."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-sm font-medium">Ano</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">Mês</div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 rounded-lg border bg-gray-50 p-3 text-sm">
            <div>
              <span className="font-medium">Competência selecionada:</span>{" "}
              {selectedMonthLabel}/{year}
            </div>
            <div className="mt-1">
              <span className="font-medium">Período calculado:</span>{" "}
              <span className="font-mono">{range.dtInicio}</span> até{" "}
              <span className="font-mono">{range.dtFim}</span>
            </div>
          </div>

          <div className="mt-4">
            <Button disabled={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? "Executando..." : "Calcular Score"}
            </Button>
          </div>

          {run.isError ? (
            <div className="mt-3 text-sm text-red-600">{String(run.error)}</div>
          ) : null}

          {activeJobId ? (
            <div className="mt-3 text-sm text-gray-600">
              Job: <span className="font-mono">#{activeJobId}</span>
              {stream.status ? <span className="ml-2">({stream.status})</span> : null}
            </div>
          ) : null}
        </Card>

        <Card title="Logs">
          <div className="h-[420px] overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs">
            {stream.logs.length === 0 ? (
              <div className="text-gray-500">Sem logs ainda.</div>
            ) : (
              stream.logs.map((l) => (
                <div key={l.id_job_run_log}>
                  [{l.level}] {l.message}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}