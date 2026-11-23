import { Stack, Text } from '@mantine/core';
import { LEAVE_STAGES, personName, type LeaveRequest } from './types';

// Where a request stands at each of the three steps: who said yes or no, what
// is waiting, and which step did not apply.
export function LeaveProgress({ request }: { request: LeaveRequest }) {
  const current = LEAVE_STAGES.findIndex((entry) => entry.pending === request.status);

  return (
    <Stack gap={0}>
      {LEAVE_STAGES.map((entry, index) => {
        const approval = request.approvals.find((candidate) => candidate.stage === entry.stage);
        let state: string;
        let color = 'dimmed';
        if (approval) {
          state = `${approval.decision === 'APPROVED' ? 'approved' : 'declined'} by ${personName(approval.decider)}`;
          color = approval.decision === 'APPROVED' ? 'green' : 'red';
        } else if (index === current) {
          state = 'waiting';
          color = 'yellow.8';
        } else if (current === -1 && request.status === 'APPROVED') {
          state = 'skipped';
        } else if (index < current) {
          state = 'skipped';
        } else {
          state = 'not reached';
        }
        return (
          <Text key={entry.stage} size="xs" c={color}>
            {entry.label}: {state}
            {approval?.comment ? ` — “${approval.comment}”` : ''}
          </Text>
        );
      })}
    </Stack>
  );
}
