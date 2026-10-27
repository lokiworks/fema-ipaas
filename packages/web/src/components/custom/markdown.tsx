import { MarkdownVariant } from '@fema-ipaas/shared';
import { Info, AlertTriangle, Lightbulb } from 'lucide-react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import breaks from 'remark-breaks';
import gfm from 'remark-gfm';

import { cn } from '@/lib/utils';

import { Alert, AlertDescription } from '../ui/alert';

import { CopyToClipboardInput } from './clipboard/copy-to-clipboard';

function applyVariables(markdown: string, variables: Record<string, string>) {
  if (typeof markdown !== 'string') {
    return '';
  }
  let result = markdown.split('<br>').join('\n');
  result = result.replace(/\{\{(.*?)\}\}/g, (_, variableName) => {
    return variables[variableName] ?? '';
  });
  return result;
}

function rowsForText({ text }: { text: string }) {
  return Math.min(
    Math.max(Math.ceil(text.length / CHARS_PER_ROW), 1),
    MAX_ROWS,
  );
}

const CHARS_PER_ROW = 30;
const MAX_ROWS = 4;

type MarkdownProps = {
  markdown: string | undefined;
  variables?: Record<string, string>;
  variant?: MarkdownVariant;
  className?: string;
  loading?: string;
};

const Container = ({
  variant,
  children,
}: {
  variant?: MarkdownVariant;
  children: React.ReactNode;
}) => {
  return (
    <Alert
      className={cn('rounded-md border', {
        'dark:bg-amber-950 bg-amber-50  border-none dark:text-amber-600 text-amber-700':
          variant === MarkdownVariant.WARNING,
        'bg-success-100 text-success-300 border-none':
          variant === MarkdownVariant.TIP,
        'p-0 bg-transparent border-none':
          variant === MarkdownVariant.BORDERLESS,
      })}
    >
      {variant !== MarkdownVariant.BORDERLESS && (
        <>
          {(variant === MarkdownVariant.INFO || variant === undefined) && (
            <Info className="w-4 h-4 mt-1" />
          )}
          {variant === MarkdownVariant.WARNING && (
            <AlertTriangle className="w-4 h-4 mt-1 stroke-amber-700" />
          )}
          {variant === MarkdownVariant.TIP && (
            <Lightbulb className="w-4 h-4 mt-1" />
          )}
        </>
      )}
      <AlertDescription className="grow w-full">{children}</AlertDescription>
    </Alert>
  );
};

const Markdown = React.memo(
  ({ markdown, variables, variant, className, loading }: MarkdownProps) => {
    if (loading && loading.length > 0) {
      return (
        <Container variant={variant}>
          <div className="flex items-center gap-2">{loading}</div>
        </Container>
      );
    }

    if (!markdown) {
      return null;
    }

    const markdownProcessed = applyVariables(markdown, variables ?? {});

    return (
      <Container variant={variant}>
        <ReactMarkdown
          className={cn('grow w-full ', className)}
          remarkPlugins={[gfm, breaks]}
          components={{
            code({ node: _node, ref: _ref, ...props }) {
              const isLanguageText = props.className?.includes('language-text');
              if (!isLanguageText) {
                return <code {...props} className="text-wrap" />;
              }
              const codeContent = String(props.children).trim();
              return (
                <CopyToClipboardInput
                  textToCopy={codeContent}
                  useInput={false}
                  rows={rowsForText({ text: codeContent })}
                />
              );
            },
            h1: ({ node: _node, ref: _ref, ...props }) => (
              <h1
                className="scroll-m-20 text-xl font-extrabold tracking-tight lg:text-3xl"
                {...props}
              />
            ),
            h2: ({ node: _node, ref: _ref, ...props }) => (
              <h2
                className="scroll-m-20 text-lg text-xl font-semibold tracking-tight first:mt-0"
                {...props}
              />
            ),
            h3: ({ node: _node, ref: _ref, ...props }) => (
              <h3
                className="scroll-m-20 text-lg font-semibold tracking-tight"
                {...props}
              />
            ),
            p: ({ node: _node, ref: _ref, ...props }) => (
              <p
                className="leading-5 first-of-type:mt-1 not-first-of-type:mt-2 w-full mb-2"
                {...props}
              />
            ),
            ul: ({ node: _node, ref: _ref, ...props }) => (
              <ul className="mt-4 ml-6 list-disc [&>li]:mt-2" {...props} />
            ),
            ol: ({ node: _node, ref: _ref, ...props }) => (
              <ol className="mt-4 ml-6 list-decimal [&>li]:mt-2" {...props} />
            ),
            li: ({ node: _node, ref: _ref, ...props }) => <li {...props} />,
            a: ({ node: _node, ref: _ref, ...props }) => (
              <a
                className="font-medium text-primary underline underline-offset-4"
                target="_blank"
                rel="noreferrer noopener"
                {...props}
              />
            ),
            blockquote: ({ node: _node, ref: _ref, ...props }) => (
              <blockquote
                className="mt-4 first:mt-0 border-l-2 pl-6 italic"
                {...props}
              />
            ),
            hr: ({ node: _node, ref: _ref, ...props }) => (
              <hr className="my-4 border-t border-border/50" {...props} />
            ),
            img: ({ node: _node, ref: _ref, ...props }) => (
              <img className="my-8" {...props} />
            ),
            b: ({ node: _node, ref: _ref, ...props }) => <b {...props} />,
            em: ({ node: _node, ref: _ref, ...props }) => <em {...props} />,
            table: ({ node: _node, ref: _ref, ...props }) => (
              <table className="w-full my-4 border-collapse" {...props} />
            ),
            thead: ({ node: _node, ref: _ref, ...props }) => (
              <thead className="bg-muted" {...props} />
            ),
            tr: ({ node: _node, ref: _ref, ...props }) => (
              <tr className="border-b border-border" {...props} />
            ),
            th: ({ node: _node, ref: _ref, ...props }) => (
              <th className="text-left p-2 font-medium" {...props} />
            ),
            td: ({ node: _node, ref: _ref, ...props }) => (
              <td className="p-2" {...props} />
            ),
          }}
        >
          {markdownProcessed.trim()}
        </ReactMarkdown>
      </Container>
    );
  },
);

Markdown.displayName = 'Markdown';
export { Markdown };
