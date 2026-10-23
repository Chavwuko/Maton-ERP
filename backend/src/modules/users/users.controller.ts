import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { Roles } from '../../auth/roles.guard';
import { ApproveUserDto } from './dto/approve-user.dto';
import { RejectUserDto } from './dto/reject-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// The directory is readable by any authenticated user (for assigning work
// orders, picking document reviewers, etc.). Users are created by the auth
// guards on first login as PENDING; the endpoints below are how an admin
// approves, rejects, edits or disables them.
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @Query('role') role?: string | string[],
    @Query('isActive') isActive?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.findAll({
      role,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      status,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles('admin')
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveUserDto, @Req() req: Request) {
    return this.usersService.approve(id, dto, req.user!.id);
  }

  @Roles('admin')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectUserDto, @Req() req: Request) {
    return this.usersService.reject(id, dto, req.user!.id);
  }

  @Roles('admin')
  @Post(':id/disable')
  disable(@Param('id') id: string, @Req() req: Request) {
    return this.usersService.disable(id, req.user!.id);
  }

  @Roles('admin')
  @Post(':id/enable')
  enable(@Param('id') id: string, @Req() req: Request) {
    return this.usersService.enable(id, req.user!.id);
  }
}
