const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

const DEFAULT_COUNTRY_CODE = '+86';

const COUNTRY_CODES = [
  '+86',
  '+852',
  '+853',
  '+886',
  '+65',
  '+60',
  '+1',
  '+44',
  '+49',
  '+33',
  '+81',
  '+82',
  '+61',
];

function normalize({
  countryCode,
  nationalNumber,
}: {
  countryCode: string;
  nationalNumber: string;
}): string {
  const digits = nationalNumber.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  const withoutTrunkZero =
    countryCode === '+86' ? digits : digits.replace(/^0+/, '');
  return `${countryCode}${withoutTrunkZero}`;
}

function isValid(phone: string): boolean {
  return PHONE_PATTERN.test(phone);
}

function mask(phone: string): string {
  if (phone.length <= 7) {
    return phone;
  }
  return `${phone.slice(0, phone.length - 8)}${'*'.repeat(4)}${phone.slice(
    -4,
  )}`;
}

export const phoneUtils = {
  normalize,
  isValid,
  mask,
  DEFAULT_COUNTRY_CODE,
  COUNTRY_CODES,
};
