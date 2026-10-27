import { ActionClassification } from '@fema-ipaas/connector-sdk';

function effective({
  connectorName,
  actionName,
  input,
  classification,
}: {
  connectorName: string;
  actionName: string | undefined;
  input: Record<string, unknown> | undefined;
  classification: ActionClassification | undefined;
}): ActionClassification | undefined {
  if (
    connectorName !== HTTP_CONNECTOR_NAME ||
    actionName !== HTTP_SEND_REQUEST_ACTION_NAME
  ) {
    return classification;
  }
  const method = input?.method;
  const isReadMethod =
    typeof method === 'string' &&
    READ_ONLY_HTTP_METHODS.includes(method.trim().toUpperCase());
  return isReadMethod ? 'READ' : classification;
}

export const stepClassification = { effective };

const HTTP_CONNECTOR_NAME = '@fema-ipaas/connector-http';
const HTTP_SEND_REQUEST_ACTION_NAME = 'send_request';
const READ_ONLY_HTTP_METHODS = ['GET', 'HEAD', 'OPTIONS'];
