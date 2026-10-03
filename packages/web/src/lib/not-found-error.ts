import { isAxiosError } from 'axios';
import { z } from 'zod';

function isNotFound(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  if (status === NOT_FOUND_STATUS) {
    return true;
  }
  return (
    status === BAD_REQUEST_STATUS &&
    InvalidPathParameterBody.safeParse(error.response?.data).success
  );
}

export const notFoundError = { isNotFound };

const NOT_FOUND_STATUS = 404;
const BAD_REQUEST_STATUS = 400;

const InvalidPathParameterBody = z.object({
  code: z.literal('FST_ERR_VALIDATION'),
  message: z.string().startsWith('params/'),
});
