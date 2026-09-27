import { isNil } from '@fema-ipaas/core-utils';
import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { BookOpen } from 'lucide-react';
import { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

import { templatesHooks } from '../hooks/templates-hook';

import { TemplatePreview } from './template-preview';
import { TemplateUseAction } from './template-use-action';

export function TemplateDetailDrawer({
  template,
  templateId,
  open,
  onOpenChange,
  projectId,
}: TemplateDetailDrawerProps) {
  const needsFetch = isNil(template) && !isNil(templateId);
  const { data: fetched, isError } = templatesHooks.useTemplateById({
    id: templateId ?? null,
    enabled: open && needsFetch,
  });
  const shown = template ?? (needsFetch ? fetched : undefined);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b">
          <SheetTitle>{t('Template details')}</SheetTitle>
          <SheetDescription className="sr-only">
            {shown?.name ?? t('Template details')}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            {isNil(shown) ? (
              <DrawerPlaceholder isError={isError} />
            ) : (
              <TemplatePreview template={shown} />
            )}
          </div>
        </ScrollArea>
        {!isNil(shown) && (
          <SheetFooter className="flex-row justify-end border-t">
            <TemplateActions
              template={shown}
              projectId={projectId}
              onDone={() => onOpenChange(false)}
            />
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function TemplateActions({
  template,
  projectId,
  onDone,
  children,
}: {
  template: Template;
  projectId?: string | null;
  onDone?: () => void;
  children?: ReactNode;
}) {
  const helpUrl = template.blogUrl;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {children}
      {!isNil(helpUrl) && helpUrl !== '' && (
        <Button variant="outline" asChild>
          <a
            href={withScheme(helpUrl)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen className="size-4" />
            {t('Help docs')}
          </a>
        </Button>
      )}
      <TemplateUseAction
        template={template}
        projectId={projectId}
        onDone={onDone}
      />
    </div>
  );
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function DrawerPlaceholder({ isError }: { isError: boolean }) {
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('This template does not exist or you cannot view it.')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

type TemplateDetailDrawerProps = {
  template?: Template | null;
  templateId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
};
