import { ErasureSubjectKind } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { erasureConfirmationUtils } from '@/features/privacy/utils/erasure-confirmation';

const accepts = (kind: ErasureSubjectKind, typed: string) =>
  erasureConfirmationUtils.isAcceptable({ kind, typed });

describe('erasureConfirmationUtils.isAcceptable', () => {
  it('accepts the fixed confirmation word in either language, ignoring case and spaces', () => {
    expect(accepts(ErasureSubjectKind.PHONE, 'DELETE')).toBe(true);
    expect(accepts(ErasureSubjectKind.EMAIL, ' delete ')).toBe(true);
    expect(accepts(ErasureSubjectKind.EMPLOYEE_ID, '删除')).toBe(true);
  });

  it('accepts something shaped like the identifier of the request kind', () => {
    expect(accepts(ErasureSubjectKind.PHONE, '13812345678')).toBe(true);
    expect(accepts(ErasureSubjectKind.EMAIL, 'wang.lei@example.com')).toBe(
      true,
    );
    expect(accepts(ErasureSubjectKind.EMPLOYEE_ID, 'XH20210311')).toBe(true);
  });

  it('keeps the button disabled for empty input and for text that is neither', () => {
    expect(accepts(ErasureSubjectKind.PHONE, '')).toBe(false);
    expect(accepts(ErasureSubjectKind.PHONE, '   ')).toBe(false);
    expect(accepts(ErasureSubjectKind.PHONE, '138')).toBe(false);
    expect(accepts(ErasureSubjectKind.EMAIL, 'not an email')).toBe(false);
    expect(accepts(ErasureSubjectKind.EMPLOYEE_ID, 'a b')).toBe(false);
    expect(accepts(ErasureSubjectKind.EMPLOYEE_ID, '随便写点什么')).toBe(false);
  });

  it('does not accept an identifier of another kind', () => {
    expect(accepts(ErasureSubjectKind.PHONE, 'wang.lei@example.com')).toBe(
      false,
    );
    expect(accepts(ErasureSubjectKind.EMAIL, '13812345678')).toBe(false);
  });
});
