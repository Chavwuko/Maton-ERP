import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { AccessSettings, getAccessSettings, normalizeDomains, saveAccessSettings } from './access-settings';
import { UpdateAccessSettingsDto } from './dto/update-access-settings.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { isEmailEnabled, setEmailEnabled } from './email-settings';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  getAccess(): Promise<AccessSettings> {
    return getAccessSettings(this.prisma);
  }

  async updateAccess(dto: UpdateAccessSettingsDto): Promise<AccessSettings> {
    if (dto.openSignup !== undefined && typeof dto.openSignup !== 'boolean') {
      throw new BadRequestException('openSignup must be true or false');
    }
    if (dto.allowedEmailDomains !== undefined && !Array.isArray(dto.allowedEmailDomains)) {
      throw new BadRequestException('allowedEmailDomains must be a list of domains');
    }

    const current = await getAccessSettings(this.prisma);
    const next: AccessSettings = {
      openSignup: dto.openSignup ?? current.openSignup,
      allowedEmailDomains:
        dto.allowedEmailDomains === undefined ? current.allowedEmailDomains : normalizeDomains(dto.allowedEmailDomains),
    };
    await saveAccessSettings(this.prisma, next);
    return next;
  }

  // `transport` says whether mail really goes out ('smtp') or is only written
  // to the log ('log'), so the settings screen can be honest about it.
  async getEmail() {
    return { enabled: await isEmailEnabled(this.prisma), transport: this.mail.transport.kind };
  }

  async updateEmail(dto: UpdateEmailSettingsDto) {
    if (typeof dto.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be true or false');
    }
    await setEmailEnabled(this.prisma, dto.enabled);
    return this.getEmail();
  }
}
