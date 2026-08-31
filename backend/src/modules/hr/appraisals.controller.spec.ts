import { mockRequest } from '../../../test/utils/mock-request';
import { AppraisalsController } from './appraisals.controller';
import { AppraisalsService } from './appraisals.service';
import { EmployeesService } from './employees.service';

describe('AppraisalsController', () => {
  let appraisalsService: jest.Mocked<AppraisalsService>;
  let employeesService: jest.Mocked<EmployeesService>;
  let controller: AppraisalsController;

  beforeEach(() => {
    appraisalsService = {
      findAllCycles: jest.fn(),
      findCycle: jest.fn(),
      createCycle: jest.fn(),
      updateCycleStatus: jest.fn(),
      createAppraisal: jest.fn(),
      findAllAppraisals: jest.fn(),
      findAppraisal: jest.fn(),
      submitReview: jest.fn(),
    } as unknown as jest.Mocked<AppraisalsService>;
    employeesService = { findByUserId: jest.fn() } as unknown as jest.Mocked<EmployeesService>;
    controller = new AppraisalsController(appraisalsService, employeesService);
  });

  it('findAllCycles forwards organizationId and status', () => {
    controller.findAllCycles('org-1', 'ACTIVE' as never);
    expect(appraisalsService.findAllCycles).toHaveBeenCalledWith({ organizationId: 'org-1', status: 'ACTIVE' });
  });

  it('findCycle forwards the id', () => {
    controller.findCycle('c1');
    expect(appraisalsService.findCycle).toHaveBeenCalledWith('c1');
  });

  it('createCycle forwards the dto', () => {
    const dto = { organizationId: 'org-1', name: 'Q1', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-03-31T00:00:00.000Z' };
    controller.createCycle(dto);
    expect(appraisalsService.createCycle).toHaveBeenCalledWith(dto);
  });

  it('updateCycleStatus forwards the id and dto', () => {
    controller.updateCycleStatus('c1', { status: 'CLOSED' });
    expect(appraisalsService.updateCycleStatus).toHaveBeenCalledWith('c1', { status: 'CLOSED' });
  });

  it('createAppraisal forwards the cycle id and dto', () => {
    const dto = { employeeId: 'e1', reviewers: [{ employeeId: 'e1', relationType: 'SELF' as const }] };
    controller.createAppraisal('c1', dto);
    expect(appraisalsService.createAppraisal).toHaveBeenCalledWith('c1', dto);
  });

  it('findAllAppraisals forwards every filter', () => {
    controller.findAllAppraisals('org-1', 'c1', 'e1', 'PENDING' as never);
    expect(appraisalsService.findAllAppraisals).toHaveBeenCalledWith({
      organizationId: 'org-1',
      cycleId: 'c1',
      employeeId: 'e1',
      status: 'PENDING',
    });
  });

  it('findAppraisal forwards the id', () => {
    controller.findAppraisal('appr-1');
    expect(appraisalsService.findAppraisal).toHaveBeenCalledWith('appr-1');
  });

  it('submitReview resolves the caller\'s own employee id and submits under THAT id, not req.user.id', async () => {
    const req = mockRequest({ id: 'user-1' });
    employeesService.findByUserId.mockResolvedValue({ id: 'emp-77' } as never);
    appraisalsService.submitReview.mockResolvedValue({ id: 'appr-1', status: 'COMPLETED' } as never);

    const result = await controller.submitReview('appr-1', { rating: 4 }, req);

    expect(employeesService.findByUserId).toHaveBeenCalledWith('user-1');
    expect(appraisalsService.submitReview).toHaveBeenCalledWith('appr-1', 'emp-77', { rating: 4 });
    expect(result).toEqual({ id: 'appr-1', status: 'COMPLETED' });
  });

  it('a caller with no employee record never reaches appraisalsService.submitReview', async () => {
    const req = mockRequest({ id: 'user-1' });
    employeesService.findByUserId.mockRejectedValue(new Error('no employee record'));

    await expect(controller.submitReview('appr-1', { rating: 4 }, req)).rejects.toThrow('no employee record');
    expect(appraisalsService.submitReview).not.toHaveBeenCalled();
  });
});
