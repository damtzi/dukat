import { dbEnv } from '@dukat/env/db';
import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

export const db = drizzle(dbEnv.DATABASE_URL, { schema });
