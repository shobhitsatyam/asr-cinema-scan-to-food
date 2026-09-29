import axios from 'axios';

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && (envUrl.includes('onrender.com') || envUrl.startsWith('https:') || import.meta.env.PROD)) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location.hostname) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)) {
      return `http://${window.location.hostname}:5000/api`;
    }
  }
  return envUrl || 'http://localhost:5000/api';
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 15000,
});

export default api;
