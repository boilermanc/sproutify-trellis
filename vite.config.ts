import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: 'localhost',
      },
      plugins: [react()],
      define: {
        // API keys are fetched from Supabase tenant_secrets at runtime.
        // Do NOT inject secrets via Vite define — they end up in the client bundle.
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
