import { isNil, Permission, tryCatch } from '@fema-ipaas/core-utils';
import { TenantRole, ProjectType } from '@fema-ipaas/shared';
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
import { INTERNAL_ERROR_MESSAGE } from '@/components/ui/sonner';
import { projectCollectionUtils } from '@/features/projects';
import { ProjectDisplay } from '@/features/projects/components/project-display';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { ProjectAvatar } from '../project-avatar';

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
  initialValues?: {
    projectName?: string;
    externalId?: string;
  };
}

export function ProjectSettingsDialog({
  open,
  onClose,
  initialTab = 'general',
  initialValues,
}: ProjectSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const { checkAccess } = useAuthorization();
  const { project } = projectCollectionUtils.useCurrentProject();
  const previousOpenRef = useRef(open);

  const tenantRole = userHooks.getCurrentUserTenantRole();

  const form = useForm<FormValues>({
    defaultValues: {
      projectName: initialValues?.projectName,
      icon: project.icon,
      externalId: initialValues?.externalId,
      maxConcurrentJobs: project.maxConcurrentJobs,
    },
    disabled: checkAccess(Permission.WRITE_PROJECT) === false,
  });

  const handleSave = async (values: FormValues) => {
    const transaction = projectCollectionUtils.update(project.id, {
      displayName: values.projectName,
      externalId: values.externalId,
      icon: values.icon,
      maxConcurrentJobs: values.maxConcurrentJobs,
    });
    const { error } = await tryCatch(() => transaction.isPersisted.promise);
    if (!isNil(error)) {
      toast.error(api.extractServerErrorMessage(error, INTERNAL_ERROR_MESSAGE));
      return;
    }
    toast.success(t('Your changes have been saved.'), {
      duration: 3000,
    });
    onClose();
  };

  useEffect(() => {
    const dialogJustOpened = open && !previousOpenRef.current;
    if (dialogJustOpened && !isNil(project)) {
      form.reset({
        ...initialValues,
        icon: project.icon,
        maxConcurrentJobs: project.maxConcurrentJobs,
      });
      setActiveTab(initialTab);
    }
    previousOpenRef.current = open;
  }, [open, project]);

  const hasGeneralSettings =
    project.type === ProjectType.TEAM || tenantRole === TenantRole.ADMIN;

  const canReadMembers = checkAccess(Permission.READ_PROJECT_MEMBER);

  const tabs = [
    {
      id: 'general' as TabId,
      label: t('General'),
      icon: <Settings className="w-4 h-4" />,
      disabled: !hasGeneralSettings,
    },
    {
      id: 'members' as TabId,
      label: t('Members'),
      icon: <UsersRound className="w-4 h-4" />,
      disabled: !canReadMembers,
    },
  ].filter((tab) => !tab.disabled);

  const renderTabContent = () => {
    switch (activeTab) {
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
    const hasUnsavedChanges = activeTab === 'general' && form.formState.isDirty;
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold">
          {tabs.find((tab) => tab.id === activeTab)?.label}
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
    if (activeTab !== 'general') return null;

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

  const currentIconColor = form.watch('icon')?.color ?? project.icon.color;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-full max-h-[95vh] rounded-sm flex flex-col p-0">
        <DialogTitle className="sr-only">{t('Project settings')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('Rename this project, manage its members and adjust its limits.')}
        </DialogDescription>
        <div className="flex h-[700px]">
          <div className="w-[238px]">
            <nav className="bg-sidebar space-y-1 bg-muted rounded-sm rounded-r-none h-full flex flex-col rounded-l-md">
              <ProjectDisplay
                title={form.watch('projectName') ?? project.displayName}
                icon={form.watch('icon') ?? project.icon}
                containerClassName="px-3 my-4"
                titleClassName="text-sm font-medium"
                maxLengthToNotShowTooltip={18}
                projectType={project.type}
              />
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
                    aria-selected={activeTab === tab.id}
                    className={cn(
                      'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium transition-all cursor-pointer text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      {
                        'bg-sidebar-accent': activeTab === tab.id,
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
                {activeTab === 'general' && (
                  <ProjectAvatar
                    displayName={project.displayName}
                    projectType={project.type}
                    iconColor={currentIconColor}
                    size="md"
                    showBackground={true}
                  />
                )}
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
