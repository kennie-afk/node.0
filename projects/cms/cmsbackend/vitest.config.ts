import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    pool: 'forks',
    fileParallelism: false
  },
  resolve: {
    alias: {
      '@models': path.resolve(__dirname, 'src/models/index.ts'),
      '@users': path.resolve(__dirname, 'src/users'),
      '@families': path.resolve(__dirname, 'src/families'),
      '@members': path.resolve(__dirname, 'src/members'),
      '@events': path.resolve(__dirname, 'src/events'),
      '@announcements': path.resolve(__dirname, 'src/announcements'),
      '@sermons': path.resolve(__dirname, 'src/sermons'),
      '@contributions': path.resolve(__dirname, 'src/contributions'),
      '@attendance': path.resolve(__dirname, 'src/attendance'),
      '@ministries': path.resolve(__dirname, 'src/ministries'),
      '@small_groups': path.resolve(__dirname, 'src/small_groups'),
      '@auth': path.resolve(__dirname, 'src/auth'),
      '@config': path.resolve(__dirname, 'src/config')
    }
  }
});
