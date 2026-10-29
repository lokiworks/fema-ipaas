import { useEmbedding } from '@/components/providers/embed-provider';
import { SidebarProvider } from '@/components/ui/sidebar-shadcn';
import { useIsCompact } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

import { GlobalRail } from '../global-rail';
import { GlobalSearchProvider } from '../global-search/global-search-context';
import { ProjectNavColumn } from '../project-layout/project-nav-column';

export function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalSearchProvider>
      <BuilderLayoutInner>{children}</BuilderLayoutInner>
    </GlobalSearchProvider>
  );
}

function BuilderLayoutInner({ children }: { children: React.ReactNode }) {
  const { embedState } = useEmbedding();
  const isCompact = useIsCompact();

  return (
    <SidebarProvider defaultOpen={false} className="h-svh min-h-0">
      {!embedState.isEmbedded && !isCompact && <GlobalRail />}
      {!embedState.isEmbedded && !isCompact && (
        <ProjectNavColumn className="max-[1439px]:hidden" />
      )}
      <div
        id={BUILDER_CONTENT_ID}
        className={cn(
          'flex min-w-0 flex-1 flex-col overflow-hidden bg-background',
          embedState.isEmbedded && 'border-l',
        )}
      >
        {children}
      </div>
    </SidebarProvider>
  );
}

export const BUILDER_CONTENT_ID = 'builder-content';
