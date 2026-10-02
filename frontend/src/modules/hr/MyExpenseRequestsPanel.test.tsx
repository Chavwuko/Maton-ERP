import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as hrApi from '../../api/hr';
import * as documentControlApi from '../../api/documentControl';
import { MyExpenseRequestsPanel } from './MyExpenseRequestsPanel';
import type { ExpenseRequest } from './types';

vi.mock('../../api/hr');
vi.mock('../../api/documentControl');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));

function record(overrides: Partial<ExpenseRequest> = {}): ExpenseRequest {
  return {
    id: 'exp-1',
    organizationId: 'org-1',
    employeeId: 'emp-1',
    category: 'TRAVEL',
    amount: '125.50',
    description: null,
    incurredOn: '2026-06-01T00:00:00.000Z',
    status: 'PENDING',
    decidedById: null,
    decisionComment: null,
    decidedAt: null,
    reimbursedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MyExpenseRequestsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the requests returned by the API', async () => {
    vi.mocked(hrApi.getMyExpenseRequests).mockResolvedValue([record()]);

    renderWithProviders(<MyExpenseRequestsPanel />);

    expect(await screen.findByText('Travel')).toBeInTheDocument();
    expect(screen.getByText('125.5')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('shows an empty state when there are no requests', async () => {
    vi.mocked(hrApi.getMyExpenseRequests).mockResolvedValue([]);

    renderWithProviders(<MyExpenseRequestsPanel />);

    expect(await screen.findByText('No expense requests yet.')).toBeInTheDocument();
  });

  it('submits a new request and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.getMyExpenseRequests).mockResolvedValue([]);
    vi.mocked(hrApi.createMyExpenseRequest).mockResolvedValue(record());

    renderWithProviders(<MyExpenseRequestsPanel />);
    await screen.findByText('No expense requests yet.');

    await user.click(screen.getByRole('button', { name: 'New request' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.type(screen.getByLabelText('Amount', { exact: false }), '125.5');
    await user.type(screen.getByLabelText('Incurred on', { exact: false }), '2026-06-01');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(vi.mocked(hrApi.createMyExpenseRequest).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        category: 'TRAVEL',
        amount: 125.5,
        incurredOn: '2026-06-01',
      });
    });
    expect(await screen.findByText('Expense request submitted')).toBeInTheDocument();
  });

  it('attaches a receipt to an existing request', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.getMyExpenseRequests).mockResolvedValue([record()]);
    vi.mocked(documentControlApi.createDocument).mockResolvedValue({ id: 'doc-1' } as never);
    const file = new File(['receipt'], 'receipt.txt', { type: 'text/plain' });

    renderWithProviders(<MyExpenseRequestsPanel />);
    await screen.findByText('Travel');

    const fileInput = document.body.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('file input not found');
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(documentControlApi.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', expenseRequestId: 'exp-1', title: 'receipt.txt' }),
        file,
      );
    });
    expect(await screen.findByText('Receipt attached')).toBeInTheDocument();
  });
});
