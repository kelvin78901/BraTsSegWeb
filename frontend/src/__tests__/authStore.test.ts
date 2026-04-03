import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/authStore';

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();

    useAuthStore.setState({
      token: null,
      user: null,
      loading: false,
      error: null,
    });
  });

  it('initial state has null token and user', () => {
    const { token, user } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
  });

  it('logout clears token and user', () => {
    useAuthStore.setState({
      token: 'abc',
      user: { userId: 'D001', displayName: 'Dr. Test', institution: 'Test', caseRoot: '/' },
    });
    useAuthStore.getState().logout();
    const { token, user } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
    expect(localStorage.getItem('salynt_token')).toBeNull();
  });
});
