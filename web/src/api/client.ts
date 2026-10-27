// Sunucuyla konuşan tek yer. Hata gövdesi her zaman { error: "<Türkçe mesaj>" }.

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
export class UnauthorizedError extends ApiError {}

type Handler = () => void;
let unauthorizedHandler: Handler = () => {};
/** 401 gelince (giriş dışında) çağrılır: oturum düştü. */
export function onUnauthorized(fn: Handler): void {
  unauthorizedHandler = fn;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("Sunucuya ulaşılamadı", 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const message = (data && typeof data === "object" && "error" in data && typeof data.error === "string") ? data.error : null;
  if (res.status === 401 && path !== "/api/auth/login") {
    unauthorizedHandler();
    throw new UnauthorizedError(message ?? "Oturum süresi doldu", 401);
  }
  if (!res.ok) throw new ApiError(message ?? `İstek başarısız (${res.status})`, res.status);
  return (data ?? {}) as T;
}

export const get = <T>(path: string) => api<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => api<T>("POST", path, body);
export const put = <T>(path: string, body?: unknown) => api<T>("PUT", path, body);
export const del = <T>(path: string) => api<T>("DELETE", path);

/** { a: 1, b: "", c: null } → "?a=1" (boş değerler atlanır) */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
