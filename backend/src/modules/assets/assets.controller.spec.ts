import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

describe('AssetsController', () => {
  let service: jest.Mocked<AssetsService>;
  let controller: AssetsController;
  const req = { user: { id: 'user-1' } } as never;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findMine: jest.fn(),
      findOne: jest.fn(),
      assignments: jest.fn(),
      history: jest.fn(),
      serviceHistory: jest.fn(),
      valuation: jest.fn(),
      dashboard: jest.fn(),
      exportRegister: jest.fn(),
      exportValuation: jest.fn(),
      valuationReport: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      checkOut: jest.fn(),
      checkIn: jest.fn(),
    } as unknown as jest.Mocked<AssetsService>;
    controller = new AssetsController(service);
  });

  it('findAll forwards every filter', () => {
    controller.findAll('org-1', 'ACTIVE', 'proj-1', 'dept-1', 'FAIR', 'user-9', 'pump');

    expect(service.findAll).toHaveBeenCalledWith({
      organizationId: 'org-1',
      status: 'ACTIVE',
      projectId: 'proj-1',
      departmentId: 'dept-1',
      condition: 'FAIR',
      assignedToId: 'user-9',
      search: 'pump',
    });
  });

  it('findMine asks for the signed-in user', () => {
    controller.findMine(req);

    expect(service.findMine).toHaveBeenCalledWith('user-1');
  });

  it('findOne, assignments, service history and history forward the id', () => {
    controller.findOne('a1');
    controller.assignments('a1');
    controller.serviceHistory('a1');
    controller.history('a1');

    expect(service.serviceHistory).toHaveBeenCalledWith('a1');
    expect(service.findOne).toHaveBeenCalledWith('a1');
    expect(service.assignments).toHaveBeenCalledWith('a1');
    expect(service.history).toHaveBeenCalledWith('a1');
  });

  it('create and update forward the dto', () => {
    const dto = { organizationId: 'org-1', assetTag: 'PUMP-1', name: 'Pump', category: 'x' };
    controller.create(dto);
    controller.update('a1', { name: 'New' });

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.update).toHaveBeenCalledWith('a1', { name: 'New' });
  });

  it('check-out and check-in act as the signed-in user', () => {
    controller.checkOut('a1', { assigneeId: 'u1' }, req);
    controller.checkIn('a1', { condition: 'GOOD' }, req);

    expect(service.checkOut).toHaveBeenCalledWith('a1', { assigneeId: 'u1' }, { id: 'user-1' });
    expect(service.checkIn).toHaveBeenCalledWith('a1', { condition: 'GOOD' }, { id: 'user-1' });
  });

  it('valuation forwards the asset and the day, and the report forwards its filters', () => {
    controller.valuation('a1', '2027-01-15');
    controller.valuationReport('org-1', '2027-01-15', 'true');

    expect(service.valuation).toHaveBeenCalledWith('a1', '2027-01-15');
    expect(service.valuationReport).toHaveBeenCalledWith({ organizationId: 'org-1', asOf: '2027-01-15', includeDecommissioned: 'true' });
  });

  describe('dashboard and spreadsheets', () => {
    const res = () => ({ setHeader: jest.fn() }) as never;

    it('dashboard forwards the organization', () => {
      controller.dashboard('org-1');

      expect(service.dashboard).toHaveBeenCalledWith({ organizationId: 'org-1' });
    });

    it('exports the register as a download, with money unless the role is staff', async () => {
      service.exportRegister.mockResolvedValue({ filename: 'assets-2027-01-15.csv', content: 'a,b' });
      const response = { setHeader: jest.fn() };

      const body = await controller.exportRegister('org-1', 'ACTIVE', 'p1', 'd1', 'FAIR', 'pump', { user: { roleName: 'finance' } } as never, response as never);
      await controller.exportRegister(undefined, undefined, undefined, undefined, undefined, undefined, { user: { roleName: 'staff' } } as never, res());

      expect(body).toBe('a,b');
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="assets-2027-01-15.csv"');
      expect(service.exportRegister).toHaveBeenNthCalledWith(
        1,
        { organizationId: 'org-1', status: 'ACTIVE', projectId: 'p1', departmentId: 'd1', condition: 'FAIR', search: 'pump' },
        true,
      );
      expect(service.exportRegister).toHaveBeenNthCalledWith(2, expect.any(Object), false);
    });

    it('exports the valuation as a download', async () => {
      service.exportValuation.mockResolvedValue({ filename: 'asset-valuation-2027-01-15.csv', content: 'x' });
      const response = { setHeader: jest.fn() };

      const body = await controller.exportValuation('org-1', '2027-01-15', 'true', response as never);

      expect(body).toBe('x');
      expect(service.exportValuation).toHaveBeenCalledWith({ organizationId: 'org-1', asOf: '2027-01-15', includeDecommissioned: 'true' });
      expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="asset-valuation-2027-01-15.csv"');
    });
  });
});
