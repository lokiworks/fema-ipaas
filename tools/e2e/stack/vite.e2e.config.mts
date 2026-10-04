import { defineConfig, loadConfigFromFile } from 'vite';

export default defineConfig(async (env) => {
  const loaded = await loadConfigFromFile(
    env,
    new URL('../../../packages/web/vite.config.mts', import.meta.url).pathname,
  );
  const base = loaded?.config ?? {};
  return {
    ...base,
    server: { ...base.server, watch: null, hmr: false },
  };
});
