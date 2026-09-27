import {
  BlueprintInput,
  BlueprintInputControl,
  BlueprintOptionsSource,
  blueprintProblems,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListPlusIcon,
  PenLineIcon,
  TriangleAlertIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';

import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  BlueprintInputDrawer,
  OperationOption,
} from './blueprint-input-drawer';
import { blueprintInputProblemMessages } from './blueprint-input-problem-messages';

export function BlueprintInputsTable({
  title,
  hint,
  inputs,
  operationOptions,
  problemOperationKeys,
  onChange,
}: {
  title: string;
  hint?: React.ReactNode;
  inputs: BlueprintInput[];
  operationOptions: OperationOption[];
  problemOperationKeys: string[];
  onChange: (inputs: BlueprintInput[]) => void;
}) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const drawerOpen = editIndex !== null;
  const editing =
    editIndex !== null && editIndex >= 0 ? inputs[editIndex] : null;

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= inputs.length) {
      return;
    }
    const next = [...inputs];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };
  const remove = (index: number) => {
    onChange(inputs.filter((_, current) => current !== index));
  };
  const save = (input: BlueprintInput) => {
    if (editIndex !== null && editIndex >= 0) {
      onChange(
        inputs.map((current, index) => (index === editIndex ? input : current)),
      );
    } else {
      onChange([...inputs, input]);
    }
    setEditIndex(null);
  };

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        <div className="flex items-center gap-2">
          {inputs.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('Use the arrows to reorder fields')}
            </span>
          )}
          <Button size="sm" onClick={() => setEditIndex(-1)}>
            {t('Add field')}
          </Button>
        </div>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {inputs.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <ListPlusIcon />
          </EmptyMedia>
          <EmptyTitle>{t('No fields yet')}</EmptyTitle>
          <EmptyDescription>
            {t('Once you add a field, the node panel shows a matching input')}
          </EmptyDescription>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t('Order')}</TableHead>
              <TableHead>{t('Field')}</TableHead>
              <TableHead className="w-36">{t('Control · Type')}</TableHead>
              <TableHead className="w-16">{t('Required')}</TableHead>
              <TableHead className="w-28">{t('Source')}</TableHead>
              <TableHead className="w-20 text-right">{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inputs.map((input, index) => {
              const problems = blueprintProblems.input({
                input,
                operationKeys: problemOperationKeys,
              });
              return (
                <TableRow key={input.key}>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        disabled={index === 0}
                        aria-label={t('Move up')}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        disabled={index === inputs.length - 1}
                        aria-label={t('Move down')}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className="flex flex-col">
                        <span>{input.label}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {input.key}
                        </span>
                      </div>
                      {problems.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TriangleAlertIcon className="size-3.5 shrink-0 text-warning" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <ul className="list-disc pl-3">
                              {blueprintInputProblemMessages
                                .listOf(problems)
                                .map((message) => (
                                  <li key={message}>{message}</li>
                                ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{controlLabel(input)}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {input.type}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{input.required ? t('Yes') : t('No')}</TableCell>
                  <TableCell>
                    {input.optionsSource ===
                    BlueprintOptionsSource.OPERATION ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default text-xs text-info-700">
                            {t('Dynamic dropdown')}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {input.optionsOperation
                            ? t('Options come from operation {name}', {
                                name:
                                  operationOptions.find(
                                    (option) =>
                                      option.key === input.optionsOperation,
                                  )?.name ?? input.optionsOperation,
                              })
                            : t('No operation chosen to provide options yet')}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t('Entered value')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={t('Edit')}
                        onClick={() => setEditIndex(index)}
                      >
                        <PenLineIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={t('Delete')}
                        onClick={() => remove(index)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <BlueprintInputDrawer
        open={drawerOpen}
        initial={editing}
        taken={inputs
          .filter((_, index) => index !== editIndex)
          .map((input) => input.key)}
        operationOptions={operationOptions}
        onClose={() => setEditIndex(null)}
        onSave={save}
      />
    </section>
  );
}

function controlLabel(input: BlueprintInput): string {
  switch (input.control) {
    case BlueprintInputControl.TEXT:
      return t('Text input');
    case BlueprintInputControl.DROPDOWN:
      return t('Dropdown');
    case BlueprintInputControl.CODE:
      return t('Code');
    case BlueprintInputControl.SWITCH:
      return t('Switch');
  }
}
