import { FlagId, ResetPasswordRequestBody } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useRef, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { authenticationApi } from '@/api/authentication-api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { PasswordRequirementsList } from '@/features/authentication/components/password-validator';
import { passwordValidation } from '@/features/authentication/utils/password-validation-utils';
import { flagsHooks } from '@/hooks/flags-hooks';

import { authMutations } from '../hooks/auth-hooks';

const ChangePasswordForm = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const otp = queryParams.get('otpcode') ?? '';
  const identityId = queryParams.get('identityId') ?? '';
  const hasLinkParams = otp.length > 0 && identityId.length > 0;
  const { data: linkCheck, isLoading } = useQuery({
    queryKey: ['reset-password-link', identityId, otp],
    queryFn: () =>
      authenticationApi.checkResetPasswordLink({ identityId, otp }),
    enabled: hasLinkParams,
    retry: false,
    staleTime: Infinity,
  });
  if (hasLinkParams && isLoading) {
    return (
      <Card
        className="w-full max-w-md rounded-sm drop-shadow-xl"
        data-testid="reset-link-checking"
      >
        <CardHeader>
          <CardTitle className="text-2xl">{t('Reset Password')}</CardTitle>
          <CardDescription>{t('Checking the reset link…')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!hasLinkParams || linkCheck?.valid === false) {
    return <ExpiredResetLink />;
  }
  return <NewPasswordForm otp={otp} identityId={identityId} />;
};

const ExpiredResetLink = () => {
  const { data: smtpFlag } = flagsHooks.useFlag<boolean>(
    FlagId.SMTP_CONFIGURED,
  );
  const smtpConfigured = smtpFlag === true;
  return (
    <Card
      className="w-full max-w-md rounded-sm drop-shadow-xl"
      data-testid="reset-link-expired"
    >
      <CardHeader>
        <CardTitle className="text-2xl">
          {t('This reset link no longer works')}
        </CardTitle>
        <CardDescription>
          {smtpConfigured
            ? t(
                'The link has expired, has already been used, or is incomplete. Request a new reset email and use the latest link within 10 minutes.',
              )
            : t(
                'The link has expired, has already been used, or is incomplete. Email is not set up on this platform, so a new link cannot be sent. Ask an administrator to reset your password in Members.',
              )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {smtpConfigured && (
          <Button asChild className="w-full">
            <Link to="/forget-password">{t('Request a new link')}</Link>
          </Button>
        )}
        <Button
          asChild
          variant={smtpConfigured ? 'ghost' : 'default'}
          className="w-full"
        >
          <Link to="/sign-in">{t('Back to sign in')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
};

const NewPasswordForm = ({
  otp,
  identityId,
}: {
  otp: string;
  identityId: string;
}) => {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [isPasswordFocused, setPasswordFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const form = useForm<{
    otp: string;
    identityId: string;
    newPassword: string;
  }>({
    defaultValues: {
      otp,
      identityId,
      newPassword: '',
    },
  });

  const { mutate, isPending } = authMutations.useResetPassword({
    onSuccess: () => {
      toast.success(t('Your password was changed successfully'), {
        duration: 3000,
      });
      navigate('/sign-in');
    },
    onError: (error) => {
      setServerError(
        t('Your password reset request has expired, please request a new one'),
      );
      console.error(error);
    },
  });

  const onSubmit: SubmitHandler<ResetPasswordRequestBody> = (data) => {
    mutate(data);
  };

  return (
    <Card className="w-full max-w-md rounded-sm drop-shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">{t('Reset Password')}</CardTitle>
        <CardDescription>{t('Enter your new password')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="grid gap-2">
            <FormField
              control={form.control}
              name="newPassword"
              rules={{
                required: t('Password is required'),
                validate: passwordValidation,
              }}
              render={({ field }) => (
                <FormItem
                  className="grid space-y-2"
                  onClick={() => inputRef?.current?.focus()}
                  onFocus={() => setPasswordFocused(true)}
                >
                  <Label htmlFor="newPassword">{t('Password')}</Label>
                  <Popover open={isPasswordFocused}>
                    <PopoverTrigger asChild>
                      <Input
                        {...field}
                        required
                        id="newPassword"
                        type="password"
                        placeholder={t('Enter a new password')}
                        className="rounded-sm"
                        ref={inputRef}
                        onBlur={() => setPasswordFocused(false)}
                        onChange={(e) => field.onChange(e)}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="absolute border-2 bg-background p-2 rounded-md right-60 -bottom-16 flex flex-col">
                      <PasswordRequirementsList
                        password={form.getValues().newPassword}
                        isSubmitted={form.formState.submitCount > 0}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            {serverError && <FormMessage>{serverError}</FormMessage>}
            <Button
              className="w-full mt-2"
              loading={isPending}
              onClick={(e) => form.handleSubmit(onSubmit)(e)}
            >
              {t('Confirm')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export { ChangePasswordForm };
