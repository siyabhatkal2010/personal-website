import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Pages are pre-built as static HTML; only /api/* runs as a Vercel function.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  devToolbar: { enabled: false },
});
