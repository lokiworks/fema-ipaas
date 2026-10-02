import {
  CreateSolutionFromProjectRequestBody,
  InstallSolutionRequestBody,
  PublishSolutionVersionRequestBody,
  RunSolutionChecksRequestBody,
  SolutionCheckResults,
  SolutionDetail,
  SolutionInstall,
  SolutionInstallInput,
  SolutionInstallPreview,
  SolutionInstallResult,
  SolutionSummary,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const solutionsApi = {
  list(): Promise<SolutionSummary[]> {
    return api.get<SolutionSummary[]>('/v1/solutions');
  },
  get(id: string): Promise<SolutionDetail> {
    return api.get<SolutionDetail>(`/v1/solutions/${id}`);
  },
  listInstalls(): Promise<SolutionInstall[]> {
    return api.get<SolutionInstall[]>('/v1/solutions/installs');
  },
  createFromProject(
    request: CreateSolutionFromProjectRequestBody,
  ): Promise<SolutionDetail> {
    return api.post<SolutionDetail>('/v1/solutions', request);
  },
  publishVersion({
    id,
    request,
  }: {
    id: string;
    request: PublishSolutionVersionRequestBody;
  }): Promise<SolutionDetail> {
    return api.post<SolutionDetail>(`/v1/solutions/${id}/versions`, request);
  },
  preview({
    id,
    request,
  }: {
    id: string;
    request: SolutionInstallInput;
  }): Promise<SolutionInstallPreview> {
    return api.post<SolutionInstallPreview>(
      `/v1/solutions/${id}/preview`,
      request,
    );
  },
  runChecks({
    id,
    request,
  }: {
    id: string;
    request: RunSolutionChecksRequestBody;
  }): Promise<SolutionCheckResults> {
    return api.post<SolutionCheckResults>(
      `/v1/solutions/${id}/checks`,
      request,
    );
  },
  install({
    id,
    request,
  }: {
    id: string;
    request: InstallSolutionRequestBody;
  }): Promise<SolutionInstallResult> {
    return api.post<SolutionInstallResult>(
      `/v1/solutions/${id}/install`,
      request,
    );
  },
  upgrade(installId: string): Promise<SolutionInstall> {
    return api.post<SolutionInstall>(
      `/v1/solutions/installs/${installId}/upgrade`,
      {},
    );
  },
};
