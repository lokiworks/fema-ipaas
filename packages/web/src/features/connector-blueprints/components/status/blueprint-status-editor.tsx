import {
  BlueprintStatusConfig,
  BlueprintStatusRule,
  BlueprintStatusUnmatched,
  generateId,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function BlueprintStatusEditor({
  value,
  onSave,
  title,
  description,
  extra,
  isSaving,
}: {
  value: BlueprintStatusConfig;
  onSave: (value: BlueprintStatusConfig) => void;
  title?: string;
  description?: string;
  extra?: ReactNode;
  isSaving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [codePath, setCodePath] = useState('');
  const [messagePath, setMessagePath] = useState('');
  const [unmatched, setUnmatched] = useState<BlueprintStatusUnmatched>(
    BlueprintStatusUnmatched.FAIL,
  );

  const startEdit = () => {
    setCodePath(value.codePath);
    setMessagePath(value.messagePath);
    setUnmatched(value.unmatched);
    setDraft(value.rules.map((rule) => ({ id: generateId(), ...rule })));
    setEditing(true);
  };

  const codePathError =
    codePath.trim().length === 0
      ? t('Enter the application status code path')
      : '';
  const messagePathError =
    messagePath.trim().length === 0 ? t('Enter the error message path') : '';
  const rowErrors = draft.map((row, index) => {
    const code = row.code.trim();
    if (code.length === 0) {
      return t('The value cannot be empty');
    }
    if (
      draft.findIndex((candidate) => candidate.code.trim() === code) < index
    ) {
      return t('Duplicate value {code}', { code });
    }
    return '';
  });
  const emptyError =
    draft.length === 0 ? t('Configure at least one status code') : '';
  const invalid =
    Boolean(codePathError) ||
    Boolean(messagePathError) ||
    Boolean(emptyError) ||
    rowErrors.some(Boolean);

  const save = () => {
    if (invalid) {
      return;
    }
    onSave({
      codePath: codePath.trim(),
      messagePath: messagePath.trim(),
      unmatched,
      rules: draft.map((row) => ({
        code: row.code.trim(),
        success: row.success,
        retry: row.success ? false : row.retry,
        tip: row.tip.trim(),
      })),
    });
    setEditing(false);
  };

  const updateRow = (id: string, patch: Partial<DraftRow>) =>
    setDraft((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-medium">{title ?? t('Status codes')}</span>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {extra}
          {editing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                size="sm"
                disabled={invalid}
                loading={isSaving}
                onClick={save}
              >
                {t('Save')}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={startEdit}>
              {t('Edit')}
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label={t('Application status code path')}
              required
              error={codePathError}
            >
              <Input
                className="font-mono"
                value={codePath}
                placeholder="body.code"
                onChange={(event) => setCodePath(event.target.value)}
              />
            </LabeledInput>
            <LabeledInput
              label={t('Error message path')}
              required
              error={messagePathError}
            >
              <Input
                className="font-mono"
                value={messagePath}
                placeholder="body.message"
                onChange={(event) => setMessagePath(event.target.value)}
              />
            </LabeledInput>
          </div>
          <div className="flex flex-col gap-2">
            {draft.map((row, index) => (
              <div key={row.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    className="w-24 font-mono"
                    value={row.code}
                    onChange={(event) =>
                      updateRow(row.id, { code: event.target.value })
                    }
                  />
                  <Select
                    value={row.success ? 'success' : 'fail'}
                    onValueChange={(next) =>
                      updateRow(row.id, { success: next === 'success' })
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="success">{t('Success')}</SelectItem>
                      <SelectItem value="fail">{t('Failure')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.success ? 'no' : row.retry ? 'yes' : 'no'}
                    disabled={row.success}
                    onValueChange={(next) =>
                      updateRow(row.id, { retry: next === 'yes' })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{t('Retryable')}</SelectItem>
                      <SelectItem value="no">{t('Not retryable')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="grow"
                    value={row.tip}
                    placeholder={t('Tell the user how to troubleshoot')}
                    onChange={(event) =>
                      updateRow(row.id, { tip: event.target.value })
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    aria-label={t('Delete')}
                    onClick={() =>
                      setDraft((rows) =>
                        rows.filter((current) => current.id !== row.id),
                      )
                    }
                  >
                    <Trash2Icon className="size-4 text-destructive" />
                  </Button>
                </div>
                {rowErrors[index] && (
                  <p className="text-xs text-destructive">{rowErrors[index]}</p>
                )}
              </div>
            ))}
            {emptyError && (
              <p className="text-xs text-destructive">{emptyError}</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft((rows) => [
                  ...rows,
                  {
                    id: generateId(),
                    code: '',
                    success: false,
                    retry: false,
                    tip: '',
                  },
                ])
              }
            >
              <PlusIcon className="size-4" />
              {t('Add status code')}
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('Unmatched status codes')}</span>
              <Select
                value={unmatched}
                onValueChange={(next) => {
                  const value = toUnmatched(next);
                  if (value) {
                    setUnmatched(value);
                  }
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BlueprintStatusUnmatched.SUCCESS}>
                    {t('Treat as success')}
                  </SelectItem>
                  <SelectItem value={BlueprintStatusUnmatched.FAIL}>
                    {t('Treat as failure')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : (
        <StatusReadView value={value} />
      )}
    </section>
  );
}

export function StatusReadView({ value }: { value: BlueprintStatusConfig }) {
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">
          {t('Application status code path')}
        </dt>
        <dd className="font-mono">{value.codePath}</dd>
        <dt className="text-muted-foreground">{t('Error message path')}</dt>
        <dd className="font-mono">{value.messagePath}</dd>
        <dt className="text-muted-foreground">{t('Unmatched status codes')}</dt>
        <dd>
          {value.unmatched === BlueprintStatusUnmatched.SUCCESS
            ? t('Treat as success')
            : t('Treat as failure')}
        </dd>
      </dl>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">{t('Value')}</TableHead>
            <TableHead className="w-24">{t('Result')}</TableHead>
            <TableHead className="w-28">{t('Retry')}</TableHead>
            <TableHead>{t('Troubleshooting tip')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.rules.map((rule) => (
            <TableRow key={rule.code}>
              <TableCell className="font-mono">{rule.code}</TableCell>
              <TableCell>
                <Badge variant={rule.success ? 'success' : 'destructive'}>
                  {rule.success ? t('Success') : t('Failure')}
                </Badge>
              </TableCell>
              <TableCell>
                {rule.success
                  ? '-'
                  : rule.retry
                  ? t('Retryable')
                  : t('Not retryable')}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {rule.tip || '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function LabeledInput({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function toUnmatched(value: string): BlueprintStatusUnmatched | undefined {
  return z.enum(BlueprintStatusUnmatched).safeParse(value).data;
}

type DraftRow = BlueprintStatusRule & { id: string };
