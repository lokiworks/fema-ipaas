import { t } from 'i18next';
import {
  PackageCheckIcon,
  PackageIcon,
  TerminalIcon,
  UploadIcon,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STEPS = [
  {
    icon: PackageIcon,
    title: () => t('Scaffold'),
    command: 'fema connectors create',
    description: () =>
      t(
        'Generates a connector package under packages/connectors with the SDK wired up.',
      ),
  },
  {
    icon: TerminalIcon,
    title: () => t('Add an action or trigger'),
    command: 'fema actions create\nfema triggers create',
    description: () =>
      t(
        'Adds a typed action or trigger file and registers it on the connector.',
      ),
  },
  {
    icon: PackageCheckIcon,
    title: () => t('Validate'),
    command: 'fema connectors validate',
    description: () =>
      t(
        'Checks the packaging rules that only surface after publishing: scoped name, exact version, pinned dependencies.',
      ),
  },
  {
    icon: UploadIcon,
    title: () => t('Pack and publish'),
    command: 'fema connectors pack\nfema connectors publish',
    description: () =>
      t(
        'Builds the bundle, writes the registry manifest, and uploads it to this instance.',
      ),
  },
];

export default function ConnectorDevelopmentPage() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Connector Development')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('Build a connector in code and publish it to this instance.')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {STEPS.map((step) => (
          <Card key={step.command}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <step.icon className="size-4 text-muted-foreground" />
                {step.title()}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                {step.command}
              </pre>
              <span className="text-xs text-muted-foreground">
                {step.description()}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t('What the manifest carries')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">
            {t(
              'fema connectors pack writes connector-manifest.json beside the bundle so the registry can list a connector without running its code.',
            )}
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
            {`{
  "schemaVersion": "1",
  "name": "@fema-ipaas/connector-example",
  "displayName": "Example",
  "version": "1.0.0",
  "authTypes": ["CUSTOM_AUTH"],
  "actions": ["send_message"],
  "triggers": ["new_message"],
  "runtime": { "node": ">=20" }
}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
