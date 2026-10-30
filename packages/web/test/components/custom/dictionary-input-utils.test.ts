import { Property } from '@fema-ipaas/connector-sdk';
import { describe, expect, it } from 'vitest';

import { dictionaryInputUtils } from '@/components/custom/dictionary-input-utils';
import { formUtils } from '@/features/connectors/utils/form-utils';

const objectProperty = Property.Object({
  displayName: 'Fields',
  required: true,
});
const dropdownProperty = Property.StaticDropdown({
  displayName: 'Table',
  required: true,
  options: { options: [{ label: 'A', value: 'a' }] },
});
const textProperty = Property.ShortText({
  displayName: 'Text',
  required: false,
});

describe('dictionaryInputUtils.toRecord', () => {
  it('refuses an expression string instead of splitting it into characters', () => {
    expect(
      dictionaryInputUtils.toRecord("{{map_roster['output']}}"),
    ).toBeNull();
  });

  it('refuses arrays', () => {
    expect(dictionaryInputUtils.toRecord(['a', 'b'])).toBeNull();
  });

  it('treats an empty value as no entries', () => {
    expect(dictionaryInputUtils.toRecord(undefined)).toEqual({});
    expect(dictionaryInputUtils.toRecord(null)).toEqual({});
  });

  it('keeps key-value objects as they are', () => {
    expect(dictionaryInputUtils.toRecord({ 姓名: '王五' })).toEqual({
      姓名: '王五',
    });
  });
});

describe('formUtils.requiresDynamicInput', () => {
  it('shows an object stored as an expression as a dynamic value', () => {
    expect(
      formUtils.requiresDynamicInput({
        property: objectProperty,
        value: "{{map_roster['output']}}",
      }),
    ).toBe(true);
  });

  it('shows a dropdown whose value is an expression as a dynamic value', () => {
    expect(
      formUtils.requiresDynamicInput({
        property: dropdownProperty,
        value: "{{trigger['output']['table']}}",
      }),
    ).toBe(true);
  });

  it('keeps a plain dropdown value in the dropdown', () => {
    expect(
      formUtils.requiresDynamicInput({
        property: dropdownProperty,
        value: 'a',
      }),
    ).toBe(false);
  });

  it('keeps objects and text inputs as they are', () => {
    expect(
      formUtils.requiresDynamicInput({
        property: objectProperty,
        value: { a: '1' },
      }),
    ).toBe(false);
    expect(
      formUtils.requiresDynamicInput({
        property: textProperty,
        value: '{{trigger}}',
      }),
    ).toBe(false);
  });
});
