import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as hrApi from '../../api/hr';
import { ExpenseRequestsPage } from './ExpenseRequestsPage';

vi.mock('../../api/hr');

describe('ExpenseRequestsPage', () => {
  beforeEach(() => {
    vi.mocked(hrApi.getMyExpenseRequests).mockResolvedValue([]);
    vi.mocked(hrApi.listExpenseRequests).mockResolvedValue([]);
    vi.mocked(hrApi.listEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows both tabs for admin/hr', async () => {
    setCurrentRole('admin');
    renderWithProviders(<ExpenseRequestsPage />);

    expect(await screen.findByRole('tab', { name: 'My Requests' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Team Requests' })).toBeInTheDocument();
  });

  it('shows only My Requests for a non-manager role', async () => {
    setCurrentRole('finance');
    renderWithProviders(<ExpenseRequestsPage />);

    expect(await screen.findByRole('tab', { name: 'My Requests' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Team Requests' })).not.toBeInTheDocument();
  });
});
