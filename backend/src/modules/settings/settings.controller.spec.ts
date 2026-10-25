import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let service: jest.Mocked<SettingsService>;
  let controller: SettingsController;

  beforeEach(() => {
    service = { getAccess: jest.fn(), updateAccess: jest.fn(), getEmail: jest.fn(), updateEmail: jest.fn() } as unknown as jest.Mocked<SettingsService>;
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

  it('getEmail and updateEmail delegate', () => {
    controller.getEmail();
    controller.updateEmail({ enabled: false });

    expect(service.getEmail).toHaveBeenCalled();
    expect(service.updateEmail).toHaveBeenCalledWith({ enabled: false });
  });
});
