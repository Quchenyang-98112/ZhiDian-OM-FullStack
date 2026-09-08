import { join } from 'node:path';

export const API_RUNTIME_DIR =
  process.env.NEXUS_API_RUNTIME_DIR ?? join(process.cwd(), '.runtime', 'api');

export const DEAD_LETTER_QUEUE_PATH = join(API_RUNTIME_DIR, 'dead-letter.ndjson');
