"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api";
import type { Job, JobLog } from "@/lib/types";
import { useJobStream } from "@/hooks/useJobStream";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type LoaderType =
  | "AGENTES"
  | "FRAUDE"
  | "POSVENDA"
  | "AUTORREGULACAO"
  | "NUVIDEO"
  | "ESTEIRA"
  | "CONVENIO_PRAZO";

const LOADER_OPTIONS: { value: LoaderType; label: string }[] = [
  { value: "AGENTES", label: "Agentes" },
  { value: "ESTEIRA", label: "Esteira" },
  { value: "POSVENDA", label: "Pós-venda" },
  { value: "FRAUDE", label: "Fraude" },
  { value: "AUTORREGULACAO", label: "Autorregulação" },
  { value: "NUVIDEO", label: "Nuvideo" },
  { value: "CONVENIO_PRAZO", label: "Convênio Prazo" },
];

function lineClass(level: JobLog["level"]) {
  if (level === "ERROR") return "text-red-700";
  if (level === "WARN") return "text-amber-700";
  if (level === "OK") return "text-emerald-700";
  return "text-gray-900";
}

async function uploadViaPresign(file: File) {
  // 1) pede presign
  const presign = await apiPost<{
    bucket: string;
    fileKey: string;
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
  }>("/uploads/presign", {
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  });

  // 2) PUT direto no MinIO
  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: presign.requiredHeaders,
    body: file,
  });

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`Falha no upload (PUT): ${putRes.status} ${text}`);
  }

  // 3) opcional: confirmar
  await apiPost("/uploads/confirm", { fileKey: presign.fileKey });

  return presign.fileKey;
}

export default function LoadersPage() {
  const qc = useQueryClient();

  const [type, setType] = React.useState<LoaderType>("AGENTES");
  const [file, setFile] = React.useState<File | null>(null);
  const [activeJobId, setActiveJobId] = React.useState<number | null>(null);

  const stream = useJobStream(activeJobId);

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: async () => {
      const r = await apiFetch<{ data: Job[] }>(`/jobs?limit=50`);
      return r.data;
    },
    refetchInterval: 3000,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo.");
      // upload direto pro MinIO
      const fileKey = await uploadViaPresign(file);
      // run loader por fileKey (sem multipart)
      const r = await apiPost<{ jobId: string }>("/loaders/run", { type, fileKey });
      return Number(r.jobId);
    },
    onSuccess: async (jobId) => {
      setActiveJobId(jobId);
      await qc.invalidateQueries({ queryKey: ["jobs", "recent"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Loaders</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload direto no MinIO + execução via job (logs em tempo real).
        </p>
      </div>

      <Card
        title="Executar Loader"
        subtitle="Escolha o tipo e suba o arquivo. O backend enfileira e o worker processa."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <div className="text-sm font-medium">Tipo</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as LoaderType)}
            >
              {LOADER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-sm font-medium">Arquivo</div>
            <input
              type="file"
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="text-xs text-gray-500">
              O upload vai direto no MinIO (não passa pela API).
            </div>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            disabled={!file || runMutation.isPending}
            onClick={() => runMutation.mutate()}
          >
            {runMutation.isPending ? "Executando..." : "Executar loader"}
          </Button>

          {runMutation.isError ? (
            <div className="text-sm text-red-600">{String(runMutation.error)}</div>
          ) : null}

          {activeJobId ? (
            <div className="text-sm text-gray-600">
              Job: <span className="font-mono">#{activeJobId}</span>
              {stream.status ? <span className="ml-2">({stream.status})</span> : null}
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Logs"
          right={
            activeJobId ? (
              <Button variant="ghost" onClick={() => setActiveJobId(null)}>
                limpar
              </Button>
            ) : null
          }
        >
          <div className="h-[420px] overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs">
            {stream.logs.length === 0 ? (
              <div className="text-gray-500">Sem logs ainda.</div>
            ) : (
              stream.logs.map((l) => (
                <div key={l.id_job_run_log} className={lineClass(l.level)}>
                  [{l.level}] {l.message}
                  {l.meta ? (
                    <span className="text-gray-500">
                      {" "}
                      {(() => {
                        try {
                          return JSON.stringify(l.meta);
                        } catch {
                          return "";
                        }
                      })()}
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Histórico recente" subtitle="Clique para ver logs daquele job nesta tela.">
          {jobsQuery.isLoading ? <div className="text-sm text-gray-500">Carregando...</div> : null}
          {jobsQuery.isError ? <div className="text-sm text-red-600">Falha ao carregar jobs</div> : null}

          {jobsQuery.data?.length ? (
            <div className="mt-2 divide-y rounded-lg border">
              {jobsQuery.data.map((j) => (
                <button
                  key={j.id_job_run}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => setActiveJobId(j.id_job_run)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono">#{j.id_job_run}</div>
                    <div className="text-xs text-gray-600">{j.status}</div>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    <span className="font-medium">{j.job_type}</span>
                    {j.input_filename ? <span className="ml-2 text-gray-500">• {j.input_filename}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Nenhum job ainda.</div>
          )}
        </Card>
      </div>
    </div>
  );
}