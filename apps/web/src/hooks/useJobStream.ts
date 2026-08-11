"use client";

import * as React from "react";
import { sseUrl } from "@/lib/api";
import type { JobLog, JobStatus } from "@/lib/types";

export function useJobStream(jobId: number | null) {
  const [logs, setLogs] = React.useState<JobLog[]>([]);
  const [status, setStatus] = React.useState<JobStatus | null>(null);

  React.useEffect(() => {
    if (!jobId) return;

    setLogs([]);
    setStatus(null);

    const es = new EventSource(sseUrl(`/jobs/${jobId}/stream`));

    const onLogs = (ev: MessageEvent<string>) => {
      const data = JSON.parse(ev.data) as JobLog[];
      setLogs((prev) => {
        const merged = [...prev, ...data];
        const seen = new Set<number>();
        const uniq = merged.filter((r) => {
          if (seen.has(r.id_job_run_log)) return false;
          seen.add(r.id_job_run_log);
          return true;
        });
        return uniq.length > 2000 ? uniq.slice(uniq.length - 2000) : uniq;
      });
    };

    es.addEventListener("logs", onLogs as unknown as EventListener);

    es.onerror = () => {
      // servidor pode fechar ao terminar, ou erro de rede; não spam
    };

    return () => es.close();
  }, [jobId]);

  return { logs, status };
}