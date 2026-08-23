import {
  GenerateConnectorFromOpenApiRequest,
  GenerateConnectorFromOpenApiResponse,
  ParseOpenApiResponse,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const openApiImportApi = {
  parse(document: string): Promise<ParseOpenApiResponse> {
    return api.post<ParseOpenApiResponse>('/v1/connectors/openapi/parse', {
      document,
    });
  },
  generate(
    request: GenerateConnectorFromOpenApiRequest,
  ): Promise<GenerateConnectorFromOpenApiResponse> {
    return api.post<GenerateConnectorFromOpenApiResponse>(
      '/v1/connectors/openapi/generate',
      request,
    );
  },
};
