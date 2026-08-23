import {
  ConnectorMetadataModel,
  ConnectorMetadataModelSummary,
  ConnectorPackageInformation,
  PropertyType,
  ExecutePropsResult,
} from '@fema-ipaas/connector-sdk';
import {
  AddConnectorRequestBody,
  GetConnectorRequestParams,
  GetConnectorRequestQuery,
  ListConnectorsRequestQuery,
  PackageType,
  ConnectorOptionRequest,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { internalErrorToast } from '@/components/ui/sonner';
import { api } from '@/lib/api';

export const connectorsApi = {
  list(
    request: ListConnectorsRequestQuery,
  ): Promise<ConnectorMetadataModelSummary[]> {
    return api.get<ConnectorMetadataModelSummary[]>('/v1/connectors', request);
  },
  get(
    request: GetConnectorRequestParams & GetConnectorRequestQuery,
  ): Promise<ConnectorMetadataModel> {
    return api.get<ConnectorMetadataModel>(`/v1/connectors/${request.name}`, {
      version: request.version ?? undefined,
      locale: request.locale ?? undefined,
      workspaceId: request.workspaceId ?? undefined,
      audience: request.audience ?? undefined,
    });
  },
  options<
    T extends
      | PropertyType.DROPDOWN
      | PropertyType.MULTI_SELECT_DROPDOWN
      | PropertyType.DYNAMIC,
  >(
    request: ConnectorOptionRequest,
    propertyType: T,
  ): Promise<ExecutePropsResult<T>> {
    return api
      .post<ExecutePropsResult<T>>(`/v1/connectors/options`, request)
      .catch((error) => {
        if (propertyType === PropertyType.DYNAMIC) {
          throw error;
        }
        console.error(error);
        internalErrorToast();
        const defaultStateForDropdownProperty: ExecutePropsResult<PropertyType.DROPDOWN> =
          {
            options: {
              options: [],
              disabled: true,
              placeholder: t(
                'An internal error occurred, please contact support',
              ),
            },
            type: PropertyType.DROPDOWN,
          };
        return defaultStateForDropdownProperty as ExecutePropsResult<T>;
      });
  },
  syncFromCloud() {
    return api.post<void>(`/v1/connectors/sync`, {});
  },
  async install(params: AddConnectorRequestBody) {
    const formData = new FormData();
    formData.set('packageType', params.packageType);
    formData.set('connectorName', params.connectorName);
    formData.set('connectorVersion', params.connectorVersion);
    formData.set('scope', params.scope);
    if (params.packageType === PackageType.ARCHIVE) {
      const buffer = await (
        params.connectorArchive as unknown as File
      ).arrayBuffer();
      formData.append('connectorArchive', new Blob([buffer]));
    }

    return api.post<ConnectorMetadataModel>(
      '/v1/connectors',
      formData,
      undefined,
      {
        'Content-Type': 'multipart/form-data',
      },
    );
  },
  registry(release: string): Promise<ConnectorPackageInformation[]> {
    return api.get<ConnectorPackageInformation[]>('/v1/connectors/registry', {
      release,
    });
  },
  delete(id: string) {
    return api.delete(`/v1/connectors/${id}`);
  },
};
