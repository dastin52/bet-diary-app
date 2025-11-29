
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Init Telegram
const initTelegram = () => {
  if (window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      console.log("Telegram WebApp initialized successfully");
    } catch (e) {
      console.error("Error initializing Telegram WebApp:", e);
    }
  } else {
      console.log("Telegram WebApp not detected");
  }
};

initTelegram();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Wrap in try-catch to ensure we catch render errors
try {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    // Remove the loader once React starts rendering
    // We verify this by checking if root has content or simply scheduling removal
    requestAnimationFrame(() => {
        const loader = document.getElementById('app-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 500);
        }
    });

} catch (e: any) {
    console.error("React Render Error:", e);
    // Force showing the error on screen if React fails
    const errorContainer = document.getElementById('error-container');
    const errorMsg = document.getElementById('error-message');
    if (errorContainer && errorMsg) {
        errorContainer.style.display = 'block';
        errorMsg.innerText = "React Render Error:\n" + e.message + "\n" + e.stack;
    }
}
