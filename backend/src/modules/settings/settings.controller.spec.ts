import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let service: jest.Mocked<SettingsService>;
  let controller: SettingsController;

  beforeEach(() => {
    service = { getAccess: jest.fn(), updateAccess: jest.fn() } as unknown as jest.Mocked<SettingsService>;
    controller = new SettingsController(service);
  });

  it('getAccess delegates', () => {
    controller.getAccess();
    expect(service.getAccess).toHaveBeenCalled();
  });

  it('updateAccess delegates the body', () => {
    controller.updateAccess({ openSignup: false });
    expect(service.updateAccess).toHaveBeenCalledWith({ openSignup: false });
  });
});
