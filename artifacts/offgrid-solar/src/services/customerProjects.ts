const STORAGE_KEY = "offgrid-customer-projects-v1";
const CONTACT_EMAIL_KEY = "offgrid-customer-contact-email";

export interface CustomerProjectAccess {
  id: number;
  accessToken: string;
  name?: string;
  address?: string;
  savedAt: string;
}

function isValidEntry(value: unknown): value is CustomerProjectAccess {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CustomerProjectAccess>;
  return Number.isInteger(entry.id)
    && typeof entry.accessToken === "string"
    && entry.accessToken.length > 0
    && typeof entry.savedAt === "string";
}

export function listCustomerProjectAccess(): CustomerProjectAccess[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export function saveCustomerProjectAccess(input: {
  id: number;
  accessToken: string;
  name?: string;
  address?: string;
}): void {
  if (!Number.isInteger(input.id) || !input.accessToken) return;
  try {
    const current = listCustomerProjectAccess().filter((entry) => entry.id !== input.id);
    current.unshift({
      ...input,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current.slice(0, 100)));
    sessionStorage.setItem(`project-token-${input.id}`, input.accessToken);
  } catch {
    // Storage can be unavailable in private browsing; the URL token still works.
  }
}

export function removeCustomerProjectAccess(projectId: number): void {
  try {
    const current = listCustomerProjectAccess().filter((entry) => entry.id !== projectId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    sessionStorage.removeItem(`project-token-${projectId}`);
  } catch {
    // Ignore storage failures.
  }
}

export function clearCustomerProjectAccess(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CONTACT_EMAIL_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function getCustomerContactEmail(): string {
  try {
    return localStorage.getItem(CONTACT_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setCustomerContactEmail(email: string): void {
  try {
    if (email.trim()) localStorage.setItem(CONTACT_EMAIL_KEY, email.trim());
    else localStorage.removeItem(CONTACT_EMAIL_KEY);
  } catch {
    // Ignore storage failures.
  }
}
