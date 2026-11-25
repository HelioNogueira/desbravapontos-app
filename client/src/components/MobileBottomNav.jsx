import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Gavel,
  Wallet,
  Users,
  Award,
  Sliders,
  Sparkles,
  Crown
} from 'lucide-react';

export default function MobileBottomNav({ activeTab, setActiveTab }) {
  const { isSuperAdmin, isDirector, isPlatformAdmin } = useAuth();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* Início / Dashboard */}
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
            activeTab === 'dashboard'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition ${activeTab === 'dashboard' ? 'bg-amber-500/15' : ''}`}>
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Início</span>
        </button>

        {/* Leilão Virtual */}
        <button
          onClick={() => setActiveTab('auction')}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 relative ${
            activeTab === 'auction'
              ? 'text-red-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition relative ${activeTab === 'auction' ? 'bg-red-500/20' : ''}`}>
            <Gavel className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Leilão</span>
        </button>

        {/* Carteira & Extrato */}
        <button
          onClick={() => setActiveTab('wallet')}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
            activeTab === 'wallet'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition ${activeTab === 'wallet' ? 'bg-amber-500/15' : ''}`}>
            <Wallet className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Carteira</span>
        </button>

        {/* Unidades & Rankings */}
        <button
          onClick={() => setActiveTab('teams')}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
            activeTab === 'teams'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className={`p-1 rounded-xl transition ${activeTab === 'teams' ? 'bg-amber-500/15' : ''}`}>
            <Users className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Unidades</span>
        </button>

        {/* Ação Especial: Lançar Pontos ou Admin */}
        {(isSuperAdmin || isDirector) && (
          <button
            onClick={() => setActiveTab('award')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
              activeTab === 'award'
                ? 'text-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === 'award' ? 'bg-amber-500/15' : ''}`}>
              <Award className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight font-medium">Lançar</span>
          </button>
        )}

        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
              activeTab === 'admin'
                ? 'text-purple-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === 'admin' ? 'bg-purple-500/15' : ''}`}>
              <Sliders className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight font-medium">Gestão</span>
          </button>
        )}
        {isPlatformAdmin && (
          <button
            onClick={() => setActiveTab('master')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-90 ${
              activeTab === 'master'
                ? 'text-emerald-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${activeTab === 'master' ? 'bg-emerald-500/15' : ''}`}>
              <Crown className="w-5 h-5" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight font-medium">Master</span>
          </button>
        )}
      </div>
    </nav>
  );
}
