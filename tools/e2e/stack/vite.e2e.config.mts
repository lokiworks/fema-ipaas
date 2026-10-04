import { defineConfig, loadConfigFromFile, PluginOption } from 'vite';

export default defineConfig(async (env) => {
  const loaded = await loadConfigFromFile(
    env,
    new URL('../../../packages/web/vite.config.mts', import.meta.url).pathname,
  );
  const base = loaded?.config ?? {};
  return {
    ...base,
    cacheDir: process.env.FEMA_E2E_VITE_CACHE_DIR ?? base.cacheDir,
    plugins: withoutChecker(base.plugins ?? []),
    server: {
      ...base.server,
      watch: process.env.FEMA_E2E_VITE_WATCH === '1' ? base.server?.watch : null,
      hmr: process.env.FEMA_E2E_VITE_WATCH === '1' ? base.server?.hmr : false,
    },
  };
});

function withoutChecker(plugins: PluginOption[]): PluginOption[] {
  return plugins.flatMap((plugin): PluginOption[] => {
    if (Array.isArray(plugin)) {
      return [withoutChecker(plugin)];
    }
    const named = typeof plugin === 'object' && plugin !== null && 'name' in plugin;
    return named && String(plugin.name).startsWith('vite-plugin-checker')
      ? []
      : [plugin];
  });
}
