import { CreateOtpRequestBody, FlagId, OtpType } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

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
import { CheckEmailNote } from '@/features/authentication/components/check-email-note';
import { flagsHooks } from '@/hooks/flags-hooks';
import { HttpError } from '@/lib/api';

const FormSchema = z.object({
  email: z.string().min(1, t('Please enter your email')),
  type: CreateOtpRequestBody.shape.type,
});

type FormSchema = z.infer<typeof FormSchema>;

const ResetPasswordForm = () => {
  const [isSent, setIsSent] = useState<boolean>(false);
  const { data: smtpFlag } = flagsHooks.useFlag<boolean>(
    FlagId.SMTP_CONFIGURED,
  );
  const smtpConfigured = smtpFlag === true;
  const form = useForm<FormSchema>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: '',
      type: OtpType.PASSWORD_RESET,
    },
  });

  const { mutate, isPending } = useMutation<
    void,
    HttpError,
    CreateOtpRequestBody
  >({
    mutationFn: authenticationApi.sendOtpEmail,
    onSuccess: () => setIsSent(true),
  });

  const onSubmit: SubmitHandler<CreateOtpRequestBody> = (data) => {
    mutate(data);
  };

  return (
    <Card className="w-full max-w-md rounded-sm drop-shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">
          {isSent ? t('Check Your Inbox') : t('Reset Password')}
        </CardTitle>
        <CardDescription>
          {!smtpConfigured ? (
            <span>
              {t(
                'Email is not set up on this platform, so a reset link cannot be sent. Ask an administrator to reset your password in member management.',
              )}
            </span>
          ) : isSent ? (
            <CheckEmailNote
              email={form.getValues().email.trim().toLocaleLowerCase()}
              type={OtpType.PASSWORD_RESET}
            />
          ) : (
            <span>
              {t(
                `If the user exists we'll send you an email with a link to reset your password.`,
              )}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {smtpConfigured && !isSent && (
          <Form {...form}>
            <form className="grid ">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="w-full grid space-y-2">
                    <Label htmlFor="email">{t('Email')}</Label>
                    <Input
                      {...field}
                      id="email"
                      type="text"
                      placeholder={'email@example.com'}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="w-full mt-4"
                loading={isPending}
                onClick={(e) => form.handleSubmit(onSubmit)(e)}
              >
                {t('Send Password Reset Link')}
              </Button>
            </form>
          </Form>
        )}
        <div className="mt-4 text-center text-sm">
          <Link to="/sign-in" className="text-muted-foreground">
            {t('Back to sign in')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

ResetPasswordForm.displayName = 'ResetPassword';

export { ResetPasswordForm };
