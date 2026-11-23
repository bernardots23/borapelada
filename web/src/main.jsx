import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ProvedorApp } from './contexto.jsx';
import App from './App.jsx';
import './estilo.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProvedorApp>
        <App />
      </ProvedorApp>
    </BrowserRouter>
  </React.StrictMode>,
);
