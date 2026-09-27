import {
  BlueprintAuth,
  BlueprintAuthField,
  BlueprintAuthProblem,
  BlueprintAuthType,
  BlueprintCredentialLocation,
  blueprintFactory,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { PenLine, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { authDraftUtils } from './auth-draft-utils';
import { AuthFieldDialog } from './auth-field-dialog';

export function AuthStepFields({
  draft,
  setDraft,
  problems,
}: {
  draft: BlueprintAuth;
  setDraft: (auth: BlueprintAuth) => void;
  problems: BlueprintAuthProblem[];
}) {
  const [fieldEdit, setFieldEdit] = useState<{ index: number } | null>(null);
  const autoFields = blueprintFactory.autoAuthFields(draft.type);
  const takenKeys = [
    ...autoFields.map((field) => field.key),
    ...draft.fields.map((field) => field.key),
  ];

  const removeField = (key: string) => {
    setDraft({
      ...draft,
      fields: draft.fields.filter((field) => field.key !== key),
    });
  };

  const saveField = (field: BlueprintAuthField) => {
    if (fieldEdit && fieldEdit.index >= 0) {
      setDraft({
        ...draft,
        fields: draft.fields.map((existing, index) =>
          index === fieldEdit.index ? field : existing,
        ),
      });
    } else {
      setDraft({ ...draft, fields: [...draft.fields, field] });
    }
    setFieldEdit(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t('Authentication form')}</h2>
          <Button size="sm" onClick={() => setFieldEdit({ index: -1 })}>
            <Plus className="size-4" />
            {t('Add custom field')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'Users fill in these fields when they create a connection. Reference them from the authentication flow with',
          )}{' '}
          <code className="rounded bg-muted px-1 font-mono">
            {'{{authInput.field_key}}'}
          </code>
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Field key')}</TableHead>
              <TableHead>{t('Display name')}</TableHead>
              <TableHead>{t('Control')}</TableHead>
              <TableHead>{t('Required')}</TableHead>
              <TableHead>{t('Source')}</TableHead>
              <TableHead className="text-right">{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {autoFields.map((field) => (
              <TableRow key={field.key}>
                <TableCell className="font-mono text-xs">{field.key}</TableCell>
                <TableCell>{field.label}</TableCell>
                <TableCell>
                  {authDraftUtils.authFieldControlLabel(field.control)}
                </TableCell>
                <TableCell>{field.required ? t('Yes') : t('No')}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t('Platform generated')}</Badge>
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
            {draft.fields.map((field, index) => (
              <TableRow key={field.key}>
                <TableCell className="font-mono text-xs">{field.key}</TableCell>
                <TableCell>{field.label}</TableCell>
                <TableCell>
                  {authDraftUtils.authFieldControlLabel(field.control)}
                </TableCell>
                <TableCell>{field.required ? t('Yes') : t('No')}</TableCell>
                <TableCell>
                  <Badge>{t('Custom')}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setFieldEdit({ index })}
                  >
                    <PenLine className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => removeField(field.key)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {problems.includes(BlueprintAuthProblem.FIELDS) && (
          <p className="text-xs text-destructive">
            {t(
              'Check the custom fields: every key must be unique and every field needs a display name',
            )}
          </p>
        )}
      </section>
      {authDraftUtils.showsCredentialFields(draft.type) && (
        <CredentialCard draft={draft} setDraft={setDraft} problems={problems} />
      )}
      <AuthFieldDialog
        open={Boolean(fieldEdit)}
        onOpenChange={(open) => !open && setFieldEdit(null)}
        initial={
          fieldEdit && fieldEdit.index >= 0
            ? draft.fields[fieldEdit.index]
            : null
        }
        taken={takenKeys.filter(
          (key) =>
            !(
              fieldEdit &&
              fieldEdit.index >= 0 &&
              draft.fields[fieldEdit.index]?.key === key
            ),
        )}
        onSave={saveField}
      />
    </div>
  );
}

function CredentialCard({
  draft,
  setDraft,
  problems,
}: {
  draft: BlueprintAuth;
  setDraft: (auth: BlueprintAuth) => void;
  problems: BlueprintAuthProblem[];
}) {
  const isApiKey = draft.type === BlueprintAuthType.API_KEY;
  const invalid = problems.includes(BlueprintAuthProblem.CREDENTIAL);
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="font-medium">
        {isApiKey ? t('API Key placement') : t('Access token placement')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <RadioGroup
            value={draft.credentialLocation}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                credentialLocation:
                  value === BlueprintCredentialLocation.QUERY
                    ? BlueprintCredentialLocation.QUERY
                    : BlueprintCredentialLocation.HEADER,
              })
            }
            className="flex flex-row gap-4"
          >
            <label className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value={BlueprintCredentialLocation.HEADER} />
              {t('Request header')}
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value={BlueprintCredentialLocation.QUERY} />
              {t('Query parameter')}
            </label>
          </RadioGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label showRequiredIndicator>{t('Parameter name')}</Label>
          <Input
            className="font-mono"
            value={draft.credentialName}
            aria-invalid={invalid}
            placeholder="X-Api-Key"
            onChange={(event) =>
              setDraft({ ...draft, credentialName: event.target.value })
            }
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t('Prefix')}</Label>
        <Input
          className="font-mono"
          value={draft.credentialPrefix}
          placeholder="Bearer "
          onChange={(event) =>
            setDraft({ ...draft, credentialPrefix: event.target.value })
          }
        />
      </div>
      {invalid && (
        <p className="text-xs text-destructive">
          {t(
            'The parameter name can only contain letters, digits, underscores and hyphens',
          )}
        </p>
      )}
    </section>
  );
}
