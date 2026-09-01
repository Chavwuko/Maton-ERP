import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AssetsModule } from './modules/assets/assets.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DocumentControlModule } from './modules/document-control/document-control.module';
import { HseModule } from './modules/hse/hse.module';
import { HrModule } from './modules/hr/hr.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    StorageModule,
    AuthModule,
    OrganizationsModule,
    DepartmentsModule,
    DocumentControlModule,
    ProjectsModule,
    AssetsModule,
    MaintenanceModule,
    InventoryModule,
    AccountingModule,
    HseModule,
    HrModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
