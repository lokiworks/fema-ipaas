import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { internalErrorToast } from '@/components/ui/sonner';
import { api } from '@/lib/api';

const VerifyIntegrityButton = () => {
  const [report, setReport] = useState<IntegrityReport | null>(null);

  const { mutate: verify, isPending } = useMutation({
    mutationFn: () =>
      api.post<IntegrityReport>('/v1/connectors/integrity/verify', {}),
    onSuccess: (result) => {
      const problems = result.mismatched + result.unverifiable;
      if (problems === 0) {
        toast.success(t('connectorsVerified', { count: result.checked }));
        return;
      }
      setReport(result);
    },
    onError: () => internalErrorToast(),
  });

  const problems = (report?.results ?? []).filter(
    (result) => result.status !== 'VERIFIED',
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        loading={isPending}
        onClick={() => verify()}
      >
        <ShieldCheck className="w-4 h-4 mr-2" />
        {t('Verify integrity')}
      </Button>
      <Dialog open={report !== null} onOpenChange={() => setReport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Integrity check')}</DialogTitle>
            <DialogDescription>
              {t('integritySummary', {
                checked: report?.checked ?? 0,
                mismatched: report?.mismatched ?? 0,
                unverifiable: report?.unverifiable ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[50vh] flex-col divide-y overflow-y-auto">
            {problems.map((result) => (
              <div
                key={`${result.name}-${result.version}`}
                className="flex flex-col gap-1 py-3"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="truncate text-sm font-medium">
                    {result.name}
                  </span>
                  <span
                    className={
                      result.status === 'MISMATCH'
                        ? 'shrink-0 text-xs text-destructive-700'
                        : 'shrink-0 text-xs text-muted-foreground'
                    }
                  >
                    {result.status === 'MISMATCH'
                      ? t('Archive does not match its checksum')
                      : t('Cannot be verified')}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  v{result.version}
                  {result.reason ? ` · ${result.reason}` : ''}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

VerifyIntegrityButton.displayName = 'VerifyIntegrityButton';

type IntegrityResult = {
  name: string;
  version: string;
  status: 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE';
  reason?: string;
};

type IntegrityReport = {
  checked: number;
  verified: number;
  mismatched: number;
  unverifiable: number;
  results: IntegrityResult[];
  signatureRequired: boolean;
};

export { VerifyIntegrityButton };
