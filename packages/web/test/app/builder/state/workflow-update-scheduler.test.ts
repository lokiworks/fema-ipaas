import {
  NoteColorVariant,
  WorkflowOperationRequest,
  WorkflowOperationType,
} from '@fema-ipaas/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workflowUpdateScheduler } from '@/app/builder/state/workflow-update-scheduler';

const NOTE = {
  id: 'note-1',
  content: '',
  color: NoteColorVariant.YELLOW,
  position: { x: 0, y: 0 },
  size: { width: 200, height: 120 },
};

const ADD_NOTE: WorkflowOperationRequest = {
  type: WorkflowOperationType.ADD_NOTE,
  request: NOTE,
};

const UPDATE_NOTE: WorkflowOperationRequest = {
  type: WorkflowOperationType.UPDATE_NOTE,
  request: { ...NOTE, content: 'hello', ownerId: null },
};

function recordingScheduler() {
  const fired: string[] = [];
  const scheduler = workflowUpdateScheduler.createScheduler({
    wait: 1000,
    onFire: (task) => {
      void task();
    },
  });
  const submit = ({
    operation,
    label,
  }: {
    operation: WorkflowOperationRequest;
    label: string;
  }) =>
    scheduler.submit({
      operation,
      task: async () => {
        fired.push(label);
      },
    });
  return { fired, submit, flush: scheduler.flush };
}

describe('workflowUpdateScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a new note right away so typing into it cannot swallow the add', () => {
    const { fired, submit } = recordingScheduler();
    submit({ operation: ADD_NOTE, label: 'add' });
    submit({ operation: UPDATE_NOTE, label: 'update-1' });
    submit({ operation: UPDATE_NOTE, label: 'update-2' });
    expect(fired).toEqual(['add']);
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual(['add', 'update-2']);
  });

  it('keeps note edits debounced per note', () => {
    expect(workflowUpdateScheduler.scheduleOf(UPDATE_NOTE)).toEqual({
      mode: 'debounced',
      key: 'note:note-1',
    });
    expect(workflowUpdateScheduler.scheduleOf(ADD_NOTE)).toEqual({
      mode: 'immediate',
    });
  });

  it('flushes pending edits before an immediate operation to keep the order', () => {
    const { fired, submit } = recordingScheduler();
    submit({ operation: UPDATE_NOTE, label: 'update' });
    submit({
      operation: {
        type: WorkflowOperationType.ADD_NOTE,
        request: { ...NOTE, id: 'note-2' },
      },
      label: 'add-2',
    });
    expect(fired).toEqual(['update', 'add-2']);
  });
});
