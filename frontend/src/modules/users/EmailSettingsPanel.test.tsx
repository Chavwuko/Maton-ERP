import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ApiError } from '../../api/client';
import * as settingsApi from '../../api/settings';
import { EmailSettingsPanel } from './EmailSettingsPanel';

vi.mock('../../api/settings');

describe('EmailSettingsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the switch on, with no warning when a mail server is connected', async () => {
    vi.mocked(settingsApi.getEmailSettings).mockResolvedValue({ enabled: true, transport: 'smtp' });

    renderWithProviders(<EmailSettingsPanel />);

    expect(await screen.findByRole('switch')).toBeChecked();
    expect(screen.queryByText('No mail server is connected')).not.toBeInTheDocument();
  });

  it('warns that emails are only logged when no mail server is connected', async () => {
    vi.mocked(settingsApi.getEmailSettings).mockResolvedValue({ enabled: false, transport: 'log' });

    renderWithProviders(<EmailSettingsPanel />);

    expect(await screen.findByRole('switch')).not.toBeChecked();
    expect(screen.getByText('No mail server is connected')).toBeInTheDocument();
    expect(screen.getByText(/only written to the server log/)).toBeInTheDocument();
  });

  it('turns emails off and says so', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.getEmailSettings).mockResolvedValue({ enabled: true, transport: 'smtp' });
    vi.mocked(settingsApi.updateEmailSettings).mockResolvedValue({ enabled: false, transport: 'smtp' });

    renderWithProviders(<EmailSettingsPanel />);
    await user.click(await screen.findByRole('switch'));

    await waitFor(() => expect(vi.mocked(settingsApi.updateEmailSettings).mock.calls[0][0]).toEqual({ enabled: false }));
    expect(await screen.findByText('Email notifications are off')).toBeInTheDocument();
  });

  it('turns emails back on and says so', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.getEmailSettings).mockResolvedValue({ enabled: false, transport: 'smtp' });
    vi.mocked(settingsApi.updateEmailSettings).mockResolvedValue({ enabled: true, transport: 'smtp' });

    renderWithProviders(<EmailSettingsPanel />);
    await user.click(await screen.findByRole('switch'));

    expect(await screen.findByText('Email notifications are on')).toBeInTheDocument();
  });

  it('surfaces a save failure', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.getEmailSettings).mockResolvedValue({ enabled: true, transport: 'smtp' });
    vi.mocked(settingsApi.updateEmailSettings)
      .mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'))
      .mockRejectedValueOnce(new Error('network'));

    renderWithProviders(<EmailSettingsPanel />);
    await user.click(await screen.findByRole('switch'));
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));
    expect(await screen.findByText('Failed to save the email setting')).toBeInTheDocument();
  });

  it('shows an error when the setting cannot be loaded', async () => {
    vi.mocked(settingsApi.getEmailSettings).mockRejectedValueOnce(new ApiError(500, 'Server down'));
    const { unmount } = renderWithProviders(<EmailSettingsPanel />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
    unmount();

    vi.mocked(settingsApi.getEmailSettings).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<EmailSettingsPanel />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});
