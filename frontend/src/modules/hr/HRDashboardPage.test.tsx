import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as hrApi from '../../api/hr';
import { HRDashboardPage } from './HRDashboardPage';
import type { HrDashboard } from './types';

vi.mock('../../api/hr');

const dashboard: HrDashboard = {
  totalEmployees: 12,
  newHiresThisYear: 3,
  exitsThisYear: 1,
  relievingThisQuarter: 1,
  joiningThisQuarter: 2,
  byAgeRange: [
    { label: 'Under 25', count: 2 },
    { label: '25-34', count: 6 },
    { label: '35-44', count: 3 },
    { label: '45-54', count: 1 },
    { label: '55+', count: 0 },
    { label: 'Unknown', count: 0 },
  ],
  byGender: [
    { label: 'MALE', count: 7 },
    { label: 'FEMALE', count: 5 },
    { label: 'OTHER', count: 0 },
    { label: 'Unknown', count: 0 },
  ],
  byEmploymentType: [{ label: 'FULL_TIME', count: 12 }],
  byGrade: [{ label: 'SENIOR', count: 12 }],
  byBranch: [{ label: 'Lagos HQ', count: 12 }],
  byDesignation: [{ label: 'Operations Manager', count: 12 }],
  byDepartment: [{ label: 'Finance', count: 12 }],
};

describe('HRDashboardPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders every stat card with its value', async () => {
    vi.mocked(hrApi.getHrDashboard).mockResolvedValue(dashboard);

    renderWithProviders(<HRDashboardPage />);

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Total Employees')).toBeInTheDocument();
    expect(screen.getByText('New Hires (This Year)')).toBeInTheDocument();
    expect(screen.getByText('Employee Exits (This Year)')).toBeInTheDocument();
    expect(screen.getByText('Employees Relieving (This Quarter)')).toBeInTheDocument();
    expect(screen.getByText('Employees Joining (This Quarter)')).toBeInTheDocument();
  });

  it('renders every chart title', async () => {
    vi.mocked(hrApi.getHrDashboard).mockResolvedValue(dashboard);

    renderWithProviders(<HRDashboardPage />);

    expect(await screen.findByText('Employees by Age Range')).toBeInTheDocument();
    expect(screen.getByText('Gender Diversity Ratio')).toBeInTheDocument();
    expect(screen.getByText('Employees by Type')).toBeInTheDocument();
    expect(screen.getByText('Employees by Grade')).toBeInTheDocument();
    expect(screen.getByText('Employees by Branch')).toBeInTheDocument();
    expect(screen.getByText('Designation Wise Employee Count')).toBeInTheDocument();
    expect(screen.getByText('Department Wise Employee Count')).toBeInTheDocument();
  });

  it('shows an error state when the dashboard fails to load', async () => {
    vi.mocked(hrApi.getHrDashboard).mockRejectedValue(new Error('boom'));

    renderWithProviders(<HRDashboardPage />);

    expect(await screen.findByText("Couldn't load the HR dashboard")).toBeInTheDocument();
  });
});
