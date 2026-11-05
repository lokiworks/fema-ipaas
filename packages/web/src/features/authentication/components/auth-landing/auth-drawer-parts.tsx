import { t } from 'i18next';
import { ArrowLeft } from 'lucide-react';

const AUTH_TITLE_CLASS =
  'text-center text-[21px] font-normal leading-snug tracking-[-0.02em] text-balance text-foreground';

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      <h1 className={AUTH_TITLE_CLASS}>{title}</h1>
      {subtitle && (
        <p className="mx-auto mt-1.5 max-w-[19rem] text-balance text-sm font-medium text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mb-4 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {t('Back')}
    </button>
  );
}

export { AUTH_TITLE_CLASS, BackLink, Heading };
