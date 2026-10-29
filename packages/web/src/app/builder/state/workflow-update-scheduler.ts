import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowOperationRequest,
  WorkflowOperationType,
} from '@fema-ipaas/shared';

function scheduleOf(
  operation: WorkflowOperationRequest,
): WorkflowUpdateSchedule {
  switch (operation.type) {
    case WorkflowOperationType.UPDATE_TRIGGER:
    case WorkflowOperationType.UPDATE_ACTION:
      return { mode: 'debounced', key: `step:${operation.request.name}` };
    case WorkflowOperationType.UPDATE_NOTE:
    case WorkflowOperationType.DELETE_NOTE:
      return { mode: 'debounced', key: `note:${operation.request.id}` };
    default:
      return { mode: 'immediate' };
  }
}

function createScheduler({
  wait,
  onFire,
}: {
  wait: number;
  onFire: (task: WorkflowUpdateTask) => void;
}) {
  const pending = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; task: WorkflowUpdateTask }
  >();
  const fire = (key: string) => {
    const entry = pending.get(key);
    if (isNil(entry)) {
      return;
    }
    clearTimeout(entry.timer);
    pending.delete(key);
    onFire(entry.task);
  };
  const flush = () => {
    [...pending.keys()].forEach(fire);
  };
  const submit = ({
    operation,
    task,
  }: {
    operation: WorkflowOperationRequest;
    task: WorkflowUpdateTask;
  }) => {
    const schedule = scheduleOf(operation);
    if (schedule.mode === 'immediate') {
      flush();
      onFire(task);
      return;
    }
    const existing = pending.get(schedule.key);
    if (!isNil(existing)) {
      clearTimeout(existing.timer);
    }
    pending.set(schedule.key, {
      timer: setTimeout(() => fire(schedule.key), wait),
      task,
    });
  };
  return { submit, flush };
}

export const workflowUpdateScheduler = {
  scheduleOf,
  createScheduler,
};

export type WorkflowUpdateTask = () => Promise<void>;

export type WorkflowUpdateSchedule =
  | { mode: 'immediate' }
  | { mode: 'debounced'; key: string };
