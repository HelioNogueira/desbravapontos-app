import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  Shield,
  Coins,
  Calendar,
  Gavel,
  Clock,
  Award,
  ArrowUpRight,
  TrendingUp,
  Flame,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PlusCircle
} from 'lucide-react';

export default function DashboardPage({ onNavigate }) {
  const { user, isSuperAdmin, isDirector } = useAuth();
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remainingTime, setRemainingTime] = useState(null);

  const fetchDashboard = async () => {
    try {
      const res = await api.getDashboard();
      setData(res);
      if (res.active_auction) {
        setRemainingTime(res.active_auction.remaining_seconds);
      }
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  // Escutar atualizações do leilão em tempo real
  useEffect(() => {
    if (!socket) return;

    const handleTick = (payload) => {
      setRemainingTime(payload.remainingSeconds);
    };

    const handleNewBid = () => {
      fetchDashboard();
    };

    const handleAuctionStarted = () => {
      fetchDashboard();
    };

    const handleAuctionEnded = () => {
      fetchDashboard();
      setRemainingTime(0);
    };

    socket.on('auction_tick', handleTick);
    socket.on('new_bid', handleNewBid);
    socket.on('auction_started', handleAuctionStarted);
    socket.on('auction_ended', handleAuctionEnded);

    return () => {
      socket.off('auction_tick', handleTick);
      socket.off('new_bid', handleNewBid);
      socket.off('auction_started', handleAuctionStarted);
      socket.off('auction_ended', handleAuctionEnded);
    };
  }, [socket]);

  // Formatar segundos restantes em mm:ss
  const formatCountdown = (secs) => {
    if (secs === null || secs === undefined) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm text-slate-400">Carregando painel do Clube...</p>
        </div>
      </div>
    );
  }

  const { kpis, active_auction, next_scheduled_auction, teams_ranking, participants_ranking, recent_transactions, active_cycle } = data || {};

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Banner de Boas-Vindas & Ações Rápidas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
            {active_cycle?.name || 'Temporada Ativa'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Olá, {user ? user.name : 'Desbravador'}! 👋
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            {isSuperAdmin
              ? 'Painel Geral do Super Administrador: gerencie pontos, controle os leilões e monitore os rankings.'
              : isDirector
              ? 'Painel da Diretoria: distribua pontos por presença, uniforme e especialidades cumpridas.'
              : 'Acumule pontos em suas tarefas do clube e participe dos leilões de equipamentos de acampamento!'}
          </p>
        </div>

        {/* Botões de Ação Rápida */}
        <div className="flex flex-wrap items-center gap-2.5 relative z-10">
          {(isSuperAdmin || isDirector) && (
            <button
              onClick={() => onNavigate('award')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              Lançar Pontos
            </button>
          )}

          <button
            onClick={() => onNavigate('auction')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/25 transition transform active:scale-95"
          >
            <Gavel className="w-4 h-4" />
            Sala de Leilão
          </button>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Pontos em Circulação */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md relative overflow-hidden group hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pontos em Circulação</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {kpis?.total_points_in_circulation?.toLocaleString('pt-BR') || 0}
          </div>
          <p className="text-[11px] text-amber-500/90 font-medium mt-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            {kpis?.score_mode === 'collective' ? 'Soma + Cofrinho coletivo' : 'Saldos individuais ativos'}
          </p>
        </div>

        {/* KPI 2: Participantes Ativos */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md relative overflow-hidden group hover:border-blue-500/40 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Desbravadores</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {kpis?.total_participants || 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Membros ativos no clube</p>
        </div>

        {/* KPI 3: Equipes / Unidades */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Unidades Oficiais</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {kpis?.total_teams || 0}
          </div>
          <p className="text-[11px] text-emerald-400 font-medium mt-1">Competindo no ranking</p>
        </div>

        {/* KPI 4: Status do Leilão */}
        <div className={`p-5 rounded-2xl border shadow-md relative overflow-hidden transition ${
          active_auction
            ? 'bg-red-950/30 border-red-500/50 glow-red'
            : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status do Leilão</span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              active_auction ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-400'
            }`}>
              <Gavel className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            {active_auction ? (
              <>
                <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                AO VIVO
              </>
            ) : (
              'Agendado'
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {active_auction ? `Rodada #${active_auction.round_number}` : (next_scheduled_auction ? 'Próximo sábado' : 'Nenhuma rodada')}
          </p>
        </div>
      </div>

      {/* DESTAQUE: LEILÃO ATIVO AGORA COM CRONÔMETRO AO VIVO */}
      {active_auction && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border-2 border-red-500/60 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Rodada #{active_auction.round_number} em Andamento!
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                {active_auction.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                {active_auction.description || 'Dê seus lances agora utilizando seus pontos acumulados!'}
              </p>
              <div className="text-xs text-slate-400 flex items-center justify-center md:justify-start gap-4 pt-1">
                <span>📦 {active_auction.items_count} Itens em disputa</span>
                <span>🔥 {active_auction.total_bids} Lances registrados</span>
              </div>
            </div>

            {/* Cronômetro Regressivo */}
            <div className="flex flex-col items-center p-4 rounded-2xl bg-slate-950/80 border border-red-500/40 shadow-inner shrink-0">
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5" /> Tempo Restante
              </span>
              <div className="text-4xl sm:text-5xl font-mono font-black text-white tracking-wider animate-pulse">
                {formatCountdown(remainingTime)}
              </div>
              <button
                onClick={() => onNavigate('auction')}
                className="mt-3 w-full py-2 px-6 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 transition transform active:scale-95 flex items-center justify-center gap-2"
              >
                <Gavel className="w-4 h-4" />
                Dar Lances Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid Principal: Rankings e Extrato Recente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1 & 2: Rankings (Unidades & Top Desbravadores) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ranking das Unidades */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Ranking Oficial das Unidades</h3>
                  <p className="text-xs text-slate-400">Classificação coletiva da temporada</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('teams')}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
              >
                Ver Detalhes <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {teams_ranking?.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/60 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                      team.rank === 1 ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30' :
                      team.rank === 2 ? 'bg-slate-300 text-slate-900' :
                      team.rank === 3 ? 'bg-amber-700 text-white' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      #{team.rank}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-white flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                        {team.name}
                      </h4>
                      <p className="text-[11px] text-slate-400">{team.motto || `${team.members_count} integrantes`}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-amber-400">
                      {team.effective_points?.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">pts</span>
                    </div>
                    <div className="text-[10px] text-slate-400">{team.members_count} desbravadores</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top 5 Desbravadores com Maior Pontuação */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Top Desbravadores</h3>
                  <p className="text-xs text-slate-400">Líderes de pontuação individual</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('wallet')}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
              >
                Minha Classificação <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {participants_ranking?.slice(0, 6).map((part) => (
                <div
                  key={part.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      part.rank === 1 ? 'bg-amber-500 text-slate-950 font-black' :
                      part.rank === 2 ? 'bg-slate-300 text-slate-900' :
                      part.rank === 3 ? 'bg-amber-700 text-white' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {part.rank}
                    </span>
                    <img
                      src={part.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80'}
                      alt={part.name}
                      className="w-8 h-8 rounded-full object-cover border border-slate-700"
                    />
                    <div>
                      <div className="text-xs font-bold text-white">{part.name}</div>
                      <div className="text-[10px] text-slate-400">{part.team_name || 'Sem Unidade'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-amber-400">
                      {part.points_balance?.toLocaleString('pt-BR')} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna 3: Últimas Movimentações de Pontos (Extrato Ao Vivo) */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Últimos Lançamentos</h3>
                <p className="text-xs text-slate-400">Movimentações de pontos no clube</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('wallet')}
              className="text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Extrato
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-1">
            {recent_transactions?.map((tx) => {
              const isPositive = tx.amount > 0;
              const isRefund = tx.type === 'auction_refund';
              const isBid = tx.type === 'auction_bid';

              return (
                <div
                  key={tx.id}
                  className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">
                      {tx.user_name || 'Participante'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {tx.reason}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-1">
                      {new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • por {tx.actor_name || 'Sistema'}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-extrabold ${
                      isRefund ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                      isBid ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      isPositive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {isPositive ? `+${tx.amount}` : tx.amount} pts
                    </span>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Saldo: {tx.balance_after}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
