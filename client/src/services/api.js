import { Capacitor } from '@capacitor/core';

// Helper para obter a URL base do backend (suporta Web e APK Nativo)
export function getBackendBaseUrl() {
  const custom = localStorage.getItem('desbravapontos_backend_url');
  if (custom) return custom.replace(/\/$/, '');

  // Detecta se está rodando dentro do APK Android nativo (Capacitor)
  const isCapacitorNative =
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' && (
      window.location.protocol === 'capacitor:' ||
      (window.location.hostname === 'localhost' && !window.location.port) ||
      window.location.hostname === '10.0.2.2'
    ));

  if (isCapacitorNative) {
    return 'https://desbravapontos.onrender.com';
  }

  // No navegador web usa URL relativa (/api)
  return '';
}

export function getApiBase() {
  return `${getBackendBaseUrl()}/api`;
}

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('desbravapontos_token');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${getApiBase()}${endpoint}`, {
      cache: 'no-store',
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || data.message || `Erro na requisição (${response.status})`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    if (err.message && (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('Network'))) {
      const targetUrl = getBackendBaseUrl() || 'http://192.168.0.5:3001';
      throw new Error(`Não foi possível conectar ao servidor (${targetUrl}). Verifique se o celular está conectado na mesma rede Wi-Fi do computador.`);
    }
    throw err;
  }
}

export const api = {
  // Auth
  login: (email, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (userData) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
  getPublicTeams: () => apiRequest('/auth/public-teams'),
  getMe: () => apiRequest('/auth/me'),
  updateProfile: (profileData) => apiRequest('/auth/profile', { method: 'PUT', body: JSON.stringify(profileData) }),

  // Dashboard & Stats
  getDashboard: () => apiRequest('/stats/dashboard'),
  getRankings: (teamId) => apiRequest(`/stats/rankings${teamId ? `?team_id=${teamId}` : ''}`),

  // Users
  getUsers: (params = '') => apiRequest(`/users${params}`),
  createUser: (userData) => apiRequest('/users', { method: 'POST', body: JSON.stringify(userData) }),
  updateUser: (id, userData) => apiRequest(`/users/${id}`, { method: 'PUT', body: JSON.stringify(userData) }),
  toggleUserStatus: (id, active) => apiRequest(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  resetUserPassword: (id, new_password) => apiRequest(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ new_password }) }),
  deleteUser: (id) => apiRequest(`/users/${id}`, { method: 'DELETE' }),

  // Teams
  getTeams: () => apiRequest('/teams'),
  getTeamDetails: (id) => apiRequest(`/teams/${id}`),
  createTeam: (teamData) => apiRequest('/teams', { method: 'POST', body: JSON.stringify(teamData) }),
  updateTeam: (id, teamData) => apiRequest(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(teamData) }),
  deleteTeam: (id) => apiRequest(`/teams/${id}`, { method: 'DELETE' }),
  transferMember: (teamId, userId, reason) => apiRequest(`/teams/${teamId}/transfer-member`, { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) }),

  // Points
  awardSingle: (payload) => apiRequest('/points/award-single', { method: 'POST', body: JSON.stringify(payload) }),
  awardBatch: (payload) => apiRequest('/points/award-batch', { method: 'POST', body: JSON.stringify(payload) }),
  getReasons: () => apiRequest('/points/reasons'),
  getTransactions: (params = '') => apiRequest(`/points/transactions${params}`),
  revertTransaction: (txId, reason) => apiRequest(`/points/revert/${txId}`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Auctions
  getAuctions: (status = '') => apiRequest(`/auctions${status ? `?status=${status}` : ''}`),
  getAuctionDetails: (id) => apiRequest(`/auctions/${id}`),
  createAuction: (auctionData) => apiRequest('/auctions', { method: 'POST', body: JSON.stringify(auctionData) }),
  placeBid: (auctionId, itemId, amount, isTeamBid = false) => apiRequest(`/auctions/${auctionId}/bid`, { method: 'POST', body: JSON.stringify({ item_id: itemId, amount, is_team_bid: isTeamBid }) }),
  setAuctionStatus: (auctionId, status, reason = '') => apiRequest(`/auctions/${auctionId}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) }),
  addAuctionItem: (auctionId, itemData) => apiRequest(`/auctions/${auctionId}/items`, { method: 'POST', body: JSON.stringify(itemData) }),
  deleteAuction: (auctionId) => apiRequest(`/auctions/${auctionId}`, { method: 'DELETE' }),

  // Cycles
  getCycles: () => apiRequest('/cycles'),
  createCycle: (cycleData) => apiRequest('/cycles', { method: 'POST', body: JSON.stringify(cycleData) }),
  activateCycle: (id) => apiRequest(`/cycles/${id}/activate`, { method: 'PATCH' }),

  // Resets
  getResetHistory: () => apiRequest('/reset/history'),
  executeReset: (payload) => apiRequest('/reset/execute', { method: 'POST', body: JSON.stringify(payload) }),
  restoreReset: (id, admin_password) => apiRequest(`/reset/restore/${id}`, { method: 'POST', body: JSON.stringify({ admin_password }) }),

  // Settings & Audit
  getSettings: () => apiRequest('/audit/settings'),
  updateSettings: (settings) => apiRequest('/audit/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  getAuditLogs: (params = '') => apiRequest(`/audit/logs${params}`)
};
