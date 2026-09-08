import axios from 'axios';

const api = axios.create({
  baseURL: `http://${window.location.hostname || 'localhost'}:8000/api/`,
});

export default api;
