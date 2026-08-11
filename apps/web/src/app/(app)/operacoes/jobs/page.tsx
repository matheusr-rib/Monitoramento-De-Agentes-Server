"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Job } from "@/lib/types";
import { Card } from "@/components/ui/Card";

function fmtMeta(meta: any) {
  try {
    return JSON.stringify(meta);
  } catch {
    return "";
  }
}

export default function JobsPage() {
  const [activeId, setActiveId] = React.useState<number | null>(null);

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: async () => {
      const r = await apiFetch<{ data: Job[] }>(`/jobs?limit=50`);
      return r.data;
    },
    refetchInterval: 3000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Jobs / Execuções</h1>
        <p className="mt-1 text-sm text-gray-600">Monitoramento de execução e troubleshooting.</p>
      </div>

      <Card title="Histórico recente" subtitle="Clique em um job para acompanhar os detalhes (logs ficam nas telas de operação).">
        {jobsQuery.isLoading ? <div className="text-sm text-gray-500">Carregando...</div> : null}
        {jobsQuery.isError ? <div className="text-sm text-red-600">Falha ao carregar jobs</div> : null}

        {jobsQuery.data?.length ? (
          <div className="mt-2 divide-y rounded-lg border">
            {jobsQuery.data.map((j) => (
              <button
                key={j.id_job_run}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => setActiveId(j.id_job_run)}
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono">#{j.id_job_run}</div>
                  <div className="text-xs text-gray-600">{j.status}</div>
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  <span className="font-medium">{j.job_type}</span>
                  {j.input_filename ? <span className="ml-2 text-gray-500">• {j.input_filename}</span> : null}
                </div>
                <div className="mt-1 truncate text-xs text-gray-500">{fmtMeta(j.meta)}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Nenhum job ainda.</div>
        )}

        {activeId ? (
          <div className="mt-3 text-xs text-gray-600">
            Selecionado: <span className="font-mono">#{activeId}</span>
          </div>
        ) : null}
      </Card>
    </div>
  );
}