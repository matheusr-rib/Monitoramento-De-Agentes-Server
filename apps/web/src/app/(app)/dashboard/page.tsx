"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import type { Job } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function findLatest(jobs: Job[], includes: string[]) {
  const filtered = jobs.filter((j) => includes.some((s) => j.job_type.includes(s)));
  filtered.sort((a, b) => (b.id_job_run ?? 0) - (a.id_job_run ?? 0));
  return filtered[0] || null;
}

export default function DashboardPage() {
  const jobsQuery = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: async () => (await apiFetch<{ data: Job[] }>("/jobs?limit=50")).data,
    refetchInterval: 3000,
  });

  const jobs = jobsQuery.data ?? [];
  const lastBackfill = findLatest(jobs, ["BACKFILL"]);
  const lastMatch = findLatest(jobs, ["PROC_MATCH"]);
  const lastScore = findLatest(jobs, ["PROC_SCORE"]);

  const quickRun = async (kind: "backfill" | "match") => {
    if (kind === "backfill") {
      return apiPost("/clicksign/backfill", { mode: "SYNC_OPEN", params: { batchSize: 1000 } });
    }
    return apiPost("/procedures/match-clicksign", {});
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Visão operacional do sistema (jobs e saúde).</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          title="Último Backfill"
          subtitle={lastBackfill ? `#${lastBackfill.id_job_run}` : "Nenhum ainda"}
          right={<span className="text-xs text-gray-600">{lastBackfill?.status ?? "-"}</span>}
        >
          <div className="text-xs text-gray-500">
            {lastBackfill?.finished_at
              ? `Finalizado: ${new Date(lastBackfill.finished_at).toLocaleString()}`
              : "—"}
          </div>
        </Card>

        <Card
          title="Último Match"
          subtitle={lastMatch ? `#${lastMatch.id_job_run}` : "Nenhum ainda"}
          right={<span className="text-xs text-gray-600">{lastMatch?.status ?? "-"}</span>}
        >
          <div className="text-xs text-gray-500">
            {lastMatch?.finished_at
              ? `Finalizado: ${new Date(lastMatch.finished_at).toLocaleString()}`
              : "—"}
          </div>
        </Card>

        <Card
          title="Último Score"
          subtitle={lastScore ? `#${lastScore.id_job_run}` : "Nenhum ainda"}
          right={<span className="text-xs text-gray-600">{lastScore?.status ?? "-"}</span>}
        >
          <div className="text-xs text-gray-500">
            {lastScore?.finished_at
              ? `Finalizado: ${new Date(lastScore.finished_at).toLocaleString()}`
              : "—"}
          </div>
        </Card>
      </div>

      <Card
        title="Ações rápidas"
        subtitle="Para operar sem ficar navegando. Logs ficam nas páginas específicas."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => quickRun("backfill")}>
            Executar Backfill
          </Button>
          <Button variant="secondary" onClick={() => quickRun("match")}>
            Executar Match
          </Button>

          <Link href="/operacoes/score">
            <Button variant="secondary">Calcular Score</Button>
          </Link>
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Score agora é executado pela seleção de competência na tela específica.
        </div>
      </Card>

      <Card title="Últimos Jobs">
        {jobsQuery.isLoading ? <div className="text-sm text-gray-500">Carregando...</div> : null}
        {jobsQuery.isError ? <div className="text-sm text-red-600">Falha ao carregar jobs</div> : null}
        {jobs.length ? (
          <div className="mt-2 divide-y rounded-lg border">
            {jobs.slice(0, 10).map((j) => (
              <div key={j.id_job_run} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-mono">#{j.id_job_run}</div>
                  <div className="text-xs text-gray-600">{j.status}</div>
                </div>
                <div className="mt-1 text-xs text-gray-600">{j.job_type}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Nenhum job ainda.</div>
        )}
      </Card>
    </div>
  );
}