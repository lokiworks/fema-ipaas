import { t } from 'i18next';
import { ArrowLeft, ChevronRight, SearchX } from 'lucide-react';
import { useState } from 'react';

import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { HelpArticle, helpArticles } from '../lib/help-articles';
import { helpStore } from '../lib/help-store';

export function HelpDrawer() {
  const { helpOpen, articleId } = helpStore.useHelpState();
  const articles = helpArticles.list();
  const article = articles.find((item) => item.id === articleId) ?? null;
  return (
    <Sheet
      open={helpOpen}
      onOpenChange={(open) => {
        if (!open) {
          helpStore.closeHelp();
        }
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        {article ? (
          <ArticleView article={article} />
        ) : (
          <ArticleList key={helpOpen ? 'open' : 'closed'} articles={articles} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ArticleList({ articles }: { articles: HelpArticle[] }) {
  const [query, setQuery] = useState('');
  const matches = helpArticles.search({ articles, query });
  return (
    <>
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>{t('Help')}</SheetTitle>
        <SheetDescription>
          {t('Short guides for the most common tasks.')}
        </SheetDescription>
      </SheetHeader>
      <div className="px-5 pt-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('Search help articles')}
          autoFocus
        />
      </div>
      <ScrollArea className="flex-1 px-3 py-3">
        {matches.length === 0 ? (
          <div className="flex flex-col items-start gap-1 px-2 py-6">
            <SearchX className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('No matching articles')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('Try a shorter keyword.')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {matches.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => helpStore.showArticle(article.id)}
                className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left hover:bg-accent"
              >
                <article.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{article.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {article.body[0]}
                  </span>
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

function ArticleView({ article }: { article: HelpArticle }) {
  return (
    <>
      <SheetHeader className="flex flex-row items-center gap-2 border-b px-5 py-4">
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('Back to all articles')}
          onClick={() => helpStore.showArticle(null)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-col">
          <SheetTitle>{article.title}</SheetTitle>
          <SheetDescription>{t('Help')}</SheetDescription>
        </div>
      </SheetHeader>
      <ScrollArea className="flex-1 px-5 py-4">
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed">
          {article.body.map((paragraph) => (
            <li key={paragraph}>{paragraph}</li>
          ))}
        </ol>
      </ScrollArea>
    </>
  );
}
