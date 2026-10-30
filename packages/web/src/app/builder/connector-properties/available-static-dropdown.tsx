import { StaticDropdownProperty } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { SearchableSelect } from '@/components/custom/searchable-select';
import { flagsHooks } from '@/hooks/flags-hooks';

import { dropdownValueUtils } from './dropdown-value-utils';
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
  const current = dropdownValueUtils.withCurrentValue({
    value,
    options: property.options.options,
    loading: false,
  });
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
    <div className="flex flex-col gap-1">
      <SearchableSelect
        options={current.options}
        onChange={handleChange}
        value={value}
        disabled={disabled}
        placeholder={property.options.placeholder ?? t('Select an option')}
        showDeselect={!property.required}
      />
      {current.missing && (
        <span className="text-xs text-warning-700">
          {t(
            'The saved value is not in the current list. It may have been deleted or the connection cannot see it. Pick another option or keep it as it is.',
          )}
        </span>
      )}
    </div>
  );
}

type Props = {
  property: StaticDropdownProperty<unknown, boolean>;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
};
