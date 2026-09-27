import { isNil } from '@fema-ipaas/core-utils';
import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { authenticationSession } from '@/lib/authentication-session';

import { templatesHooks } from '../hooks/templates-hook';
import {
  TemplateCenterSort,
  TemplateCenterTab,
  templateCenterUtils,
} from '../utils/template-center-utils';

import {
  TemplateCenterEmpty,
  TemplateCenterTabs,
  TemplateGrid,
  TemplateGridSkeleton,
} from './template-center-parts';
import { TemplateActions } from './template-detail-drawer';
import { TemplatePreview } from './template-preview';

export function TemplatePickerDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-full max-w-5xl flex-col gap-0 p-0">
        <PickerBody
          key={open ? 'open' : 'closed'}
          projectId={projectId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TemplateCenterTab>(
    TemplateCenterTab.RECOMMENDED,
  );
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<Template | null>(null);
  const { data, isLoading } = templatesHooks.useTemplateCenter();
  const userId = authenticationSession.getCurrentUserId();
  const templates = data ?? [];
  const list = templateCenterUtils.listFor({
    templates,
    userId,
    tab,
    category: null,
    search,
    sort: TemplateCenterSort.HOT,
  });

  if (!isNil(preview)) {
    return (
      <>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t('Template details')}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-4">
            <TemplatePreview template={preview} />
          </div>
        </ScrollArea>
        <div className="border-t px-6 py-4">
          <TemplateActions
            template={preview}
            projectId={projectId}
            onDone={onClose}
          >
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              onClick={() => setPreview(null)}
            >
              <ArrowLeft className="size-4" />
              {t('Back to templates')}
            </Button>
          </TemplateActions>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4">
        <DialogTitle>{t('Create workflow from template')}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-3 px-6 pb-3">
        <TemplateCenterTabs
          value={tab}
          onChange={setTab}
          counts={templateCenterUtils.countByTab({ templates, userId })}
          showPersonalTabs={true}
        />
        <div className="ml-auto w-full sm:w-72">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('Search templates by name or description')}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 pb-6">
          {isLoading ? (
            <TemplateGridSkeleton className="lg:grid-cols-3 xl:grid-cols-3" />
          ) : list.length === 0 ? (
            <TemplateCenterEmpty tab={tab} searching={search.trim() !== ''} />
          ) : (
            <TemplateGrid
              templates={list}
              onSelect={setPreview}
              className="lg:grid-cols-3 xl:grid-cols-3"
            />
          )}
        </div>
      </ScrollArea>
    </>
  );
}
