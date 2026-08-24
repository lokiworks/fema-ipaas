import { create } from 'zustand';

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
