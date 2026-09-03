import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as hrApi from '../../api/hr';
import { EmployeesListPage } from './EmployeesListPage';

vi.mock('../../api/hr');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Industrial' }]),
}));
vi.mock('../../api/users', () => ({
  listUsers: vi.fn().mockResolvedValue([
    { id: 'user-2', email: 'jane@acme.test', firstName: 'Jane', lastName: 'Doe', isActive: true, role: null },
  ]),
}));

const sampleEmployees = [
  {
    id: 'emp-1',
    organizationId: 'org-1',
    userId: 'user-1',
    employeeNumber: 'EMP-001',
    jobTitle: 'Operations Manager',
    hireDate: '2022-01-01T00:00:00.000Z',
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
  },
];

describe('EmployeesListPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
    vi.mocked(hrApi.listEmployees).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the employees returned by the API', async () => {
    vi.mocked(hrApi.listEmployees).mockResolvedValue(sampleEmployees);

    renderWithProviders(<EmployeesListPage />);

    expect(await screen.findByText('EMP-001')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('shows an empty state when there are no employees', async () => {
    renderWithProviders(<EmployeesListPage />);

    expect(await screen.findByText('No employees yet.')).toBeInTheDocument();
  });

  it('shows "New employee" for admin/hr but not for a non-manager role', async () => {
    setCurrentRole('finance');
    renderWithProviders(<EmployeesListPage />);
    await screen.findByText('No employees yet.');

    expect(screen.queryByRole('button', { name: 'New employee' })).not.toBeInTheDocument();
  });

  // This form has more fields (and thus more async Select open/close
  // cycles) than any other create form in the suite — comfortably under
  // 15s alone, but the default 20s can be tight under full-suite CPU
  // contention (see vite.config.ts's testTimeout comment).
  it('creates an employee and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.createEmployee).mockResolvedValue({ ...sampleEmployees[0], id: 'emp-2', employeeNumber: 'EMP-002' });

    renderWithProviders(<EmployeesListPage />);
    await screen.findByText('No employees yet.');

    await user.click(screen.getByRole('button', { name: 'New employee' }));
    await user.click(await screen.findByPlaceholderText('Select organization'));
    await user.click(await screen.findByText('Acme Industrial'));
    await user.click(await screen.findByPlaceholderText('Select user'));
    await user.click(await screen.findByText('Jane Doe (jane@acme.test)'));
    await user.type(screen.getByLabelText('Employee number', { exact: false }), 'EMP-002');
    await user.type(screen.getByLabelText('Job title', { exact: false }), 'Site Supervisor');
    await user.type(screen.getByLabelText('Hire date', { exact: false }), '2026-01-01');
    await user.type(screen.getByLabelText('Date of birth', { exact: false }), '1990-01-01');
    await user.click(screen.getByRole('combobox', { name: 'Gender' }));
    await user.click(await screen.findByText('Female'));
    await user.click(screen.getByRole('combobox', { name: 'Employment type' }));
    await user.click(await screen.findByText('Full-time'));
    await user.click(screen.getByRole('combobox', { name: 'Grade' }));
    await user.click(await screen.findByText('Senior'));
    await user.type(screen.getByLabelText('Branch', { exact: false }), 'Lagos HQ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(hrApi.createEmployee).mock.calls[0][0]).toMatchObject({
        organizationId: 'org-1',
        userId: 'user-2',
        employeeNumber: 'EMP-002',
        jobTitle: 'Site Supervisor',
        gender: 'FEMALE',
        employmentType: 'FULL_TIME',
        grade: 'SENIOR',
        branch: 'Lagos HQ',
      });
    });
    expect(await screen.findByText('Employee created')).toBeInTheDocument();
  }, 30000);
});
