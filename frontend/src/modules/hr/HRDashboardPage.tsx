import { useQuery } from '@tanstack/react-query';
import { Alert, Loader, SimpleGrid, Stack, Title } from '@mantine/core';
import { ApiError } from '../../api/client';
import { getHrDashboard } from '../../api/hr';
import { BucketBarChart } from '../../components/BucketBarChart';
import { BucketPieChart } from '../../components/BucketPieChart';
import { StatCard } from '../../components/StatCard';
import { EMPLOYEE_GRADE_LABELS, EMPLOYMENT_TYPE_LABELS, GENDER_LABELS } from './types';

export function HRDashboardPage() {
  const {
    data: dashboard,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['hr-dashboard'], queryFn: () => getHrDashboard() });

  if (isLoading) return <Loader />;
  if (isError) {
    return (
      <Alert color="red" title="Couldn't load the HR dashboard">
        {error instanceof ApiError ? error.message : 'Unknown error'}
      </Alert>
    );
  }
  if (!dashboard) return null;

  return (
    <Stack>
      <Title order={2}>HR Dashboard</Title>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }}>
        <StatCard label="Total Employees" value={dashboard.totalEmployees} />
        <StatCard label="New Hires (This Year)" value={dashboard.newHiresThisYear} />
        <StatCard label="Employee Exits (This Year)" value={dashboard.exitsThisYear} />
        <StatCard label="Employees Relieving (This Quarter)" value={dashboard.relievingThisQuarter} />
        <StatCard label="Employees Joining (This Quarter)" value={dashboard.joiningThisQuarter} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <BucketBarChart title="Employees by Age Range" data={dashboard.byAgeRange} />
        <BucketPieChart title="Gender Diversity Ratio" data={dashboard.byGender} labelMap={GENDER_LABELS} />
        <BucketPieChart
          title="Employees by Type"
          data={dashboard.byEmploymentType}
          labelMap={EMPLOYMENT_TYPE_LABELS}
        />
        <BucketPieChart title="Employees by Grade" data={dashboard.byGrade} labelMap={EMPLOYEE_GRADE_LABELS} />
        <BucketPieChart title="Employees by Branch" data={dashboard.byBranch} />
        <BucketPieChart title="Designation Wise Employee Count" data={dashboard.byDesignation} />
        <BucketPieChart title="Department Wise Employee Count" data={dashboard.byDepartment} />
      </SimpleGrid>
    </Stack>
  );
}
