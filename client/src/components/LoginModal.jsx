import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import Avatar from './Avatar';
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
  Crown,
  ChevronLeft
} from 'lucide-react';

export default function LoginModal({ isOpen, onClose }) {
  const { login, register, registerClub, loginWithGoogle } = useAuth();

  const [tab, setTab] = useState('login'); // 'login', 'register', 'register_club' ou 'complete_google'
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [clubCode, setClubCode] = useState('');
  const [resolvedClub, setResolvedClub] = useState(null);

  // Form de Novo Clube (7 dias grátis)
  const [newClubName, setNewClubName] = useState('');
  const [newClubCode, setNewClubCode] = useState('');
  const [newClubAdminName, setNewClubAdminName] = useState('');
  const [newClubAdminEmail, setNewClubAdminEmail] = useState('');
  const [newClubAdminPassword, setNewClubAdminPassword] = useState('');

  // Google Sign-In States
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleCredential, setGoogleCredential] = useState('');
  const [googleData, setGoogleData] = useState(null);
  const [googleFirstName, setGoogleFirstName] = useState('');
  const [googleLastName, setGoogleLastName] = useState('');
  const [googleTeamId, setGoogleTeamId] = useState('');
  const [googleClubRole, setGoogleClubRole] = useState('Desbravador');
  const [googleRole, setGoogleRole] = useState('participant');
  const [googleRegCode, setGoogleRegCode] = useState('');
  const [googleBtnReady, setGoogleBtnReady] = useState(false);
  const [gsiLoaded, setGsiLoaded] = useState(Boolean(window.google?.accounts?.id));
  const gsiInitializedRef = useRef(false);
  const googleBtnRef = useRef(null);

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

  // Carregar unidades públicas para o formulário de cadastro e Google Client ID
  const loadTeamsForClub = async (code = '') => {
    try {
      const res = await api.getPublicTeams(code);
      setTeams(res.teams || []);
      if (res.club) {
        setResolvedClub(res.club);
      }
      if (res.teams?.length > 0) {
        setRegTeamId(res.teams[0].id);
        setGoogleTeamId(res.teams[0].id);
      } else {
        setRegTeamId('');
        setGoogleTeamId('');
      }
    } catch (_) {}
  };

  const handleLookupClub = async (codeToLookup) => {
    const clean = (codeToLookup || '').trim().toUpperCase();
    if (!clean) {
      loadTeamsForClub('');
      return;
    }
    try {
      const res = await api.getClubByCode(clean);
      setResolvedClub(res.club);
      setTeams(res.teams || []);
      setRegTeamId(res.teams?.[0]?.id || '');
      setGoogleTeamId(res.teams?.[0]?.id || '');
      setError('');
    } catch (err) {
      setResolvedClub(null);
      setTeams([]);
      setError(err.message || 'Código do clube não encontrado.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTeamsForClub(clubCode);

      api.getGoogleClientId()
        .then(res => {
          if (res.clientId) setGoogleClientId(res.clientId);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Carregar script do Google Identity Services
  useEffect(() => {
    if (window.google?.accounts?.id) {
      setGsiLoaded(true);
      return;
    }
    const existingScript = document.getElementById('google-gsi-client');
    if (existingScript) {
      existingScript.addEventListener('load', () => setGsiLoaded(true));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGsiLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Resposta da credencial do Google
  const handleGoogleCredentialResponse = async (response) => {
    if (!response?.credential) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await loginWithGoogle({ credential: response.credential });
      if (res.needProfileCompletion) {
        setGoogleCredential(response.credential);
        setGoogleData(res.googleData);
        setGoogleFirstName(res.googleData?.suggestedFirstName || '');
        setGoogleLastName(res.googleData?.suggestedLastName || '');
        if (teams.length > 0 && !googleTeamId) {
          setGoogleTeamId(teams[0].id);
        }
        setTab('complete_google');
      } else if (res.token && res.user) {
        setSuccess(`Bem-vindo(a) ao Clube, ${res.user.name}!`);
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch (err) {
      setError(err.message || 'Erro ao autenticar com o Google.');
    } finally {
      setLoading(false);
    }
  };

  // Inicializar Google Sign-In button quando o modal abrir
  useEffect(() => {
    if (isOpen && googleClientId && gsiLoaded && window.google?.accounts?.id && (tab === 'login' || tab === 'register')) {
      try {
        if (!gsiInitializedRef.current) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false
          });
          gsiInitializedRef.current = true;
        }

        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            text: tab === 'register' ? 'signup_with' : 'signin_with',
            logo_alignment: 'left',
            width: 280
          });
          setGoogleBtnReady(true);
        }
      } catch (e) {
        console.warn('Erro ao inicializar botão do Google:', e);
        setGoogleBtnReady(false);
      }
    } else {
      setGoogleBtnReady(false);
    }
  }, [isOpen, googleClientId, gsiLoaded, tab]);

  // Concluir cadastro com dados customizados do Google (Primeiro Nome e Sobrenome reais)
  const handleCompleteGoogleSubmit = async (e) => {
    e.preventDefault();
    if (!googleFirstName.trim() || !googleLastName.trim()) {
      setError('Por favor preencha seu Primeiro Nome e seu Sobrenome.');
      return;
    }
    if ((googleRole === 'director' || googleRole === 'superadmin') && !googleRegCode.trim()) {
      setError('Informe o Código de Autorização obrigatório para este nível de acesso.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await loginWithGoogle({
        credential: googleCredential,
        firstName: googleFirstName.trim(),
        lastName: googleLastName.trim(),
        club_code: clubCode.trim() || undefined,
        team_id: googleRole === 'superadmin' ? null : (googleTeamId ? Number(googleTeamId) : null),
        club_role: googleClubRole || (
          googleRole === 'superadmin' ? 'Pastor / Diretor Geral' :
          googleRole === 'director' ? 'Membro da Diretoria' : 'Desbravador'
        ),
        role: googleRole,
        registration_code: googleRegCode
      });

      setSuccess(`Cadastro finalizado! Bem-vindo(a), ${res.user?.name || googleFirstName}!`);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err.message || 'Erro ao concluir cadastro com o Google.');
    } finally {
      setLoading(false);
    }
  };

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
        club_code: clubCode.trim() || undefined,
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

  const handleRegisterClubSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await registerClub({
        clubName: newClubName,
        joinCode: newClubCode,
        adminName: newClubAdminName,
        adminEmail: newClubAdminEmail,
        adminPassword: newClubAdminPassword
      });
      setSuccess(res.message || 'Clube cadastrado com 7 dias grátis!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Erro ao cadastrar novo clube.');
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

        {/* Abas ou Cabeçalho de Conclusão do Google */}
        {tab === 'complete_google' ? (
          <div className="flex items-center justify-between pb-2 mb-4 border-b border-slate-800">
            <button
              type="button"
              onClick={() => { setTab('login'); setError(''); }}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 transition"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
              Concluir Cadastro
            </span>
          </div>
        ) : (
          <div className="flex p-1 rounded-2xl bg-slate-950 border border-slate-800 mb-5 gap-1">
            <button
              type="button"
              onClick={() => { setTab('login'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                tab === 'login'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setTab('register'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                tab === 'register'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cadastrar-se
            </button>
            <button
              type="button"
              onClick={() => { setTab('register_club'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                tab === 'register_club'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-emerald-400/90 hover:text-emerald-300'
              }`}
            >
              Novo Clube
            </button>
          </div>
        )}

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

        {/* SE ESTIVER NA ETAPA DE COMPLETAR CADASTRO DO GOOGLE */}
        {tab === 'complete_google' ? (
          <div className="space-y-4 animate-in fade-in">
            {/* Prévia dos dados da conta Google */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3">
              <Avatar
                src={googleData?.picture}
                name={googleFirstName || 'Desbravador'}
                size="md"
                className="ring-2 ring-amber-500/30 shrink-0"
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                  <span>Conta Google Conectada</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
                <div className="text-[11px] text-slate-400 truncate">{googleData?.email}</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
              <span className="font-bold">✨ Nome Oficial no Clube:</span>
              <p className="text-[11px] text-blue-200/80 mt-0.5">
                Para não usar o apelido do seu e-mail, digite seu <strong>Primeiro Nome</strong> e <strong>Sobrenome</strong> como devem aparecer nos leilões e no ranking:
              </p>
            </div>

            <form onSubmit={handleCompleteGoogleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Primeiro Nome *
                  </label>
                  <input
                    type="text"
                    required
                    value={googleFirstName}
                    onChange={(e) => setGoogleFirstName(e.target.value)}
                    placeholder="Ex: Lucas"
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Sobrenome *
                  </label>
                  <input
                    type="text"
                    required
                    value={googleLastName}
                    onChange={(e) => setGoogleLastName(e.target.value)}
                    placeholder="Ex: Silveira"
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
              </div>

              {/* Nível da Conta Google */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Função / Nível no Clube
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setGoogleRole('participant')}
                    className={`py-2 px-1 rounded-xl text-center text-xs font-bold border transition ${
                      googleRole === 'participant'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Desbravador
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoogleRole('director')}
                    className={`py-2 px-1 rounded-xl text-center text-xs font-bold border transition ${
                      googleRole === 'director'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Diretoria
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoogleRole('superadmin')}
                    className={`py-2 px-1 rounded-xl text-center text-xs font-bold border transition ${
                      googleRole === 'superadmin'
                        ? 'bg-red-500/20 border-red-500 text-red-300 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Pastor / Geral
                  </button>
                </div>
              </div>

              {/* Código do Clube (Multi-Clube) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Código do Clube (Opcional para clube padrão)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clubCode}
                    onChange={(e) => setClubCode(e.target.value.toUpperCase())}
                    onBlur={() => handleLookupClub(clubCode)}
                    placeholder="Ex: ALBATROZ"
                    className="flex-1 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupClub(clubCode)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-amber-400"
                  >
                    Buscar
                  </button>
                </div>
                {resolvedClub && (
                  <p className="text-[11px] text-emerald-400 mt-1 font-semibold">
                    Clube selecionado: {resolvedClub.name}
                  </p>
                )}
              </div>

              {/* Seleção de Unidade */}
              {googleRole !== 'superadmin' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Sua Unidade de Desbravadores *
                  </label>
                  <select
                    value={googleTeamId}
                    onChange={(e) => setGoogleTeamId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Código se for Diretoria ou Superadmin */}
              {(googleRole === 'director' || googleRole === 'superadmin') && (
                <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-1.5">
                  <label className="block text-[11px] font-bold text-amber-400">
                    Código de Autorização Obrigatório
                  </label>
                  <input
                    type="password"
                    required
                    value={googleRegCode}
                    onChange={(e) => setGoogleRegCode(e.target.value)}
                    placeholder="Digite o código da Diretoria ou Pastor..."
                    className="w-full px-3 py-2 bg-slate-900 border border-amber-500/40 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50 mt-2"
              >
                {loading ? 'Finalizando...' : 'Concluir Cadastro e Entrar'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          <div>
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
        ) : tab === 'register_club' ? (
          /* ABA 3: CADASTRAR NOVO CLUBE (7 DIAS GRÁTIS) */
          <form onSubmit={handleRegisterClubSubmit} className="space-y-3.5 animate-in fade-in">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
              <strong className="block">Teste Grátis por 7 Dias</strong>
              <span className="text-[11px] text-emerald-200/80">
                Cadastre seu Clube de Desbravadores agora e tenha pontuação, ranking e leilão ao vivo isolados para seus membros.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Nome do Clube *
              </label>
              <input
                type="text"
                required
                value={newClubName}
                onChange={(e) => setNewClubName(e.target.value)}
                placeholder="Ex: Clube de Desbravadores Águias"
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Código de Convite do Clube (opcional)
              </label>
              <input
                type="text"
                value={newClubCode}
                onChange={(e) => setNewClubCode(e.target.value.toUpperCase())}
                placeholder="Ex: AGUIAS2026 (gerado se ficar vazio)"
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Seu Nome (Diretor / Pastor Responsável) *
              </label>
              <input
                type="text"
                required
                value={newClubAdminName}
                onChange={(e) => setNewClubAdminName(e.target.value)}
                placeholder="Ex: Pr. João Marcos"
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  value={newClubAdminEmail}
                  onChange={(e) => setNewClubAdminEmail(e.target.value)}
                  placeholder="diretor@clube.org"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Senha (mín. 6) *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newClubAdminPassword}
                  onChange={(e) => setNewClubAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? 'Criando Clube...' : 'Criar Clube e Começar 7 Dias Grátis'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          /* ABA 2: CADASTRO COMPLETO */
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            {/* Código do Clube */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Código do Clube (Opcional para clube padrão)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clubCode}
                  onChange={(e) => setClubCode(e.target.value.toUpperCase())}
                  onBlur={() => handleLookupClub(clubCode)}
                  placeholder="Ex: ALBATROZ"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleLookupClub(clubCode)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-amber-400"
                >
                  Buscar
                </button>
              </div>
              {resolvedClub && (
                <p className="text-[11px] text-emerald-400 mt-1 font-semibold">
                  Clube: {resolvedClub.name}
                </p>
              )}
            </div>
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
                      ? 'Exige a chave mestra de autorização especial do Pastor / Diretor Geral.'
                      : 'Solicite este código de autorização ao Pastor ou Diretor Geral do Clube.'}
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

        {/* SEPARADOR OU */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[10px] uppercase font-bold text-slate-500">ou</span>
          <div className="border-t border-slate-800 w-full" />
        </div>

        {/* BOTÃO OFICIAL GOOGLE SIGN-IN */}
        <div className="flex flex-col items-center gap-2">
          <div
            ref={googleBtnRef}
            className={`w-full flex justify-center ${googleBtnReady ? 'min-h-[44px]' : 'hidden'}`}
          />

          {!googleBtnReady && (
            <button
              type="button"
              onClick={() => {
                if (!googleClientId) {
                  setError('Para ativar o Login com Google, informe o Google Client ID nas Configurações de Administrador.');
                } else if (window.google?.accounts?.id) {
                  window.google.accounts.id.prompt();
                }
              }}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-xl text-xs sm:text-sm font-bold text-white transition flex items-center justify-center gap-2.5 shadow-sm active:scale-95"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{tab === 'register' ? 'Cadastrar com o Google' : 'Continuar com o Google'}</span>
            </button>
          )}
        </div>
      </div>
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
