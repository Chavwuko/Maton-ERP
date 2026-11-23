import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveTypesService } from './leave-types.service';
import { LeaveService } from './leave.service';

@Module({
  controllers: [LeaveController],
  providers: [LeaveService, LeaveTypesService],
})
export class LeaveModule {}
