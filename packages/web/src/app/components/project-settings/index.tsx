import { isNil, Permission, tryCatch } from '@fema-ipaas/core-utils';
import { FlagId, TenantRole } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Settings, UsersRound } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { internalErrorMessage } from '@/components/ui/sonner';
import { ProjectMark } from '@/features/project-workspace/components/project-mark';
import { projectCollectionUtils } from '@/features/projects';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { GeneralSettings, FormValues } from './general';
import { MembersSettings } from './members';

type TabId =
  | 'general'
  | 'members'
  | 'alerts'
  | 'connectors'
  | 'environment'
  | 'mcp';

interface ProjectSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabId;
}

export function ProjectSettingsDialog({
  open,
  onClose,
  initialTab = 'general',
}: ProjectSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const { checkAccess } = useAuthorization();
  const { project } = projectCollectionUtils.useCurrentProject();
  const previousOpenRef = useRef(open);

  const hasGeneralSettings = projectSettingsHooks.useHasGeneralSettings();

  const form = useForm<FormValues>({
    defaultValues: {
      maxConcurrentJobs: project.maxConcurrentJobs,
    },
    disabled: checkAccess(Permission.WRITE_PROJECT) === false,
  });

  const handleSave = async (values: FormValues) => {
    const transaction = projectCollectionUtils.update(project.id, {
      maxConcurrentJobs: values.maxConcurrentJobs,
    });
    const { error } = await tryCatch(() => transaction.isPersisted.promise);
    if (!isNil(error)) {
      const message = api.extractServerErrorMessage(
        error,
        internalErrorMessage(),
      );
      toast.error(
        message === PROJECT_NAME_TAKEN ? t('projectNameTaken') : message,
      );
      return;
    }
    toast.success(t('Saved {name}', { name: project.displayName }), {
      duration: 3000,
    });
    onClose();
  };

  useEffect(() => {
    const dialogJustOpened = open && !previousOpenRef.current;
    if (dialogJustOpened && !isNil(project)) {
      form.reset({ maxConcurrentJobs: project.maxConcurrentJobs });
      setActiveTab(initialTab);
    }
    previousOpenRef.current = open;
  }, [open, project]);

  const canReadMembers = checkAccess(Permission.READ_PROJECT_MEMBER);

  const tabs = [
    {
      id: 'general' as TabId,
      label: t('Project settings'),
      icon: <Settings className="w-4 h-4" />,
      disabled: !hasGeneralSettings,
    },
    {
      id: 'members' as TabId,
      label: t('Project members'),
      icon: <UsersRound className="w-4 h-4" />,
      disabled: !canReadMembers,
    },
  ].filter((tab) => !tab.disabled);

  const shownTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : tabs[0]?.id;

  const renderTabContent = () => {
    switch (shownTab) {
      case 'general':
        return <GeneralSettings form={form} />;
      case 'members':
        return (
          <MembersSettings
            readonly={!checkAccess(Permission.WRITE_PROJECT_MEMBER)}
          />
        );
      default:
        return null;
    }
  };

  const renderTabHeader = () => {
    const hasUnsavedChanges = shownTab === 'general' && form.formState.isDirty;
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold">
          {tabs.find((tab) => tab.id === shownTab)?.label}
        </span>
        {hasUnsavedChanges && (
          <Badge variant="ghost" className="text-muted-foreground">
            {t('Unsaved changes')}
          </Badge>
        )}
      </div>
    );
  };
  const renderDialogFooter = () => {
    if (shownTab !== 'general') return null;

    return (
      <div className="border-t bg-background rounded-br-md">
        <div className="flex items-center justify-end gap-3 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('Close')}
          </Button>
          <Button
            disabled={!form.formState.isDirty}
            size="sm"
            onClick={form.handleSubmit(handleSave)}
          >
            {t('Save Changes')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-5xl w-full max-h-[95vh] rounded-sm flex flex-col p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {tabs.find((tab) => tab.id === shownTab)?.label}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('Manage the members of this project.')}
        </DialogDescription>
        <div className="flex h-[700px]">
          <div className="w-[238px]">
            <nav className="bg-sidebar space-y-1 bg-muted rounded-sm rounded-r-none h-full flex flex-col rounded-l-md">
              <div className="flex items-center gap-2 px-3 my-4">
                <ProjectMark name={project.displayName} icon={project.icon} />
                <span className="truncate text-sm font-medium">
                  {project.displayName}
                </span>
              </div>
              <div
                role="tablist"
                aria-orientation="vertical"
                aria-label={t('Project settings')}
                className="flex flex-col px-2 gap-1"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={shownTab === tab.id}
                    className={cn(
                      'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium transition-all cursor-pointer text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      {
                        'bg-sidebar-accent': shownTab === tab.id,
                      },
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-3 px-10 pt-4">
                  {renderTabHeader()}
                  {renderTabContent()}
                </div>
              </ScrollArea>
            </div>
            {renderDialogFooter()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useHasGeneralSettings(): boolean {
  const tenantRole = userHooks.getCurrentUserTenantRole();
  const { data: isRateLimiterEnabled } = flagsHooks.useFlag<boolean>(
    FlagId.PROJECT_RATE_LIMITER_ENABLED,
  );
  return tenantRole === TenantRole.ADMIN && isRateLimiterEnabled === true;
}

export const projectSettingsHooks = { useHasGeneralSettings };

const PROJECT_NAME_TAKEN = 'projectNameTaken';
