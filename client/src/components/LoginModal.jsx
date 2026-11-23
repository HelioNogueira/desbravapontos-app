import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Shield,
  Lock,
  Mail,
  User,
  ArrowRight,
  UserCheck,
  Sparkles,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Users,
  Compass,
  Crown
} from 'lucide-react';

export default function LoginModal({ isOpen, onClose }) {
  const { login, register } = useAuth();

  const [tab, setTab] = useState('login'); // 'login' ou 'register'
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);

  // Form de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Form de Cadastro
  const [role, setRole] = useState('participant'); // 'participant', 'director', 'superadmin'
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regTeamId, setRegTeamId] = useState('');
  const [regClubRole, setRegClubRole] = useState('');
  const [regCode, setRegCode] = useState('');

  // Carregar unidades públicas para o formulário de cadastro
  useEffect(() => {
    if (isOpen) {
      api.getPublicTeams()
        .then(res => {
          setTeams(res.teams || []);
          if (res.teams?.length > 0 && !regTeamId) {
            setRegTeamId(res.teams[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
      onClose();
    } catch (err) {
      setError(err.message || 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = {
        name: regName,
        email: regEmail,
        password: regPassword,
        role,
        team_id: role === 'superadmin' ? null : (regTeamId ? Number(regTeamId) : null),
        club_role: regClubRole || (
          role === 'superadmin' ? 'Pastor / Diretor Geral' :
          role === 'director' ? 'Membro da Diretoria' : 'Desbravador'
        ),
        registration_code: regCode
      };

      await register(payload);
      setSuccess('Cadastro realizado com sucesso! Entrando no app...');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-7 overflow-hidden my-auto max-h-[95vh] overflow-y-auto scrollbar-none">
        {/* Glows de fundo */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header com Logo */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg shadow-amber-500/20 mb-2 border border-amber-400/40">
            <Shield className="w-6 h-6 text-slate-950" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">DesbravaPontos</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Clube de Desbravadores Oficial</p>
        </div>

        {/* Abas: Entrar vs Criar Conta */}
        <div className="flex p-1 rounded-2xl bg-slate-950 border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(''); setSuccess(''); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
              tab === 'login'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Já tenho conta
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(''); setSuccess(''); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
              tab === 'register'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Cadastrar-se
          </button>
        </div>

        {/* Alertas */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        {/* ABA 1: LOGIN */}
        {tab === 'login' ? (
          <div>
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="seu.email@clube.org"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {loading ? 'Entrando...' : 'Entrar no Aplicativo'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          /* ABA 2: CADASTRO COMPLETO */
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            {/* 1. Seleção do Tipo de Conta */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                1. Nível de Acesso da Conta
              </label>

              <div className="grid grid-cols-3 gap-2">
                {/* Desbravador */}
                <button
                  type="button"
                  onClick={() => setRole('participant')}
                  className={`p-2.5 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                    role === 'participant'
                      ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-md shadow-blue-500/10'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <Compass className="w-5 h-5 text-blue-400" />
                  <span className="text-xs font-bold leading-tight">Desbravador</span>
                  <span className="text-[9px] text-slate-400">Participante</span>
                </button>

                {/* Diretoria */}
                <button
                  type="button"
                  onClick={() => setRole('director')}
                  className={`p-2.5 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                    role === 'director'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <Shield className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-bold leading-tight">Diretoria</span>
                  <span className="text-[9px] text-slate-400">Diretor / Instrutor</span>
                </button>

                {/* Super Admin */}
                <button
                  type="button"
                  onClick={() => setRole('superadmin')}
                  className={`p-2.5 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                    role === 'superadmin'
                      ? 'bg-red-500/20 border-red-500 text-red-300 shadow-md shadow-red-500/10'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <Crown className="w-5 h-5 text-red-400" />
                  <span className="text-xs font-bold leading-tight">Pastor / Geral</span>
                  <span className="text-[9px] text-slate-400">Super Admin</span>
                </button>
              </div>
            </div>

            {/* 2. Dados Pessoais */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ex: Pedro Henrique Silva"
                    className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="email@clube.org"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Senha (mínimo 6 dígitos)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Unidade & Cargo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {role !== 'superadmin' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Unidade no Clube
                    </label>
                    <select
                      value={regTeamId}
                      onChange={(e) => setRegTeamId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Sem Unidade / Geral</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={role === 'superadmin' ? 'sm:col-span-2' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Cargo / Função Específica
                  </label>
                  <input
                    type="text"
                    value={regClubRole}
                    onChange={(e) => setRegClubRole(e.target.value)}
                    placeholder={
                      role === 'superadmin' ? 'Ex: Pastor Distrital ou Diretor do Clube' :
                      role === 'director' ? 'Ex: Conselheira, Instrutor, Secretário' :
                      'Ex: Desbravador, Capitão, Secretário de Unidade'
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Campo de Código de Autorização para Diretoria ou Super Admin */}
              {role !== 'participant' && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span>
                      {role === 'superadmin'
                        ? 'Chave Mestra de Segurança (Pastor / Diretor Geral)'
                        : 'Código de Autorização da Diretoria'}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    {role === 'superadmin'
                      ? 'Exige autorização especial de Pastor. (Código padrão inicial: PASTOR2026)'
                      : 'Solicite este código ao Pastor ou Diretor Geral. (Código padrão inicial: DIRETORIA2026)'}
                  </p>

                  <input
                    type="password"
                    required
                    value={regCode}
                    onChange={(e) => setRegCode(e.target.value)}
                    placeholder="Digite o código de autorização..."
                    className="w-full px-3 py-2 bg-slate-900 border border-amber-500/40 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? 'Cadastrando...' : 'Criar Minha Conta no Clube'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Rodapé com configuração do Servidor (Útil para APK / Rede Local) */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="truncate max-w-[240px]">
            Servidor: <strong className="text-amber-400 font-mono">{localStorage.getItem('desbravapontos_backend_url') || 'http://192.168.0.5:3001'}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              const current = localStorage.getItem('desbravapontos_backend_url') || 'http://192.168.0.5:3001';
              const nextUrl = prompt('URL do Servidor (IP do computador na rede):', current);
              if (nextUrl !== null) {
                if (nextUrl.trim()) {
                  localStorage.setItem('desbravapontos_backend_url', nextUrl.trim());
                } else {
                  localStorage.removeItem('desbravapontos_backend_url');
                }
                window.location.reload();
              }
            }}
            className="text-amber-400 hover:text-amber-300 font-semibold underline transition ml-2 shrink-0"
          >
            Alterar IP
          </button>
        </div>
      </div>
    </div>
  );
}
