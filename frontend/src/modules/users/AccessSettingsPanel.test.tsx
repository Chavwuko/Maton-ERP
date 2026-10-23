import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ApiError } from '../../api/client';
import * as settingsApi from '../../api/settings';
import { AccessSettingsPanel } from './AccessSettingsPanel';

vi.mock('../../api/settings');

describe('AccessSettingsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the current settings', async () => {
    vi.mocked(settingsApi.getAccessSettings).mockResolvedValue({
      openSignup: false,
      allowedEmailDomains: ['acme.com', 'example.org'],
    });

    renderWithProviders(<AccessSettingsPanel />);

    const toggle = await screen.findByRole('switch');
    expect(toggle).not.toBeChecked();
    expect(screen.getByLabelText('Allowed email domains', { exact: false })).toHaveValue('acme.com\nexample.org');
  });

  it('saves changes, splitting domains on new lines and commas', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.getAccessSettings).mockResolvedValue({ openSignup: true, allowedEmailDomains: [] });
    vi.mocked(settingsApi.updateAccessSettings).mockResolvedValue({ openSignup: false, allowedEmailDomains: ['a.com', 'b.com', 'c.com'] });

    renderWithProviders(<AccessSettingsPanel />);
    await user.click(await screen.findByRole('switch'));
    await user.click(screen.getByLabelText('Allowed email domains', { exact: false }));
    await user.paste('a.com, b.com\n\n  c.com ');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(vi.mocked(settingsApi.updateAccessSettings).mock.calls[0][0]).toEqual({
        openSignup: false,
        allowedEmailDomains: ['a.com', 'b.com', 'c.com'],
      });
    });
    expect(await screen.findByText('Sign-up settings saved')).toBeInTheDocument();
  });

  it('surfaces a save failure', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.getAccessSettings).mockResolvedValue({ openSignup: true, allowedEmailDomains: [] });
    vi.mocked(settingsApi.updateAccessSettings)
      .mockRejectedValueOnce(new ApiError(400, 'openSignup must be true or false'))
      .mockRejectedValueOnce(new Error('network'));

    renderWithProviders(<AccessSettingsPanel />);
    await user.click(await screen.findByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('openSignup must be true or false')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Failed to save settings')).toBeInTheDocument();
  });

  it('shows an error when the settings cannot be loaded', async () => {
    vi.mocked(settingsApi.getAccessSettings).mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'));
    const { unmount } = renderWithProviders(<AccessSettingsPanel />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
    unmount();

    vi.mocked(settingsApi.getAccessSettings).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<AccessSettingsPanel />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});
