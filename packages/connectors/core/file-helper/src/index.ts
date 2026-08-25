import { createConnector, ConnectorAuth } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { readFileAction } from './lib/actions/read-file';
import { createFile } from './lib/actions/create-file';
import { changeFileEncoding } from './lib/actions/change-file-encoding';
import { checkFileType } from './lib/actions/check-file-type';
import { zipFiles } from './lib/actions/zip-files';
import { unzipFile } from './lib/actions/unzip-file';
import { getFileName } from './lib/actions/get-file-name';

export const filesHelper = createConnector({
  displayName: 'Files Helper',
  description: 'Read file content and return it in different formats.',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: '/assets/connectors/file-helper.svg',
  categories: [ConnectorCategory.CORE],
  authors: ['kishanprmr', 'MoShizzle', 'abuaboud', 'Seb-C', 'danielpoonwj'],
  actions: [
    readFileAction,
    createFile,
    changeFileEncoding,
    checkFileType,
    zipFiles,
    unzipFile,
    getFileName,
  ],
  triggers: [],
});
