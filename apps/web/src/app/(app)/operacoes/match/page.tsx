"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useJobStream } from "@/hooks/useJobStream";

export default function MatchPage() {
  const [activeJobId, setActiveJobId] = React.useState<number | null>(null);
  const stream = useJobStream(activeJobId);

  const run = useMutation({
    mutationFn: async () => {
      const r = await apiPost<{ jobId: string }>("/procedures/match-clicksign", {});
      return Number(r.jobId);
    },
    onSuccess: (jobId) => setActiveJobId(jobId),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Match de Documentos</h1>
        <p className="mt-1 text-sm text-gray-600">Executa a procedure de match documentos ↔ agentes.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Executar">
          <Button disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Executando..." : "Executar Match"}
          </Button>

          {run.isError ? <div className="mt-3 text-sm text-red-600">{String(run.error)}</div> : null}

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