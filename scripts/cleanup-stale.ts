// Fallback: delete walls older than 6 hours (run hourly by .github/workflows/cleanup.yml). The boards site's
// archiver (ge5072-ladpet-boards) saves and deletes walls at 3 h; this only catches what it missed.
// Signs in as a throw-away anonymous user, deletes stale walls, then deletes that user. No secrets needed.
// CLEANUP_EMULATOR=1 runs it against the local emulators (for testing).
import {deleteApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {onValue, ref} from 'firebase/database';
import {firebaseConfig} from '../src/firebase-config.ts';
import {EMULATOR_CONFIG, openDatabase, signInHost} from '../src/lib/fb.ts';
import {FALLBACK_STALE_MS} from '../src/lib/types.ts';
import {WallHost} from '../src/lib/wall-host.ts';

const emu = process.env.CLEANUP_EMULATOR === '1';
const backend = emu ? {config: EMULATOR_CONFIG, emulatorHost: '127.0.0.1'} : {config: firebaseConfig};

const {app, db} = openDatabase(backend);
await signInHost(app, backend);
try {
  const offset = await new Promise<number>((resolve) => {
    const off = onValue(ref(db, '.info/serverTimeOffset'), (s) => {
      off();
      resolve(s.val() ?? 0);
    });
  });
  const n = await WallHost.cleanupStale(db, Date.now() + offset - 4 * 60 * 1000, FALLBACK_STALE_MS);
  console.log(`Deleted ${n} stale wall(s).`);
} finally {
  await getAuth(app).currentUser?.delete().catch((e) => console.warn('Could not delete the temporary user:', e.message));
  await deleteApp(app);
}
process.exit(0);
