import {
  CreateDataErasureRequestBody,
  ERASURE_CONFIRM_WORDS,
  ErasureSubjectKind,
} from '@fema-ipaas/shared';

export const erasureConfirmationUtils = { isAcceptable };

function isAcceptable({
  kind,
  typed,
}: {
  kind: ErasureSubjectKind;
  typed: string;
}): boolean {
  const value = typed.trim();
  if (value.length === 0) {
    return false;
  }
  if (
    ERASURE_CONFIRM_WORDS.some(
      (word) => word.toLowerCase() === value.toLowerCase(),
    )
  ) {
    return true;
  }
  return CreateDataErasureRequestBody.safeParse({
    kind,
    value,
    reason: SHAPE_CHECK_REASON,
  }).success;
}

const SHAPE_CHECK_REASON = 'confirmation';
