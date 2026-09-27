import { useSyncExternalStore } from 'react';

import { ResolvedTourStep } from '../utils/tour-utils';

import { HelpArticleId } from './help-articles';
import { TourId } from './tours';

function getState(): HelpState {
  return state;
}

function setState(next: HelpState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function openHelp(articleId?: HelpArticleId): void {
  setState({ ...state, helpOpen: true, articleId: articleId ?? null });
}

function closeHelp(): void {
  setState({ ...state, helpOpen: false });
}

function showArticle(articleId: HelpArticleId | null): void {
  setState({ ...state, articleId });
}

function startTour({
  tourId,
  steps,
}: {
  tourId: TourId;
  steps: ResolvedTourStep[];
}): void {
  setState({
    ...state,
    helpOpen: false,
    tourId,
    tourSteps: steps,
    tourRequest: state.tourRequest + 1,
  });
}

function endTour(): void {
  setState({ ...state, tourId: null, tourSteps: [] });
}

function useHelpState(): HelpState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export const helpStore = {
  openHelp,
  closeHelp,
  showArticle,
  startTour,
  endTour,
  useHelpState,
};

const listeners = new Set<() => void>();

let state: HelpState = {
  helpOpen: false,
  articleId: null,
  tourId: null,
  tourSteps: [],
  tourRequest: 0,
};

export type HelpState = {
  helpOpen: boolean;
  articleId: HelpArticleId | null;
  tourId: TourId | null;
  tourSteps: ResolvedTourStep[];
  tourRequest: number;
};
