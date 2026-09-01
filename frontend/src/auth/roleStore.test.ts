import { afterEach, describe, expect, it } from 'vitest';

const STORAGE_KEY = 'erp.currentRole';

// roleStore's initial value is computed once at module load from
// localStorage, so each test that cares about that initial state needs a
// fresh module instance — vi.resetModules() + a dynamic import. Callers
// set up localStorage themselves *before* calling this.
async function freshRoleStore() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('./roleStore');
}

describe('roleStore', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to admin when localStorage has nothing', async () => {
    localStorage.clear();
    const { getCurrentRole } = await freshRoleStore();
    expect(getCurrentRole()).toBe('admin');
  });

  it('falls back to admin when localStorage holds an unknown role', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-real-role');
    const { getCurrentRole } = await freshRoleStore();
    expect(getCurrentRole()).toBe('admin');
  });

  it('picks up a previously stored valid role on load', async () => {
    localStorage.setItem(STORAGE_KEY, 'finance');
    const { getCurrentRole } = await freshRoleStore();
    expect(getCurrentRole()).toBe('finance');
  });

  it('setCurrentRole updates the in-memory value and persists it', async () => {
    const { getCurrentRole, setCurrentRole } = await freshRoleStore();

    setCurrentRole('hse');

    expect(getCurrentRole()).toBe('hse');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('hse');
  });
});
