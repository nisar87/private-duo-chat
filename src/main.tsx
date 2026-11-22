import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { tabAlert } from './privacy/tabAlert';
import { session } from './session/session';
import { applyLook, getSettings, subscribe } from './settings/settings';
import './styles/app.css';

applyLook(getSettings());
subscribe(() => applyLook(getSettings()));
tabAlert.init();
session.onIncoming = () => tabAlert.incoming();
session.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
