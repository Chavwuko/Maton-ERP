import { Module } from '@nestjs/common';
import { DocumentControlController } from './document-control.controller';
import { DocumentControlService } from './document-control.service';

@Module({
  controllers: [DocumentControlController],
  providers: [DocumentControlService],
  exports: [DocumentControlService],
})
export class DocumentControlModule {}
