import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as hrApi from '../../api/hr';
import { TeamExpenseRequestsPanel } from './TeamExpenseRequestsPanel';
import type { ExpenseRequest } from './types';

vi.mock('../../api/hr');

const sampleEmployee = {
  id: 'emp-1',
  organizationId: 'org-1',
  userId: 'user-1',
  employeeNumber: 'EMP-001',
  jobTitle: 'Field Engineer',
  hireDate: '2024-01-01T00:00:00.000Z',
  employmentStatus: 'ACTIVE' as const,
  managerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  dateOfBirth: null,
  gender: null,
  employmentType: null,
  grade: null,
  branch: null,
  exitDate: null,
  shiftId: null,
};

function record(overrides: Partial<ExpenseRequest> = {}): ExpenseRequest {
  return {
    id: 'exp-1',
    organizationId: 'org-1',
    employeeId: 'emp-1',
    category: 'MEALS',
    amount: '40',
    description: null,
    incurredOn: '2026-06-01T00:00:00.000Z',
    status: 'PENDING',
    decidedById: null,
    decisionComment: null,
    decidedAt: null,
    reimbursedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    employee: sampleEmployee,
    ...overrides,
  };
}

describe('TeamExpenseRequestsPanel', () => {
  beforeEach(() => {
    vi.mocked(hrApi.listEmployees).mockResolvedValue([sampleEmployee]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders requests with the employee number', async () => {
    vi.mocked(hrApi.listExpenseRequests).mockResolvedValue([record()]);

    renderWithProviders(<TeamExpenseRequestsPanel />);

    expect(await screen.findByText('EMP-001')).toBeInTheDocument();
    expect(screen.getByText('Meals')).toBeInTheDocument();
  });

  it('shows an empty state when there are no requests', async () => {
    vi.mocked(hrApi.listExpenseRequests).mockResolvedValue([]);

    renderWithProviders(<TeamExpenseRequestsPanel />);

    expect(await screen.findByText('No expense requests yet.')).toBeInTheDocument();
  });

  it('offers only the legal next statuses for PENDING', async () => {
    vi.mocked(hrApi.listExpenseRequests).mockResolvedValue([record()]);

    renderWithProviders(<TeamExpenseRequestsPanel />);
    await screen.findByText('EMP-001');

    await userEvent.setup().click(screen.getByRole('button', { name: /PENDING/i }));

    expect(await screen.findByText('Move to APPROVED')).toBeInTheDocument();
    expect(screen.getByText('Move to REJECTED')).toBeInTheDocument();
  });

  it('approving a request calls updateExpenseRequestStatus with APPROVED', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.listExpenseRequests).mockResolvedValue([record()]);
    vi.mocked(hrApi.updateExpenseRequestStatus).mockResolvedValue(record({ status: 'APPROVED' }));

    renderWithProviders(<TeamExpenseRequestsPanel />);
    await screen.findByText('EMP-001');

    await user.click(screen.getByRole('button', { name: /PENDING/i }));
    await user.click(await screen.findByText('Move to APPROVED'));

    await waitFor(() => {
      expect(hrApi.updateExpenseRequestStatus).toHaveBeenCalledWith('exp-1', 'APPROVED');
    });
    expect(await screen.findByText('Status updated')).toBeInTheDocument();
  });
});
