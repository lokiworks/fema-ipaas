function normalize(fullName: string): string {
  const collapsed = fullName.trim().replace(/\s+/g, ' ');
  return CJK_PATTERN.test(collapsed) ? collapsed.replace(/\s/g, '') : collapsed;
}

const CJK_PATTERN = /[㐀-鿿豈-﫿]/;

export const fullNameUtils = { normalize };
