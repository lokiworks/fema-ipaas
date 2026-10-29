import { t } from 'i18next';

function explain({ message }: { message: string }): ErrorExplanation | null {
  const text = message.toLowerCase();
  const rule = RULES.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(text)),
  );
  if (!rule) {
    return null;
  }
  return { headline: rule.headline(text), hint: rule.hint() };
}

function isStepTimeout(message: string): boolean {
  const text = message.toLowerCase();
  return STEP_TIMEOUT_PATTERNS.some((pattern) => pattern.test(text));
}

function stepTimeoutHeadline(text: string): string {
  const seconds = STEP_TIMEOUT_SECONDS_PATTERN.exec(text)?.[1];
  return seconds
    ? t('The step ran longer than {seconds} seconds and was stopped', {
        seconds,
      })
    : t('The step ran longer than its time limit and was stopped');
}

export const errorExplanation = {
  explain,
  isStepTimeout,
  timeoutPatterns: () => TIMEOUT_PATTERNS,
  stepTimeoutPatterns: () => STEP_TIMEOUT_PATTERNS,
};

const STEP_TIMEOUT_PATTERNS: RegExp[] = [
  /\bfema_step_timeout\b/,
  /\bsteptimeoutexceeded\b/,
  /\bstep_timeout\b/,
  /ran longer than \d+ seconds/,
];

const STEP_TIMEOUT_SECONDS_PATTERN = /longer than (\d+) seconds/;

const TIMEOUT_PATTERNS: RegExp[] = [
  /\be(?:socket)?timedout\b/,
  /\btimed out\b/,
  /\btimeout of \d+\s*ms exceeded\b/,
  /\b(?:connect|connection|request|response|read|socket|headers|body|gateway|operation|step)\s+time-?out\b/,
  /\btimeout (?:error|exceeded|expired)\b/,
];

const RULES: ExplanationRule[] = [
  {
    patterns: STEP_TIMEOUT_PATTERNS,
    headline: stepTimeoutHeadline,
    hint: () =>
      t(
        'The platform stops a step that runs past the time limit. It usually queries or processes too much data at once, or waits on a slow system. Narrow the query or split the work into batches, or ask the platform administrator to raise the step time limit.',
      ),
  },
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
  {
    patterns: [/root organization oid does not exist/],
    headline: () =>
      t(
        'The organization in Root organization OId does not exist. Pick it again.',
      ),
    hint: () =>
      t(
        'Beisen found no organization unit with this OId (Beisen code 417). Open the step input and pick the root organization from the list again.',
      ),
  },
  {
    patterns: [/组织单元不存在/],
    headline: () => t('The Beisen organization OId does not exist'),
    hint: () =>
      t(
        'Beisen found no organization unit with the OId this step sent (Beisen code 417). Check the organization field in the step input and pick an existing organization.',
      ),
  },
];

type ExplanationRule = {
  patterns: RegExp[];
  headline: (text: string) => string;
  hint: () => string;
};

export type ErrorExplanation = {
  headline: string;
  hint: string;
};
