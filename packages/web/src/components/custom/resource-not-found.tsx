import { t } from 'i18next';
import { FileX } from 'lucide-react';
import { Link } from 'react-router-dom';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ResourceNotFound({ kind }: { kind: ResourceKind }) {
  return (
    <div className="mx-auto flex max-w-(--breakpoint-sm) flex-col items-center gap-4 px-4 py-16 text-center">
      <FileX className="size-20 text-muted-foreground" />
      <p className="text-3xl font-bold tracking-tight text-foreground">
        {t(TITLES[kind])}
      </p>
      <p className="text-lg font-light text-foreground">
        {t('It does not exist, was removed, or the link is wrong.')}
      </p>
      <Link to="/" className={cn(buttonVariants({ size: 'lg' }))}>
        {t('Go Home')}
      </Link>
    </div>
  );
}

const TITLES: Record<ResourceKind, string> = {
  issue: 'Issue not found',
  release: 'Release not found',
  run: 'Run not found',
  mcpService: 'MCP service not found',
};

export type ResourceKind = 'issue' | 'release' | 'run' | 'mcpService';
