import { HttpStatusCode, isAxiosError } from 'axios';

function shouldRetry({
  failureCount,
  error,
}: {
  failureCount: number;
  error: unknown;
}): boolean {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const isClientError = status !== undefined && status >= 400 && status < 500;
    if (isClientError && !RETRYABLE_CLIENT_STATUSES.includes(status)) {
      return false;
    }
  }
  return failureCount < MAX_QUERY_RETRIES;
}

export const queryRetry = { shouldRetry };

const MAX_QUERY_RETRIES = 3;
const RETRYABLE_CLIENT_STATUSES: number[] = [
  HttpStatusCode.RequestTimeout,
  HttpStatusCode.TooManyRequests,
];
