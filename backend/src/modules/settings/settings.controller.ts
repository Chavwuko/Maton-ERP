import { Body, Controller, Get, Put } from '@nestjs/common';
import { Roles } from '../../auth/roles.guard';
import { UpdateAccessSettingsDto } from './dto/update-access-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@Roles('admin')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('access')
  getAccess() {
    return this.settingsService.getAccess();
  }

  @Put('access')
  updateAccess(@Body() dto: UpdateAccessSettingsDto) {
    return this.settingsService.updateAccess(dto);
  }
}
