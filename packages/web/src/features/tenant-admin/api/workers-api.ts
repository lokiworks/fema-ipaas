import { WorkerMachineWithStatus } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const workersApi = {
  list() {
    return api.get<WorkerMachineWithStatus[]>('/v1/worker-machines');
  },
  listWorkerGroups() {
    return api.get<WorkerPoolCapacity>('/v1/worker-machines/worker-groups');
  },
};

export type WorkerGroupInfo = {
  label: string;
  slots: number;
};

export type WorkerPoolCapacity = {
  groups: WorkerGroupInfo[];
  sharedSlots: number;
};
