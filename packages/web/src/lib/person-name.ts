import { isNil } from '@fema-ipaas/core-utils';
import i18next from 'i18next';

function format({
  firstName,
  lastName,
  language = i18next.language,
}: {
  firstName?: string | null;
  lastName?: string | null;
  language?: string;
}): string {
  const first = cleanPart(firstName);
  const last = cleanPart(lastName);
  const lastNameFirst =
    language.startsWith('zh') && !isLatinName({ first, last });
  if (lastNameFirst || CJK_PATTERN.test(`${first}${last}`)) {
    return `${last}${first}`;
  }
  return [first, last].filter((part) => part.length > 0).join(' ');
}

function formatWithFallback({
  firstName,
  lastName,
  fallback,
}: {
  firstName?: string | null;
  lastName?: string | null;
  fallback: string;
}): string {
  const name = format({ firstName, lastName });
  return name.length > 0 ? name : fallback;
}

function cleanPart(part: string | null | undefined): string {
  const trimmed = isNil(part) ? '' : part.trim();
  return trimmed === PLACEHOLDER_PART ? '' : trimmed;
}

function isLatinName({ first, last }: { first: string; last: string }) {
  const combined = `${first}${last}`;
  return combined.length > 0 && LATIN_PATTERN.test(combined);
}

const PLACEHOLDER_PART = '-';
const CJK_PATTERN = /[㐀-鿿豈-﫿]/;
const LATIN_PATTERN = /^[ -ɏ]+$/;

export const personName = { format, formatWithFallback };
