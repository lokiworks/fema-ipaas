import type { OutputSchema, OutputSchemaField } from '@fema-ipaas/connector-sdk';

export const femaOutputSchemas = {
  businessEvent: schema({
    fields: [
      { key: 'id', label: 'Event ID', description: 'Unique per event; FEMA may deliver the same event more than once and repeats are dropped.' },
      { key: 'type', label: 'Event Type' },
      { key: 'app', label: 'App' },
      { key: 'ability', label: 'Ability' },
      { key: 'tenantId', label: 'Tenant Code' },
      { key: 'occurredAt', label: 'Occurred At', format: 'datetime' },
      {
        key: 'object',
        label: 'Object',
        children: [
          { key: 'code', label: 'Object Code' },
          { key: 'id', label: 'Object ID' },
        ],
      },
      { key: 'objectPath', label: 'Object Path', description: 'Pass it to Read Object to load the details.' },
    ],
  }),
  readObject: schema({
    fields: [
      { key: 'found', label: 'Found', format: 'boolean' },
      { key: 'objectPath', label: 'Object Path' },
      { key: 'objectId', label: 'Object ID' },
      { key: 'data', label: 'Object Details' },
    ],
  }),
};

function schema({ fields }: { fields: OutputSchemaField[] }): OutputSchema {
  return { fields };
}
