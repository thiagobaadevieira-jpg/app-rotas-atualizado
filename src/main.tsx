import 'leaflet/dist/leaflet.css';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import './safari-input.css';

const swReloadKey = 'ri_sw_reload_at';
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const lastReload = Number(sessionStorage.getItem(swReloadKey) || 0);
    if (Date.now() - lastReload < 10000) return;
    sessionStorage.setItem(swReloadKey, String(Date.now()));
    window.location.reload();
  });
}

const askWaitingWorkerToTakeOver = (registration: ServiceWorkerRegistration) => {
  registration.waiting?.postMessage({type: 'SKIP_WAITING'});
};

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    askWaitingWorkerToTakeOver(registration);
    const check = () => {
      void registration.update().then(() => askWaitingWorkerToTakeOver(registration));
    };
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) askWaitingWorkerToTakeOver(registration);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.setInterval(check, 60 * 60 * 1000);
    check();
  },
});

createRoot(document.getElementById('root')!).render(<App />);

