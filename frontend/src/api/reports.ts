import { apiClient } from './client';
import type { InventoryDashboard, InventoryReport } from '../modules/inventory/reportTypes';

function query(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function getInventoryDashboard() {
  return apiClient.get<InventoryDashboard>('/dashboard/inventory');
}

export function getInventoryReport(filters: { from?: string; to?: string } = {}) {
  return apiClient.get<InventoryReport>(`/reports/inventory${query(filters)}`);
}

export function downloadReportCsv(type: string, filters: { from?: string; to?: string } = {}) {
  return apiClient.download(`/reports/inventory/csv${query({ type, ...filters })}`);
}
