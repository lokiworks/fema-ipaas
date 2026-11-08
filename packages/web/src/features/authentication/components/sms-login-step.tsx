import { ErrorCode, isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { Phone } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
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
import { authenticationSession } from '@/lib/authentication-session';
import { useRedirectAfterLogin } from '@/lib/navigation-utils';

import { authMutations } from '../hooks/auth-hooks';
import { captchaUtils } from '../utils/captcha-utils';
import {
  LoginChallenge,
  loginChallengeUtils,
} from '../utils/login-challenge-utils';
import { phoneUtils } from '../utils/phone-utils';

import { BackLink, Heading } from './auth-landing/auth-drawer-parts';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

function SmsLoginStep({
  captchaToken,
  captchaRequired,
  onCaptchaSpent,
  onBack,
  onNeedsName,
  onChallenge,
}: SmsLoginStepProps) {
  const [countryCode, setCountryCode] = useState(
    phoneUtils.DEFAULT_COUNTRY_CODE,
  );
  const [nationalNumber, setNationalNumber] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phoneDisabled, setPhoneDisabled] = useState(false);

  const { mutate: requestCode, isPending: isRequesting } =
    authMutations.useRequestSmsCode({
      onSuccess: () => {
        onCaptchaSpent();
      },
      onError: (error) => {
        onCaptchaSpent();
        if (loginChallengeUtils.isForbidden(error)) {
          setPhoneDisabled(true);
          return;
        }
        setErrorMessage(requestErrorMessage(error));
      },
    });

  const submitPhone = () => {
    const phone = phoneUtils.normalize({ countryCode, nationalNumber });
    if (!phoneUtils.isValid(phone)) {
      setErrorMessage(t('Enter a valid phone number.'));
      return;
    }
    setErrorMessage(null);
    requestCode(
      { phone, captchaToken },
      {
        onSuccess: () => setSentTo(phone),
      },
    );
  };

  if (phoneDisabled) {
    return <PhoneDisabledNotice onBack={onBack} />;
  }

  if (sentTo !== null) {
    return (
      <SmsCodeEntry
        phone={sentTo}
        captchaToken={captchaToken}
        captchaRequired={captchaRequired}
        onCaptchaSpent={onCaptchaSpent}
        onBack={() => setSentTo(null)}
        onPhoneDisabled={() => setPhoneDisabled(true)}
        onNeedsName={onNeedsName}
        onChallenge={onChallenge}
      />
    );
  }

  return (
    <>
      <BackLink onClick={onBack} />
      <Heading
        title={t('Sign in with your phone')}
        subtitle={t('We will text a 6-digit code to this number.')}
      />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitPhone();
        }}
      >
        <div className="flex gap-2">
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger
              className="h-12 w-24 shrink-0 rounded-lg"
              aria-label={t('Country code')}
              data-testid="sms-country-code"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {phoneUtils.COUNTRY_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Phone className="absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={nationalNumber}
              onChange={(event) => {
                setErrorMessage(null);
                setNationalNumber(event.target.value);
              }}
              placeholder={t('Phone number')}
              className="h-12 rounded-lg pl-11 text-[15px]"
              data-testid="sms-phone"
            />
          </div>
        </div>
        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
        <Button
          type="submit"
          loading={isRequesting}
          disabled={
            nationalNumber.trim().length === 0 ||
            (captchaRequired && isNil(captchaToken))
          }
          className="h-11 rounded-lg"
          data-testid="sms-send"
        >
          {t('Send code')}
        </Button>
      </form>
    </>
  );
}

function SmsCodeEntry({
  phone,
  captchaToken,
  captchaRequired,
  onCaptchaSpent,
  onBack,
  onPhoneDisabled,
  onNeedsName,
  onChallenge,
}: SmsCodeEntryProps) {
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const redirectAfterLogin = useRedirectAfterLogin();

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const { mutate: verify, isPending: isVerifying } =
    authMutations.useVerifySmsCode({
      onSuccess: (data) => {
        authenticationSession.saveResponse(data, false);
        if (isNil(data.projectId)) {
          onNeedsName();
          return;
        }
        redirectAfterLogin();
      },
      onError: (error) => {
        setCode('');
        const challenge = loginChallengeUtils.parse(error);
        if (challenge !== null) {
          onChallenge(challenge);
          return;
        }
        if (loginChallengeUtils.isForbidden(error)) {
          onPhoneDisabled();
          return;
        }
        setErrorMessage(verifyErrorMessage(error));
      },
    });

  const { mutate: resend, isPending: isResending } =
    authMutations.useRequestSmsCode({
      onSuccess: () => {
        onCaptchaSpent();
        setCooldown(RESEND_COOLDOWN_SECONDS);
      },
      onError: (error) => {
        onCaptchaSpent();
        if (loginChallengeUtils.isForbidden(error)) {
          onPhoneDisabled();
          return;
        }
        setErrorMessage(requestErrorMessage(error));
      },
    });

  const handleChange = (value: string) => {
    setErrorMessage(null);
    setCode(value);
    if (value.length === CODE_LENGTH) {
      verify({ phone, code: value });
    }
  };

  return (
    <>
      <BackLink onClick={onBack} />
      <Heading
        title={t('Enter your code')}
        subtitle={t('We sent a 6-digit code to {phone}', {
          phone: phoneUtils.mask(phone),
        })}
      />
      <div className="flex flex-col items-center gap-4">
        <InputOTP
          maxLength={CODE_LENGTH}
          value={code}
          onChange={handleChange}
          disabled={isVerifying}
          autoFocus
          data-testid="sms-code"
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
        <button
          type="button"
          disabled={
            cooldown > 0 ||
            isResending ||
            (captchaRequired && isNil(captchaToken))
          }
          onClick={() => resend({ phone, captchaToken })}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {cooldown > 0
            ? t('Resend code in {seconds}s', { seconds: cooldown })
            : t('Resend code')}
        </button>
      </div>
    </>
  );
}

function PhoneDisabledNotice({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Heading title={t('Phone sign-in is turned off')} />
      <p
        className="text-center text-sm text-muted-foreground"
        role="alert"
        data-testid="sms-phone-disabled"
      >
        {t(
          'This organization has not turned on phone sign-in. Use another sign-in method.',
        )}
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-6 h-11 w-full rounded-lg"
        onClick={onBack}
        data-testid="sms-use-other-method"
      >
        {t('Use another sign-in method')}
      </Button>
    </>
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

function verifyErrorMessage(error: HttpError): string {
  if (loginChallengeUtils.errorCode(error) === ErrorCode.INVALID_OTP) {
    return t('That code is invalid or expired. Try again.');
  }
  return (
    loginChallengeUtils.messageFor(error) ??
    t('Something went wrong, please try again later')
  );
}

export { SmsLoginStep };

type SmsStepSharedProps = {
  captchaToken: string | undefined;
  captchaRequired: boolean;
  onCaptchaSpent: () => void;
  onBack: () => void;
  onNeedsName: () => void;
  onChallenge: (challenge: LoginChallenge) => void;
};

type SmsLoginStepProps = SmsStepSharedProps;

type SmsCodeEntryProps = SmsStepSharedProps & {
  phone: string;
  onPhoneDisabled: () => void;
};
