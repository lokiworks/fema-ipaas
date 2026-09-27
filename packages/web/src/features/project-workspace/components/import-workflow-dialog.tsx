import {
  WORKFLOW_NAME_MAX_LENGTH,
  WorkflowExportFile,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { FileJson, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';
import { workspaceUtils } from '../lib/workspace-utils';

export function ImportWorkflowFileDialog({
  open,
  onOpenChange,
  projectId,
  folderId,
  existingNames,
  limitReason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  folderId?: string | null;
  existingNames: string[];
  limitReason: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ImportBody
          key={open ? 'open' : 'closed'}
          projectId={projectId}
          folderId={folderId ?? null}
          existingNames={existingNames}
          limitReason={limitReason}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function ImportBody({
  projectId,
  folderId,
  existingNames,
  limitReason,
  onOpenChange,
}: {
  projectId: string;
  folderId: string | null;
  existingNames: string[];
  limitReason: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState(false);
  const { mutate: importWorkflow, isPending } =
    projectWorkspaceHooks.useImportWorkflow();

  const trimmed = name.trim();
  const nameError = picked
    ? trimmed.length === 0
      ? t('formErrors.required')
      : workspaceUtils.isNameTaken({ name: trimmed, taken: existingNames })
      ? t('workflowNameTaken')
      : null
    : null;

  const read = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    const text = await file.text().catch(() => null);
    if (text === null) {
      setPicked(null);
      setError(t('Could not read the file, choose it again'));
      return;
    }
    const parsed = workspaceUtils.parseWorkflowExport(text);
    if ('error' in parsed) {
      setPicked(null);
      setError(
        t(
          'The file format is not valid. Only workflow files exported from this platform can be imported',
        ),
      );
      return;
    }
    setError(null);
    setPicked({ fileName: file.name, size: file.size, file: parsed.file });
    setName(
      workspaceUtils.uniqueName({
        base: parsed.file.workflow.name,
        taken: existingNames,
        maxLength: WORKFLOW_NAME_MAX_LENGTH,
      }),
    );
  };

  const handleImport = () => {
    if (!picked || nameError || limitReason) {
      return;
    }
    importWorkflow(
      {
        projectId,
        ...(folderId ? { folderId } : {}),
        file: {
          ...picked.file,
          workflow: { ...picked.file.workflow, name: trimmed },
        },
      },
      {
        onSuccess: (result) => {
          toast.success(
            t('Imported. Select the connections, then publish the workflow'),
          );
          onOpenChange(false);
          navigate(`/projects/${projectId}/workflows/${result.workflowId}`);
        },
        onError: (importError) =>
          setError(
            t(
              api.extractServerErrorMessage(
                importError,
                'Something went wrong',
              ),
            ),
          ),
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Import workflow')}</DialogTitle>
        <DialogDescription>
          {t(
            'After importing, select the connections again. The workflow is an unpublished draft.',
          )}
        </DialogDescription>
      </DialogHeader>
      {limitReason && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {limitReason}
        </p>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void read(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex flex-col items-start gap-1 rounded-md border border-dashed p-6 text-left text-sm transition-colors hover:bg-muted/50',
          dragging && 'border-primary bg-primary/5',
          error && 'border-destructive',
        )}
      >
        {picked ? (
          <FileJson className="size-6 text-muted-foreground" />
        ) : (
          <Upload className="size-6 text-muted-foreground" />
        )}
        <span className="font-medium">
          {picked ? picked.fileName : t('Click or drop a file here to upload')}
        </span>
        <span className="text-xs text-muted-foreground">
          {picked
            ? t('{size} KB · click to choose again', {
                size: (picked.size / 1024).toFixed(1),
              })
            : t('Workflow files exported from this platform (.json)')}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void read(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {picked && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('Workflow name')}</span>
          <Input
            value={name}
            maxLength={WORKFLOW_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {name.length}/{WORKFLOW_NAME_MAX_LENGTH}
          </span>
          {nameError && (
            <span className="text-sm text-destructive">{nameError}</span>
          )}
        </div>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          loading={isPending}
          disabled={!picked || Boolean(nameError) || Boolean(limitReason)}
          onClick={handleImport}
        >
          {t('Import')}
        </Button>
      </DialogFooter>
    </>
  );
}

type PickedFile = {
  fileName: string;
  size: number;
  file: WorkflowExportFile;
};
