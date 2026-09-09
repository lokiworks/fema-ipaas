import { t } from 'i18next';
import { create } from 'zustand';

import { api } from '@/lib/api';

type ErrorDialogParams = {
  title: string;
  description: React.ReactNode;
  error: unknown;
};
interface ErrorDialogStore {
  params: ErrorDialogParams | null;
  openDialog: (params: ErrorDialogParams) => void;
  closeDialog: () => void;
}

export const useApErrorDialogStore = create<ErrorDialogStore>((set) => ({
  params: null,
  openDialog: (params) => set({ params }),
  closeDialog: () => set({ params: null }),
}));

export function openQueryErrorDialog(error: unknown, queryKey: unknown): void {
  const { openDialog } = useApErrorDialogStore.getState();
  openDialog({
    title: t('Failed to load data'),
    description: t(
      'Something went wrong while loading your data. Your data is safe — please try again by refreshing the page.',
    ),
    error: {
      queryKey,
      details: api.isError(error) ? error.response?.data : String(error),
    },
  });
}
