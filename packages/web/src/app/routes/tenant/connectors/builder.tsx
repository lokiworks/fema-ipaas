import {
  BlueprintAuthType,
  BlueprintFieldType,
  BlueprintHttpMethod,
  ConnectorBlueprintDefinition,
  GenerateFromBlueprintResponse,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { connectorBlueprintsApi } from '@/features/connector-blueprints';

const EMPTY: ConnectorBlueprintDefinition = {
  connectorName: '',
  displayName: '',
  description: '',
  logoUrl: '',
  categories: [],
  documentationUrl: '',
  baseUrl: '',
  defaultHeaders: {},
  auth: { type: BlueprintAuthType.NONE, description: '' },
  actions: [],
  networkAgentId: null,
};

export default function ConnectorBuilderPage() {
  const queryClient = useQueryClient();
  const [definition, setDefinition] =
    useState<ConnectorBlueprintDefinition>(EMPTY);
  const [blueprintId, setBlueprintId] = useState<string | undefined>(undefined);
  const [generated, setGenerated] =
    useState<GenerateFromBlueprintResponse | null>(null);

  const { data: blueprints } = useQuery({
    queryKey: ['connector-blueprints'],
    queryFn: () => connectorBlueprintsApi.list(),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      connectorBlueprintsApi.upsert({ id: blueprintId, definition }),
    onSuccess: (saved) => {
      setBlueprintId(saved.id);
      queryClient.invalidateQueries({ queryKey: ['connector-blueprints'] });
      toast.success(t('Saved'));
    },
    onError: () => toast.error(t('Could not save the connector')),
  });

  const generateMutation = useMutation({
    mutationFn: () => connectorBlueprintsApi.generate(blueprintId!),
    onSuccess: setGenerated,
    onError: () => toast.error(t('Could not generate the connector')),
  });

  const update = (patch: Partial<ConnectorBlueprintDefinition>) =>
    setDefinition((current) => ({ ...current, ...patch }));

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('Build a Connector')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Describe an HTTP API and generate a connector without writing code.',
            )}
          </p>
        </div>
        {(blueprints?.data.length ?? 0) > 0 && (
          <Select
            value={blueprintId ?? ''}
            onValueChange={async (id) => {
              const saved = await connectorBlueprintsApi.get(id);
              setBlueprintId(saved.id);
              setDefinition(saved.definition);
              setGenerated(null);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={t('Open a saved connector')} />
            </SelectTrigger>
            <SelectContent>
              {blueprints?.data.map((blueprint) => (
                <SelectItem key={blueprint.id} value={blueprint.id}>
                  {blueprint.definition.displayName || blueprint.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t('1. Basic information')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Display name')}>
            <Input
              value={definition.displayName}
              onChange={(event) => update({ displayName: event.target.value })}
            />
          </Field>
          <Field label={t('Package name')}>
            <Input
              className="font-mono text-xs"
              placeholder="@fema-ipaas/connector-example"
              value={definition.connectorName}
              onChange={(event) =>
                update({ connectorName: event.target.value })
              }
            />
          </Field>
          <Field label={t('Description')}>
            <Input
              value={definition.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </Field>
          <Field label={t('Documentation URL')}>
            <Input
              value={definition.documentationUrl}
              onChange={(event) =>
                update({ documentationUrl: event.target.value })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t('2. Connection')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Base URL')}>
            <Input
              className="font-mono text-xs"
              placeholder="https://api.example.com/v1"
              value={definition.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
            />
          </Field>
          <Field label={t('Authentication')}>
            <Select
              value={definition.auth.type}
              onValueChange={(type) =>
                update({
                  auth: { ...definition.auth, type: type as BlueprintAuthType },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BlueprintAuthType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {(definition.auth.type === BlueprintAuthType.API_KEY ||
            definition.auth.type === BlueprintAuthType.BEARER_TOKEN) && (
            <Field label={t('Header name')}>
              <Input
                className="font-mono text-xs"
                placeholder="X-Api-Key"
                value={definition.auth.parameterName ?? ''}
                onChange={(event) =>
                  update({
                    auth: {
                      ...definition.auth,
                      parameterName: event.target.value,
                    },
                  })
                }
              />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t('3. Operations')} · {definition.actions.length}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              update({
                actions: [
                  ...definition.actions,
                  {
                    name: `operation_${definition.actions.length + 1}`,
                    displayName: '',
                    description: '',
                    method: BlueprintHttpMethod.GET,
                    path: '/',
                    fields: [],
                  },
                ],
              })
            }
          >
            <PlusIcon className="mr-1 size-3.5" />
            {t('Add operation')}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {definition.actions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('Add at least one operation before generating.')}
            </p>
          )}
          {definition.actions.map((action, index) => (
            <div key={index} className="flex flex-col gap-2 rounded border p-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <Field label={t('Display name')}>
                  <Input
                    value={action.displayName}
                    onChange={(event) =>
                      update({
                        actions: replaceAt(definition.actions, index, {
                          ...action,
                          displayName: event.target.value,
                        }),
                      })
                    }
                  />
                </Field>
                <Field label={t('Method')}>
                  <Select
                    value={action.method}
                    onValueChange={(method) =>
                      update({
                        actions: replaceAt(definition.actions, index, {
                          ...action,
                          method: method as BlueprintHttpMethod,
                        }),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(BlueprintHttpMethod).map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('Path')}>
                  <Input
                    className="font-mono text-xs"
                    placeholder="/orders/{id}"
                    value={action.path}
                    onChange={(event) =>
                      update({
                        actions: replaceAt(definition.actions, index, {
                          ...action,
                          path: event.target.value,
                        }),
                      })
                    }
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      update({ actions: removeAt(definition.actions, index) })
                    }
                    aria-label={t('Remove operation')}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
              <FieldEditor
                fields={action.fields}
                onChange={(fields) =>
                  update({
                    actions: replaceAt(definition.actions, index, {
                      ...action,
                      fields,
                    }),
                  })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={
            definition.connectorName.trim().length === 0 ||
            definition.baseUrl.trim().length === 0
          }
        >
          {t('Save')}
        </Button>
        <Button
          variant="outline"
          onClick={() => generateMutation.mutate()}
          loading={generateMutation.isPending}
          disabled={
            blueprintId === undefined || definition.actions.length === 0
          }
        >
          {t('Generate connector')}
        </Button>
      </div>

      {generated && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Generated files')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {t(
                'Save these under packages/connectors, then run fema connectors validate and fema connectors publish.',
              )}
            </p>
            {Object.entries(generated.files).map(([path, contents]) => (
              <div key={path} className="flex flex-col gap-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {path}
                </span>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                  {contents}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FieldEditor({
  fields,
  onChange,
}: {
  fields: ConnectorBlueprintDefinition['actions'][number]['fields'];
  onChange: (
    fields: ConnectorBlueprintDefinition['actions'][number]['fields'],
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {t('Inputs')} · {fields.length}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange([
              ...fields,
              {
                name: `field_${fields.length + 1}`,
                displayName: '',
                description: '',
                required: false,
                in: 'query',
                type: BlueprintFieldType.TEXT,
                options: [],
              },
            ])
          }
        >
          <PlusIcon className="mr-1 size-3" />
          {t('Add input')}
        </Button>
      </div>
      {fields.map((field, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-5">
          <Input
            className="h-8 font-mono text-xs"
            placeholder={t('Name')}
            value={field.name}
            onChange={(event) =>
              onChange(
                replaceAt(fields, index, {
                  ...field,
                  name: event.target.value,
                }),
              )
            }
          />
          <Input
            className="h-8 text-xs"
            placeholder={t('Display name')}
            value={field.displayName}
            onChange={(event) =>
              onChange(
                replaceAt(fields, index, {
                  ...field,
                  displayName: event.target.value,
                }),
              )
            }
          />
          <Select
            value={field.in}
            onValueChange={(location) =>
              onChange(
                replaceAt(fields, index, {
                  ...field,
                  in: location as typeof field.in,
                }),
              )
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['query', 'path', 'header', 'body'] as const).map(
                (location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange(removeAt(fields, index))}
            aria-label={t('Remove input')}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, position) => (position === index ? value : item));
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_item, position) => position !== index);
}
