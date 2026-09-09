import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as hrApi from '../../api/hr';
import { TeamAttendancePanel } from './TeamAttendancePanel';
import type { AttendanceRecord } from './types';

vi.mock('../../api/hr');

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
    shiftId: null,
  },
];

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'att-1',
    employeeId: 'emp-1',
    date: '2026-06-15T00:00:00.000Z',
    clockIn: '2026-06-15T09:00:00.000Z',
    clockOut: '2026-06-15T17:00:00.000Z',
    status: 'PRESENT',
    notes: null,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    employee: sampleEmployees[0],
    ...overrides,
  };
}

describe('TeamAttendancePanel', () => {
  beforeEach(() => {
    vi.mocked(hrApi.listEmployees).mockResolvedValue(sampleEmployees);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders attendance records with the employee number', async () => {
    vi.mocked(hrApi.listAttendance).mockResolvedValue([record()]);

    renderWithProviders(<TeamAttendancePanel />);

    expect(await screen.findByText('EMP-001')).toBeInTheDocument();
    expect(screen.getByText('PRESENT')).toBeInTheDocument();
  });

  it('shows an empty state when there are no records', async () => {
    vi.mocked(hrApi.listAttendance).mockResolvedValue([]);

    renderWithProviders(<TeamAttendancePanel />);

    expect(await screen.findByText('No attendance records yet.')).toBeInTheDocument();
  });

  it('marks attendance for an employee and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.listAttendance).mockResolvedValue([]);
    vi.mocked(hrApi.createAttendanceRecord).mockResolvedValue(record({ status: 'ON_LEAVE' }));

    renderWithProviders(<TeamAttendancePanel />);
    await screen.findByText('No attendance records yet.');

    await user.click(screen.getByRole('button', { name: 'Mark attendance' }));
    const dialog = await screen.findByRole('dialog');
    // Two EmployeeSelects are on screen at once (the page's own employee
    // filter, plus this modal's) — both share the "Select employee"
    // placeholder, so the click that opens the dropdown must be scoped to
    // the modal; the dropdown itself still portals to the document body.
    const employeeInput = within(dialog).getByPlaceholderText('Select employee');
    await user.click(employeeInput);
    // The page's own (closed) employee filter keeps its own dropdown
    // mounted too, with the same option text — scope by this input's own
    // aria-controls listbox instead of guessing DOM/portal order.
    const listboxId = employeeInput.getAttribute('aria-controls');
    const listbox = await waitFor(() => {
      const el = document.getElementById(listboxId!);
      if (!el) throw new Error('listbox not mounted yet');
      return el;
    });
    await user.click(within(listbox).getByText('EMP-001 — Operations Manager'));
    await user.type(within(dialog).getByLabelText('Date', { exact: false }), '2026-06-15');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(hrApi.createAttendanceRecord).mock.calls[0][0]).toMatchObject({
        employeeId: 'emp-1',
        date: '2026-06-15',
      });
    });
    expect(await screen.findByText('Attendance record created')).toBeInTheDocument();
  });

  it('corrects an existing record', async () => {
    const user = userEvent.setup();
    vi.mocked(hrApi.listAttendance).mockResolvedValue([record()]);
    vi.mocked(hrApi.updateAttendanceRecord).mockResolvedValue(record({ status: 'HALF_DAY' }));

    renderWithProviders(<TeamAttendancePanel />);
    await screen.findByText('EMP-001');

    await user.click(screen.getByRole('button', { name: 'Correct' }));
    await user.click(await screen.findByRole('textbox', { name: 'Notes' }));
    await user.type(screen.getByLabelText('Notes', { exact: false }), 'Left early');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(hrApi.updateAttendanceRecord).toHaveBeenCalledWith(
        'att-1',
        expect.objectContaining({ notes: 'Left early' }),
      );
    });
  });
});
