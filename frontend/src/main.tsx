import {createRoot} from 'react-dom/client';
import {AppShell} from './shell/AppShell';
import './design-system/tokens.css';
import './styles.css';
import './design-system/sidebar.css';
createRoot(document.getElementById('root')!).render(<AppShell/>);
