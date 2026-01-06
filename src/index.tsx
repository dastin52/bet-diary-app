import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('TWA: JavaScript started');

// Применяем тему TG немедленно
if (window.Telegram?.WebApp) {
    const scheme = window.Telegram.WebApp.colorScheme;
    if (scheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
    const err = "Root element not found";
    console.error(err);
    if (window.logToBackend) window.logToBackend('error', err);
} else {
    const root = ReactDOM.createRoot(rootElement);
    try {
        root.render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
        console.log('TWA: React render called');
    } catch (e: any) {
        console.error("TWA: React Mount Error", e);
        if (window.logToBackend) window.logToBackend('error', 'React Mount Error: ' + e.message);
    }
}