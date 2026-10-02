import { t } from 'i18next';
import { PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { CenteredPage } from '@/app/components/centered-page';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  GenerateSolutionDialog,
  SolutionInstallsList,
  SolutionLibrary,
} from '@/features/solutions';

export function SolutionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [generating, setGenerating] = useState(false);
  const tab =
    searchParams.get(TAB_PARAM) === INSTALLED_TAB ? INSTALLED_TAB : LIBRARY_TAB;

  return (
    <CenteredPage
      title={t('Solutions')}
      description={t(
        'Ready-made sets of workflows and mapping tables. The install wizard walks you through connections, configuration and checks.',
      )}
      widthClassName="max-w-[72rem]"
      actions={
        <Button onClick={() => setGenerating(true)}>
          <PackagePlus className="size-4" />
          {t('Create solution from project')}
        </Button>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSearchParams(value === LIBRARY_TAB ? {} : { [TAB_PARAM]: value })
        }
        className="flex flex-col gap-4"
      >
        <TabsList>
          <TabsTrigger value={LIBRARY_TAB}>{t('Solution library')}</TabsTrigger>
          <TabsTrigger value={INSTALLED_TAB}>{t('Installed')}</TabsTrigger>
        </TabsList>
        <TabsContent value={LIBRARY_TAB}>
          <SolutionLibrary onGenerate={() => setGenerating(true)} />
        </TabsContent>
        <TabsContent value={INSTALLED_TAB}>
          <SolutionInstallsList onBrowse={() => setSearchParams({})} />
        </TabsContent>
      </Tabs>
      <GenerateSolutionDialog
        open={generating}
        onOpenChange={setGenerating}
        onCreated={(id) => navigate(`/solutions/${id}`)}
      />
    </CenteredPage>
  );
}

const TAB_PARAM = 'tab';
const LIBRARY_TAB = 'library';
const INSTALLED_TAB = 'installed';
