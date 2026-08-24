import { FlagId } from '@fema-ipaas/shared';

import { flagsHooks } from '@/hooks/flags-hooks';

type FlagGuardProps = {
  children: React.ReactNode;
  flag: FlagId;
};
const FlagGuard = ({ children, flag }: FlagGuardProps) => {
  const { data: flagValue } = flagsHooks.useFlag<boolean>(flag);
  if (!flagValue) {
    return null;
  }
  return children;
};

FlagGuard.displayName = 'FlagGuard';
export { FlagGuard };
