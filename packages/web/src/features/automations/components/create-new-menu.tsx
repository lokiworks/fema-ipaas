import { t } from 'i18next';
import { FolderPlus, Loader2, Sparkles, Upload, Workflow } from 'lucide-react';
import { useState } from 'react';

import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { useEmbedding } from '@/components/providers/embed-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const CreateNewMenu = ({
  children,
  scope = 'root',
  align = 'end',
  userHasPermissionToWriteWorkflow,
  userHasPermissionToWriteFolder,
  isCreatingWorkflow = false,
  onCreateWorkflow,
  onCreateFolder,
  onImportWorkflow,
  onSelectTemplate,
  onOpenChange,
}: CreateNewMenuProps) => {
  const { embedState } = useEmbedding();
  const [isOpen, setIsOpen] = useState(false);

  const showFolder = scope === 'root' && !embedState.hideFolders;
  const showTemplate = scope === 'root';
  const busy = isCreatingWorkflow;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(next) => {
        if (busy && !next) return;
        setIsOpen(next);
        onOpenChange?.(next);
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        <PermissionNeededTooltip
          hasPermission={userHasPermissionToWriteWorkflow}
        >
          <DropdownMenuItem
            disabled={!userHasPermissionToWriteWorkflow || busy}
            onSelect={(e) => {
              e.preventDefault();
              onCreateWorkflow();
            }}
            className="cursor-pointer"
          >
            {isCreatingWorkflow ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Workflow className="h-4 w-4 mr-2" />
            )}
            {isCreatingWorkflow ? t('Creating...') : t('New Workflow')}
          </DropdownMenuItem>
        </PermissionNeededTooltip>

        {showTemplate && onSelectTemplate && (
          <PermissionNeededTooltip
            hasPermission={userHasPermissionToWriteWorkflow}
          >
            <DropdownMenuItem
              disabled={!userHasPermissionToWriteWorkflow || busy}
              onSelect={() => onSelectTemplate()}
              className="cursor-pointer"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {t('Start from Template')}
            </DropdownMenuItem>
          </PermissionNeededTooltip>
        )}

        {scope === 'folder' && !embedState.hideExportAndImportWorkflow && (
          <>
            <DropdownMenuSeparator />
            <PermissionNeededTooltip
              hasPermission={userHasPermissionToWriteWorkflow}
            >
              <DropdownMenuItem
                disabled={!userHasPermissionToWriteWorkflow}
                onClick={onImportWorkflow}
                className="cursor-pointer"
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('Import Workflow')}
              </DropdownMenuItem>
            </PermissionNeededTooltip>
          </>
        )}
        {showFolder && onCreateFolder && (
          <>
            <DropdownMenuSeparator />
            <PermissionNeededTooltip
              hasPermission={userHasPermissionToWriteFolder}
            >
              <DropdownMenuItem
                disabled={!userHasPermissionToWriteFolder || busy}
                onClick={onCreateFolder}
                className="cursor-pointer"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                {t('New Folder')}
              </DropdownMenuItem>
            </PermissionNeededTooltip>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

type CreateNewMenuProps = {
  children: React.ReactNode;
  scope?: 'root' | 'folder';
  align?: 'start' | 'end' | 'center';
  userHasPermissionToWriteWorkflow: boolean;
  userHasPermissionToWriteFolder: boolean;
  isCreatingWorkflow?: boolean;
  onCreateWorkflow: () => void;
  onCreateFolder?: () => void;
  onImportWorkflow: () => void;
  onSelectTemplate?: () => void;
  onOpenChange?: (open: boolean) => void;
};

export type CreateInFolderKind = 'workflow' | 'import-workflow';
