import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';

import { RunbookStep } from '../utils/system-runbook';

export function RunbookSteps({ steps }: { steps: RunbookStep[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{step.title}</span>
              {step.description && (
                <span className="text-xs text-muted-foreground">
                  {step.description}
                </span>
              )}
            </div>
            {step.command && (
              <CopyToClipboardInput
                textToCopy={step.command}
                useInput={!step.command.includes('\n')}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
