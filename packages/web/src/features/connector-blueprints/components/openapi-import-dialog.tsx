import {
  BLUEPRINT_LIMITS,
  ImportOpenApiBlueprintRequest,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { FileJsonIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { connectorBlueprintHooks } from '@/features/connector-blueprints';
import { api } from '@/lib/api';

export function OpenApiImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <OpenApiImportForm
          key={open ? 'open' : 'closed'}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function OpenApiImportForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [document, setDocument] = useState('');
  const [debouncedDocument, setDebouncedDocument] = useState('');
  const {
    mutate: runPreview,
    data: preview,
    error: previewError,
    isPending: isPreviewing,
    reset: resetPreview,
  } = connectorBlueprintHooks.usePreviewOpenApiBlueprint();
  const form = useForm<ImportOpenApiBlueprintRequest>({
    resolver: zodResolver(ImportOpenApiBlueprintRequest),
    defaultValues: {
      displayName: '',
      identifier: '',
      description: '',
      iconColor: '#2563EB',
      document: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (preview) {
      form.setValue(
        'displayName',
        preview.title.slice(0, BLUEPRINT_LIMITS.name),
        {
          shouldValidate: true,
        },
      );
      form.setValue('identifier', preview.identifier, { shouldValidate: true });
      form.setValue(
        'description',
        preview.description.slice(0, BLUEPRINT_LIMITS.description),
        { shouldValidate: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  useEffect(() => {
    form.setValue('document', document, { shouldValidate: true });
    const timer = setTimeout(() => setDebouncedDocument(document), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  useEffect(() => {
    if (debouncedDocument.trim().length === 0) {
      resetPreview();
      return;
    }
    runPreview({ document: debouncedDocument });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDocument]);

  const { mutate, isPending } =
    connectorBlueprintHooks.useImportOpenApiBlueprint();

  const displayName = form.watch('displayName');
  const description = form.watch('description');

  const handleSubmit = form.handleSubmit((values) => {
    form.clearErrors('root.serverError');
    mutate(values, {
      onSuccess: (blueprint) => {
        toast.success(
          t('Imported {count} operations', { count: blueprint.operationCount }),
        );
        onDone();
        navigate(`/tenant/connectors/development/${blueprint.id}/basic`);
      },
      onError: (error) => {
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(
            error,
            t('Failed to import the OpenAPI document'),
          ),
        });
      },
    });
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <DialogHeader>
          <DialogTitle>{t('Import from OpenAPI')}</DialogTitle>
          <DialogDescription>
            {t(
              'Paste an OpenAPI 3.x JSON document to generate the base path and operations automatically',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t(
              'YAML must be converted to JSON first. The import lands as a draft; authentication is configured separately.',
            )}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setDocument(JSON.stringify(DEVKIT_OPENAPI_SAMPLE, null, 2))
            }
          >
            <FileJsonIcon className="mr-1 size-4" />
            {t('Fill in a sample')}
          </Button>
        </div>
        <Textarea
          value={document}
          onChange={(event) => setDocument(event.target.value)}
          rows={10}
          className="font-mono text-xs"
          placeholder='{ "openapi": "3.0.1", "paths": { ... } }'
        />
        {form.formState.errors.document && (
          <FormMessage>{form.formState.errors.document.message}</FormMessage>
        )}
        {isPreviewing && (
          <p className="text-xs text-muted-foreground">{t('Parsing...')}</p>
        )}
        {previewError && (
          <p className="text-xs text-destructive">
            {api.extractServerErrorMessage(
              previewError,
              t('The document is not a valid OpenAPI 3.x specification'),
            )}
          </p>
        )}
        {preview && (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{preview.title}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {preview.identifier}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {preview.baseUrl
                ? t('Base URL: {url}', { url: preview.baseUrl })
                : t(
                    'The document has no usable servers entry. Configure the Base URL after importing',
                  )}
            </p>
            <div className="flex max-h-40 flex-col gap-1 overflow-auto">
              {preview.operations.map((operation) => (
                <div
                  key={operation.key}
                  className="flex items-center gap-2 text-xs"
                >
                  <Badge variant="outline">{operation.method}</Badge>
                  <span className="grow truncate">{operation.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {operation.path}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {preview && (
          <div className="flex flex-col gap-4 border-t pt-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>
                    {t('Connector name')}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={BLUEPRINT_LIMITS.name} />
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
                      maxLength={BLUEPRINT_LIMITS.identifier}
                      onChange={(event) =>
                        field.onChange(event.target.value.trim().toLowerCase())
                      }
                    />
                  </FormControl>
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
                      rows={2}
                      maxLength={BLUEPRINT_LIMITS.description}
                    />
                  </FormControl>
                  <div className="text-right text-xs text-muted-foreground">
                    {description.length}/{BLUEPRINT_LIMITS.description}
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
          <Button type="button" variant="outline" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            disabled={!preview || !form.formState.isValid}
            loading={isPending}
          >
            {t('Import')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const DEVKIT_OPENAPI_SAMPLE = {
  openapi: '3.0.1',
  info: { title: '工单系统', description: '内部 IT 工单的查询与创建接口' },
  servers: [{ url: 'https://tickets.example.com/api/v1' }],
  paths: {
    '/tickets': {
      get: {
        operationId: 'listTickets',
        summary: '查询工单列表',
        tags: ['工单'],
        parameters: [
          {
            name: 'status',
            in: 'query',
            description: '工单状态',
            schema: { type: 'string', enum: ['open', 'closed'] },
          },
          {
            name: 'page',
            in: 'query',
            description: '页码',
            schema: { type: 'integer' },
          },
        ],
        responses: {
          200: {
            content: {
              'application/json': {
                example: {
                  total: 1,
                  items: [
                    { id: 'T-1024', title: 'VPN 无法连接', status: 'open' },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createTicket',
        summary: '创建工单',
        tags: ['工单'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', description: '标题' },
                  urgent: { type: 'boolean', description: '是否紧急' },
                  detail: { type: 'object', description: '详细信息' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            content: {
              'application/json': { example: { id: 'T-1025', status: 'open' } },
            },
          },
        },
      },
    },
    '/tickets/{id}': {
      get: {
        operationId: 'getTicket',
        summary: '查询工单详情',
        tags: ['工单'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: '工单 ID',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            content: {
              'application/json': {
                example: {
                  id: 'T-1024',
                  title: 'VPN 无法连接',
                  status: 'open',
                  assignee: 'IT 服务台',
                },
              },
            },
          },
        },
      },
    },
  },
};
