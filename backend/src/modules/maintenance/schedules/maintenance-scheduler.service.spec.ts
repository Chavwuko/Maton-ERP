import { Logger } from '@nestjs/common';
import { MaintenanceSchedulerService } from './maintenance-scheduler.service';
import type { MaintenanceSchedulesService } from './maintenance-schedules.service';

describe('MaintenanceSchedulerService', () => {
  let schedules: { generateDue: jest.Mock };
  let scheduler: MaintenanceSchedulerService;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    schedules = { generateDue: jest.fn() };
    scheduler = new MaintenanceSchedulerService(schedules as unknown as MaintenanceSchedulesService);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    warn.mockRestore();
  });

  it('opens what is due and says how many', async () => {
    schedules.generateDue.mockResolvedValue({ created: 2, workOrders: [] });

    await expect(scheduler.hourly()).resolves.toBe(2);

    expect(log).toHaveBeenCalledWith('Opened 2 preventive work order(s)');
  });

  it('stays quiet when nothing was due', async () => {
    schedules.generateDue.mockResolvedValue({ created: 0, workOrders: [] });

    await expect(scheduler.hourly()).resolves.toBe(0);

    expect(log).not.toHaveBeenCalled();
  });

  it('logs a failure instead of crashing the server', async () => {
    schedules.generateDue.mockRejectedValue(new Error('db down'));

    await expect(scheduler.hourly()).resolves.toBe(0);

    expect(warn).toHaveBeenCalledWith('Preventive maintenance run failed: db down');
  });
});
