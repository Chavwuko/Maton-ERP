import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setCurrentRole } from '../../auth/roleStore';
import * as hrApi from '../../api/hr';
import { EmployeeDetailPage } from './EmployeeDetailPage';
import type { Employee } from './types';

vi.mock('../../api/hr');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ id: 'emp-1' }) };
});

const baseEmployee: Employee = {
  id: 'emp-1',
  organizationId: 'org-1',
  userId: 'user-1',
  employeeNumber: 'EMP-001',
  jobTitle: 'Operations Manager',
  hireDate: '2022-01-01T00:00:00.000Z',
  employmentStatus: 'ACTIVE',
  managerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  dateOfBirth: null,
  gender: null,
  employmentType: null,
  grade: null,
  branch: null,
  exitDate: null,
  directReports: [],
};

describe('EmployeeDetailPage', () => {
  beforeEach(() => {
    setCurrentRole('admin');
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('offers ON_LEAVE and TERMINATED as next statuses for ACTIVE', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.getEmployee).mockResolvedValue(baseEmployee);

    renderWithProviders(<EmployeeDetailPage />);
    await screen.findByText('EMP-001 — Operations Manager');

    await user.click(screen.getByRole('button', { name: /ACTIVE/i }));

    expect(await screen.findByText('Move to ON LEAVE')).toBeInTheDocument();
    expect(screen.getByText('Move to TERMINATED')).toBeInTheDocument();
  });

  it('shows a plain badge (no menu) once TERMINATED — it is terminal', async () => {
    vi.mocked(hrApi.getEmployee).mockResolvedValue({ ...baseEmployee, employmentStatus: 'TERMINATED' });

    renderWithProviders(<EmployeeDetailPage />);
    await screen.findByText('EMP-001 — Operations Manager');

    expect(screen.getByText('TERMINATED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /TERMINATED/i })).not.toBeInTheDocument();
  });

  it('picking a transition calls updateEmploymentStatus with the chosen status', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.getEmployee).mockResolvedValue(baseEmployee);
    vi.mocked(hrApi.updateEmploymentStatus).mockResolvedValue({ ...baseEmployee, employmentStatus: 'ON_LEAVE' });

    renderWithProviders(<EmployeeDetailPage />);
    await screen.findByText('EMP-001 — Operations Manager');

    await user.click(screen.getByRole('button', { name: /ACTIVE/i }));
    await user.click(await screen.findByText('Move to ON LEAVE'));

    await waitFor(() => {
      expect(hrApi.updateEmploymentStatus).toHaveBeenCalledWith('emp-1', 'ON_LEAVE');
    });
    expect(await screen.findByText('Employment status updated')).toBeInTheDocument();
  });

  it('hides the status menu for a non-manager role', async () => {
    setCurrentRole('finance');
    vi.mocked(hrApi.getEmployee).mockResolvedValue(baseEmployee);

    renderWithProviders(<EmployeeDetailPage />);
    await screen.findByText('EMP-001 — Operations Manager');

    expect(screen.queryByRole('button', { name: /ACTIVE/i })).not.toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('hides "Edit profile" for a non-manager role', async () => {
    setCurrentRole('finance');
    vi.mocked(hrApi.getEmployee).mockResolvedValue(baseEmployee);

    renderWithProviders(<EmployeeDetailPage />);
    await screen.findByText('EMP-001 — Operations Manager');

    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
  });

  it('"Edit profile" pre-fills the form and submits the updated branch', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.getEmployee).mockResolvedValue({ ...baseEmployee, branch: 'Lagos HQ' });
    vi.mocked(hrApi.listEmployees).mockResolvedValue([]);
    vi.mocked(hrApi.updateEmployee).mockResolvedValue({ ...baseEmployee, branch: 'Abuja Office' });

    renderWithProviders(<EmployeeDetailPage />);
    await screen.findByText('EMP-001 — Operations Manager');

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    const branchInput = await screen.findByLabelText('Branch', { exact: false });
    expect(branchInput).toHaveValue('Lagos HQ');

    await user.clear(branchInput);
    await user.type(branchInput, 'Abuja Office');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(hrApi.updateEmployee).toHaveBeenCalledWith(
        'emp-1',
        expect.objectContaining({ branch: 'Abuja Office', jobTitle: 'Operations Manager' }),
      );
    });
    expect(await screen.findByText('Employee profile updated')).toBeInTheDocument();
  });
});
