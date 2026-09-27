import { BlueprintInputProblem } from '@fema-ipaas/shared';
import { t } from 'i18next';

function messageOf(problem: BlueprintInputProblem): string {
  switch (problem) {
    case BlueprintInputProblem.LABEL:
      return t('Enter a label');
    case BlueprintInputProblem.KEY:
      return t('The field identifier is invalid or already used');
    case BlueprintInputProblem.PATTERN:
      return t('The validation pattern is not a valid regular expression');
    case BlueprintInputProblem.VISIBILITY:
      return t('The visibility expression is invalid');
    case BlueprintInputProblem.OPTIONS:
      return t('Enter at least one option');
    case BlueprintInputProblem.OPTIONS_OPERATION:
      return t('Choose an operation to load options from');
  }
}

function messagesOf(problems: BlueprintInputProblem[]): string[] {
  return problems.map((problem) => messageOf(problem));
}

export const blueprintInputProblemMessages = {
  of: messageOf,
  listOf: messagesOf,
};
