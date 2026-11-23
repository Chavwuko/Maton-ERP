import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { decideLeave } from '../../api/leave';
import { LeaveProgress } from './LeaveProgress';
import { leaveDate, personName, type LeaveRequest } from './types';

interface Props {
  request: LeaveRequest;
  opened: boolean;
  onClose: () => void;
}

// Approve or decline the step a request is waiting at. Declining needs a reason.
export function DecisionDialog({ request, opened, onClose }: Props) {
  const queryClient = useQueryClient();
  const form = useForm({ initialValues: { comment: '' } });

  const mutation = useMutation({
    mutationFn: ({ decision, comment }: { decision: 'APPROVE' | 'REJECT'; comment: string }) => decideLeave(request.id, decision, comment.trim() || undefined),
    onSuccess: (_, { decision }) => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      notifications.show({ message: decision === 'APPROVE' ? 'Leave approved' : 'Leave declined', color: 'green' });
      onClose();
    },
    onError: (err) => {
      notifications.show({ message: err instanceof ApiError ? err.message : 'Failed to record the decision', color: 'red' });
    },
  });

  const submit = (decision: 'APPROVE' | 'REJECT') => {
    if (decision === 'REJECT' && !form.values.comment.trim()) {
      form.setFieldError('comment', 'Please say why you are declining');
      return;
    }
    mutation.mutate({ decision, comment: form.values.comment });
  };

  const user = request.employee.user;
  return (
    <Modal opened={opened} onClose={onClose} title={`Leave for ${personName(user)}`}>
      <Stack>
        <div>
          <Text fw={600}>
            {request.leaveType.name}: {request.days} working day{request.days === 1 ? '' : 's'}
          </Text>
          <Text size="sm">
            {leaveDate(request.startDate)} to {leaveDate(request.endDate)}
          </Text>
          <Text size="sm" c="dimmed">
            Expected back {leaveDate(request.returnDate)}
          </Text>
          {user.department && (
            <Text size="sm" c="dimmed">
              {request.employee.jobTitle}, {user.department.name}
            </Text>
          )}
        </div>
        {request.reason && <Text size="sm">{request.reason}</Text>}
        <LeaveProgress request={request} />
        <Textarea label="Comment" description="Needed if you decline" {...form.getInputProps('comment')} />
        <Group justify="flex-end">
          <Button color="red" variant="light" loading={mutation.isPending} onClick={() => submit('REJECT')}>
            Decline
          </Button>
          <Button loading={mutation.isPending} onClick={() => submit('APPROVE')}>
            Approve
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
