import {
  AuthenticationType,
  httpClient,
  HttpMethod,
} from '@fema-ipaas/connector-common';
import {
  createAction,
  dataMapping,
  MappingSpec,
  MappingTableData,
  Property,
} from '@fema-ipaas/connector-sdk';

export const mapFields = createAction({
  audience: 'both',
  name: 'map_fields',
  classification: 'READ',
  displayName: 'Map Fields',
  description:
    'Build an object field by field, with transforms and mapping-table lookups',
  aiMetadata: {
    description:
      'Builds a target object from upstream values field by field. Each field has a source (a template reference or a constant), an ordered chain of transforms (trim, to number, to text, date format, default value, round, upper/lower case, split into a list, look up a project mapping table) and optionally a per-item mapping for lists. Use it to shape data for a write step when the target system needs different field names, codes or types. Read-only and idempotent.',
    idempotent: true,
  },
  props: {
    mapping: Property.Json({
      displayName: 'Field mapping',
      description: 'Target fields and how each one is computed',
      required: true,
      defaultValue: { fields: [] },
    }),
    failOnError: Property.Checkbox({
      displayName: 'Fail when a field cannot be mapped',
      description:
        'When off, fields that fail keep their unconverted value and the step succeeds',
      required: false,
      defaultValue: true,
    }),
  },
  async run(context) {
    const parsed = MappingSpec.safeParse(context.propsValue.mapping);
    if (!parsed.success) {
      throw new Error('The field mapping is not valid');
    }
    const tables = await Promise.all(
      dataMapping.lookupTableIds(parsed.data).map((id) =>
        fetchTable({
          apiUrl: context.server.apiUrl,
          token: context.server.token,
          id,
        }),
      ),
    );
    const result = dataMapping.evaluate({ spec: parsed.data, tables });
    const errors = result.rows.filter((row) => row.error !== null);
    if (errors.length > 0 && context.propsValue.failOnError !== false) {
      throw new Error(
        errors.map((row) => `${row.target}: ${row.error}`).join('; '),
      );
    }
    return result.value;
  },
});

async function fetchTable({
  apiUrl,
  token,
  id,
}: {
  apiUrl: string;
  token: string;
  id: string;
}): Promise<MappingTableData> {
  const response = await httpClient.sendRequest<MappingTableData>({
    method: HttpMethod.GET,
    url: `${apiUrl.replace(/\/$/, '')}/v1/worker/mapping-tables/${encodeURIComponent(id)}`,
    authentication: { type: AuthenticationType.BEARER_TOKEN, token },
  });
  return response.body;
}
