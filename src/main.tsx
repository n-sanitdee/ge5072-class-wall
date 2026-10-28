import {StrictMode, Suspense, lazy, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {loadFunFonts, loadThaiFont} from './fonts.ts';
import {StudentApp} from './student/StudentApp.tsx';
import './styles.css';
import './student-fun.css';

const HostApp = lazy(() => import('./host/HostApp.tsx'));

// Students use the plain URL (?w=123456 from the QR code); the teacher opens #host on the projector.
function useIsHost() {
  const [host, setHost] = useState(() => location.hash.replace(/^#\/?/, '') === 'host');
  useEffect(() => {
    const on = () => setHost(location.hash.replace(/^#\/?/, '') === 'host');
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
if (location.hash.replace(/^#\/?/, '') !== 'host') loadFunFonts();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
