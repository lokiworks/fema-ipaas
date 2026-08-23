import { FlowComponentMetadata } from '@fema-ipaas/component-sdk';

import { api } from '@/lib/api';

export const componentsApi = {
  list(): Promise<FlowComponentMetadata[]> {
    return api.get<FlowComponentMetadata[]>('/v1/components');
  },
};
