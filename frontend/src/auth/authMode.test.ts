import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthMode } from './authMode';

describe('getAuthMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to local when VITE_AUTH_MODE is unset', () => {
    vi.stubEnv('VITE_AUTH_MODE', '');
    expect(getAuthMode()).toBe('local');
  });

  it('returns cognito only for an exact "cognito" value', () => {
    vi.stubEnv('VITE_AUTH_MODE', 'cognito');
    expect(getAuthMode()).toBe('cognito');
  });

  it('treats any other value as local', () => {
    vi.stubEnv('VITE_AUTH_MODE', 'something-else');
    expect(getAuthMode()).toBe('local');
  });
});
