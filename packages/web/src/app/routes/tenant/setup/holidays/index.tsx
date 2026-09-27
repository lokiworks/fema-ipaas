import { HolidayCalendar } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { FileUp } from 'lucide-react';
import { useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { CenteredPage } from '@/app/components/centered-page';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  scheduleFormat,
  triggerRuntimeHooks,
} from '@/features/trigger-runtime';

export function HolidayCalendarPage() {
  const { data: calendar, isLoading } =
    triggerRuntimeHooks.useHolidayCalendar();
  return (
    <CenteredPage
      title={t('Holiday calendar')}
      description={t(
        'Schedules that turn on "Skip public holidays" do not run on these dates. The calendar starts empty, so import the official dates for each year.',
      )}
    >
      {isLoading || !calendar ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <HolidayCalendarForm
          key={calendar.updated ?? 'empty'}
          calendar={calendar}
        />
      )}
    </CenteredPage>
  );
}

function HolidayCalendarForm({ calendar }: { calendar: HolidayCalendar }) {
  const { mutate: save, isPending } =
    triggerRuntimeHooks.useUpdateHolidayCalendar();
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useForm<HolidayFormValues>({
    resolver: zodResolver(HolidayFormSchema),
    mode: 'onChange',
    defaultValues: { text: calendar.dates.join('\n') },
  });
  const text = useWatch({ control: form.control, name: 'text' });
  const parsed = scheduleFormat.parseHolidayDates(text);
  const years = [...new Set(parsed.dates.map((date) => date.slice(0, 4)))];

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          save(scheduleFormat.parseHolidayDates(values.text).dates),
        )}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('Dates')}</CardTitle>
            <CardDescription>
              {t(
                'One date per line in YYYY-MM-DD format. You can paste a column from a spreadsheet or import a CSV file; other columns are ignored.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Holiday dates')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={12}
                      className="font-mono text-xs"
                      placeholder={'2026-10-01\n2026-10-02'}
                    />
                  </FormControl>
                  <FormDescription>
                    {parsed.dates.length === 0
                      ? t('No dates yet. Schedules will not skip any day.')
                      : t('{count} dates across {years}', {
                          count: parsed.dates.length,
                          years: years.join(', '),
                        })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                const imported = await file.text();
                form.setValue(
                  'text',
                  [text, imported]
                    .filter((part) => part.trim().length > 0)
                    .join('\n'),
                  { shouldDirty: true, shouldValidate: true },
                );
                event.target.value = '';
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp className="size-4" />
                {t('Import CSV')}
              </Button>
              <Button type="submit" loading={isPending}>
                {t('Save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

const HolidayFormSchema = z.object({
  text: z.string().superRefine((value, ctx) => {
    if (scheduleFormat.parseHolidayDates(value).invalid.length > 0) {
      ctx.addIssue({ code: 'custom', message: 'holidayDateInvalid' });
    }
  }),
});

type HolidayFormValues = z.infer<typeof HolidayFormSchema>;
