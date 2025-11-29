import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Init Telegram (Redundant safety check)
const initTelegram = () => {
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      // Ensure color scheme is applied immediately to body to prevent white flash
      const scheme = window.Telegram.WebApp.colorScheme;
      if (scheme === 'dark') {
          document.documentElement.classList.add('dark');
      }
    } catch (e) {
      console.error("Error initializing Telegram WebApp:", e);
    }
  }
};

initTelegram();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

try {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
} catch (e: any) {
    console.error("React Render Error:", e);
    // Force showing the error on screen if React fails synchronously
    const errorContainer = document.getElementById('error-container');
    const errorMsg = document.getElementById('error-message');
    const loader = document.getElementById('app-loader');
    
    if (loader) loader.style.display = 'none'; // Hide loader
    
    if (errorContainer && errorMsg) {
        errorContainer.style.display = 'block';
        errorMsg.innerText = "React Render Error:\n" + e.message + "\n" + e.stack;
    }
}