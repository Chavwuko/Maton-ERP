import { Controller, Get, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';

// Read-only directory — any authenticated user can look up who's who (for
// assigning work orders, picking document reviewers, etc.). No create or
// update here: Users are lazily created by the auth guards on first login.
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query('role') role?: string | string[], @Query('isActive') isActive?: string) {
    return this.usersService.findAll({
      role,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
