import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSignupPreviewEmail, setSignupPreviewEmail, subscribeSignupPreview } from './signupPreviewStore';

describe('signupPreviewStore', () => {
  afterEach(() => {
    setSignupPreviewEmail(null);
  });

  it('starts empty, then remembers the email', () => {
    expect(getSignupPreviewEmail()).toBeNull();

    setSignupPreviewEmail('new@acme.test');

    expect(getSignupPreviewEmail()).toBe('new@acme.test');
  });

  it('clears the email', () => {
    setSignupPreviewEmail('new@acme.test');

    setSignupPreviewEmail(null);

    expect(getSignupPreviewEmail()).toBeNull();
  });

  it('notifies subscribers on every change until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSignupPreview(listener);

    setSignupPreviewEmail('a@acme.test');
    setSignupPreviewEmail(null);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setSignupPreviewEmail('b@acme.test');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
