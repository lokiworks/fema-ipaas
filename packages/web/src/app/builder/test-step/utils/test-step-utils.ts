import { isNil, isObject, tryCatchSync } from '@fema-ipaas/core-utils';

function formatErrorMessage(errorMessage: string): string {
  const errorMessages = errorMessage.split('Error:');
  if (errorMessages.length < 2) {
    return errorMessage;
  }

  const errorMessagesWithoutWhiteSpaces = errorMessages
    .map((message) => message.trim().replace(/^\n+|\n+$/g, ''))
    .filter((message) => message !== '');

  const indentationStep = '  ';
  return errorMessagesWithoutWhiteSpaces.reduce((acc, current, index) => {
    const indentation = indentationStep.repeat(index);
    const errorLabel =
      errorMessagesWithoutWhiteSpaces.length === 1
        ? 'Error'
        : `Error ${index + 1}`;
    return `${acc}${indentation}${errorLabel}: ${current}\n`;
  }, '');
}

function knownStepErrorOf(errorMessage: string | null): KnownStepError | null {
  if (isNil(errorMessage)) {
    return null;
  }
  const message = messageOf(errorMessage);
  return KNOWN_STEP_ERRORS.find((known) => known.match === message) ?? null;
}

function messageOf(errorMessage: string): string {
  const { data } = tryCatchSync(() => JSON.parse(errorMessage));
  if (isObject(data) && typeof data['message'] === 'string') {
    return data['message'];
  }
  return errorMessage.trim();
}

export const testStepUtils = {
  formatErrorMessage,
  knownStepErrorOf,
};

const KNOWN_STEP_ERRORS: KnownStepError[] = [
  {
    match: 'The items you have selected must be a list.',
    title: 'Loop items must be a list',
    hint: 'The value picked for Items is not a list. In the data selector pick a field with the list icon and an item count, such as the employees returned by a search step, then test again.',
  },
];

export type KnownStepError = {
  match: string;
  title: string;
  hint: string;
};
