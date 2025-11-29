import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('App: JS Entry point loaded');

// Init Telegram (Redundant safety check)
const initTelegram = () => {
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      console.log('App: Telegram WebApp Ready signal sent');
      // Ensure color scheme is applied immediately to body to prevent white flash
      const scheme = window.Telegram.WebApp.colorScheme;
      if (scheme === 'dark') {
          document.documentElement.classList.add('dark');
      }
    } catch (e) {
      console.error("Error initializing Telegram WebApp:", e);
    }
  } else {
      console.warn("App: Telegram WebApp object not found on window");
  }
};

initTelegram();

const rootElement = document.getElementById('root');
if (!rootElement) {
  const msg = "Could not find root element to mount to";
  console.error(msg);
  // @ts-ignore
  if(window.showOnScreenError) window.showOnScreenError(msg);
  throw new Error(msg);
}

const root = ReactDOM.createRoot(rootElement);

try {
    console.log('App: Attempting to render React root');
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('App: React render called successfully');
} catch (e: any) {
    console.error("React Render Error:", e);
    // @ts-ignore
    if(window.showOnScreenError) window.showOnScreenError("Render Crash: " + e.message);
    
    // Force showing the error on screen if React fails synchronously
    const loader = document.getElementById('app-loader');
    if (loader) loader.style.display = 'none'; // Hide loader
}