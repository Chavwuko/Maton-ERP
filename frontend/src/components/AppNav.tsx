import { NavLink } from '@mantine/core';
import {
  IconArrowsExchange,
  IconBox,
  IconBuildingFactory2,
  IconBuildingSkyscraper,
  IconBuildingStore,
  IconBuildingWarehouse,
  IconCalendarOff,
  IconCalendarRepeat,
  IconChartBar,
  IconChecklist,
  IconClipboardList,
  IconClipboardPlus,
  IconClockHour4,
  IconCoin,
  IconFiles,
  IconLayoutDashboard,
  IconListDetails,
  IconPackage,
  IconReceipt2,
  IconShieldCheck,
  IconShoppingCart,
  IconTargetArrow,
  IconTool,
  IconUserCog,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  label: string;
  // Shown before the label: larger for a module, smaller for its pages.
  icon?: Icon;
  path?: string;
  // Exact-match instead of prefix-match — for a child whose path is its
  // parent's own landing page (e.g. HR's "Dashboard" at /hr), a prefix
  // match would light up alongside every other child too.
  exact?: boolean;
  children?: NavItem[];
}

// Mirrors the backend's module build order (see README's "Notes on
// scope"). HR is the first module built out with its own dashboard +
// sub-modules — Performance/Leaves are listed as a visible roadmap and get
// flipped to `path` as each lands (Shift & Attendance and Expense Requests
// already have).
const NAV_ITEMS: NavItem[] = [
  { label: 'Organizations', icon: IconBuildingSkyscraper, path: '/organizations' },
  { label: 'Document Control', icon: IconFiles, path: '/documents' },
  { label: 'Project Control', icon: IconChecklist, path: '/projects' },
  {
    label: 'Assets',
    icon: IconBuildingFactory2,
    path: '/assets',
    children: [
      { label: 'Dashboard', icon: IconLayoutDashboard, path: '/assets/dashboard' },
      { label: 'Register', icon: IconListDetails, path: '/assets', exact: true },
      { label: 'Valuation', icon: IconCoin, path: '/assets/valuation' },
    ],
  },
  {
    label: 'Maintenance',
    icon: IconTool,
    path: '/maintenance',
    children: [
      { label: 'Work orders', icon: IconClipboardList, path: '/maintenance', exact: true },
      { label: 'Schedules', icon: IconCalendarRepeat, path: '/maintenance/schedules' },
    ],
  },
  {
    label: 'Inventory',
    icon: IconPackage,
    path: '/inventory',
    children: [
      { label: 'Dashboard', icon: IconLayoutDashboard, path: '/inventory', exact: true },
      { label: 'Items', icon: IconBox, path: '/inventory/items' },
      { label: 'Purchases', icon: IconShoppingCart, path: '/inventory/purchases' },
      { label: 'Consumption', icon: IconArrowsExchange, path: '/inventory/consumption' },
      { label: 'Store', icon: IconBuildingStore, path: '/inventory/store' },
      { label: 'Warehouses', icon: IconBuildingWarehouse, path: '/inventory/warehouses' },
      { label: 'Reports', icon: IconChartBar, path: '/inventory/reports' },
    ],
  },
  { label: 'Make Request', icon: IconClipboardPlus, path: '/appointments' },
  { label: 'Accounting', icon: IconReceipt2, path: '/accounting' },
  { label: 'HSE', icon: IconShieldCheck, path: '/hse' },
  {
    label: 'HR',
    icon: IconUsers,
    path: '/hr',
    children: [
      { label: 'Dashboard', icon: IconLayoutDashboard, path: '/hr', exact: true },
      { label: 'Employees', icon: IconUsers, path: '/hr/employees' },
      { label: 'Shift & Attendance', icon: IconClockHour4, path: '/hr/shift-attendance' },
      { label: 'Expense Requests', icon: IconCoin, path: '/hr/expense-requests' },
      { label: 'Performance', icon: IconTargetArrow },
      { label: 'Leaves', icon: IconCalendarOff, path: '/hr/leaves' },
    ],
  },
  { label: 'Users', icon: IconUserCog, path: '/users' },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (!item.path) return false;
  return item.exact ? pathname === item.path : pathname.startsWith(item.path);
}

// Modules get a full-size icon; their pages a smaller one, so the two levels
// read apart at a glance.
function renderItem(item: NavItem, pathname: string, nested = false) {
  const Icon = item.icon;
  const icon = Icon ? <Icon size={nested ? 16 : 19} stroke={1.7} aria-hidden /> : undefined;

  if (item.children) {
    return (
      <NavLink key={item.label} label={item.label} leftSection={icon} defaultOpened={isActive(item, pathname)}>
        {item.children.map((child) => renderItem(child, pathname, true))}
      </NavLink>
    );
  }

  return item.path ? (
    <NavLink key={item.label} component={Link} to={item.path} label={item.label} leftSection={icon} active={isActive(item, pathname)} />
  ) : (
    <NavLink key={item.label} label={item.label} leftSection={icon} description="Coming soon" disabled />
  );
}

export function AppNav() {
  const location = useLocation();

  return <div className="app-nav">{NAV_ITEMS.map((item) => renderItem(item, location.pathname))}</div>;
}
