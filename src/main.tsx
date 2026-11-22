import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { tabAlert } from './privacy/tabAlert';
import { session } from './session/session';
import './styles/app.css';

tabAlert.init();
session.onIncoming = () => tabAlert.incoming();
session.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
