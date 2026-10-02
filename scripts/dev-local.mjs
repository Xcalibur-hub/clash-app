/**
 * npm run dev:local
 * 1) Write .env.local from local supabase status
 * 2) adb reverse API port
 * 3) expo start with APP_VARIANT=development
 *
 * Never used by EAS — local developer workflow only.
 */
import { spawn } from 'node:child_process';
import { writeLocalEnv, adbReverseSupabase } from './local-supabase-env.mjs';

writeLocalEnv();
try {
  adbReverseSupabase();
} catch (error) {
  console.warn(String(error?.message ?? error));
  console.warn('Continuing without adb reverse — emulator/localhost may still work.');
}

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
