import { referenceFields } from '@/app/builder/reference-drag/reference-fields';

describe('referenceFields.flatten', () => {
  it('lists nested object fields and the first array item', () => {
    const fields = referenceFields.flatten({
      id: 7,
      user: { name: 'Ann' },
      items: [{ sku: 'A1' }, { sku: 'B2' }],
    });
    expect(fields.map((field) => field.path)).toEqual([
      'id',
      'user',
      'user.name',
      'items',
      'items[0]',
      'items[0].sku',
    ]);
    expect(fields.find((field) => field.path === 'user.name')?.preview).toBe(
      'Ann',
    );
  });

  it('returns nothing for empty sample data', () => {
    expect(referenceFields.flatten(undefined)).toEqual([]);
    expect(referenceFields.flatten('text')).toEqual([]);
  });
});
