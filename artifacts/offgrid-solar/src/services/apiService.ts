import { appEnv } from "@/config/env";

type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${appEnv.apiBaseUrl}${normalizedPath}`, window.location.origin);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  query?: Record<string, QueryValue>,
): Promise<T> {
  const response = await fetch(buildUrl(path, query), options);
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? `API request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
  return apiRequest<T>(path, undefined, query);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    headers: body == null ? undefined : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}
