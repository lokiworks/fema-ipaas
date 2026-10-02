import { readFileSync, readdirSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

type Catalog = Record<string, string>;

const WEB_ROOT = path.resolve(__dirname, '../..');
const SHARED_SRC = path.resolve(WEB_ROOT, '../core/shared/src');
const KANA_PATTERN = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HALF_WIDTH_PUNCTUATION_IN_CHINESE =
  /[\u4e00-\u9fff][,;!?]|[\u4e00-\u9fff]\(|\)[\u4e00-\u9fff]/;
const PRODUCT_NAME_PATTERN = /FEMA Integration|Activepieces/i;
const KEPT_IN_ENGLISH = new Set([
  'HTTP {status}',
  'JSON',
  'CPU',
  'example.com',
  'Redis',
  'SSE',
  'name@work.com',
  'Slack',
  'Webhook',
  '{count} / {max}',
  'OAuth 2.0',
  'OIDC',
  'MCP',
  'Streamable HTTP',
  'PKCE',
  '{name} · {method} {path}',
  '{status} · {duration} ms',
  'SVG',
  'Git',
  'Google',
  'SAML',
  'CSV',
  'Claude Desktop / Cursor',
  'Claude Code',
]);

function loadCatalog(lang: 'en' | 'zh'): Catalog {
  return JSON.parse(
    readFileSync(
      path.resolve(WEB_ROOT, `public/locales/${lang}/translation.json`),
      'utf-8',
    ),
  );
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : listSourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [full]
      : [];
  });
}

function stripQuoted(message: string): string {
  return message.replace(/''/g, '').replace(/'[{}][^']*'/g, '');
}

function argumentNames(message: string): string[] | null {
  const text = stripQuoted(message);
  const names = new Set<string>();
  const stack: Array<'argument' | 'branch'> = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '{') {
      const parent = stack[stack.length - 1];
      if (parent === 'argument') {
        const head = text.slice(0, index).trimEnd();
        const isBranch = /[,}]\s*[=\w#]*$/.test(head) && !/,\s*$/.test(head);
        if (!isBranch) {
          return null;
        }
        stack.push('branch');
      } else {
        const match = /^\{\s*([A-Za-z_][\w]*)\s*([,}])/.exec(text.slice(index));
        if (!match) {
          return null;
        }
        names.add(match[1]);
        stack.push(match[2] === ',' ? 'argument' : 'branch');
        if (match[2] === '}') {
          stack.pop();
          index += match[0].length;
          continue;
        }
        index += match[0].length;
        continue;
      }
    } else if (char === '}') {
      if (stack.length === 0) {
        return null;
      }
      stack.pop();
    }
    index += 1;
  }
  return stack.length === 0 ? [...names].sort() : null;
}

function routeTitleKeys(): string[] {
  const files = [
    ...listSourceFiles(path.resolve(WEB_ROOT, 'src/app/routes')),
    ...listSourceFiles(path.resolve(WEB_ROOT, 'src/app/guards')),
  ];
  const titles = files.flatMap((file) => {
    const source = readFileSync(file, 'utf-8');
    const jsx = [...source.matchAll(/<PageTitle\s+title="([^"]+)"/g)];
    const tenant = [
      ...source.matchAll(/tenantRoute\(\s*'[^']+',\s*'([^']+)'/g),
    ];
    return [...jsx, ...tenant].map((match) => match[1]);
  });
  return [...new Set(titles)];
}

function sharedValidationKeys(): string[] {
  const keys = listSourceFiles(SHARED_SRC).flatMap((file) => {
    const source = readFileSync(file, 'utf-8');
    const chained = [
      ...source.matchAll(
        /\.(?:min|max|regex|refine|superRefine|int|nonempty)\([^()]*?,\s*'([a-z][A-Za-z]+)'\s*\)/g,
      ),
    ];
    const explicit = [...source.matchAll(/message:\s*'([a-z][A-Za-z]+)'/g)];
    return [...chained, ...explicit].map((match) => match[1]);
  });
  return [...new Set(keys)];
}

const en = loadCatalog('en');
const zh = loadCatalog('zh');

describe('locale catalogs', () => {
  it('declares the same keys in English and Chinese', () => {
    const enKeys = Object.keys(en);
    const zhKeys = Object.keys(zh);
    expect(enKeys.filter((key) => !(key in zh))).toEqual([]);
    expect(zhKeys.filter((key) => !(key in en))).toEqual([]);
  });

  it('has no empty translation in either language', () => {
    const empty = (catalog: Catalog) =>
      Object.entries(catalog)
        .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
        .map(([key]) => key);
    expect(empty(en)).toEqual([]);
    expect(empty(zh)).toEqual([]);
  });

  it('keeps Japanese kana out of the Chinese catalog', () => {
    const offenders = Object.entries(zh)
      .filter(([key, value]) => KANA_PATTERN.test(key + value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('uses full-width punctuation next to Chinese characters', () => {
    const offenders = Object.entries(zh)
      .filter(([, value]) =>
        HALF_WIDTH_PUNCTUATION_IN_CHINESE.test(value.replace(/\{[^}]*\}/g, '')),
      )
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('does not hardcode a product name into any message', () => {
    const offenders = (catalog: Catalog) =>
      Object.entries(catalog)
        .filter(([, value]) => PRODUCT_NAME_PATTERN.test(value))
        .map(([key]) => key);
    expect(offenders(en)).toEqual([]);
    expect(offenders(zh)).toEqual([]);
  });

  it('writes every message as well formed ICU', () => {
    const malformed = (catalog: Catalog) =>
      Object.entries(catalog)
        .filter(([, value]) => argumentNames(value) === null)
        .map(([key]) => key);
    expect(malformed(en)).toEqual([]);
    expect(malformed(zh)).toEqual([]);
  });

  it('uses the same ICU arguments in both languages', () => {
    const mismatched = Object.keys(en).filter(
      (key) =>
        key in zh &&
        JSON.stringify(argumentNames(en[key])) !==
          JSON.stringify(argumentNames(zh[key])),
    );
    expect(mismatched).toEqual([]);
  });

  it('leaves no English sentence untranslated in Chinese', () => {
    const untranslated = Object.keys(en).filter(
      (key) =>
        key in zh &&
        zh[key] === en[key] &&
        /[A-Za-z]{3,}/.test(en[key]) &&
        !KEPT_IN_ENGLISH.has(key),
    );
    expect(untranslated).toEqual([]);
  });

  it('has a translation for every route page title', () => {
    const titles = routeTitleKeys();
    expect(titles.length).toBeGreaterThan(40);
    expect(titles.filter((title) => !(title in en))).toEqual([]);
    expect(titles.filter((title) => zh[title] === title)).toEqual([]);
  });

  it('has a translation for every validation message the shared schemas can emit', () => {
    const keys = sharedValidationKeys();
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.filter((key) => !(key in en) || !(key in zh))).toEqual([]);
  });
});
