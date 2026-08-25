import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { storageAddtoList } from './lib/actions/store-add-to-list';
import { storageAppendAction } from './lib/actions/store-append-action';
import { storageGetAction } from './lib/actions/store-get-action';
import { storagePutAction } from './lib/actions/store-put-action';
import { storageRemoveFromList } from './lib/actions/store-remove-from-list';
import { storageRemoveValue } from './lib/actions/store-remove-value';

export const storage = createConnector({
  displayName: 'Storage',
  description: 'Store or retrieve data from key/value database',
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/store.svg',
  categories: [ConnectorCategory.CORE],
  auth: ConnectorAuth.None(),
  authors: ["JanHolger","fardeenpanjwani-codeglo","Abdallah-Alwarawreh","Salem-Alaa","kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  actions: [
    storageGetAction,
    storagePutAction,
    storageAppendAction,
    storageRemoveValue,
    storageAddtoList,
    storageRemoveFromList,
  ],
  triggers: [],
});
