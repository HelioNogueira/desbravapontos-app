import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('desbravapontos_token') || null);
  const [loading, setLoading] = useState(true);

  // Carregar usuário logado inicial
  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.getMe();
        setUser(data.user);
      } catch (err) {
        console.warn('Sessão expirada:', err);
        logout();
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [token]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('desbravapontos_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (userData) => {
    const data = await api.register(userData);
    localStorage.setItem('desbravapontos_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const loginWithGoogle = async (googlePayload) => {
    const data = await api.loginWithGoogle(googlePayload);
    if (data.token && data.user) {
      localStorage.setItem('desbravapontos_token', data.token);
      setToken(data.token);
      setUser(data.user);
    }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('desbravapontos_token');
    setToken(null);
    setUser(null);
  };

  const updateUserBalance = (newBalance) => {
    setUser(prev => prev ? { ...prev, points_balance: newBalance } : null);
  };

  const updateProfile = async (profileData) => {
    const data = await api.updateProfile(profileData);
    setUser(data.user);
    return data.user;
  };

  const refreshUser = async () => {
    try {
      const data = await api.getMe();
      setUser(data.user);
    } catch (_) {}
  };

  const isSuperAdmin = user?.role === 'superadmin';
  const isDirector = user?.role === 'director';
  const isParticipant = user?.role === 'participant';
  const canAwardPoints = isSuperAdmin || isDirector;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        loginWithGoogle,
        logout,
        updateUserBalance,
        updateProfile,
        refreshUser,
        isSuperAdmin,
        isDirector,
        isParticipant,
        canAwardPoints
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
