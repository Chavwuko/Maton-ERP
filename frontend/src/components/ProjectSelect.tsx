import { Select, type SelectProps } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listProjects } from '../api/projects';

export function ProjectSelect({ label = 'Project', ...rest }: Partial<SelectProps>) {
  const { data } = useQuery({ queryKey: ['projects'], queryFn: () => listProjects() });

  return (
    <Select
      label={label}
      placeholder="Select project"
      searchable
      clearable
      data={(data ?? []).map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
      {...rest}
    />
  );
}
