import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { concat } from './lib/actions/concat';
import { find } from './lib/actions/find';
import { findAll } from './lib/actions/find-all';
import { htmlToMarkdown } from './lib/actions/html-to-markdown';
import { markdownToHTML } from './lib/actions/markdown-to-html';
import { replace } from './lib/actions/replace';
import { split } from './lib/actions/split';
import { stripHtmlContent } from './lib/actions/strip-html';
import { slugifyAction } from './lib/actions/slugify';
import { defaultValue } from './lib/actions/default-value';
import { jsonToAsciiTable } from './lib/actions/json-to-ascii-table';
import { extractFromHtml } from './lib/actions/extract-from-html';

export const textHelper = createConnector({
  displayName: 'Text Helper',
  description: 'Tools for text processing',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.36.1',
  logoUrl: '/assets/connectors/text-helper.svg',
  authors: [
    'joeworkman',
    'kishanprmr',
    'MoShizzle',
    'AbdulTheActiveConnectorr',
    'abuaboud',
    'AdamSelene',
    'Anmol-Gup',
    'geekyme',
    'bertrandong',
    'onyedikachi-david',
  ],
  categories: [ConnectorCategory.CORE],
  actions: [
    concat,
    replace,
    split,
    find,
    findAll,
    markdownToHTML,
    htmlToMarkdown,
    stripHtmlContent,
    slugifyAction,
    defaultValue,
    jsonToAsciiTable,
    extractFromHtml,
  ],
  triggers: [],
});
