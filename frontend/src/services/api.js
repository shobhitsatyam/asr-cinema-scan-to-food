import axios from 'axios';

const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
    return `http://${window.location.hostname}:5000/api`;
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 15000,
});

export default api;
