
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Initialize Telegram Web App SDK immediately.
// This is critical to remove the loading spinner in Telegram.
const initTelegram = () => {
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      
      // Optional: Set header color to match app theme if possible (v6.1+)
      if (window.Telegram.WebApp.setHeaderColor) {
         // We can default to a neutral color or rely on theme params
         // window.Telegram.WebApp.setHeaderColor('#ffffff'); 
      }
    } catch (e) {
      console.error("Error initializing Telegram WebApp:", e);
    }
  }
};

// Call it before rendering React
initTelegram();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
