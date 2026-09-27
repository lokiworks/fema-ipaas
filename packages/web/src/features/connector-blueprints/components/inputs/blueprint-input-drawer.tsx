import {
  BlueprintInput,
  BlueprintInputControl,
  blueprintExpression,
  BlueprintOptionsSource,
  blueprintRules,
  BlueprintValueType,
  isNil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function BlueprintInputDrawer({
  open,
  initial,
  taken,
  operationOptions,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: BlueprintInput | null;
  taken: string[];
  operationOptions: OperationOption[];
  onClose: () => void;
  onSave: (input: BlueprintInput) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
      >
        {open && (
          <InputDrawerForm
            key={initial?.key ?? 'new'}
            initial={initial}
            taken={taken}
            operationOptions={operationOptions}
            onClose={onClose}
            onSave={onSave}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function InputDrawerForm({
  initial,
  taken,
  operationOptions,
  onClose,
  onSave,
}: {
  initial: BlueprintInput | null;
  taken: string[];
  operationOptions: OperationOption[];
  onClose: () => void;
  onSave: (input: BlueprintInput) => void;
}) {
  const [draft, setDraft] = useState<BlueprintInput>(initial ?? blankInput());
  const [optionsText, setOptionsText] = useState(
    (initial?.options ?? []).join('\n'),
  );
  const set = <K extends keyof BlueprintInput>(
    key: K,
    value: BlueprintInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));
  const setControl = (control: BlueprintInputControl) =>
    setDraft((current) => controlChanged(current, control));
  const setType = (type: BlueprintValueType) =>
    setDraft((current) => typeChanged(current, type));

  const optionsList = optionsText
    .split('\n')
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  const isDropdown = draft.control === BlueprintInputControl.DROPDOWN;
  const isStaticOptions = draft.optionsSource === BlueprintOptionsSource.STATIC;
  const isText = draft.control === BlueprintInputControl.TEXT;

  const keyMissing = draft.key.trim().length === 0;
  const keyError = keyMissing
    ? ''
    : !blueprintRules.isValidFieldKey(draft.key)
    ? t(
        'Start with a letter or underscore, then letters, digits or underscores only',
      )
    : draft.key.startsWith('__') || draft.key === RESERVED_AUTH_KEY
    ? t('This identifier is reserved')
    : taken.includes(draft.key)
    ? t('This field identifier is already used')
    : '';
  const labelError = draft.label.trim().length === 0 ? t('Enter a label') : '';
  const optionsError =
    isDropdown && isStaticOptions && optionsList.length === 0
      ? t('Enter at least one option')
      : new Set(optionsList).size !== optionsList.length
      ? t('Options must be unique')
      : '';
  const operationError =
    isDropdown &&
    !isStaticOptions &&
    (isNil(draft.optionsOperation) || draft.optionsOperation.length === 0)
      ? t('Choose an operation to load options from')
      : '';
  const patternError =
    draft.pattern.length > 0 && !blueprintRules.isValidRegex(draft.pattern)
      ? t('Not a valid regular expression')
      : '';
  const patternMessageError =
    draft.pattern.length > 0 && draft.patternMessage.trim().length === 0
      ? t('Enter the message to show when validation fails')
      : '';
  const visibleIfError =
    draft.visibleIf.trim().length > 0 &&
    !blueprintExpression.isValid(draft.visibleIf)
      ? t('Not a valid expression')
      : '';

  const valid =
    !keyMissing &&
    !keyError &&
    !labelError &&
    !optionsError &&
    !operationError &&
    !patternError &&
    !patternMessageError &&
    !visibleIfError;

  const submit = () => {
    if (!valid) {
      return;
    }
    onSave({
      ...draft,
      key: draft.key.trim(),
      label: draft.label.trim(),
      hint: draft.hint.trim(),
      options: isDropdown ? optionsList : [],
      optionsOperation:
        isDropdown && !isStaticOptions ? draft.optionsOperation : null,
      pattern: isText ? draft.pattern.trim() : '',
      patternMessage:
        isText && draft.pattern.trim().length > 0
          ? draft.patternMessage.trim()
          : '',
      visibleIf: draft.visibleIf.trim(),
    });
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{initial ? t('Edit field') : t('Add field')}</SheetTitle>
        <SheetDescription>
          {t(
            'Fields become inputs on the node panel, referenced as {placeholder} in the API configuration',
            { placeholder: '{{input.key}}' },
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-2">
        <LabeledField label={t('Field identifier')} required error={keyError}>
          <Input
            className="font-mono"
            value={draft.key}
            placeholder="order_id"
            onChange={(event) => set('key', event.target.value.trim())}
          />
        </LabeledField>
        <LabeledField label={t('Display name')} required error={labelError}>
          <Input
            value={draft.label}
            maxLength={30}
            placeholder={t('Order number')}
            onChange={(event) => set('label', event.target.value.slice(0, 30))}
          />
        </LabeledField>
        <div className="grid grid-cols-2 gap-3">
          <LabeledField label={t('Control')}>
            <Select
              value={draft.control}
              onValueChange={(value) => {
                const control = toControl(value);
                if (control) {
                  setControl(control);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BlueprintInputControl.TEXT}>
                  {t('Text input')}
                </SelectItem>
                <SelectItem value={BlueprintInputControl.DROPDOWN}>
                  {t('Dropdown')}
                </SelectItem>
                <SelectItem value={BlueprintInputControl.CODE}>
                  {t('Code')}
                </SelectItem>
                <SelectItem value={BlueprintInputControl.SWITCH}>
                  {t('Switch')}
                </SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label={t('Type')}>
            <Select
              value={draft.type}
              onValueChange={(value) => {
                const type = toValueType(value);
                if (type) {
                  setType(type);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BlueprintValueType.STRING}>
                  {t('String')}
                </SelectItem>
                <SelectItem value={BlueprintValueType.NUMBER}>
                  {t('Number')}
                </SelectItem>
                <SelectItem value={BlueprintValueType.BOOLEAN}>
                  {t('Boolean')}
                </SelectItem>
                <SelectItem value={BlueprintValueType.OBJECT}>
                  {t('Object')}
                </SelectItem>
                <SelectItem value={BlueprintValueType.ARRAY}>
                  {t('Array')}
                </SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
        </div>
        <LabeledField label={t('Required')}>
          <RequiredSwitch
            draft={draft}
            onChange={(value) => set('required', value)}
          />
        </LabeledField>
        {isDropdown && (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <LabeledField label={t('Option source')}>
              <RadioGroup
                value={draft.optionsSource}
                onValueChange={(value) => {
                  const source = toOptionsSource(value);
                  if (source) {
                    set('optionsSource', source);
                  }
                }}
                className="flex flex-col gap-2"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={BlueprintOptionsSource.STATIC} />
                  {t('Fixed options')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={BlueprintOptionsSource.OPERATION} />
                  {t('Provided by another operation (dynamic dropdown)')}
                </label>
              </RadioGroup>
            </LabeledField>
            {!isStaticOptions && (
              <>
                <LabeledField
                  label={t('Operation that provides options')}
                  error={operationError}
                >
                  <Select
                    value={draft.optionsOperation ?? undefined}
                    onValueChange={(value) => set('optionsOperation', value)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          operationOptions.length > 0
                            ? t('Choose an operation of this connector')
                            : t('This connector has no other operations yet')
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {operationOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </LabeledField>
                <div className="grid grid-cols-3 gap-2">
                  <LabeledField label={t('Items path')}>
                    <Input
                      className="font-mono"
                      value={draft.optionsItemsPath}
                      placeholder="body.items"
                      onChange={(event) =>
                        set('optionsItemsPath', event.target.value)
                      }
                    />
                  </LabeledField>
                  <LabeledField label={t('Label path')}>
                    <Input
                      className="font-mono"
                      value={draft.optionsLabelPath}
                      placeholder="name"
                      onChange={(event) =>
                        set('optionsLabelPath', event.target.value)
                      }
                    />
                  </LabeledField>
                  <LabeledField label={t('Value path')}>
                    <Input
                      className="font-mono"
                      value={draft.optionsValuePath}
                      placeholder="id"
                      onChange={(event) =>
                        set('optionsValuePath', event.target.value)
                      }
                    />
                  </LabeledField>
                </div>
              </>
            )}
            <LabeledField
              label={isStaticOptions ? t('Options') : t('Example options')}
              required={isStaticOptions}
              hint={
                isStaticOptions
                  ? t('One per line')
                  : t(
                      'One per line, used for the simulator and node panel preview',
                    )
              }
              error={optionsError}
            >
              <Textarea
                rows={4}
                value={optionsText}
                onChange={(event) => setOptionsText(event.target.value)}
              />
            </LabeledField>
          </div>
        )}
        <LabeledField
          label={t('Hint text')}
          hint={t('Shown next to the field name')}
        >
          <Input
            value={draft.hint}
            maxLength={60}
            onChange={(event) => set('hint', event.target.value.slice(0, 60))}
          />
        </LabeledField>
        {isText && (
          <LabeledField
            label={t('Validation pattern')}
            hint={t(
              'A regular expression and its failure message. Leave empty to skip validation',
            )}
            error={patternError || patternMessageError}
          >
            <div className="grid grid-cols-2 gap-2">
              <Input
                className="font-mono"
                value={draft.pattern}
                placeholder="^\d{6,}$"
                onChange={(event) => set('pattern', event.target.value)}
              />
              <Input
                value={draft.patternMessage}
                placeholder={t('At least 6 digits')}
                onChange={(event) => set('patternMessage', event.target.value)}
              />
            </div>
          </LabeledField>
        )}
        <LabeledField
          label={t('Visibility expression')}
          hint={t(
            'The field only shows when this expression is true. Leave empty to always show it',
          )}
          error={visibleIfError}
        >
          <Input
            className="font-mono"
            value={draft.visibleIf}
            placeholder="input.mode == 'advanced'"
            onChange={(event) => set('visibleIf', event.target.value)}
          />
        </LabeledField>
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button type="button" disabled={!valid} onClick={submit}>
          {t('Save')}
        </Button>
      </SheetFooter>
    </>
  );
}

function RequiredSwitch({
  draft,
  onChange,
}: {
  draft: BlueprintInput;
  onChange: (value: boolean) => void;
}) {
  const isSwitch = draft.control === BlueprintInputControl.SWITCH;
  const control = (
    <Switch
      checked={draft.required}
      disabled={isSwitch}
      onCheckedChange={onChange}
    />
  );
  if (!isSwitch) {
    return control;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{control}</span>
      </TooltipTrigger>
      <TooltipContent>
        {t('A switch always has a value, so it cannot be required')}
      </TooltipContent>
    </Tooltip>
  );
}

function LabeledField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function toControl(value: string): BlueprintInputControl | undefined {
  return z.enum(BlueprintInputControl).safeParse(value).data;
}

function toValueType(value: string): BlueprintValueType | undefined {
  return z.enum(BlueprintValueType).safeParse(value).data;
}

function toOptionsSource(value: string): BlueprintOptionsSource | undefined {
  return z.enum(BlueprintOptionsSource).safeParse(value).data;
}

function blankInput(): BlueprintInput {
  return {
    key: '',
    label: '',
    type: BlueprintValueType.STRING,
    control: BlueprintInputControl.TEXT,
    required: false,
    hint: '',
    options: [],
    optionsSource: BlueprintOptionsSource.STATIC,
    optionsOperation: null,
    optionsItemsPath: '',
    optionsLabelPath: 'name',
    optionsValuePath: 'id',
    pattern: '',
    patternMessage: '',
    visibleIf: '',
  };
}

function controlChanged(
  input: BlueprintInput,
  control: BlueprintInputControl,
): BlueprintInput {
  const nextType =
    control === BlueprintInputControl.SWITCH
      ? BlueprintValueType.BOOLEAN
      : control === BlueprintInputControl.CODE
      ? [BlueprintValueType.OBJECT, BlueprintValueType.ARRAY].includes(
          input.type,
        )
        ? input.type
        : BlueprintValueType.OBJECT
      : [
          BlueprintValueType.BOOLEAN,
          BlueprintValueType.OBJECT,
          BlueprintValueType.ARRAY,
        ].includes(input.type)
      ? BlueprintValueType.STRING
      : input.type;
  return {
    ...input,
    control,
    type: nextType,
    required: control === BlueprintInputControl.SWITCH ? false : input.required,
    optionsSource:
      control === BlueprintInputControl.DROPDOWN
        ? input.optionsSource
        : BlueprintOptionsSource.STATIC,
  };
}

function typeChanged(
  input: BlueprintInput,
  type: BlueprintValueType,
): BlueprintInput {
  const nextControl =
    type === BlueprintValueType.BOOLEAN
      ? BlueprintInputControl.SWITCH
      : type === BlueprintValueType.OBJECT || type === BlueprintValueType.ARRAY
      ? BlueprintInputControl.CODE
      : input.control === BlueprintInputControl.SWITCH ||
        input.control === BlueprintInputControl.CODE
      ? BlueprintInputControl.TEXT
      : input.control;
  return {
    ...input,
    type,
    control: nextControl,
    required: type === BlueprintValueType.BOOLEAN ? false : input.required,
  };
}

const RESERVED_AUTH_KEY = 'auth';

export type OperationOption = {
  key: string;
  name: string;
};
