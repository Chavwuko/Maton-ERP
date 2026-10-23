import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AccessSettings, getAccessSettings, normalizeDomains, saveAccessSettings } from './access-settings';
import { UpdateAccessSettingsDto } from './dto/update-access-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
