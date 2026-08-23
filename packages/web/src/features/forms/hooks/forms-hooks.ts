import { FormResponse, HumanInputFormResult } from '@fema-ipaas/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { humanInputApi } from '../api/human-input-api';

export const formsKeys = {
  form: (workflowId: string) => ['form', workflowId] as const,
};

export const formsQueries = {
  useForm: (workflowId: string, useDraft: boolean, enabled: boolean) =>
    useQuery<FormResponse | null, Error>({
      queryKey: formsKeys.form(workflowId),
      queryFn: () => humanInputApi.getForm(workflowId, useDraft),
      enabled,
      retry: false,
      staleTime: Infinity,
    }),
};

export const formsMutations = {
  useSubmitForm: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (result: HumanInputFormResult | null) => void;
    onError: (error: Error) => void;
  }) => {
    return useMutation<
      HumanInputFormResult | null,
      Error,
      { form: FormResponse; useDraft: boolean; data: Record<string, unknown> }
    >({
      mutationFn: ({ form, useDraft, data }) =>
        humanInputApi.submitForm(form, useDraft, data),
      onSuccess,
      onError,
    });
  },
};
