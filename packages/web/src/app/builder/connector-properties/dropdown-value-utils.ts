import { isNil } from '@fema-ipaas/core-utils';
import deepEqual from 'deep-equal';
import { t } from 'i18next';

function withCurrentValue<Option extends { label: string; value: unknown }>({
  value,
  options,
  loading,
}: {
  value: unknown;
  options: Option[];
  loading: boolean;
}): {
  options: (Option | { label: string; value: unknown })[];
  missing: boolean;
} {
  if (
    loading ||
    isNil(value) ||
    value === '' ||
    options.some((option) => deepEqual(option.value, value, { strict: true }))
  ) {
    return { options, missing: false };
  }
  return {
    options: [
      ...options,
      {
        label: t('{value} (not in the list)', { value: displayOf(value) }),
        value,
      },
    ],
    missing: true,
  };
}

function displayOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : JSON.stringify(value) ?? '';
}

export const dropdownValueUtils = { withCurrentValue };
