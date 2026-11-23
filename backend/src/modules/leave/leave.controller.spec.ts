import { LeaveController } from './leave.controller';
import type { LeaveTypesService } from './leave-types.service';
import type { LeaveService } from './leave.service';

describe('LeaveController', () => {
  let leave: jest.Mocked<LeaveService>;
  let types: jest.Mocked<LeaveTypesService>;
  let controller: LeaveController;
  const req = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    leave = {
      access: jest.fn(),
      balance: jest.fn(),
      onLeave: jest.fn(),
      create: jest.fn(),
      mine: jest.fn(),
      inbox: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      decide: jest.fn(),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<LeaveService>;
    types = { findAll: jest.fn(), create: jest.fn(), createDefaults: jest.fn(), update: jest.fn() } as unknown as jest.Mocked<LeaveTypesService>;
    controller = new LeaveController(leave, types);
  });

  it('access, mine and inbox act as the signed-in user', () => {
    controller.access(req);
    controller.mine(req, 'APPROVED');
    controller.inbox(req);

    expect(leave.access).toHaveBeenCalledWith({ id: 'user-1' });
    expect(leave.mine).toHaveBeenCalledWith({ id: 'user-1' }, { status: 'APPROVED' });
    expect(leave.inbox).toHaveBeenCalledWith({ id: 'user-1' });
  });

  it('lists leave types, every type only when asked', () => {
    controller.findTypes('org-1');
    controller.findTypes(undefined, 'true');

    expect(types.findAll).toHaveBeenNthCalledWith(1, { organizationId: 'org-1', includeInactive: false });
    expect(types.findAll).toHaveBeenNthCalledWith(2, { organizationId: undefined, includeInactive: true });
  });

  it('creates, updates and sets up defaults for leave types', () => {
    const dto = { organizationId: 'org-1', name: 'Annual leave' };
    controller.createType(dto);
    controller.createDefaults({ organizationId: 'org-1' });
    controller.updateType('t1', { active: false });

    expect(types.create).toHaveBeenCalledWith(dto);
    expect(types.createDefaults).toHaveBeenCalledWith('org-1');
    expect(types.update).toHaveBeenCalledWith('t1', { active: false });
  });

  it('forwards balance and dashboard filters', () => {
    controller.balance(req, 'e1', '2026');
    controller.onLeave(req, '2026-12-01', 'd1');

    expect(leave.balance).toHaveBeenCalledWith({ id: 'user-1' }, { employeeId: 'e1', year: '2026' });
    expect(leave.onLeave).toHaveBeenCalledWith({ id: 'user-1' }, { date: '2026-12-01', departmentId: 'd1' });
  });

  it('files, lists, reads, decides and cancels requests as the signed-in user', () => {
    const dto = { leaveTypeId: 't1', startDate: '2026-12-01', endDate: '2026-12-03' };
    controller.create(dto, req);
    controller.findAll(req, 'APPROVED', 'e1', 'd1', '2026-12-01', '2026-12-31');
    controller.findOne('lr-1', req);
    controller.decide('lr-1', { decision: 'APPROVE' }, req);
    controller.cancel('lr-1', req);

    expect(leave.create).toHaveBeenCalledWith({ id: 'user-1' }, dto);
    expect(leave.findAll).toHaveBeenCalledWith({ id: 'user-1' }, { status: 'APPROVED', employeeId: 'e1', departmentId: 'd1', from: '2026-12-01', to: '2026-12-31' });
    expect(leave.findOne).toHaveBeenCalledWith('lr-1', { id: 'user-1' });
    expect(leave.decide).toHaveBeenCalledWith('lr-1', { id: 'user-1' }, { decision: 'APPROVE' });
    expect(leave.cancel).toHaveBeenCalledWith('lr-1', { id: 'user-1' });
  });
});
