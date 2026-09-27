import { TenantMember, TenantMemberStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { SearchableSelect } from '@/components/custom/searchable-select';

import { tenantAccessUtils } from '../utils/tenant-access-utils';

export function MemberPicker({
  members,
  value,
  onChange,
  excludeIds,
  placeholder,
}: {
  members: TenantMember[];
  value: string | null;
  onChange: (value: string | null) => void;
  excludeIds: string[];
  placeholder?: string;
}) {
  const options = members
    .filter(
      (member) =>
        member.kind === 'USER' &&
        member.status === TenantMemberStatus.ACTIVE &&
        !excludeIds.includes(member.id),
    )
    .map((member) => ({
      value: member.id,
      label: tenantAccessUtils.memberDisplayName(member),
      description: member.email,
    }));
  return (
    <SearchableSelect<string>
      options={options}
      value={value ?? undefined}
      onChange={onChange}
      placeholder={placeholder ?? t('Choose a user')}
    />
  );
}
