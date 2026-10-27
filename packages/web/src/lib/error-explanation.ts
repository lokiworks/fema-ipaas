import { t } from 'i18next';

function explain({ message }: { message: string }): ErrorExplanation | null {
  const text = message.toLowerCase();
  const rule = RULES.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(text)),
  );
  if (!rule) {
    return null;
  }
  return { headline: rule.headline(), hint: rule.hint() };
}

export const errorExplanation = {
  explain,
  timeoutPatterns: () => TIMEOUT_PATTERNS,
};

const TIMEOUT_PATTERNS: RegExp[] = [
  /\be(?:socket)?timedout\b/,
  /\btimed out\b/,
  /\btimeout of \d+\s*ms exceeded\b/,
  /\b(?:connect|connection|request|response|read|socket|headers|body|gateway|operation|step)\s+time-?out\b/,
  /\btimeout (?:error|exceeded|expired)\b/,
];

const RULES: ExplanationRule[] = [
  {
    patterns: [/\beconnrefused\b/],
    headline: () => t('The other system refused the connection'),
    hint: () =>
      t(
        'Nothing is listening at this address and port. Check the URL and port, and that the other system is running.',
      ),
  },
  {
    patterns: [/\benotfound\b/, /\bgetaddrinfo\b/, /\beai_again\b/],
    headline: () => t('The domain name could not be resolved'),
    hint: () =>
      t(
        'Check the spelling of the host in the URL, and that the platform server can resolve it.',
      ),
  },
  {
    patterns: TIMEOUT_PATTERNS,
    headline: () => t('The other system did not respond in time'),
    hint: () =>
      t(
        'Check that the other system is up and reachable from the platform server, or raise the timeout of this step.',
      ),
  },
  {
    patterns: [/\beconnreset\b/, /socket hang up/, /\bepipe\b/],
    headline: () => t('The connection was closed by the other system'),
    hint: () =>
      t(
        'The other system dropped the connection while answering. Try again, and check its logs if it keeps happening.',
      ),
  },
  {
    patterns: [
      /self[- ]signed/,
      /certificate/,
      /unable to verify the first certificate/,
    ],
    headline: () => t('The security certificate could not be verified'),
    hint: () =>
      t(
        'The other system uses a certificate that is expired, self-signed or issued by an unknown authority. Fix the certificate, or allow untrusted certificates in this step if the host is internal.',
      ),
  },
  {
    patterns: [/fetch failed/, /network error/, /failed to fetch/],
    headline: () => t('The request could not reach the other system'),
    hint: () =>
      t(
        'No response was received. Check that the URL is correct, the other system is running, and the platform server can reach it (internal addresses may need to be allowed by the administrator).',
      ),
  },
];

type ExplanationRule = {
  patterns: RegExp[];
  headline: () => string;
  hint: () => string;
};

export type ErrorExplanation = {
  headline: string;
  hint: string;
};
