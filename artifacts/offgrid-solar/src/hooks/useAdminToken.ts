const KEY = "offgrid-admin-token";

export function getAdminToken(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function saveAdminToken(token: string): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function adminRequestOpts(token: string) {
  return token ? { headers: { "x-admin-token": token } } : undefined;
}
