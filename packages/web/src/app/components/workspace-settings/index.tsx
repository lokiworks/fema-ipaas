import { isNil, Permission, tryCatch } from '@fema-ipaas/core-utils';
import { TenantRole, WorkspaceType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Settings } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { INTERNAL_ERROR_MESSAGE } from '@/components/ui/sonner';
import { workspaceCollectionUtils } from '@/features/workspaces';
import { ApWorkspaceDisplay } from '@/features/workspaces/components/ap-workspace-display';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { userHooks } from '@/hooks/user-hooks';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { WorkspaceAvatar } from '../workspace-avatar';

import { GeneralSettings, FormValues } from './general';

type TabId =
  | 'general'
  | 'members'
  | 'alerts'
  | 'connectors'
  | 'environment'
  | 'mcp';

interface WorkspaceSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabId;
  initialValues?: {
    workspaceName?: string;
    externalId?: string;
  };
}

export function WorkspaceSettingsDialog({
  open,
  onClose,
  initialTab = 'general',
  initialValues,
}: WorkspaceSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const { checkAccess } = useAuthorization();
  const { workspace } = workspaceCollectionUtils.useCurrentWorkspace();
  const previousOpenRef = useRef(open);

  const tenantRole = userHooks.getCurrentUserTenantRole();

  const form = useForm<FormValues>({
    defaultValues: {
      workspaceName: initialValues?.workspaceName,
      icon: workspace.icon,
      externalId: initialValues?.externalId,
      maxConcurrentJobs: workspace.maxConcurrentJobs,
    },
    disabled: checkAccess(Permission.WRITE_WORKSPACE) === false,
  });

  const handleSave = async (values: FormValues) => {
    const transaction = workspaceCollectionUtils.update(workspace.id, {
      displayName: values.workspaceName,
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
    if (dialogJustOpened && !isNil(workspace)) {
      form.reset({
        ...initialValues,
        icon: workspace.icon,
        maxConcurrentJobs: workspace.maxConcurrentJobs,
      });
      setActiveTab(initialTab);
    }
    previousOpenRef.current = open;
  }, [open, workspace]);

  const hasGeneralSettings =
    workspace.type === WorkspaceType.TEAM || tenantRole === TenantRole.ADMIN;

  const tabs = [
    {
      id: 'general' as TabId,
      label: t('General'),
      icon: <Settings className="w-4 h-4" />,
      disabled: !hasGeneralSettings,
    },
  ].filter((tab) => !tab.disabled);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings form={form} />;
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

  const currentIconColor = form.watch('icon')?.color ?? workspace.icon.color;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-full max-h-[95vh] rounded-sm flex flex-col p-0">
        <div className="flex h-[700px]">
          <div className="w-[238px]">
            <nav className="bg-sidebar space-y-1 bg-muted rounded-sm rounded-r-none h-full flex flex-col rounded-l-md">
              <ApWorkspaceDisplay
                title={form.watch('workspaceName') ?? workspace.displayName}
                icon={form.watch('icon') ?? workspace.icon}
                containerClassName="px-3 my-4"
                titleClassName="text-sm font-medium"
                maxLengthToNotShowTooltip={18}
                workspaceType={workspace.type}
              />
              <div className="flex flex-col px-2 gap-1">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={cn(
                      'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium transition-all cursor-pointer hover:bg-sidebar-accent',
                      {
                        'bg-sidebar-accent': activeTab === tab.id,
                      },
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.icon}
                    {tab.label}
                  </div>
                ))}
              </div>
            </nav>
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-full">
                {activeTab === 'general' && (
                  <WorkspaceAvatar
                    displayName={workspace.displayName}
                    workspaceType={workspace.type}
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
