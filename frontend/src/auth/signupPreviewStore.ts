// Local-dev only: lets the AUTH_MODE=local app pretend to be a brand-new
// person who just signed up, so the whole "request access, then wait for an
// admin" flow can be tried without Cognito. In cognito mode this is never set.
const STORAGE_KEY = 'erp.localSignupEmail';

const listeners = new Set<() => void>();

export function getSignupPreviewEmail(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setSignupPreviewEmail(email: string | null): void {
  if (email) {
    localStorage.setItem(STORAGE_KEY, email);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  listeners.forEach((listener) => listener());
}

// For useSyncExternalStore, so the gate re-renders the moment the preview
// starts or ends.
export function subscribeSignupPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
