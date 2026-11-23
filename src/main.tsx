import {StrictMode, Suspense, lazy, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loadFunFonts, loadThaiFont} from './fonts.ts';
import {rememberPass} from './lib/pool.ts';
import {StudentApp} from './student/StudentApp.tsx';
import './styles.css';
import './student-fun.css';
import './host-fun.css';

const HostApp = lazy(() => import('./host/HostApp.tsx'));

// Students use the plain URL (?w=123456 from the QR code); the teacher opens #host on the projector.
// Wk16 teacher link (Mew, 23 Nov 2026: no passcode box): #host?k=<passphrase> — this computer remembers the
// passphrase and the address bar goes back to plain #host at once, so it never shows on the projector.
const isHostHash = () => /^host(?:[?&]|$)/.test(location.hash.replace(/^#\/?/, ''));
function takeTeacherKey() {
  const m = location.hash.match(/^#\/?host[?&](?:.*&)?k=([^&]+)/);
  if (!m) return;
  rememberPass(decodeURIComponent(m[1]));
  history.replaceState(null, '', `${location.pathname}${location.search}#host`);
}
takeTeacherKey();
function useIsHost() {
  const [host, setHost] = useState(isHostHash);
  useEffect(() => {
    const on = () => {
      takeTeacherKey();
      setHost(isHostHash());
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return host;
}

function App() {
  const host = useIsHost();
  useEffect(() => {
    document.documentElement.classList.toggle('is-host', host);
  }, [host]);
  if (!host) return <StudentApp />;
  return (
    <Suspense fallback={<div className="screen center"><div className="spinner" /></div>}>
      <HostApp />
    </Suspense>
  );
}

loadThaiFont();
loadFunFonts();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
