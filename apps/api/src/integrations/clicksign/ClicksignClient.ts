import { setTimeout as sleep } from 'timers/promises';

export type ClicksignListResponse = {
  documents: any[];
  page: number;
  total_pages?: number;
  totalPages?: number;
};

type ClientConfig = {
  baseUrl: string;
  accessToken: string;
  timeoutMs: number;
  throttleMs: number;
  maxRetries: number;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function jitter(ms: number) {
  const j = Math.floor(Math.random() * Math.min(250, ms));
  return ms + j;
}

export class ClicksignClient {
  private cfg: ClientConfig;

  constructor(cfg?: Partial<ClientConfig>) {
    this.cfg = {
      baseUrl: cfg?.baseUrl ?? (process.env.CLICKSIGN_BASE_URL || 'https://app.clicksign.com'),
      accessToken: cfg?.accessToken ?? requiredEnv('CLICKSIGN_ACCESS_TOKEN'),
      timeoutMs: cfg?.timeoutMs ?? Number(process.env.CLICKSIGN_TIMEOUT_MS || 30_000),
      throttleMs: cfg?.throttleMs ?? Number(process.env.CLICKSIGN_THROTTLE_MS || 150),
      maxRetries: cfg?.maxRetries ?? Number(process.env.CLICKSIGN_MAX_RETRIES || 6),
    };
  }

  private async getJson<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(this.cfg.baseUrl + path);
    url.searchParams.set('access_token', this.cfg.accessToken);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }

    // throttle
    if (this.cfg.throttleMs > 0) await sleep(this.cfg.throttleMs);

    let attempt = 0;
    let backoff = 500;

    while (true) {
      attempt += 1;

      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

      try {
        const res = await fetch(url, { method: 'GET', signal: ac.signal });
        clearTimeout(t);

        if (res.status === 429 || res.status >= 500) {
          if (attempt <= this.cfg.maxRetries) {
            const retryAfter = res.headers.get('retry-after');
            const waitMs = retryAfter ? Number(retryAfter) * 1000 : jitter(backoff);
            await sleep(waitMs);
            backoff = Math.min(backoff * 2, 10_000);
            continue;
          }
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Clicksign HTTP ${res.status} on ${path}: ${body.slice(0, 500)}`);
        }

        return (await res.json()) as T;
      } catch (err: any) {
        clearTimeout(t);
        const retryable = err?.name === 'AbortError' || /ECONNRESET|ETIMEDOUT|fetch failed/i.test(String(err?.message || err));
        if (retryable && attempt <= this.cfg.maxRetries) {
          await sleep(jitter(backoff));
          backoff = Math.min(backoff * 2, 10_000);
          continue;
        }
        throw err;
      }
    }
  }

  async listDocuments(page: number, perPage: number) {
    return this.getJson<ClicksignListResponse>('/api/v1/documents', { page, per_page: perPage });
  }

  async getDocument(key: string) {
    return this.getJson<any>(`/api/v1/documents/${encodeURIComponent(key)}`);
  }
}
