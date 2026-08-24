import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorDialog } from '@/components/custom/error-dialog/error-dialog';
import { EmbeddingProvider } from '@/components/providers/embed-provider';
import TelemetryProvider from '@/components/providers/telemetry-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import { EmbeddingFontLoader } from './components/embedding-font-loader';
import { GlobalErrorBoundary } from './components/global-error-boundary';
import { InitialDataGuard } from './components/initial-data-guard';
import { AppRouter } from './guards';
import { queryClient } from './query-client';

export function App() {
  const { i18n } = useTranslation();
  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <EmbeddingProvider>
          <InitialDataGuard>
            <EmbeddingFontLoader>
              <TelemetryProvider>
                <TooltipProvider>
                  <React.Fragment key={i18n.language}>
                    <ThemeProvider storageKey="vite-ui-theme">
                      <AppRouter />
                      <Toaster position="bottom-right" />
                      <ErrorDialog />
                    </ThemeProvider>
                  </React.Fragment>
                </TooltipProvider>
              </TelemetryProvider>
            </EmbeddingFontLoader>
          </InitialDataGuard>
        </EmbeddingProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
