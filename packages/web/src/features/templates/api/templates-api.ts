import { SeekPage } from '@fema-ipaas/core-utils';
import {
  CreateTemplateRequestBody,
  GenerateTemplateFromWorkflowRequestBody,
  ListTemplatesRequestQuery,
  Template,
  UpdateTemplateRequestBody,
  Flag,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const templatesApi = {
  getTemplate(templateId: string) {
    return api.get<Template>(`/v1/templates/${templateId}`);
  },
  create(request: CreateTemplateRequestBody) {
    return api.post<Template>(`/v1/templates`, request);
  },
  update(templateId: string, request: UpdateTemplateRequestBody) {
    return api.post<Template>(`/v1/templates/${templateId}`, request);
  },
  list(request: ListTemplatesRequestQuery) {
    return api.get<SeekPage<Template>>(`/v1/templates`, request);
  },
  delete(templateId: string) {
    return api.delete<void>(`/v1/templates/${templateId}`);
  },
  generateFromWorkflow(request: GenerateTemplateFromWorkflowRequestBody) {
    return api.post<Template>(`/v1/templates/from-workflow`, request);
  },
  recordUsage(templateId: string) {
    return api.post<void>(`/v1/templates/${templateId}/usage`, {});
  },
  getCategories() {
    return api.get<Flag>(`/v1/templates/categories`);
  },
};
