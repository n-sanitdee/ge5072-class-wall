import {type FirebaseApp, type FirebaseOptions, initializeApp} from 'firebase/app';
import {type Database, connectDatabaseEmulator, getDatabase} from 'firebase/database';

export type Backend = {config: FirebaseOptions; emulatorHost?: string};

/** Local emulator ports (firebase.json). Not Hakoot's 9000/9099, so both projects' emulators can run at once. */
export const EMU_DB_PORT = 9010;
export const EMU_AUTH_PORT = 9109;

/** Config for the local Firebase emulators (no Google account needed). */
export const EMULATOR_CONFIG: FirebaseOptions = {
  apiKey: 'demo-key',
  projectId: 'demo-classwall',
  databaseURL: `http://127.0.0.1:${EMU_DB_PORT}/?ns=demo-classwall-default-rtdb`,
  authDomain: 'demo-classwall.firebaseapp.com',
};

/** One app = one database connection. Tests open many apps in one process, hence the name. */
export function openDatabase(backend: Backend, name?: string): {app: FirebaseApp; db: Database} {
  const app = initializeApp(backend.config, name);
  const db = getDatabase(app);
  if (backend.emulatorHost) connectDatabaseEmulator(db, backend.emulatorHost, EMU_DB_PORT);
  return {app, db};
}

/** Anonymous sign-in for the host only (players never sign in). */
export async function signInHost(app: FirebaseApp, backend: Backend): Promise<string> {
  const {getAuth, connectAuthEmulator, signInAnonymously} = await import('firebase/auth');
  const auth = getAuth(app);
  if (backend.emulatorHost && !auth.emulatorConfig) {
    connectAuthEmulator(auth, `http://${backend.emulatorHost}:${EMU_AUTH_PORT}`, {disableWarnings: true});
  }
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  return (await signInAnonymously(auth)).user.uid;
}
