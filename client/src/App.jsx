import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import MobileBottomNav from './components/MobileBottomNav';
import InstallAppBanner from './components/InstallAppBanner';
import LoginModal from './components/LoginModal';
import ProfileModal from './components/ProfileModal';
import NotificationToast from './components/NotificationToast';
import PixPaymentModal from './components/PixPaymentModal';
import DashboardPage from './pages/DashboardPage';
import AuctionPage from './pages/AuctionPage';
import WalletPage from './pages/WalletPage';
import TeamsPage from './pages/TeamsPage';
import AwardPointsPage from './pages/AwardPointsPage';
import AdminPage from './pages/AdminPage';
import MasterPage from './pages/MasterPage';

function AppContent() {
  const { user, club, loading, isPlatformAdmin, isClubExpired, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const pixKey = club?.pixKey || '92994020715';
  const whatsappNumber = club?.whatsapp || '5592994020715';

  const handleCopyPix = () => {
    navigator.clipboard?.writeText(pixKey).catch(() => {});
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2500);
  };

  // Se não está logado, abrir modal de login com segurança (Hook sempre no topo!)
  useEffect(() => {
    if (!user && !loading) {
      const timer = setTimeout(() => setShowLogin(true), 300);
      return () => clearTimeout(timer);
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-xl shadow-amber-500/30 animate-pulse">
            <svg className="w-10 h-10 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <p className="text-sm text-slate-400 animate-pulse">Carregando DesbravaPontos App...</p>
        </div>
      </div>
    );
  }

  const handleNavigate = (tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onNavigate={handleNavigate} />;
      case 'auction':
        return <AuctionPage />;
      case 'wallet':
        return <WalletPage onOpenProfile={() => setShowProfile(true)} />;
      case 'teams':
        return <TeamsPage />;
      case 'award':
        return <AwardPointsPage />;
      case 'admin':
        return <AdminPage />;
      case 'master':
        return isPlatformAdmin ? <MasterPage /> : <DashboardPage onNavigate={handleNavigate} />;
      default:
        return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <div>
        <Navbar
          activeTab={activeTab}
          setActiveTab={handleNavigate}
          onOpenLogin={() => setShowLogin(true)}
          onOpenProfile={() => setShowProfile(true)}
        />
        <InstallAppBanner />
        <NotificationToast />

        {/* Banner de Aviso de Cobrança em Carência (não trava o app durante sexta/sábado ou dia de tolerância) */}
        {user && club?.inGracePeriod && !isPlatformAdmin && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="text-amber-200 text-center sm:text-left">
                <strong>Aviso de Renovação ({club.name}):</strong> O prazo do teste/mensalidade venceu, mas o app continua liberado temporariamente.
                Renove via Pix (<strong className="text-white font-mono">{pixKey}</strong> — R$ {Number(club.monthly_price || 39.9).toFixed(2).replace('.', ',')}).
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowPixModal(true)}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black transition"
                >
                  Pagar com Pix (QR Code)
                </button>
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Olá! Segue o comprovante Pix de renovação do clube ${club.name} (${club.join_code}).`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold transition"
                >
                  Enviar Comprovante
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo com espaçamento de segurança para a barra inferior mobile */}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8">
          {user ? (
            isClubExpired ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-5 px-4">
                <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div className="max-w-md space-y-2">
                  <h2 className="text-2xl font-black text-white">Assinatura do Clube Expirada</h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    O acesso do clube <strong className="text-amber-400">{club?.name}</strong> foi pausado após o período de carência.
                    Para reativar por +30 dias, faça o Pix de <strong className="text-white">R$ {Number(club?.monthly_price || 39.9).toFixed(2).replace('.', ',')}</strong>:
                  </p>
                </div>

                <div className="w-full max-w-sm p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-slate-400">Pagamento via Pix (QR Code ou Copia e Cola)</div>
                  <button
                    onClick={() => setShowPixModal(true)}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition"
                  >
                    Abrir QR Code & Pix Copia e Cola
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyPix}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition"
                    >
                      {pixCopied ? 'Chave Copiada!' : `Copiar Chave (${pixKey})`}
                    </button>
                    <a
                      href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Olá! Segue o comprovante Pix de renovação do clube ${club?.name || ''} (${club?.join_code || ''}).`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center transition"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>

                <button
                  onClick={logout}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition"
                >
                  Sair da Conta
                </button>
              </div>
            ) : renderPage()
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-2xl shadow-amber-500/30 border border-amber-400/40">
                <svg className="w-12 h-12 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white tracking-tight">DesbravaPontos</h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto">
                  Aplicativo de Pontuação e Leilão Virtual para Desbravadores. Acesse para visualizar sua carteira e dar lances.
                </p>
              </div>
              <button
                onClick={() => setShowLogin(true)}
                className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-amber-500/25 transition transform active:scale-95"
              >
                Entrar no Aplicativo
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Barra de Navegação Inferior Nativa do Mobile */}
      {user && (
        <MobileBottomNav activeTab={activeTab} setActiveTab={handleNavigate} />
      )}

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
      <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} />
      <PixPaymentModal
        isOpen={showPixModal}
        onClose={() => setShowPixModal(false)}
        club={club}
        pixKey={pixKey}
        whatsappNumber={whatsappNumber}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
}
