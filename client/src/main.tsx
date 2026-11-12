import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SceneProvider } from './context/SceneContext';
import './index.css';
import './styles/monarch.css';
import './styles/glass.css';
import { setupServiceWorker } from './registerSW';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* "user": segue o "reduzir movimento" do sistema nas animações do framer-motion. */}
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <SceneProvider>
              <App />
            </SceneProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </MotionConfig>
  </React.StrictMode>,
);

setupServiceWorker();
