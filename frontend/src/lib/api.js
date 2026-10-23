import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "olabs_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && getToken() && !String(err.config?.url || "").includes("/auth/")) {
      setToken(null);
      window.location.hash = "#/entrar";
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

export const errMsg = (e, fallback = "Algo deu errado. Tente de novo.") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return fallback;
};

export const fileUrl = (id, inline = false) => `${API}/files/${id}/download?auth=${encodeURIComponent(getToken() || "")}${inline ? "&inline=true" : ""}`;
export const avatarUrl = (u) => `${API}/users/${u.id}/avatar?auth=${encodeURIComponent(getToken() || "")}&v=${u.avatar_v}`;

export default api;
