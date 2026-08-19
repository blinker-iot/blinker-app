import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@ionic\/angular/, /@ionic\/core/],
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@ionic\/core\/components$/,
        replacement: fileURLToPath(
          new URL('./node_modules/@ionic/core/components/index.js', import.meta.url),
        ),
      },
    ],
  },
});
