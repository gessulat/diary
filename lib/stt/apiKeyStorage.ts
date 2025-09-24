const STORAGE_KEY = "OPENAI_API_KEY";

type Listener = (value: string | null) => void;

const listeners = new Set<Listener>();

const safeWindow = (): Window | null => {
  if (typeof window === "undefined") return null;
  return window;
};

const notify = (value: string | null) => {
  listeners.forEach((listener) => {
    try {
      listener(value);
    } catch {
      // Ignore listener errors to avoid breaking storage propagation.
    }
  });
};

export const getStoredApiKey = (): string | null => {
  const win = safeWindow();
  if (!win) return null;
  const value = win.localStorage.getItem(STORAGE_KEY);
  return value?.trim() ? value.trim() : null;
};

export const setStoredApiKey = (value: string): void => {
  const win = safeWindow();
  if (!win) return;
  const trimmed = value.trim();
  if (!trimmed) {
    clearStoredApiKey();
    return;
  }
  win.localStorage.setItem(STORAGE_KEY, trimmed);
  notify(trimmed);
};

export const clearStoredApiKey = (): void => {
  const win = safeWindow();
  if (!win) return;
  win.localStorage.removeItem(STORAGE_KEY);
  notify(null);
};

export const subscribeToApiKey = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const win = safeWindow();
if (win) {
  win.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = event.newValue?.trim() ? event.newValue.trim() : null;
    notify(next);
  });
}
