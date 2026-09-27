import {
  BLUEPRINT_ICON_COLORS,
  BLUEPRINT_LIMITS,
  BLUEPRINT_PRESETS,
  blueprintRules,
  CreateConnectorBlueprintRequest,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { connectorBlueprintHooks } from '@/features/connector-blueprints';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function NewConnectorDialog({
  open,
  onOpenChange,
  existingIdentifiers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingIdentifiers: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <NewConnectorForm
          key={open ? 'open' : 'closed'}
          existingIdentifiers={existingIdentifiers}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewConnectorForm({
  existingIdentifiers,
  onDone,
}: {
  existingIdentifiers: string[];
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1>(0);
  const [selectedPresetId, setSelectedPresetId] = useState<
    string | null | 'blank'
  >(null);
  const form = useForm<CreateConnectorBlueprintRequest>({
    resolver: zodResolver(CreateConnectorBlueprintRequest),
    defaultValues: {
      displayName: '',
      identifier: '',
      description: '',
      iconColor: BLUEPRINT_ICON_COLORS[0],
      presetId: null,
    },
    mode: 'onChange',
  });
  const { mutate, isPending } =
    connectorBlueprintHooks.useCreateConnectorBlueprint({
      onSuccess: (blueprint) => {
        toast.success(t('Connector created'));
        onDone();
        navigate(`/tenant/connectors/development/${blueprint.id}/basic`);
      },
      onError: (error) => {
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(
            error,
            t('Failed to create the connector'),
          ),
        });
      },
    });

  const displayName = form.watch('displayName');
  const description = form.watch('description');
  const iconColor = form.watch('iconColor');

  const goToDetails = () => {
    if (selectedPresetId === null) {
      return;
    }
    const preset =
      selectedPresetId === 'blank'
        ? null
        : BLUEPRINT_PRESETS.find(
            (candidate) => candidate.id === selectedPresetId,
          ) ?? null;
    const baseName = preset ? preset.name : '';
    form.setValue('displayName', baseName.slice(0, BLUEPRINT_LIMITS.name), {
      shouldValidate: true,
    });
    form.setValue(
      'identifier',
      preset
        ? blueprintRules.uniqueKey({
            base: preset.id,
            taken: existingIdentifiers,
          })
        : '',
      { shouldValidate: true },
    );
    form.setValue('presetId', preset?.id ?? null);
    setStep(1);
  };

  const handleSubmit = form.handleSubmit((values) => {
    form.clearErrors('root.serverError');
    mutate(values);
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 1) {
            handleSubmit();
          }
        }}
        className="flex flex-col gap-4"
      >
        <DialogHeader>
          <DialogTitle>
            {t('New connector ({step}/2)', { step: step + 1 })}
          </DialogTitle>
          <DialogDescription>
            {step === 0
              ? t('Choose a service to integrate with')
              : t('Fill in the basic information')}
          </DialogDescription>
        </DialogHeader>

        {step === 0 ? (
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setSelectedPresetId('blank')}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-md border p-3 text-sm hover:bg-accent',
                selectedPresetId === 'blank' && 'border-primary bg-accent',
              )}
            >
              <PlusIcon className="size-6 text-muted-foreground" />
              <span>{t('New')}</span>
            </button>
            {BLUEPRINT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPresetId(preset.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-md border p-3 text-sm hover:bg-accent',
                  selectedPresetId === preset.id && 'border-primary bg-accent',
                )}
              >
                <span
                  className="flex size-9 items-center justify-center rounded-md text-sm font-semibold text-white"
                  style={{ background: BLUEPRINT_ICON_COLORS[0] }}
                >
                  {iconLetterOf(preset.name)}
                </span>
                <span className="truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <FormItem>
              <FormLabel>{t('Connector icon')}</FormLabel>
              <div className="flex items-center gap-3">
                <span
                  className="flex size-11 items-center justify-center rounded-md text-lg font-semibold text-white"
                  style={{ background: iconColor }}
                >
                  {iconLetterOf(displayName)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {BLUEPRINT_ICON_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={t('Icon color {color}', { color })}
                      onClick={() =>
                        form.setValue('iconColor', color, {
                          shouldValidate: true,
                        })
                      }
                      className={cn(
                        'size-6 rounded-full border-2',
                        color === iconColor
                          ? 'border-foreground'
                          : 'border-transparent',
                      )}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'The icon letter is taken from the first character of the name',
                )}
              </p>
            </FormItem>
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>
                    {t('Connector name')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoFocus
                      maxLength={BLUEPRINT_LIMITS.name}
                    />
                  </FormControl>
                  <div className="text-right text-xs text-muted-foreground">
                    {displayName.length}/{BLUEPRINT_LIMITS.name}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>
                    {t('Connector identifier')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="font-mono"
                      placeholder="custom_crm"
                      maxLength={BLUEPRINT_LIMITS.identifier}
                      onChange={(event) =>
                        field.onChange(event.target.value.trim().toLowerCase())
                      }
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'Cannot be changed after saving. Must start with a lowercase letter and contain only lowercase letters, digits and underscores',
                    )}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Connector description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      maxLength={BLUEPRINT_LIMITS.description}
                    />
                  </FormControl>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('Required before publishing')}</span>
                    <span>
                      {description.length}/{BLUEPRINT_LIMITS.description}
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {form.formState.errors.root?.serverError && (
          <FormMessage>
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={step === 0 ? onDone : () => setStep(0)}
          >
            {step === 0 ? t('Cancel') : t('Back')}
          </Button>
          {step === 0 ? (
            <NextStepButton
              disabled={selectedPresetId === null}
              onClick={goToDetails}
            />
          ) : (
            <Button
              type="submit"
              disabled={!form.formState.isValid}
              loading={isPending}
            >
              {t('Create')}
            </Button>
          )}
        </DialogFooter>
      </form>
    </Form>
  );
}

function NextStepButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  if (!disabled) {
    return (
      <Button type="button" onClick={onClick}>
        {t('Next')}
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button type="button" disabled>
            {t('Next')}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {t('Choose a preset or start blank first')}
      </TooltipContent>
    </Tooltip>
  );
}

function iconLetterOf(name: string): string {
  const character = [...name.trim()][0] ?? t('New')[0];
  return /[a-z]/.test(character) ? character.toUpperCase() : character;
}
