import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('TWA: Entry point index.tsx started');

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("FATAL: Root element '#root' not found in DOM.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('TWA: React render triggered');
  } catch (err: any) {
    console.error("TWA: Failed to mount React app", err);
  }
}