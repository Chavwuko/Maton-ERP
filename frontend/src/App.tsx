import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { OrganizationDetailPage } from './modules/organizations/OrganizationDetailPage';
import { OrganizationsListPage } from './modules/organizations/OrganizationsListPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/organizations" replace />} />
        <Route path="/organizations" element={<OrganizationsListPage />} />
        <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
      </Routes>
    </AppShell>
  );
}
