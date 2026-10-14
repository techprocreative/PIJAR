import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

// Runs before module decorators read DEV_MODE and JWT settings.
for (const envPath of [resolve(__dirname, '../.env'), resolve(__dirname, '../../../.env')]) {
  if (existsSync(envPath)) loadEnvFile(envPath);
}
