/**
 * React Entry Point
 *
 * Initializes the React application
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './components/App';

console.log('[React] Initializing application...');
const root = ReactDOM.createRoot(document.getElementById('root'));
console.log('[React] Root created, rendering App...');

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('[React] App rendered successfully!');
