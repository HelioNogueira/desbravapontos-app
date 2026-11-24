import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import MobileBottomNav from './components/MobileBottomNav';
import InstallAppBanner from './components/InstallAppBanner';
import LoginModal from './components/LoginModal';
import ProfileModal from './components/ProfileModal';
import NotificationToast from './components/NotificationToast';
import DashboardPage from './pages/DashboardPage';
import AuctionPage from './pages/AuctionPage';
import WalletPage from './pages/WalletPage';
import TeamsPage from './pages/TeamsPage';
import AwardPointsPage from './pages/AwardPointsPage';
import AdminPage from './pages/AdminPage';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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

  // Se não está logado, abrir modal de login com segurança
  useEffect(() => {
    if (!user && !loading) {
      const timer = setTimeout(() => setShowLogin(true), 300);
      return () => clearTimeout(timer);
    }
  }, [user, loading]);

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

        {/* Conteúdo com espaçamento de segurança para a barra inferior mobile */}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8">
          {user ? renderPage() : (
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
