import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const CORE_DIR = path.resolve(__dirname, '../../core');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return full.endsWith('.ts') ? [full] : [];
  });
}

function occurrences(source: string, needle: RegExp): number {
  return (source.match(needle) ?? []).length;
}

const actionFiles = readdirSync(CORE_DIR)
  .filter((name) => statSync(path.join(CORE_DIR, name)).isDirectory())
  .flatMap((name) => sourceFiles(path.join(CORE_DIR, name, 'src')))
  .filter((file) => occurrences(readFileSync(file, 'utf8'), /\bcreateAction\(/g) > 0);

describe('core connector actions', () => {
  it('finds the actions to check', () => {
    expect(actionFiles.length).toBeGreaterThan(40);
  });

  it.each(actionFiles.map((file) => [path.relative(CORE_DIR, file), file]))(
    '%s declares a classification and whether it is idempotent for every action',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      const actions = occurrences(source, /\bcreateAction\(/g);
      expect(occurrences(source, /\bclassification:\s*'(READ|SEARCH|WRITE|DESTRUCTIVE)'/g)).toBeGreaterThanOrEqual(actions);
      expect(occurrences(source, /\bidempotent:\s*(true|false)\b/g)).toBeGreaterThanOrEqual(actions);
    },
  );
});

describe('core connector translations', () => {
  const connectors = readdirSync(CORE_DIR).filter((name) => statSync(path.join(CORE_DIR, name)).isDirectory());

  it.each(connectors)('%s has a Chinese translation for every key of its source file', (name) => {
    const dir = path.join(CORE_DIR, name, 'src', 'i18n');
    const source = Object.keys(JSON.parse(readFileSync(path.join(dir, 'translation.json'), 'utf8')));
    const chinese = Object.keys(JSON.parse(readFileSync(path.join(dir, 'zh.json'), 'utf8')));
    expect(source.filter((key) => !chinese.includes(key))).toEqual([]);
  });
});
