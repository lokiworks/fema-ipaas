import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction, tryCatch } from '@fema-ipaas/connector-sdk';

import { femaAuth } from '../auth';
import { femaCommon } from '../common';
import { femaOutputSchemas } from '../output-schemas';

export const readObject = createAction({
  auth: femaAuth,
  name: 'read_object',
  displayName: 'Read Object',
  description: 'Load the details of a FEMA object, such as the contract a business event is about',
  audience: 'both',
  classification: 'READ',
  aiMetadata: {
    description:
      'Read one FEMA object by its path and ID, as the connection application. Pick this after FEMA Business Event, which only says which object changed: pass its Object Path and Object ID. Returns found false when the object does not exist; a missing read permission fails the step.',
    idempotent: true,
  },
  reliability: { rateLimits: [{ bucket: 'fema-api', scope: 'TENANT', perSecond: 20 }] },
  props: {
    objectPath: Property.ShortText({
      displayName: 'Object Path',
      description: 'The app and object, for example rental-agreement/contract. Pick Object Path from the FEMA Business Event trigger.',
      required: true,
    }),
    objectId: Property.ShortText({
      displayName: 'Object ID',
      description: 'Pick Object ID from the FEMA Business Event trigger.',
      required: true,
    }),
  },
  outputSchema: femaOutputSchemas.readObject,
  async run(context) {
    const objectPath = context.propsValue.objectPath.trim().replace(/^\/+|\/+$/g, '');
    if (!OBJECT_PATH.test(objectPath)) {
      throw new Error(`对象地址「${objectPath}」不对，应写成 应用/对象，例如 rental-agreement/contract`);
    }
    const objectId = context.propsValue.objectId.trim();
    const { data, error } = await tryCatch(() =>
      femaCommon.call({
        auth: context.auth,
        method: HttpMethod.GET,
        path: `${objectPath}/find-by-id`,
        queryParams: { id: objectId },
      }),
    );
    if (error && isMissing({ error })) {
      return { found: false, objectPath, objectId, data: null };
    }
    if (error) {
      throw error;
    }
    return { found: data !== null && data !== undefined, objectPath, objectId, data: data ?? null };
  },
});

function isMissing({ error }: { error: unknown }): boolean {
  return error instanceof femaCommon.FemaApiError && (error.status === 404 || error.code === 'NOT_FOUND');
}

const OBJECT_PATH = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
