import { create } from 'zustand';

import { DeleteImpact } from './delete-impact';

export const useDeleteConfirmation = create<DeleteConfirmationState>((set) => ({
  pending: null,
  open: (pending) => set({ pending }),
  close: () => set({ pending: null }),
}));

type DeleteConfirmationState = {
  pending: DeleteImpact | null;
  open: (pending: DeleteImpact) => void;
  close: () => void;
};
