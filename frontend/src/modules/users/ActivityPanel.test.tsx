import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pickOption } from '../../test/pickOption';
import { ApiError } from '../../api/client';
import * as activityApi from '../../api/activity';
import { ActivityPanel } from './ActivityPanel';
import type { ActivityEntry } from './activityTypes';

vi.mock('../../api/activity');

const entry = (overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: 'log-1',
  userId: 'u1',
  action: 'PURCHASE',
  entityType: 'Purchase',
  entityId: 'p1',
  metadata: { summary: 'PO PO-1, quantity 5, total 25', method: 'POST', path: '/purchases' },
  createdAt: '2026-10-20T10:00:00.000Z',
  user: { id: 'u1', firstName: 'Kay', lastName: 'Keeper', email: 'kay@acme.test' },
  ...overrides,
});

describe('ActivityPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists who did what, with a readable summary', async () => {
    vi.mocked(activityApi.listActivity).mockResolvedValue([entry()]);

    renderWithProviders(<ActivityPanel />);

    expect(await screen.findByText('Kay Keeper')).toBeInTheDocument();
    expect(screen.getByText('PURCHASE')).toBeInTheDocument();
    expect(screen.getByText('PO PO-1, quantity 5, total 25')).toBeInTheDocument();
  });

  it('names someone by email when they have no name, and System when no one did it', async () => {
    vi.mocked(activityApi.listActivity).mockResolvedValue([
      entry({ id: 'a', user: { id: 'u2', firstName: '', lastName: '', email: 'blank@acme.test' } }),
      entry({ id: 'b', user: null, userId: null, metadata: null }),
    ]);

    renderWithProviders(<ActivityPanel />);

    expect(await screen.findByText('blank@acme.test')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('notes when the list is cut off at 200 entries', async () => {
    vi.mocked(activityApi.listActivity).mockResolvedValue(Array.from({ length: 200 }, (_, i) => entry({ id: `log-${i}` })));

    renderWithProviders(<ActivityPanel />);

    expect(await screen.findByText(/Showing the latest 200/)).toBeInTheDocument();
  });

  it('shows empty and error states', async () => {
    vi.mocked(activityApi.listActivity).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<ActivityPanel />);
    expect(await screen.findByText('No activity matches.')).toBeInTheDocument();
    unmount();

    vi.mocked(activityApi.listActivity).mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'));
    const second = renderWithProviders(<ActivityPanel />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
    second.unmount();

    vi.mocked(activityApi.listActivity).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<ActivityPanel />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  it('narrows by kind of record and date range', async () => {
    const user = userEvent.setup();
    vi.mocked(activityApi.listActivity).mockResolvedValue([]);
    renderWithProviders(<ActivityPanel />);
    await screen.findByText('No activity matches.');

    await pickOption(user, screen.getByPlaceholderText('Everything'), 'Appointment');
    await user.type(screen.getByLabelText('From'), '2026-10-01');
    await user.type(screen.getByLabelText('To'), '2026-10-31');

    await waitFor(() => {
      expect(vi.mocked(activityApi.listActivity)).toHaveBeenLastCalledWith({
        entityType: 'Appointment',
        from: '2026-10-01',
        to: '2026-10-31',
      });
    });
  });
});
