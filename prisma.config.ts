import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env.DATABASE_URL ??
  'mysql://root:rootpassword@localhost:3307/syncmove';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});