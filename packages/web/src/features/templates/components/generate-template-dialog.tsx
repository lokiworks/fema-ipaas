import { isNil } from '@fema-ipaas/core-utils';
import {
  GenerateTemplateFromWorkflowRequestBody,
  Template,
  TEMPLATE_CATEGORY_MAX_LENGTH,
  TEMPLATE_DESCRIPTION_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  TemplateVisibility,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { CircleCheck, Info } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

import { templatesMutations } from '../hooks/templates-hook';
import { TemplateCenterTab } from '../utils/template-center-utils';

export function GenerateTemplateDialog({
  open,
  onOpenChange,
  workflowId,
  projectId,
  workflowName,
}: GenerateTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <GenerateTemplateBody
          key={open ? 'open' : 'closed'}
          workflowId={workflowId}
          projectId={projectId}
          workflowName={workflowName}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function GenerateTemplateBody({
  workflowId,
  projectId,
  workflowName,
  onClose,
}: {
  workflowId: string;
  projectId: string;
  workflowName: string;
  onClose: () => void;
}) {
  const [created, setCreated] = useState<Template | null>(null);
  if (!isNil(created)) {
    return <GeneratedTemplate template={created} onClose={onClose} />;
  }
  return (
    <GenerateTemplateForm
      workflowId={workflowId}
      projectId={projectId}
      workflowName={workflowName}
      onCancel={onClose}
      onCreated={setCreated}
    />
  );
}

function GenerateTemplateForm({
  workflowId,
  projectId,
  workflowName,
  onCancel,
  onCreated,
}: {
  workflowId: string;
  projectId: string;
  workflowName: string;
  onCancel: () => void;
  onCreated: (template: Template) => void;
}) {
  const form = useForm<GenerateTemplateFormValues>({
    resolver: zodResolver(GenerateTemplateFormSchema),
    defaultValues: defaultFormValues(workflowName),
    mode: 'onChange',
  });
  const { mutate, isPending } = templatesMutations.useGenerateTemplate({
    onSuccess: onCreated,
  });
  const name = form.watch('name');
  const description = form.watch('description');

  const handleSubmit = (values: GenerateTemplateFormValues) => {
    form.clearErrors('root.serverError');
    mutate(
      { ...values, projectId, workflowId },
      {
        onError: (error) =>
          form.setError('root.serverError', {
            type: 'manual',
            message: api.extractServerErrorMessage(
              error,
              t('Failed to create the template'),
            ),
          }),
      },
    );
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>{t('Generate template')}</DialogTitle>
          <DialogDescription>
            {t(
              'The template is built from the published version of this workflow.',
            )}
          </DialogDescription>
        </DialogHeader>
        <Alert variant="primary">
          <Info />
          <AlertDescription>
            {t(
              'Connections, project configuration values and run logs are not shared.',
            )}
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2">
          <Label htmlFor="generate-template-workflow">{t('Workflow')}</Label>
          <Input
            id="generate-template-workflow"
            value={workflowName}
            readOnly
          />
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('Template name')}</FormLabel>
              <FormControl>
                <Input {...field} maxLength={TEMPLATE_NAME_MAX_LENGTH} />
              </FormControl>
              <CharacterCount
                length={name.length}
                max={TEMPLATE_NAME_MAX_LENGTH}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Template description')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={TEMPLATE_DESCRIPTION_MAX_LENGTH}
                />
              </FormControl>
              <CharacterCount
                length={description.length}
                max={TEMPLATE_DESCRIPTION_MAX_LENGTH}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Category')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={TEMPLATE_CATEGORY_MAX_LENGTH}
                  placeholder={t('For example: Approval')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="blogUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Help doc link')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder="https://" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Sharing')}</FormLabel>
              <RadioGroup
                value={field.value}
                onValueChange={(value) =>
                  field.onChange(
                    value === TemplateVisibility.PRIVATE
                      ? TemplateVisibility.PRIVATE
                      : TemplateVisibility.TENANT,
                  )
                }
                className="flex flex-col gap-2"
              >
                {VISIBILITY_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-2 rounded-md border p-3"
                  >
                    <RadioGroupItem value={option.value} />
                    <span className="flex flex-col gap-1">
                      <span className="font-medium">{t(option.label)}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {t(option.description)}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.serverError.message}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Create template')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function GeneratedTemplate({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const link = `${window.location.origin}/templates/${template.id}`;
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t('Share template')}</DialogTitle>
      </DialogHeader>
      <Alert variant="success">
        <CircleCheck />
        <AlertTitle>{t('Template created')}</AlertTitle>
        <AlertDescription>
          {template.visibility === TemplateVisibility.PRIVATE
            ? t(
                'Only you can find and use this template in the template center.',
              )
            : t(
                'Members of the organization can use this template from the link or the template center.',
              )}
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2">
        <Label>{t('Template link')}</Label>
        <CopyToClipboardInput textToCopy={link} useInput={true} />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onClose();
            navigate(`/templates?tab=${TemplateCenterTab.MINE}`);
          }}
        >
          {t('Open template center')}
        </Button>
        <Button type="button" onClick={onClose}>
          {t('Done')}
        </Button>
      </DialogFooter>
    </div>
  );
}

function CharacterCount({ length, max }: { length: number; max: number }) {
  return (
    <span className="text-xs text-muted-foreground">
      {length}/{max}
    </span>
  );
}

function defaultFormValues(workflowName: string): GenerateTemplateFormValues {
  return {
    name: workflowName.slice(0, TEMPLATE_NAME_MAX_LENGTH),
    description: '',
    category: '',
    blogUrl: '',
    visibility: TemplateVisibility.TENANT,
  };
}

const GenerateTemplateFormSchema = GenerateTemplateFromWorkflowRequestBody.omit(
  { projectId: true, workflowId: true },
);
type GenerateTemplateFormValues = z.infer<typeof GenerateTemplateFormSchema>;

const VISIBILITY_OPTIONS: {
  value: TemplateVisibility;
  label: string;
  description: string;
}[] = [
  {
    value: TemplateVisibility.TENANT,
    label: 'Share inside the organization',
    description:
      'Members of the organization find it under "Shared with me" in the template center.',
  },
  {
    value: TemplateVisibility.PRIVATE,
    label: 'Only me',
    description: 'Only you see it, under "My templates".',
  },
];

type GenerateTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  projectId: string;
  workflowName: string;
};
