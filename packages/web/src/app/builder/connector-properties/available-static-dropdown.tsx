import { StaticDropdownProperty } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { SearchableSelect } from '@/components/custom/searchable-select';
import { flagsHooks } from '@/hooks/flags-hooks';

import { StaticDropdownCards } from './static-dropdown-cards';

export function AvailableStaticDropdown(props: Props) {
  return props.property.options.options.some(
    (option) => option.requiredServerFlag,
  ) ? (
    <WithFlags {...props} />
  ) : (
    <Choices {...props} />
  );
}

function WithFlags(props: Props) {
  const { data: flags } = flagsHooks.useFlags();
  const options = props.property.options.options.map((option) => ({
    ...option,
    disabled:
      option.disabled ||
      Boolean(
        option.requiredServerFlag && flags[option.requiredServerFlag] !== true,
      ),
  }));
  return (
    <Choices
      {...props}
      property={{
        ...props.property,
        options: { ...props.property.options, options },
      }}
    />
  );
}

function Choices({ property, value, onChange, disabled }: Props) {
  const handleChange = (next: unknown) =>
    isNil(next) && !isNil(property.defaultValue)
      ? onChange(property.defaultValue)
      : onChange(next);
  return property.display === 'cards' ? (
    <StaticDropdownCards
      options={property.options.options}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  ) : (
    <SearchableSelect
      options={property.options.options}
      onChange={handleChange}
      value={value}
      disabled={disabled}
      placeholder={property.options.placeholder ?? t('Select an option')}
      showDeselect={!property.required}
    />
  );
}

type Props = {
  property: StaticDropdownProperty<unknown, boolean>;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
};
