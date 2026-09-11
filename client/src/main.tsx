import { appUrl } from './app-url';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './terminal-theme.css';
document.documentElement.style.setProperty(
  '--dawn-hangar-art',
  `url("${appUrl('assets/hangar-dawn.png')}")`,
);
document.documentElement.style.setProperty(
  '--dawn-terminal-icons',
  `url("${appUrl('identity/terminal-icons.png')}")`,
);
createRoot(document.getElementById('root')!).render(<App />);
