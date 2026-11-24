import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Shield,
  Coins,
  Radio,
  User,
  LogOut,
  ChevronDown,
  Sparkles,
  LayoutDashboard,
  Wallet,
  Gavel,
  Users,
  Award,
  Sliders,
  Camera,
  Crown
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onOpenLogin, onOpenProfile }) {
  const { user, logout, isSuperAdmin, isDirector } = useAuth();
  const { connected } = useSocket();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Logo & Marca */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 shadow-md shadow-amber-500/20 border border-amber-400/40 shrink-0">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-slate-950" />
            </div>
            <div>
              <span className="font-black text-sm sm:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent block leading-tight">
                DesbravaPontos
              </span>
              <span className="text-[9px] sm:text-[10px] tracking-wider uppercase font-bold text-amber-500/90 block">
                App Desbravadores
              </span>
            </div>
          </div>

          {/* Abas de Navegação (Apenas Desktop - no celular usa a barra inferior MobileBottomNav) */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Painel
            </button>

            <button
              onClick={() => setActiveTab('auction')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition relative ${
                activeTab === 'auction'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Gavel className="w-4 h-4" />
              Leilão
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab('wallet')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'wallet'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Carteira
            </button>

            <button
              onClick={() => setActiveTab('teams')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'teams'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              Unidades
            </button>

            {(isSuperAdmin || isDirector) && (
              <button
                onClick={() => setActiveTab('award')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'award'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Award className="w-4 h-4" />
                Lançar
              </button>
            )}

            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  activeTab === 'admin'
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Sliders className="w-4 h-4" />
                Gestão
              </button>
            )}
          </nav>

          {/* Lado Direito: Saldo, Switcher Demo e Perfil */}
          <div className="flex items-center gap-2">
            {/* Status do WebSocket */}
            <div
              title={connected ? 'Conexão em Tempo Real Ativa' : 'Desconectado'}
              className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px]"
            >
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
              <span className="hidden sm:inline text-slate-400 font-medium">
                {connected ? 'Ao Vivo' : 'Offline'}
              </span>
            </div>

            {/* Saldo de Pontos do Usuário ou Distintivo de Liderança Geral */}
            {user && user.role !== 'superadmin' ? (
              <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/5 border border-amber-500/30 text-amber-400 shadow-sm">
                <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 animate-bounce" />
                <div className="text-right">
                  <span className="text-[9px] uppercase tracking-wider text-amber-500/80 font-bold block leading-none">
                    Pts
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-white leading-tight">
                    {user.points_balance?.toLocaleString('pt-BR') || 0}
                  </span>
                </div>
              </div>
            ) : user && user.role === 'superadmin' ? (
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 shadow-sm" title="Super Administrador / Pastor">
                <Crown className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] font-bold text-purple-200 hidden sm:inline">Pastor / Admin</span>
                <span className="text-[11px] font-bold text-purple-200 sm:hidden">Admin</span>
              </div>
            ) : null}

            {/* Menu do Usuário Logado */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700/80 transition active:scale-95 group shrink-0"
                  title="Menu do Perfil"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border-2 border-amber-400 shadow-md bg-slate-800 flex items-center justify-center shrink-0">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <span className="hidden sm:inline text-xs font-bold text-slate-200 group-hover:text-amber-400 truncate max-w-[90px]">
                    {user.name.split(' ')[0]}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in space-y-2">
                    {/* Detalhes do Usuário Atual */}
                    <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-400 bg-slate-800 shrink-0">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-slate-400 m-auto mt-2" />
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-extrabold text-xs text-white truncate">{user.name}</div>
                        <div className="text-[10px] text-amber-400 font-semibold truncate">
                          {user.club_role || (user.role === 'superadmin' ? 'Pastor / Diretor Geral' : user.role === 'director' ? 'Diretoria' : 'Desbravador')}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                      </div>
                    </div>

                    {/* Botões de Ação do Perfil */}
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          onOpenProfile?.();
                        }}
                        className="w-full p-2 text-left rounded-xl text-xs text-amber-400 hover:bg-amber-500/15 flex items-center gap-2 transition font-bold"
                      >
                        <Camera className="w-4 h-4" />
                        Editar Foto de Perfil
                      </button>

                      <button
                        onClick={() => {
                          logout();
                          setUserMenuOpen(false);
                        }}
                        className="w-full p-2 text-left rounded-xl text-xs text-red-400 hover:bg-red-950/40 flex items-center gap-2 transition font-semibold"
                      >
                        <LogOut className="w-4 h-4" />
                        Sair da Conta
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Botão de Login se não estiver logado */
              <button
                onClick={onOpenLogin}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center gap-1"
              >
                <User className="w-3.5 h-3.5" />
                Entrar
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
