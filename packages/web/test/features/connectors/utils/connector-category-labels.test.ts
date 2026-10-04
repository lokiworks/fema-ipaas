import { readFileSync } from 'fs';
import path from 'path';

import { ConnectorCategory } from '@fema-ipaas/shared';
import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectorCategoryLabels } from '@/features/connectors/utils/connector-category-labels';
import { MARKET_CATEGORIES } from '@/features/connectors/utils/connector-market-utils';

const zh = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../public/locales/zh/translation.json'),
    'utf-8',
  ),
);
const HAS_CHINESE = /[一-鿿]/;
const CLASSIFICATIONS = ['READ', 'SEARCH', 'WRITE', 'DESTRUCTIVE'] as const;

describe('connectorCategoryLabels in Chinese', () => {
  beforeAll(async () => {
    i18n.addResourceBundle('zh', 'translation', zh);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(MARKET_CATEGORIES.map((category) => category.value))(
    'names the marketplace category %s in Chinese',
    (value) => {
      expect(connectorCategoryLabels.marketLabel(value)).toMatch(HAS_CHINESE);
    },
  );

  it.each(Object.values(ConnectorCategory))(
    'names the connector category %s in Chinese',
    (category) => {
      expect(connectorCategoryLabels.categoryLabel(category)).toMatch(
        HAS_CHINESE,
      );
    },
  );

  it.each(CLASSIFICATIONS)(
    'names the action classification %s in Chinese',
    (classification) => {
      expect(
        connectorCategoryLabels.classificationLabel(classification),
      ).toMatch(HAS_CHINESE);
    },
  );

  it('keeps the labels of different categories apart', () => {
    const labels = MARKET_CATEGORIES.map((category) =>
      connectorCategoryLabels.marketLabel(category.value),
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('connectorCategoryLabels in English', () => {
  it('falls back to the English names', () => {
    expect(connectorCategoryLabels.marketLabel('hr')).toBe('Human Resources');
    expect(
      connectorCategoryLabels.categoryLabel(ConnectorCategory.SALES_AND_CRM),
    ).toBe('Sales and CRM');
    expect(connectorCategoryLabels.classificationLabel('DESTRUCTIVE')).toBe(
      'Destructive',
    );
  });
});
