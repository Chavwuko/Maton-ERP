import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pickOption } from '../../test/pickOption';
import { setCurrentRole } from '../../auth/roleStore';
import { ApiError } from '../../api/client';
import * as inventoryApi from '../../api/inventory';
import { ConsumptionPage } from './ConsumptionPage';
import type { Consumption, InventoryItem } from './types';

vi.mock('../../api/inventory');
vi.mock('../../api/organizations', () => ({
  listDepartments: vi.fn().mockResolvedValue([{ id: 'dept-1', organizationId: 'org-1', name: 'Workshop', code: 'WKS', createdAt: '' }]),
}));
vi.mock('../../api/projects', () => ({
  listProjects: vi.fn().mockResolvedValue([{ id: 'proj-1', code: 'P-01', name: 'Plant upgrade' }]),
}));

const item: InventoryItem = {
  id: 'item-1',
  organizationId: 'org-1',
  sku: 'BRG-6205',
  name: 'Ball Bearing 6205',
  description: null,
  unitOfMeasure: 'pcs',
  reorderPoint: null,
  reorderQuantity: null,
  categoryId: null,
  location: null,
  unitCost: '4.80',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const warehouse = {
  id: 'wh-1',
  organizationId: 'org-1',
  code: 'WH-MAIN',
  name: 'Main',
  location: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const consumption: Consumption = {
  id: 'con-1',
  organizationId: 'org-1',
  warehouseId: 'wh-1',
  itemId: 'item-1',
  date: '2026-03-06T00:00:00.000Z',
  quantity: 10.25,
  unitCost: '4.80',
  total: '49.20',
  projectId: 'proj-1',
  departmentId: 'dept-1',
  issuedTo: 'Joe Fitter',
  purpose: 'Pump rebuild',
  issuedById: 'user-1',
  createdAt: '2026-03-06T00:00:00.000Z',
  item,
  project: { id: 'proj-1', code: 'P-01', name: 'Plant upgrade' },
  department: { id: 'dept-1', name: 'Workshop' },
  warehouse,
};

async function openIssueForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Issue stock' }));
  return screen.findByRole('dialog', { name: 'Issue stock' });
}

describe('ConsumptionPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(inventoryApi.listConsumptions).mockResolvedValue([consumption]);
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue([item]);
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue([warehouse]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders issues with the department, project and cost', async () => {
    renderWithProviders(<ConsumptionPage />);

    expect(await screen.findByText('Joe Fitter')).toBeInTheDocument();
    expect(screen.getByText('Workshop')).toBeInTheDocument();
    expect(screen.getByText('P-01 — Plant upgrade')).toBeInTheDocument();
    expect(screen.getByText('10.25 pcs')).toBeInTheDocument();
    expect(screen.getByText('49.20')).toBeInTheDocument();
  });

  it('shows an empty state and an error state', async () => {
    vi.mocked(inventoryApi.listConsumptions).mockResolvedValueOnce([]);
    const { unmount } = renderWithProviders(<ConsumptionPage />);
    expect(await screen.findByText('No stock issued yet.')).toBeInTheDocument();
    unmount();

    vi.mocked(inventoryApi.listConsumptions).mockRejectedValue(new ApiError(500, 'Server down'));
    renderWithProviders(<ConsumptionPage />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });

  it('shows dashes for rows without a department, project, issuee or purpose', async () => {
    vi.mocked(inventoryApi.listConsumptions).mockResolvedValue([
      { ...consumption, department: null, project: null, issuedTo: null, purpose: null, item: undefined },
    ]);

    renderWithProviders(<ConsumptionPage />);

    expect(await screen.findByText('item-1')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('re-queries with the date range', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');

    await user.type(screen.getByLabelText('From'), '2026-03-01');
    await user.type(screen.getByLabelText('To'), '2026-03-31');

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.listConsumptions)).toHaveBeenLastCalledWith({ from: '2026-03-01', to: '2026-03-31' });
    });
  });

  it('limits actions by role', async () => {
    setCurrentRole('hse');
    const { unmount } = renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');
    expect(screen.queryByRole('button', { name: 'Issue stock' })).not.toBeInTheDocument();
    unmount();

    setCurrentRole('inventory');
    renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');
    expect(screen.getByRole('button', { name: 'Issue stock' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete issue/ })).not.toBeInTheDocument();
  });

  it('issues stock charged to a department', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.recordConsumption).mockResolvedValue(consumption);

    renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');

    const dialog = await openIssueForm(user);
    await pickOption(user, within(dialog).getByPlaceholderText('Select item'), 'BRG-6205 — Ball Bearing 6205');
    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
    await pickOption(user, within(dialog).getByPlaceholderText('Select department'), 'Workshop');
    await user.type(within(dialog).getByLabelText('Quantity', { exact: false }), '2.5');
    await user.type(within(dialog).getByLabelText('Issued to'), 'Ann');
    await user.type(within(dialog).getByLabelText('Purpose'), 'Repairs');
    await user.click(within(dialog).getByRole('button', { name: 'Issue' }));

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.recordConsumption).mock.calls[0][0]).toMatchObject({
        itemId: 'item-1',
        warehouseId: 'wh-1',
        quantity: 2.5,
        departmentId: 'dept-1',
        issuedTo: 'Ann',
        purpose: 'Repairs',
      });
    });
    expect(vi.mocked(inventoryApi.recordConsumption).mock.calls[0][0].projectId).toBeUndefined();
    expect(await screen.findByText('Stock issued')).toBeInTheDocument();
  });

  it('issues stock charged to a project only', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.recordConsumption).mockResolvedValue(consumption);

    renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');

    const dialog = await openIssueForm(user);
    await pickOption(user, within(dialog).getByPlaceholderText('Select item'), 'BRG-6205 — Ball Bearing 6205');
    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
    await pickOption(user, within(dialog).getByPlaceholderText('Select project'), 'P-01 — Plant upgrade');
    await user.type(within(dialog).getByLabelText('Quantity', { exact: false }), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Issue' }));

    await waitFor(() => {
      expect(vi.mocked(inventoryApi.recordConsumption).mock.calls[0][0]).toMatchObject({ projectId: 'proj-1' });
    });
    expect(vi.mocked(inventoryApi.recordConsumption).mock.calls[0][0].departmentId).toBeUndefined();
  });

  it('requires a department or project and surfaces API errors', async () => {
    const user = userEvent.setup();
    vi.mocked(inventoryApi.recordConsumption).mockRejectedValue(new ApiError(400, 'Insufficient stock'));

    renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');

    const dialog = await openIssueForm(user);
    await pickOption(user, within(dialog).getByPlaceholderText('Select item'), 'BRG-6205 — Ball Bearing 6205');
    await pickOption(user, within(dialog).getByPlaceholderText('Select warehouse'), 'WH-MAIN — Main');
    await user.type(within(dialog).getByLabelText('Quantity', { exact: false }), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Issue' }));
    expect(await within(dialog).findByText('Charge to a department or a project')).toBeInTheDocument();
    expect(inventoryApi.recordConsumption).not.toHaveBeenCalled();

    await pickOption(user, within(dialog).getByPlaceholderText('Select department'), 'Workshop');
    await user.click(within(dialog).getByRole('button', { name: 'Issue' }));
    expect(await screen.findByText('Insufficient stock')).toBeInTheDocument();
  });

  it('deletes an issue after confirmation, and handles decline and failure', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    vi.mocked(inventoryApi.deleteConsumption).mockResolvedValue(consumption);

    renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');
    const button = screen.getByRole('button', { name: 'Delete issue con-1' });

    confirm.mockReturnValueOnce(false);
    await user.click(button);
    expect(inventoryApi.deleteConsumption).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await user.click(button);
    await waitFor(() => expect(vi.mocked(inventoryApi.deleteConsumption).mock.calls[0][0]).toBe('con-1'));
    expect(await screen.findByText('Issue deleted and stock returned')).toBeInTheDocument();

    vi.mocked(inventoryApi.deleteConsumption).mockRejectedValue(new ApiError(400, 'Cannot delete'));
    confirm.mockReturnValueOnce(true);
    await user.click(button);
    expect(await screen.findByText('Cannot delete')).toBeInTheDocument();
  });

  it('hides the cost column from the staff role', async () => {
    setCurrentRole('staff');
    renderWithProviders(<ConsumptionPage />);
    await screen.findByText('Joe Fitter');

    expect(screen.queryByText('Cost')).not.toBeInTheDocument();
    expect(screen.queryByText('49.20')).not.toBeInTheDocument();
  });
});
