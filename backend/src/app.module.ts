import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { AccountingModule } from './modules/accounting/accounting.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AssetsModule } from './modules/assets/assets.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DocumentControlModule } from './modules/document-control/document-control.module';
import { HseModule } from './modules/hse/hse.module';
import { HrModule } from './modules/hr/hr.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
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
    AppointmentsModule,
    AccountingModule,
    HseModule,
    HrModule,
    UsersModule,
    SettingsModule,
    ReportsModule,
    NotificationsModule,
    ActivityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
