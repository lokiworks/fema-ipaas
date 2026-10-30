function isErrorHandlingName({ name }: { name: string }): boolean {
  return ERROR_HANDLING_PROPERTY_NAMES.includes(name);
}

function hasErrorSettings({
  action,
}: {
  action: ErrorSettingsAction;
}): boolean {
  const hasErrorProps = Object.keys(action.props).some((name) =>
    isErrorHandlingName({ name }),
  );
  const options = action.errorHandlingOptions;
  const hasOptions =
    !(options?.continueOnFailure?.hide ?? false) ||
    !(options?.retryOnFailure?.hide ?? false);
  return hasErrorProps || hasOptions;
}

export const errorHandlingProps = {
  isErrorHandlingName,
  hasErrorSettings,
};

const ERROR_HANDLING_PROPERTY_NAMES = ['failureMode', 'idempotencyKey'];

export type ErrorSettingsAction = {
  props: Record<string, unknown>;
  errorHandlingOptions?: {
    continueOnFailure?: { hide?: boolean };
    retryOnFailure?: { hide?: boolean };
  };
};
