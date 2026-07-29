/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

const TOKEN_KEY = "bulkreach_token";
const IMP_TOKEN_KEY = "bulkreach_imp_token";

/** The token used for authed requests: the impersonation token when a superadmin
 *  is acting-as an account, otherwise the real session token. Single choke point
 *  — api/apiDownload/apiUpload all route through here, so impersonation is
 *  transparent to every caller. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(IMP_TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

/** The admin's own session token, ignoring any active impersonation. */
export function getRealToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function setImpToken(token: string): void {
  localStorage.setItem(IMP_TOKEN_KEY, token);
}

export function clearImpToken(): void {
  localStorage.removeItem(IMP_TOKEN_KEY);
}

export function isImpersonating(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(IMP_TOKEN_KEY) != null;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Silent refresh: swap the short-lived access token for a fresh one using the
 *  httpOnly refresh cookie (rotated server-side). Concurrent 401s share a single
 *  in-flight request. Never runs while impersonating — an impersonation token has
 *  no principal refresh cookie, so its 401 must surface (the UI exits instead). */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccess(): Promise<boolean> {
  if (isImpersonating()) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return false;
        const data = await res.json().catch(() => null);
        if (data?.access_token) {
          setToken(data.access_token);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    })();
    void refreshInFlight.finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** fetch wrapper that attaches the bearer token, and on a 401 for an authed call
 *  transparently refreshes once and retries. The single network choke point for
 *  api/apiDownload/apiUpload. */
async function authedFetch(
  path: string,
  init: RequestInit,
  useAuth: boolean,
): Promise<Response> {
  const build = (): RequestInit => {
    const headers = new Headers(init.headers as HeadersInit | undefined);
    if (useAuth) {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    return { ...init, headers, credentials: "include" };
  };

  let res = await fetch(`/api/v1${path}`, build());
  if (res.status === 401 && useAuth && !path.startsWith("/auth/refresh")) {
    if (await refreshAccess()) {
      res = await fetch(`/api/v1${path}`, build());
    }
  }
  return res;
}

/** Calls the backend through Next's /api proxy (same-origin → no CORS). */
export async function api<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth, headers, ...rest } = options;
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };
  const res = await authedFetch(path, { ...rest, headers: h }, !!auth);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

/** Download an authed binary response (e.g. a PDF) and trigger a Save dialog.
 *  Uses fetch+blob because a plain anchor can't send the Bearer header. */
export async function apiDownload(path: string, fallbackName = "download"): Promise<void> {
  const res = await authedFetch(path, {}, true);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = `Download failed (${res.status})`;
    try {
      const j = text ? JSON.parse(text) : null;
      if (j?.detail || j?.message) detail = j.detail || j.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Multipart upload — never sets Content-Type so the browser adds the boundary. */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await authedFetch(path, { method: "POST", body: form }, true);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `Upload failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}
