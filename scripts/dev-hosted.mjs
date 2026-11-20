/**
 * npm run dev:hosted
 * Disable .env.local so Expo uses hosted credentials from .env,
 * then start the bundler with APP_VARIANT=development (dev client).
 */
import { spawn } from 'node:child_process';
import { disableLocalEnv } from './local-supabase-env.mjs';

disableLocalEnv();

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'start', '--clear'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_VARIANT: 'development',
    },
    shell: true,
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
