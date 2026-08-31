import { Module } from '@nestjs/common';
import { HseController } from './hse.controller';
import { HseService } from './hse.service';

@Module({
  controllers: [HseController],
  providers: [HseService],
  exports: [HseService],
})
export class HseModule {}
