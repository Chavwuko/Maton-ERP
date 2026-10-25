import { BadRequestException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { getAccessSettings, normalizeDomains, signupBlockedReason } from './access-settings';
import type { MailService } from '../mail/mail.service';
import { SettingsService } from './settings.service';

describe('access settings', () => {
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe('getAccessSettings', () => {
    it('defaults to open sign-up with no domain restriction', async () => {
      prisma.appSetting.findMany.mockResolvedValue([]);

      await expect(getAccessSettings(prisma)).resolves.toEqual({ openSignup: true, allowedEmailDomains: [] });
    });

    it('reads stored values', async () => {
      prisma.appSetting.findMany.mockResolvedValue([
        { key: 'signup.open', value: 'false' },
        { key: 'signup.allowedDomains', value: 'acme.com,example.org' },
      ] as never);

      await expect(getAccessSettings(prisma)).resolves.toEqual({
        openSignup: false,
        allowedEmailDomains: ['acme.com', 'example.org'],
      });
    });
  });

  describe('normalizeDomains', () => {
    it('trims, lower-cases, strips a leading @, drops blanks and de-duplicates', () => {
      expect(normalizeDomains([' @Acme.COM ', 'acme.com', '', '  ', 'example.org'])).toEqual([
        'acme.com',
        'example.org',
      ]);
    });
  });

  describe('signupBlockedReason', () => {
    it('allows anyone when open with no domain list', () => {
      expect(signupBlockedReason({ openSignup: true, allowedEmailDomains: [] }, 'a@b.com')).toBeNull();
    });

    it('blocks everyone when closed', () => {
      expect(signupBlockedReason({ openSignup: false, allowedEmailDomains: [] }, 'a@b.com')).toMatch(/closed/);
    });

    it('allows a listed domain regardless of case', () => {
      expect(signupBlockedReason({ openSignup: true, allowedEmailDomains: ['acme.com'] }, 'A@ACME.com')).toBeNull();
    });

    it('blocks an unlisted domain, and an address with no domain at all', () => {
      const settings = { openSignup: true, allowedEmailDomains: ['acme.com'] };
      expect(signupBlockedReason(settings, 'a@gmail.com')).toMatch(/domain is not allowed/);
      expect(signupBlockedReason(settings, '')).toMatch(/domain is not allowed/);
    });
  });
});

describe('SettingsService', () => {
  let prisma: MockPrisma;
  let mail: { transport: { kind: string } };
  let service: SettingsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    mail = { transport: { kind: 'log' } };
    service = new SettingsService(prisma, mail as unknown as MailService);
  });

  it('getAccess returns the current settings', async () => {
    prisma.appSetting.findMany.mockResolvedValue([]);

    await expect(service.getAccess()).resolves.toEqual({ openSignup: true, allowedEmailDomains: [] });
  });

  it('updateAccess stores both values, normalising the domains', async () => {
    prisma.appSetting.findMany.mockResolvedValue([]);

    const result = await service.updateAccess({ openSignup: false, allowedEmailDomains: [' @Acme.com '] });

    expect(result).toEqual({ openSignup: false, allowedEmailDomains: ['acme.com'] });
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'signup.open' },
      update: { value: 'false' },
      create: { key: 'signup.open', value: 'false' },
    });
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'signup.allowedDomains' },
      update: { value: 'acme.com' },
      create: { key: 'signup.allowedDomains', value: 'acme.com' },
    });
  });

  it('updateAccess keeps whichever value was not sent', async () => {
    prisma.appSetting.findMany.mockResolvedValue([
      { key: 'signup.open', value: 'false' },
      { key: 'signup.allowedDomains', value: 'acme.com' },
    ] as never);

    await expect(service.updateAccess({})).resolves.toEqual({ openSignup: false, allowedEmailDomains: ['acme.com'] });
  });

  it('updateAccess lets an admin clear the domain list', async () => {
    prisma.appSetting.findMany.mockResolvedValue([{ key: 'signup.allowedDomains', value: 'acme.com' }] as never);

    await expect(service.updateAccess({ allowedEmailDomains: [] })).resolves.toEqual({
      openSignup: true,
      allowedEmailDomains: [],
    });
  });

  it('updateAccess rejects values of the wrong type', async () => {
    await expect(service.updateAccess({ openSignup: 'no' as never })).rejects.toThrow(BadRequestException);
    await expect(service.updateAccess({ allowedEmailDomains: 'acme.com' as never })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('email settings', () => {
  let prisma: MockPrisma;
  let mail: { transport: { kind: string } };
  let service: SettingsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    mail = { transport: { kind: 'smtp' } };
    service = new SettingsService(prisma, mail as unknown as MailService);
  });

  it('reports whether email is on, and whether it really goes out', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);

    await expect(service.getEmail()).resolves.toEqual({ enabled: true, transport: 'smtp' });

    prisma.appSetting.findUnique.mockResolvedValue({ key: 'email.enabled', value: 'false' } as never);
    mail.transport.kind = 'log';
    await expect(service.getEmail()).resolves.toEqual({ enabled: false, transport: 'log' });
  });

  it('turns email off and on', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ key: 'email.enabled', value: 'false' } as never);

    const result = await service.updateEmail({ enabled: false });

    expect(prisma.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'email.enabled' },
      update: { value: 'false' },
      create: { key: 'email.enabled', value: 'false' },
    });
    expect(result.enabled).toBe(false);
  });

  it('rejects anything but true or false', async () => {
    await expect(service.updateEmail({ enabled: 'yes' as never })).rejects.toThrow(BadRequestException);
    await expect(service.updateEmail({})).rejects.toThrow('enabled must be true or false');
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });
});
