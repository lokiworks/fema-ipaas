import { ConnectorMetadataModelSummary } from '@fema/connector-sdk';
import {
  ConnectionWithoutSensitiveData,
  WorkflowStatus,
  FolderDto,
} from '@fema/shared';
import { t } from 'i18next';
import {
  Filter,
  FolderIcon,
  Link2,
  Search,
  ToggleLeft,
  User,
  Workflow,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AnimatedIconButton } from '@/components/custom/animated-icon-button';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { DownloadIcon } from '@/components/icons/download';
import { PlusIcon } from '@/components/icons/plus';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useOwnerOptions } from '@/features/automations/hooks/use-owner-options';
import { TemplatesBrowseDialog } from '@/features/templates';
import { formatUtils } from '@/lib/format-utils';
import { cn, DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

import { CreateNewMenu } from './create-new-menu';
import { MultiSelectFilter } from './multi-select-filter';

type AutomationsFiltersProps = {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  typeFilter: string[];
  onTypeFilterChange: (value: string[]) => void;
  statusFilter: string[];
  onStatusFilterChange: (value: string[]) => void;
  connectionFilter: string[];
  onConnectionFilterChange: (value: string[]) => void;
  ownerFilter: string[];
  onOwnerFilterChange: (value: string[]) => void;
  folderFilter: string[];
  onFolderFilterChange: (value: string[]) => void;
  onFilterChange?: () => void;
  folders: FolderDto[];
  connections: ConnectionWithoutSensitiveData[] | undefined;
  connectors: ConnectorMetadataModelSummary[] | undefined;
  userHasPermissionToWriteWorkflow: boolean;
  userHasPermissionToWriteFolder: boolean;
  onCreateWorkflow: () => void;
  onCreateFolder: () => void;
  onImportWorkflow: () => void;
  onClearAllFilters: () => void;
  hasActiveFilters: boolean;
  isCreatingWorkflow?: boolean;
};

export const AutomationsFilters = ({
  searchTerm,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  connectionFilter,
  onConnectionFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  folderFilter,
  onFolderFilterChange,
  onFilterChange,
  folders,
  connections,
  connectors,
  userHasPermissionToWriteWorkflow,
  userHasPermissionToWriteFolder,
  onCreateWorkflow,
  onCreateFolder,
  onImportWorkflow,
  onClearAllFilters,
  hasActiveFilters,
  isCreatingWorkflow = false,
}: AutomationsFiltersProps) => {
  const navigate = useNavigate();
  const { embedState } = useEmbedding();
  const ownerOptions = useOwnerOptions();
  const [isTemplatesBrowseDialogOpen, setIsTemplatesBrowseDialogOpen] =
    useState(false);
  const typeOptions = [{ value: 'workflow', label: t('Workflows') }];

  const statusOptions = Object.values(WorkflowStatus).map((status) => ({
    value: status,
    label: formatUtils.convertEnumToHumanReadable(status),
  }));

  const folderOptions = folders.map((folder) => ({
    value: folder.id,
    label: folder.displayName,
  }));

  const connectionOptions = (connections || []).map((connection) => {
    const connectorIcon = connectors?.find(
      (p) => p.name === connection.connectorName,
    )?.logoUrl;
    return {
      value: connection.externalId,
      label: connection.displayName,
      icon: connectorIcon ? (
        <img src={connectorIcon} alt="" className="h-4 w-4 object-contain" />
      ) : undefined,
    };
  });

  return (
    <>
      <div
        className={cn('overflow-x-auto mt-4 mb-4', DASHBOARD_CONTENT_PADDING_X)}
      >
        <div className="flex items-center justify-between gap-4 min-w-max">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search workflows...')}
                value={searchTerm}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  onFilterChange?.();
                }}
                className="min-w-[300px] max-w-xs pl-8 pr-8 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    onSearchChange('');
                    onFilterChange?.();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 w-5 rounded-full bg-muted hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <MultiSelectFilter
              label={t('Type')}
              icon={<Filter className="h-4 w-4" />}
              options={typeOptions}
              selectedValues={typeFilter}
              onChange={(values) => {
                onTypeFilterChange(values);
                onFilterChange?.();
              }}
            />

            <MultiSelectFilter
              label={t('Status')}
              icon={<ToggleLeft className="h-4 w-4" />}
              options={statusOptions}
              selectedValues={statusFilter}
              onChange={(values) => {
                onStatusFilterChange(values);
                onFilterChange?.();
              }}
            />

            <MultiSelectFilter
              label={t('Connections')}
              icon={<Link2 className="h-4 w-4" />}
              options={connectionOptions}
              selectedValues={connectionFilter}
              onChange={(values) => {
                onConnectionFilterChange(values);
                onFilterChange?.();
              }}
              searchable
            />

            {!embedState.isEmbedded && (
              <MultiSelectFilter
                label={t('Owner')}
                icon={<User className="h-4 w-4" />}
                options={ownerOptions}
                selectedValues={ownerFilter}
                onChange={(values) => {
                  onOwnerFilterChange(values);
                  onFilterChange?.();
                }}
                searchable
              />
            )}

            {folderOptions.length > 0 && (
              <MultiSelectFilter
                label={t('Folder')}
                icon={<FolderIcon className="h-4 w-4" />}
                options={folderOptions}
                selectedValues={folderFilter}
                onChange={(values) => {
                  onFolderFilterChange(values);
                  onFilterChange?.();
                }}
                searchable
              />
            )}

            {hasActiveFilters && (
              <Button
                variant="link"
                size="sm"
                className="h-9 text-sm gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onClearAllFilters();
                  onFilterChange?.();
                }}
              >
                <X className="h-3.5 w-3.5" />
                {t('Clear all')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!embedState.hideExportAndImportWorkflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <AnimatedIconButton
                    icon={DownloadIcon}
                    iconSize={16}
                    variant="outline"
                    size="sm"
                    className="h-9"
                  >
                    {t('Import')}
                  </AnimatedIconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <PermissionNeededTooltip
                    hasPermission={userHasPermissionToWriteWorkflow}
                  >
                    <DropdownMenuItem
                      disabled={!userHasPermissionToWriteWorkflow}
                      onClick={onImportWorkflow}
                      className="cursor-pointer"
                    >
                      <Workflow className="h-4 w-4 mr-2" />
                      {t('Import Workflow')}
                    </DropdownMenuItem>
                  </PermissionNeededTooltip>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <CreateNewMenu
              scope="root"
              align="end"
              userHasPermissionToWriteWorkflow={
                userHasPermissionToWriteWorkflow
              }
              userHasPermissionToWriteFolder={userHasPermissionToWriteFolder}
              isCreatingWorkflow={isCreatingWorkflow}
              onCreateWorkflow={onCreateWorkflow}
              onCreateFolder={onCreateFolder}
              onImportWorkflow={onImportWorkflow}
              onSelectTemplate={() => {
                if (embedState.isEmbedded) {
                  setIsTemplatesBrowseDialogOpen(true);
                } else {
                  navigate('/templates');
                }
              }}
            >
              <AnimatedIconButton
                icon={PlusIcon}
                iconSize={16}
                size="sm"
                className="h-9"
              >
                {t('Create New')}
              </AnimatedIconButton>
            </CreateNewMenu>
          </div>
        </div>
      </div>
      <TemplatesBrowseDialog
        open={isTemplatesBrowseDialogOpen}
        onOpenChange={setIsTemplatesBrowseDialogOpen}
      />
    </>
  );
};
