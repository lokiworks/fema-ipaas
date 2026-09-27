import { RunMonitorView } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  LayoutDashboard,
  PenLine,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { RUN_MONITOR_DEFAULT_VIEW_ID } from '../utils/run-monitor-utils';

export function MonitorViewsMenu({
  views,
  selectedId,
  dirty,
  onSelect,
  onSaveAs,
  onSave,
  onRename,
  onReset,
  onDelete,
}: {
  views: RunMonitorView[];
  selectedId: string;
  dirty: boolean;
  onSelect: (id: string) => void;
  onSaveAs: () => void;
  onSave: () => void;
  onRename: () => void;
  onReset: () => void;
  onDelete: () => Promise<void>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isDefault = selectedId === RUN_MONITOR_DEFAULT_VIEW_ID;
  const current = views.find((view) => view.id === selectedId);
  const currentName = current?.name ?? t('Default view');

  const select = (id: string) => {
    if (id === selectedId) {
      return;
    }
    if (dirty && !isDefault) {
      setPendingId(id);
      return;
    }
    onSelect(id);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dirty && !isDefault && (
        <span className="text-xs text-warning">{t('Unsaved changes')}</span>
      )}
      <Select value={selectedId} onValueChange={select}>
        <SelectTrigger className="h-8 w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t('Presets')}</SelectLabel>
            <SelectItem value={RUN_MONITOR_DEFAULT_VIEW_ID}>
              <span className="flex items-center gap-2">
                <LayoutDashboard className="size-4" />
                {t('Default view')}
              </span>
            </SelectItem>
          </SelectGroup>
          {views.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t('My views')}</SelectLabel>
              {views.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  <span className="flex items-center gap-2">
                    <Bookmark className="size-4" />
                    {view.name}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Bookmark className="size-4" />
            {t('Views')}
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onSaveAs}>
            <BookmarkPlus />
            {t('Save as view')}
          </DropdownMenuItem>
          <MenuAction
            reason={
              isDefault
                ? t('The default view is a preset and cannot be changed')
                : dirty
                ? null
                : t('No changes to save')
            }
            icon={<Save />}
            label={t('Save changes')}
            onSelect={onSave}
          />
          <MenuAction
            reason={
              isDefault
                ? t('The default view is a preset and cannot be renamed')
                : null
            }
            icon={<PenLine />}
            label={t('Rename view')}
            onSelect={onRename}
          />
          <MenuAction
            reason={dirty ? null : t('The filters already match this view')}
            icon={<RotateCcw />}
            label={t('Reset view')}
            onSelect={onReset}
          />
          <DropdownMenuSeparator />
          <MenuAction
            reason={
              isDefault
                ? t('The default view is a preset and cannot be deleted')
                : null
            }
            icon={<Trash2 />}
            label={t('Delete view')}
            destructive
            onSelect={() => setDeleting(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmationDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('Delete view "{name}"?', { name: currentName })}
        message={t('This cannot be undone. It does not affect any run data.')}
        entityName={currentName}
        buttonText={t('Delete')}
        mutationFn={onDelete}
      />
      <Dialog
        open={pendingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingId(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Discard unsaved changes?')}</DialogTitle>
            <DialogDescription>
              {t(
                'The filters of view "{name}" have changes that are not saved. They will be lost if you switch.',
                { name: currentName },
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingId(null)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingId !== null) {
                  onSelect(pendingId);
                }
                setPendingId(null);
              }}
            >
              {t('Switch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MenuAction({
  reason,
  icon,
  label,
  destructive,
  onSelect,
}: {
  reason: string | null;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}) {
  const item = (
    <DropdownMenuItem
      disabled={reason !== null}
      variant={destructive ? 'destructive' : 'default'}
      onSelect={onSelect}
    >
      {icon}
      {label}
    </DropdownMenuItem>
  );
  if (reason === null) {
    return item;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0}>{item}</div>
      </TooltipTrigger>
      <TooltipContent side="left">{reason}</TooltipContent>
    </Tooltip>
  );
}
