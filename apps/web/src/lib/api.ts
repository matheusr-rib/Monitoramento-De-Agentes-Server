const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN!;

function ensureEnv() {
  if (!API_BASE) throw new Error("NEXT_PUBLIC_API_BASE não configurado");
  if (!ADMIN_TOKEN) throw new Error("NEXT_PUBLIC_ADMIN_TOKEN não configurado");
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  ensureEnv();

  const headers = new Headers(init.headers);
  headers.set("x-admin-token", ADMIN_TOKEN);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });

  const ct = res.headers.get("content-type") || "";
  const payload = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && ("error" in payload || "message" in payload))
        ? String((payload as any).error ?? (payload as any).message)
        : String(payload || `HTTP ${res.status}`);
    throw new Error(msg);
  }

  return payload as T;
}

export async function apiPost<T = any>(path: string, body: any): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiGet<T = any>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

// Para SSE/EventSource (não aceita header), manda token por query
export function sseUrl(path: string) {
  ensureEnv();
  const token = encodeURIComponent(ADMIN_TOKEN);
  const sep = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${sep}admin_token=${token}`;
}