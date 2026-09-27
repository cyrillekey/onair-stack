import { config } from "@/config/index.js";
import { withRetry } from "@/utils/retry.js";

export interface FetchHtmlOptions {
  timeoutMs?: number;
  retries?: number;
}

function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const { signal, cancel } = timeoutSignal(timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal,
      headers: {
        "User-Agent": config.HTTP_USER_AGENT,
        Accept: "application/json, text/html;q=0.9, */*;q=0.8",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return res;
  } finally {
    cancel();
  }
}

export async function fetchJson<T>(url: string, opts: FetchHtmlOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? config.HTTP_TIMEOUT_MS;
  const retries = opts.retries ?? config.HTTP_MAX_RETRIES;
  const res = await withRetry(() => fetchOnce(url, {}, timeoutMs), { retries });
  return (await res.json()) as T;
}

export async function fetchHtml(url: string, opts: FetchHtmlOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? config.HTTP_TIMEOUT_MS;
  const retries = opts.retries ?? config.HTTP_MAX_RETRIES;
  const res = await withRetry(() => fetchOnce(url, {}, timeoutMs), { retries });
  return await res.text();
}
