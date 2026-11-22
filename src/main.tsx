import 'leaflet/dist/leaflet.css';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import './safari-input.css';

registerSW({immediate: true});

createRoot(document.getElementById('root')!).render(<App />);
