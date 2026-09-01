import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { OrganizationDetailPage } from './modules/organizations/OrganizationDetailPage';
import { OrganizationsListPage } from './modules/organizations/OrganizationsListPage';
import { AssetDetailPage } from './modules/assets/AssetDetailPage';
import { AssetsListPage } from './modules/assets/AssetsListPage';
import { MaintenanceDetailPage } from './modules/maintenance/MaintenanceDetailPage';
import { MaintenanceListPage } from './modules/maintenance/MaintenanceListPage';
import { ProjectDetailPage } from './modules/projects/ProjectDetailPage';
import { ProjectsListPage } from './modules/projects/ProjectsListPage';
import { HseDetailPage } from './modules/hse/HseDetailPage';
import { HseListPage } from './modules/hse/HseListPage';
import { InvoiceDetailPage } from './modules/accounting/InvoiceDetailPage';
import { InvoicesListPage } from './modules/accounting/InvoicesListPage';
import { VendorDetailPage } from './modules/accounting/VendorDetailPage';
import { VendorsListPage } from './modules/accounting/VendorsListPage';
import { InventoryItemDetailPage } from './modules/inventory/InventoryItemDetailPage';
import { InventoryItemsListPage } from './modules/inventory/InventoryItemsListPage';
import { WarehouseDetailPage } from './modules/inventory/WarehouseDetailPage';
import { WarehousesListPage } from './modules/inventory/WarehousesListPage';
import { AppraisalCycleDetailPage } from './modules/hr/AppraisalCycleDetailPage';
import { AppraisalCyclesListPage } from './modules/hr/AppraisalCyclesListPage';
import { AppraisalDetailPage } from './modules/hr/AppraisalDetailPage';
import { EmployeeDetailPage } from './modules/hr/EmployeeDetailPage';
import { EmployeesListPage } from './modules/hr/EmployeesListPage';
import { DocumentDetailPage } from './modules/document-control/DocumentDetailPage';
import { DocumentsListPage } from './modules/document-control/DocumentsListPage';
import { UsersListPage } from './modules/users/UsersListPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/organizations" replace />} />
        <Route path="/organizations" element={<OrganizationsListPage />} />
        <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
        <Route path="/assets" element={<AssetsListPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/maintenance" element={<MaintenanceListPage />} />
        <Route path="/maintenance/:id" element={<MaintenanceDetailPage />} />
        <Route path="/projects" element={<ProjectsListPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/hse" element={<HseListPage />} />
        <Route path="/hse/:id" element={<HseDetailPage />} />
        <Route path="/accounting" element={<InvoicesListPage />} />
        <Route path="/accounting/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/accounting/vendors" element={<VendorsListPage />} />
        <Route path="/accounting/vendors/:id" element={<VendorDetailPage />} />
        <Route path="/inventory" element={<InventoryItemsListPage />} />
        <Route path="/inventory/items/:id" element={<InventoryItemDetailPage />} />
        <Route path="/inventory/warehouses" element={<WarehousesListPage />} />
        <Route path="/inventory/warehouses/:id" element={<WarehouseDetailPage />} />
        <Route path="/hr" element={<EmployeesListPage />} />
        <Route path="/hr/employees/:id" element={<EmployeeDetailPage />} />
        <Route path="/hr/appraisal-cycles" element={<AppraisalCyclesListPage />} />
        <Route path="/hr/appraisal-cycles/:id" element={<AppraisalCycleDetailPage />} />
        <Route path="/hr/appraisals/:id" element={<AppraisalDetailPage />} />
        <Route path="/documents" element={<DocumentsListPage />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="/users" element={<UsersListPage />} />
      </Routes>
    </AppShell>
  );
}
