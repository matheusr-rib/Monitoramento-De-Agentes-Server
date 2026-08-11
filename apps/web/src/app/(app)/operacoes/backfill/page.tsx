"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useJobStream } from "@/hooks/useJobStream";

export default function BackfillPage() {
  const [activeJobId, setActiveJobId] = React.useState<number | null>(null);
  const stream = useJobStream(activeJobId);

  const [resume, setResume] = React.useState(true);
  const [perPage, setPerPage] = React.useState(100);
  const [batchSize, setBatchSize] = React.useState(1000);

  const run = useMutation({
    mutationFn: async (mode: "BOOTSTRAP" | "SYNC_OPEN") => {
      const params =
        mode === "BOOTSTRAP" ? { perPage, resume } : { batchSize };
      const r = await apiPost<{ jobId: string }>("/clicksign/backfill", { mode, params });
      return Number(r.jobId);
    },
    onSuccess: (jobId) => setActiveJobId(jobId),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Clicksign Backfill</h1>
        <p className="mt-1 text-sm text-gray-600">Carrega/atualiza documentos do Clicksign no banco.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Executar">
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium">BOOTSTRAP</div>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <div className="text-xs text-gray-500">perPage</div>
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    type="number"
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                  />
                </label>
                <label className="flex items-center gap-2 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={resume}
                    onChange={(e) => setResume(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">resume</span>
                </label>
              </div>
              <div className="mt-3">
                <Button disabled={run.isPending} onClick={() => run.mutate("BOOTSTRAP")}>
                  Rodar BOOTSTRAP
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium">SYNC_OPEN</div>
              <div className="mt-2">
                <label className="space-y-1">
                  <div className="text-xs text-gray-500">batchSize</div>
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="mt-3">
                <Button disabled={run.isPending} onClick={() => run.mutate("SYNC_OPEN")}>
                  Rodar SYNC_OPEN
                </Button>
              </div>
            </div>

            {run.isError ? <div className="text-sm text-red-600">{String(run.error)}</div> : null}

            {activeJobId ? (
              <div className="text-sm text-gray-600">
                Job: <span className="font-mono">#{activeJobId}</span>
                {stream.status ? <span className="ml-2">({stream.status})</span> : null}
              </div>
            ) : null}
          </div>
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