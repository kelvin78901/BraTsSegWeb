import { create } from 'zustand';
import { apiPost, apiFetch } from '../api/client';

interface UserInfo {
  userId: string;
  displayName: string;
  institution: string;
  caseRoot: string;
  role?: string;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

function loadUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem('salynt_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: localStorage.getItem('salynt_token'),
  user: loadUser(),
  loading: false,
  error: null,

  async login(username, password) {
    set({ loading: true, error: null });
    try {
      const data = await apiPost<{
        ok: boolean;
        token?: string;
        userId?: string;
        displayName?: string;
        institution?: string;
        caseRoot?: string;
        role?: string;
        error?: string;
      }>('/api/auth/login', { username, password });

      if (data.ok && data.token) {
        const user: UserInfo = {
          userId: data.userId || username,
          displayName: data.displayName || username,
          institution: data.institution || '',
          caseRoot: data.caseRoot || '',
          role: data.role,
        };
        localStorage.setItem('salynt_token', data.token);
        localStorage.setItem('salynt_user', JSON.stringify(user));
        set({ token: data.token, user, loading: false });
        return true;
      }
      set({ error: data.error || 'Login failed', loading: false });
      return false;
    } catch (e) {
      set({ error: String(e), loading: false });
      return false;
    }
  },

  logout() {
    const token = get().token;
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('salynt_token');
    localStorage.removeItem('salynt_user');
    set({ token: null, user: null });
  },

  async checkAuth() {
    const token = get().token;
    if (!token) return false;
    try {
      const data = await apiFetch<{ ok: boolean }>('/api/auth/me');
      if (data.ok) return true;
      get().logout();
      return false;
    } catch {
      return false;
    }
  },
}));
