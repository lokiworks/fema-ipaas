import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HttpError } from '@/lib/api';

import { accountSecurityHooks } from '../hooks/account-security-hooks';
import { captchaUtils } from '../utils/captcha-utils';
import { loginChallengeUtils } from '../utils/login-challenge-utils';
import { phoneUtils } from '../utils/phone-utils';

import { CaptchaWidget } from './auth-landing/captcha-widget';

const CODE_LENGTH = 6;

function PhoneBindingDialog({ open, onOpenChange }: PhoneBindingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Link a phone number')}</DialogTitle>
          <DialogDescription>
            {t('We will text a 6-digit code to confirm the number is yours.')}
          </DialogDescription>
        </DialogHeader>
        <PhoneBindingForm
          key={open ? 'open' : 'closed'}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PhoneBindingForm({ onDone }: { onDone: () => void }) {
  const [countryCode, setCountryCode] = useState(
    phoneUtils.DEFAULT_COUNTRY_CODE,
  );
  const [nationalNumber, setNationalNumber] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const handleCaptchaUnavailable = useCallback(
    () => setCaptchaUnavailable(true),
    [],
  );

  const request = accountSecurityHooks.useRequestPhoneBinding();
  const confirm = accountSecurityHooks.useConfirmPhoneBinding();

  const sendCode = () => {
    const normalized = phoneUtils.normalize({ countryCode, nationalNumber });
    if (!phoneUtils.isValid(normalized)) {
      setErrorMessage(t('Enter a valid phone number.'));
      return;
    }
    setErrorMessage(null);
    request.mutate(
      { phone: normalized, captchaToken },
      {
        onSuccess: () => setPhone(normalized),
        onError: (error) => setErrorMessage(requestErrorMessage(error)),
        onSettled: () => {
          setCaptchaToken(undefined);
          setCaptchaReset((count) => count + 1);
        },
      },
    );
  };

  const handleCodeChange = (value: string) => {
    setErrorMessage(null);
    setCode(value);
    if (value.length === CODE_LENGTH && phone !== null) {
      confirm.mutate(
        { phone, code: value },
        {
          onSuccess: onDone,
          onError: () => {
            setCode('');
            setErrorMessage(t('That code is invalid or expired. Try again.'));
          },
        },
      );
    }
  };

  if (phone !== null) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {t('We sent a 6-digit code to {phone}', {
            phone: phoneUtils.mask(phone),
          })}
        </p>
        <InputOTP
          maxLength={CODE_LENGTH}
          value={code}
          onChange={handleCodeChange}
          disabled={confirm.isPending}
          autoFocus
          data-testid="phone-binding-code"
        >
          <InputOTPGroup>
            {Array.from({ length: CODE_LENGTH }).map((_, index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        sendCode();
      }}
    >
      <div className="flex gap-2">
        <Select value={countryCode} onValueChange={setCountryCode}>
          <SelectTrigger
            className="w-24 shrink-0"
            aria-label={t('Country code')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {phoneUtils.COUNTRY_CODES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          autoFocus
          type="tel"
          inputMode="tel"
          value={nationalNumber}
          onChange={(event) => {
            setErrorMessage(null);
            setNationalNumber(event.target.value);
          }}
          placeholder={t('Phone number')}
          data-testid="phone-binding-input"
        />
      </div>
      {errorMessage && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
      <CaptchaWidget
        onToken={setCaptchaToken}
        onUnavailable={handleCaptchaUnavailable}
        resetSignal={captchaReset}
      />
      <Button
        type="submit"
        loading={request.isPending}
        disabled={
          nationalNumber.trim().length === 0 ||
          (!captchaUnavailable && isNil(captchaToken))
        }
        data-testid="phone-binding-send"
      >
        {t('Send code')}
      </Button>
    </form>
  );
}

function requestErrorMessage(error: HttpError): string {
  if (captchaUtils.needsFreshToken(error)) {
    return t('That verification expired. Please try again.');
  }
  return (
    loginChallengeUtils.messageFor(error) ??
    t('Something went wrong, please try again later')
  );
}

export { PhoneBindingDialog };

type PhoneBindingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
