import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { makeLeaveAccess, makeLeaveRequest, makeLeaveType } from '../../test/fixtures';
import { fireDate } from '../../test/fireDate';
import { pickOption } from '../../test/pickOption';
import { ApiError } from '../../api/client';
import * as leaveApi from '../../api/leave';
import { ApprovalsPanel } from './ApprovalsPanel';
import { AllLeavePanel } from './AllLeavePanel';
import { LeaveProgress } from './LeaveProgress';
import { LeavePage } from './LeavePage';
import { LeaveTypesPanel } from './LeaveTypesPanel';
import { MyLeavePanel } from './MyLeavePanel';
import { OnLeavePanel } from './OnLeavePanel';
import { daysBetween, leaveDate, personName } from './types';

vi.mock('../../api/leave');
vi.mock('../../api/organizations', () => ({
  listOrganizations: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme', createdAt: '' }]),
  listDepartments: vi.fn().mockResolvedValue([{ id: 'dept-1', organizationId: 'org-1', name: 'Plant', code: 'PLT', createdAt: '' }]),
}));

const person = (first: string, last: string) => ({ id: `u-${first}`, firstName: first, lastName: last, email: `${first}@acme.test`.toLowerCase() });
const approval = (stage: 'SUPERVISOR' | 'HR' | 'DIRECTOR', decision: 'APPROVED' | 'REJECTED', comment: string | null = null) => ({
  id: `a-${stage}`, stage, decision, comment, decidedAt: '2026-11-25T09:00:00.000Z', decider: person('Sam', 'Smith'),
});
const findInput = (label: string) => screen.getAllByLabelText(label).find((el) => el.tagName === 'INPUT')!;

beforeEach(() => {
  vi.mocked(leaveApi.getLeaveAccess).mockResolvedValue(makeLeaveAccess());
  vi.mocked(leaveApi.listMyLeave).mockResolvedValue([]);
  vi.mocked(leaveApi.getLeaveBalance).mockResolvedValue({
    employeeId: 'emp-1',
    year: 2026,
    balances: [
      { leaveTypeId: 'lt-1', name: 'Annual leave', paid: true, entitlement: 21, used: 5, pending: 3, remaining: 13 },
      { leaveTypeId: 'lt-2', name: 'Unpaid leave', paid: false, entitlement: null, used: 0, pending: 0, remaining: null },
    ],
  });
  vi.mocked(leaveApi.listLeaveTypes).mockResolvedValue([makeLeaveType(), makeLeaveType({ id: 'lt-2', name: 'Unpaid leave', daysPerYear: null, paid: false })]);
  vi.mocked(leaveApi.listLeaveInbox).mockResolvedValue([]);
  vi.mocked(leaveApi.listAllLeave).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('leave helpers', () => {
  it('reads calendar dates without drifting a day, names people, and counts days', () => {
    expect(leaveDate('2026-12-01T00:00:00.000Z')).toBe(new Date(2026, 11, 1).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
    expect(personName({ firstName: 'Eve', lastName: 'Worker', email: 'e@x.test' })).toBe('Eve Worker');
    expect(personName({ firstName: '', lastName: '', email: 'e@x.test' })).toBe('e@x.test');
    expect(daysBetween('2026-11-24', '2026-12-04T00:00:00.000Z')).toBe(10);
    expect(daysBetween('2026-12-04', '2026-12-04')).toBe(0);
  });
});

describe('LeaveProgress', () => {
  it('shows who approved or declined each step, with their comment', () => {
    renderWithProviders(<LeaveProgress request={makeLeaveRequest({ status: 'REJECTED', approvals: [approval('SUPERVISOR', 'APPROVED'), approval('HR', 'REJECTED', 'Shutdown')] })} />);

    expect(screen.getByText('Supervisor: approved by Sam Smith')).toBeInTheDocument();
    expect(screen.getByText('HR: declined by Sam Smith — “Shutdown”')).toBeInTheDocument();
    expect(screen.getByText('Executive director: not reached')).toBeInTheDocument();
  });

  it('shows the step it is waiting at, and marks an earlier step with no decision as skipped', () => {
    renderWithProviders(<LeaveProgress request={makeLeaveRequest({ status: 'PENDING_HR' })} />);

    expect(screen.getByText('Supervisor: skipped')).toBeInTheDocument();
    expect(screen.getByText('HR: waiting')).toBeInTheDocument();
    expect(screen.getByText('Executive director: not reached')).toBeInTheDocument();
  });

  it('marks a step that never applied as skipped once approved', () => {
    renderWithProviders(<LeaveProgress request={makeLeaveRequest({ status: 'APPROVED', approvals: [approval('HR', 'APPROVED'), approval('DIRECTOR', 'APPROVED')] })} />);

    expect(screen.getByText('Supervisor: skipped')).toBeInTheDocument();
  });
});

describe('LeavePage', () => {
  it('gives an ordinary employee only their own leave', async () => {
    renderWithProviders(<LeavePage />);

    expect(await screen.findByRole('tab', { name: 'My leave' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Who is on leave' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Approvals/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Leave types' })).not.toBeInTheDocument();
  });

  it('gives the people who oversee others the approvals, the dashboard and every request', async () => {
    vi.mocked(leaveApi.getLeaveAccess).mockResolvedValue(makeLeaveAccess({ canViewDashboard: true, awaitingMyDecision: 2 }));

    renderWithProviders(<LeavePage />);

    expect(await screen.findByRole('tab', { name: /Approvals/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: 'Who is on leave' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All requests' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Leave types' })).not.toBeInTheDocument();
  });

  it('shows approvals to someone with a request waiting even if they oversee no one else, and leave types to HR', async () => {
    vi.mocked(leaveApi.getLeaveAccess).mockResolvedValue(makeLeaveAccess({ awaitingMyDecision: 1 }));
    const { unmount } = renderWithProviders(<LeavePage />);
    expect(await screen.findByRole('tab', { name: /Approvals/ })).toBeInTheDocument();
    unmount();

    vi.mocked(leaveApi.getLeaveAccess).mockResolvedValue(makeLeaveAccess({ canViewDashboard: true, canViewAll: true, canManageTypes: true }));
    renderWithProviders(<LeavePage />);
    expect(await screen.findByRole('tab', { name: 'Leave types' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Approvals' })).toBeInTheDocument();
  });

  it('opens on the tab in the link', async () => {
    vi.mocked(leaveApi.getLeaveAccess).mockResolvedValue(makeLeaveAccess({ canViewDashboard: true }));
    vi.mocked(leaveApi.listLeaveInbox).mockResolvedValue([makeLeaveRequest()]);

    renderWithProviders(<LeavePage />, { route: '/hr/leaves?tab=approvals' });

    expect(await screen.findByText('Eve Worker')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Approvals/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('surfaces a failure', async () => {
    vi.mocked(leaveApi.getLeaveAccess).mockRejectedValueOnce(new ApiError(500, 'Server error')).mockRejectedValueOnce(new Error('network'));
    const { unmount } = renderWithProviders(<LeavePage />);
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    unmount();

    renderWithProviders(<LeavePage />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});

describe('MyLeavePanel', () => {
  it('shows the allowance, what is taken and waiting, and what is left, per kind of leave', async () => {
    renderWithProviders(<MyLeavePanel organizationId="org-1" />);

    const row = (await screen.findByText('Annual leave', { selector: 'td' })).closest('tr')!;
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Annual leave', '21', '5', '3', '13']);
    const unpaid = screen.getByText('Unpaid leave', { selector: 'td' }).closest('tr')!;
    expect(within(unpaid).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Unpaid leave', 'No limit', '0', '0', '—']);
    expect(screen.getByText('You have not asked for any leave yet.')).toBeInTheDocument();
  });

  it('lists the requests with their status, where each has got to, and expected return', async () => {
    vi.mocked(leaveApi.listMyLeave).mockResolvedValue([
      makeLeaveRequest({ status: 'PENDING_HR', approvals: [approval('SUPERVISOR', 'APPROVED')] }),
      makeLeaveRequest({ id: 'lr-2', status: 'REJECTED', approvals: [approval('SUPERVISOR', 'REJECTED', 'No cover')] }),
    ]);

    renderWithProviders(<MyLeavePanel organizationId="org-1" />);

    expect(await screen.findByText('With HR')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.getAllByText(leaveDate('2026-12-04'))).toHaveLength(2);
    expect(screen.getByText('Supervisor: declined by Sam Smith — “No cover”')).toBeInTheDocument();
    // Only a request that is still alive can be cancelled.
    expect(screen.getAllByRole('button', { name: /^Cancel / })).toHaveLength(1);
  });

  it('says to ask HR when there is no employee record', () => {
    renderWithProviders(<MyLeavePanel organizationId={null} />);

    expect(screen.getByText('Ask HR to add you as an employee before you file leave.')).toBeInTheDocument();
  });

  it('says so when HR has set up no leave types, and cannot request', async () => {
    vi.mocked(leaveApi.getLeaveBalance).mockResolvedValue({ employeeId: 'emp-1', year: 2026, balances: [] });
    vi.mocked(leaveApi.listLeaveTypes).mockResolvedValue([]);

    renderWithProviders(<MyLeavePanel organizationId="org-1" />);

    expect(await screen.findByText('HR has not set up any leave types yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request leave' })).toBeDisabled();
  });

  it('surfaces a failure to load', async () => {
    vi.mocked(leaveApi.listMyLeave).mockRejectedValue(new ApiError(500, 'Server error'));

    renderWithProviders(<MyLeavePanel organizationId="org-1" />);

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('cancels a request after asking first, and surfaces a failure', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    vi.mocked(leaveApi.listMyLeave).mockResolvedValue([makeLeaveRequest()]);
    vi.mocked(leaveApi.cancelLeave).mockResolvedValueOnce(makeLeaveRequest({ status: 'CANCELLED' })).mockRejectedValueOnce(new ApiError(400, 'Leave that has already started can only be cancelled by HR')).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<MyLeavePanel organizationId="org-1" />);

    const cancel = await screen.findByRole('button', { name: /^Cancel Annual leave/ });
    await user.click(cancel);
    expect(leaveApi.cancelLeave).not.toHaveBeenCalled();

    await user.click(cancel);
    expect(await screen.findByText('Leave request cancelled')).toBeInTheDocument();
    expect(vi.mocked(leaveApi.cancelLeave).mock.calls[0][0]).toBe('lr-1');

    await user.click(cancel);
    expect(await screen.findByText('Leave that has already started can only be cancelled by HR')).toBeInTheDocument();
    await user.click(cancel);
    expect(await screen.findByText('Failed to cancel the request')).toBeInTheDocument();
    confirm.mockRestore();
  });

  describe('asking for leave', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      renderWithProviders(<MyLeavePanel organizationId="org-1" />);
      await user.click(await screen.findByRole('button', { name: 'Request leave' }));
      return screen.findByRole('dialog', { name: 'Request leave' });
    };

    it('needs the kind of leave and both dates, with the last day not before the first', async () => {
      const user = userEvent.setup();
      const dialog = await open(user);

      await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
      expect(await within(dialog).findByText('Choose the kind of leave')).toBeInTheDocument();
      expect(within(dialog).getByText('First day is required')).toBeInTheDocument();
      expect(within(dialog).getByText('Last day is required')).toBeInTheDocument();

      fireDate(within(dialog).getByLabelText(/First day away/), '2026-12-05');
      fireDate(within(dialog).getByLabelText(/Last day away/), '2026-12-01');
      await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
      expect(await within(dialog).findByText('The last day cannot be before the first')).toBeInTheDocument();
      expect(leaveApi.fileLeave).not.toHaveBeenCalled();
    });

    it('sends the request, saying how many days are left of the kind chosen', async () => {
      const user = userEvent.setup();
      vi.mocked(leaveApi.fileLeave).mockResolvedValue(makeLeaveRequest());
      const dialog = await open(user);

      await pickOption(user, within(dialog).getByLabelText('Kind of leave', { exact: false }), 'Annual leave');
      expect(within(dialog).getByText('You have 13 working days left this year.')).toBeInTheDocument();
      await pickOption(user, within(dialog).getByLabelText('Kind of leave', { exact: false }), 'Unpaid leave');
      expect(within(dialog).getByText('No yearly limit on this kind of leave.')).toBeInTheDocument();
      await pickOption(user, within(dialog).getByLabelText('Kind of leave', { exact: false }), 'Annual leave');
      fireDate(within(dialog).getByLabelText(/First day away/), '2026-12-01');
      fireDate(within(dialog).getByLabelText(/Last day away/), '2026-12-03');
      await user.click(within(dialog).getByLabelText('Reason'));
      await user.paste('  Family wedding ');
      await user.click(within(dialog).getByRole('button', { name: 'Send request' }));

      await waitFor(() => expect(leaveApi.fileLeave).toHaveBeenCalledWith({ leaveTypeId: 'lt-1', startDate: '2026-12-01', endDate: '2026-12-03', reason: 'Family wedding' }));
      expect(await screen.findByText('Leave request sent for approval')).toBeInTheDocument();
    });

    it('uses the singular for one day left, sends no reason when blank, and surfaces failures', async () => {
      const user = userEvent.setup();
      vi.mocked(leaveApi.getLeaveBalance).mockResolvedValue({
        employeeId: 'emp-1',
        year: 2026,
        balances: [{ leaveTypeId: 'lt-1', name: 'Annual leave', paid: true, entitlement: 21, used: 20, pending: 0, remaining: 1 }],
      });
      vi.mocked(leaveApi.fileLeave).mockRejectedValueOnce(new ApiError(409, 'You already have leave from 2026-12-02 to 2026-12-09')).mockRejectedValueOnce(new Error('network'));
      const dialog = await open(user);

      await pickOption(user, within(dialog).getByLabelText('Kind of leave', { exact: false }), 'Annual leave');
      expect(within(dialog).getByText('You have 1 working day left this year.')).toBeInTheDocument();
      fireDate(within(dialog).getByLabelText(/First day away/), '2026-12-01');
      fireDate(within(dialog).getByLabelText(/Last day away/), '2026-12-01');
      await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
      expect(await screen.findByText('You already have leave from 2026-12-02 to 2026-12-09')).toBeInTheDocument();
      expect(vi.mocked(leaveApi.fileLeave).mock.calls[0][0]).toEqual({ leaveTypeId: 'lt-1', startDate: '2026-12-01', endDate: '2026-12-01', reason: undefined });

      await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
      expect(await screen.findByText('Failed to send the leave request')).toBeInTheDocument();
    });
  });
});

describe('ApprovalsPanel', () => {
  it('lists what is waiting with who, what, when and which step', async () => {
    vi.mocked(leaveApi.listLeaveInbox).mockResolvedValue([
      makeLeaveRequest({ reason: 'Wedding' }),
      makeLeaveRequest({
        id: 'lr-2',
        status: 'PENDING_DIRECTOR',
        employee: { ...makeLeaveRequest().employee, jobTitle: '', user: { id: 'u-n', firstName: '', lastName: '', email: 'nameless@acme.test', department: null } },
      }),
    ]);

    renderWithProviders(<ApprovalsPanel />);

    expect(await screen.findByText('Eve Worker')).toBeInTheDocument();
    expect(screen.getByText('Operator, Plant')).toBeInTheDocument();
    expect(screen.getByText('With supervisor')).toBeInTheDocument();
    expect(screen.getByText('With executive director')).toBeInTheDocument();
    expect(screen.getByText('nameless@acme.test')).toBeInTheDocument();
  });

  it('says so when nothing is waiting, and surfaces a failure', async () => {
    const { unmount } = renderWithProviders(<ApprovalsPanel />);
    expect(await screen.findByText('Nothing is waiting for your decision.')).toBeInTheDocument();
    unmount();

    vi.mocked(leaveApi.listLeaveInbox).mockRejectedValueOnce(new ApiError(500, 'Server error')).mockRejectedValueOnce(new Error('network'));
    const second = renderWithProviders(<ApprovalsPanel />);
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    second.unmount();
    renderWithProviders(<ApprovalsPanel />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  describe('deciding', () => {
    const review = async (user: ReturnType<typeof userEvent.setup>, request = makeLeaveRequest({ reason: 'Wedding', employee: { ...makeLeaveRequest().employee, jobTitle: 'Operator' } })) => {
      vi.mocked(leaveApi.listLeaveInbox).mockResolvedValue([request]);
      renderWithProviders(<ApprovalsPanel />);
      await user.click(await screen.findByRole('button', { name: 'Review leave for Eve Worker' }));
      return screen.findByRole('dialog', { name: 'Leave for Eve Worker' });
    };

    it('shows the request, who has decided, and approves it with a comment', async () => {
      const user = userEvent.setup();
      vi.mocked(leaveApi.decideLeave).mockResolvedValue(makeLeaveRequest({ status: 'PENDING_HR' }));
      const dialog = await review(user);

      expect(within(dialog).getByText('Annual leave: 3 working days')).toBeInTheDocument();
      expect(within(dialog).getByText(`Expected back ${leaveDate('2026-12-04')}`)).toBeInTheDocument();
      expect(within(dialog).getByText('Operator, Plant')).toBeInTheDocument();
      expect(within(dialog).getByText('Wedding')).toBeInTheDocument();
      expect(within(dialog).getByText('Supervisor: waiting')).toBeInTheDocument();
      await user.click(within(dialog).getByLabelText('Comment', { exact: false }));
      await user.paste(' Fine by me ');
      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

      await waitFor(() => expect(leaveApi.decideLeave).toHaveBeenCalledWith('lr-1', 'APPROVE', 'Fine by me'));
      expect(await screen.findByText('Leave approved')).toBeInTheDocument();
    });

    it('approves with no comment', async () => {
      const user = userEvent.setup();
      vi.mocked(leaveApi.decideLeave).mockResolvedValue(makeLeaveRequest());
      const dialog = await review(user);

      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

      await waitFor(() => expect(leaveApi.decideLeave).toHaveBeenCalledWith('lr-1', 'APPROVE', undefined));
    });

    it('will not decline without a reason, then sends it', async () => {
      const user = userEvent.setup();
      vi.mocked(leaveApi.decideLeave).mockResolvedValue(makeLeaveRequest({ status: 'REJECTED' }));
      const dialog = await review(user);

      await user.click(within(dialog).getByRole('button', { name: 'Decline' }));
      expect(await within(dialog).findByText('Please say why you are declining')).toBeInTheDocument();
      expect(leaveApi.decideLeave).not.toHaveBeenCalled();

      await user.click(within(dialog).getByLabelText('Comment', { exact: false }));
      await user.paste('Shutdown that week');
      await user.click(within(dialog).getByRole('button', { name: 'Decline' }));

      await waitFor(() => expect(leaveApi.decideLeave).toHaveBeenCalledWith('lr-1', 'REJECT', 'Shutdown that week'));
      expect(await screen.findByText('Leave declined')).toBeInTheDocument();
    });

    it('surfaces failures, and leaves out the job line for someone with no department', async () => {
      const user = userEvent.setup();
      vi.mocked(leaveApi.decideLeave).mockRejectedValueOnce(new ApiError(403, 'You cannot decide your own leave request')).mockRejectedValueOnce(new Error('network'));
      const request = makeLeaveRequest();
      request.employee.user.department = null;
      const dialog = await review(user, request);

      expect(within(dialog).queryByText(/Operator,/)).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
      expect(await screen.findByText('You cannot decide your own leave request')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
      expect(await screen.findByText('Failed to record the decision')).toBeInTheDocument();
    });
  });
});

describe('OnLeavePanel', () => {
  const dashboard = (overrides = {}) => ({
    asOf: '2026-12-02',
    onLeave: [
      makeLeaveRequest({ status: 'APPROVED' }),
      makeLeaveRequest({
        id: 'lr-2',
        status: 'APPROVED',
        returnDate: '2026-12-03T00:00:00.000Z',
        employee: { ...makeLeaveRequest().employee, user: { id: 'u-b', firstName: 'Bo', lastName: 'Far', email: 'bo@acme.test', department: null } },
      }),
      makeLeaveRequest({
        id: 'lr-3',
        status: 'APPROVED',
        returnDate: '2027-01-20T00:00:00.000Z',
        employee: { ...makeLeaveRequest().employee, user: { id: 'u-c', firstName: 'Cy', lastName: 'Long', email: 'cy@acme.test', department: { id: 'dept-1', name: 'Plant' } } },
      }),
    ],
    upcoming: [makeLeaveRequest({ id: 'lr-4', status: 'APPROVED', startDate: '2026-12-10T00:00:00.000Z' })],
    counts: { onLeave: 3, returningThisWeek: 2, startingSoon: 1, awaitingApproval: 5 },
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(leaveApi.getOnLeave).mockResolvedValue(dashboard() as never);
  });

  it('shows who is on leave and when each is expected back, with the numbers', async () => {
    renderWithProviders(<OnLeavePanel />);

    expect(await screen.findByText('On leave', { selector: 'p' })).toBeInTheDocument();
    const card = (label: string) => screen.getByText(label).previousElementSibling as HTMLElement;
    expect(card('On leave')).toHaveTextContent('3');
    expect(card('Back within a week')).toHaveTextContent('2');
    expect(card('Starting in 30 days')).toHaveTextContent('1');
    expect(card('Awaiting approval')).toHaveTextContent('5');
    expect(screen.getByText(`On leave on ${leaveDate('2026-12-02')}`)).toBeInTheDocument();

    const [away, upcoming] = screen.getAllByRole('table');
    expect(within(away).getByText('Eve Worker')).toBeInTheDocument();
    expect(within(away).getByText('back in 2 days')).toBeInTheDocument();
    expect(within(away).getByText('back tomorrow')).toBeInTheDocument();
    expect(within(away).getByText('back in 49 days')).toBeInTheDocument();
    expect(within(away).getAllByText('Plant')).toHaveLength(2);
    expect(within(away).getByText('—')).toBeInTheDocument();
    expect(within(upcoming).getByText(leaveDate('2026-12-10'))).toBeInTheDocument();
    expect(within(upcoming).queryByText(/back in/)).not.toBeInTheDocument();
  });

  it('says so when nobody is away', async () => {
    vi.mocked(leaveApi.getOnLeave).mockResolvedValue(dashboard({ onLeave: [], upcoming: [], counts: { onLeave: 0, returningThisWeek: 0, startingSoon: 0, awaitingApproval: 0 } }) as never);

    renderWithProviders(<OnLeavePanel />);

    expect(await screen.findByText('Nobody is on leave.')).toBeInTheDocument();
    expect(screen.getByText('Nobody has leave coming up.')).toBeInTheDocument();
  });

  it('looks at another day or one department', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnLeavePanel />);
    await screen.findByText('Nobody is on leave.', {}, { timeout: 100 }).catch(() => undefined);
    await screen.findByText('Awaiting approval');
    expect(leaveApi.getOnLeave).toHaveBeenLastCalledWith({ date: undefined, departmentId: undefined });

    fireDate(screen.getByLabelText('As at'), '2026-12-20');
    await waitFor(() => expect(leaveApi.getOnLeave).toHaveBeenLastCalledWith({ date: '2026-12-20', departmentId: undefined }));
    await pickOption(user, findInput('Department'), 'Plant');
    await waitFor(() => expect(leaveApi.getOnLeave).toHaveBeenLastCalledWith({ date: '2026-12-20', departmentId: 'dept-1' }));
  });

  it('surfaces a failure', async () => {
    vi.mocked(leaveApi.getOnLeave).mockRejectedValueOnce(new ApiError(403, 'Only the executive director, HR, department heads and supervisors can see this')).mockRejectedValueOnce(new Error('network'));
    const { unmount } = renderWithProviders(<OnLeavePanel />);
    expect(await screen.findByText(/Only the executive director/)).toBeInTheDocument();
    unmount();

    renderWithProviders(<OnLeavePanel />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});

describe('AllLeavePanel', () => {
  it('lists every request with its status and progress', async () => {
    vi.mocked(leaveApi.listAllLeave).mockResolvedValue([
      makeLeaveRequest({ status: 'APPROVED', approvals: [approval('SUPERVISOR', 'APPROVED'), approval('HR', 'APPROVED'), approval('DIRECTOR', 'APPROVED')] }),
      makeLeaveRequest({ id: 'lr-2', status: 'CANCELLED', employee: { ...makeLeaveRequest().employee, user: { id: 'u-x', firstName: 'Xi', lastName: 'Nodept', email: 'x@acme.test', department: null } } }),
    ]);

    renderWithProviders(<AllLeavePanel />);

    expect(await screen.findByText('Eve Worker')).toBeInTheDocument();
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Approved')).toBeInTheDocument();
    expect(table.getByText('Cancelled')).toBeInTheDocument();
    expect(table.getAllByText('Executive director: approved by Sam Smith')).toHaveLength(1);
    expect(table.getByText('—')).toBeInTheDocument();
  });

  it('filters by status and department, and says so when nothing matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AllLeavePanel />);
    expect(await screen.findByText('No leave requests yet.')).toBeInTheDocument();

    await pickOption(user, findInput('Status'), 'Declined');
    await waitFor(() => expect(leaveApi.listAllLeave).toHaveBeenLastCalledWith({ status: 'REJECTED', departmentId: undefined }));
    expect(await screen.findByText('No leave requests match.')).toBeInTheDocument();
    await pickOption(user, findInput('Department'), 'Plant');
    await waitFor(() => expect(leaveApi.listAllLeave).toHaveBeenLastCalledWith({ status: 'REJECTED', departmentId: 'dept-1' }));
  });

  it('surfaces a failure', async () => {
    vi.mocked(leaveApi.listAllLeave).mockRejectedValueOnce(new ApiError(500, 'Server error')).mockRejectedValueOnce(new Error('network'));
    const { unmount } = renderWithProviders(<AllLeavePanel />);
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    unmount();
    renderWithProviders(<AllLeavePanel />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});

describe('LeaveTypesPanel', () => {
  const types = [makeLeaveType(), makeLeaveType({ id: 'lt-2', name: 'Sick leave', daysPerYear: 10, allowBackdate: true }), makeLeaveType({ id: 'lt-3', name: 'Unpaid leave', daysPerYear: null, paid: false, active: false })];

  beforeEach(() => {
    vi.mocked(leaveApi.listLeaveTypes).mockResolvedValue(types);
  });

  it('lists the types with their allowance, whether paid, and whether in use', async () => {
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);

    expect(await screen.findByText('Annual leave')).toBeInTheDocument();
    expect(leaveApi.listLeaveTypes).toHaveBeenCalledWith({ organizationId: 'org-1', all: true });
    const unpaid = screen.getByText('Unpaid leave').closest('tr')!;
    expect(within(unpaid).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Unpaid leave', 'No limit', 'Unpaid', '—', 'Switched off', 'EditSwitch on']);
    expect(within(screen.getByText('Sick leave').closest('tr')!).getByText('Allowed')).toBeInTheDocument();
  });

  it('asks which organization when the person has no employee record, and says to choose one', async () => {
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId={null} />);

    expect(await screen.findByText('Choose an organization to set up its leave types.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New leave type' })).toBeDisabled();
    expect(leaveApi.listLeaveTypes).not.toHaveBeenCalled();

    await pickOption(userEvent.setup(), findInput('Organization'), 'Acme');
    expect(await screen.findByText('Annual leave')).toBeInTheDocument();
    expect(leaveApi.listLeaveTypes).toHaveBeenCalledWith({ organizationId: 'org-1', all: true });
  });

  it('adds the standard types, saying so when none exist yet', async () => {
    const user = userEvent.setup();
    vi.mocked(leaveApi.listLeaveTypes).mockResolvedValueOnce([]);
    vi.mocked(leaveApi.createDefaultLeaveTypes).mockResolvedValueOnce(types).mockRejectedValueOnce(new ApiError(404, 'Organization org-1 not found')).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);

    expect(await screen.findByText('No leave types yet. Add the standard ones to start from.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add standard leave types' }));
    expect(await screen.findByText('Standard leave types added')).toBeInTheDocument();
    expect(leaveApi.createDefaultLeaveTypes).toHaveBeenCalledWith('org-1');

    await user.click(screen.getByRole('button', { name: 'Add standard leave types' }));
    expect(await screen.findByText('Organization org-1 not found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add standard leave types' }));
    expect(await screen.findByText('Failed to add the standard leave types')).toBeInTheDocument();
  });

  it('adds a new type', async () => {
    const user = userEvent.setup();
    vi.mocked(leaveApi.createLeaveType).mockResolvedValue(makeLeaveType());
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);

    await user.click(await screen.findByRole('button', { name: 'New leave type' }));
    const dialog = await screen.findByRole('dialog', { name: 'New leave type' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Name is required')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Name/), ' Study leave ');
    await user.type(within(dialog).getByLabelText(/Working days a year/), '5');
    await user.click(within(dialog).getByRole('switch', { name: /Paid leave/ }));
    await user.click(within(dialog).getByRole('switch', { name: /Can be filed after it has started/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(leaveApi.createLeaveType).toHaveBeenCalledWith({ organizationId: 'org-1', name: 'Study leave', daysPerYear: 5, paid: false, allowBackdate: true }));
    expect(await screen.findByText('Leave type added')).toBeInTheDocument();
  });

  it('edits a type, with no limit when the allowance is cleared', async () => {
    const user = userEvent.setup();
    vi.mocked(leaveApi.updateLeaveType).mockResolvedValue(makeLeaveType());
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);

    await user.click(await screen.findByRole('button', { name: 'Edit Sick leave' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Sick leave' });
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('Sick leave');
    expect(within(dialog).getByLabelText(/Working days a year/)).toHaveValue('10');
    await user.clear(within(dialog).getByLabelText(/Working days a year/));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(leaveApi.updateLeaveType).toHaveBeenCalledWith('lt-2', { name: 'Sick leave', daysPerYear: null, paid: true, allowBackdate: true }));
    expect(await screen.findByText('Leave type updated')).toBeInTheDocument();
  });

  it('surfaces a failure to save', async () => {
    const user = userEvent.setup();
    vi.mocked(leaveApi.createLeaveType).mockRejectedValueOnce(new ApiError(409, 'There is already a leave type called "Annual leave"')).mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);

    await user.click(await screen.findByRole('button', { name: 'New leave type' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Name/), 'Annual leave');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('There is already a leave type called "Annual leave"')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save the leave type')).toBeInTheDocument();
  });

  it('switches a type off or on, and surfaces a failure', async () => {
    const user = userEvent.setup();
    vi.mocked(leaveApi.updateLeaveType).mockResolvedValue(makeLeaveType());
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);

    await user.click(await screen.findByRole('button', { name: 'Switch off Annual leave' }));
    await waitFor(() => expect(leaveApi.updateLeaveType).toHaveBeenLastCalledWith('lt-1', { active: false }));
    await user.click(screen.getByRole('button', { name: 'Switch on Unpaid leave' }));
    await waitFor(() => expect(leaveApi.updateLeaveType).toHaveBeenLastCalledWith('lt-3', { active: true }));

    vi.mocked(leaveApi.updateLeaveType).mockRejectedValueOnce(new Error('network'));
    await user.click(screen.getByRole('button', { name: 'Switch off Annual leave' }));
    expect(await screen.findByText('Failed to update the leave type')).toBeInTheDocument();
  });

  it('surfaces a failure to load the list', async () => {
    vi.mocked(leaveApi.listLeaveTypes).mockRejectedValueOnce(new ApiError(500, 'Server error')).mockRejectedValueOnce(new Error('network'));
    const { unmount } = renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);
    expect(await screen.findByText('Server error')).toBeInTheDocument();
    unmount();
    renderWithProviders(<LeaveTypesPanel defaultOrganizationId="org-1" />);
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });
});
