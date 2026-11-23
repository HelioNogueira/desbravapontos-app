import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Wallet,
  Coins,
  Shield,
  Award,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Filter,
  RefreshCw,
  Calendar,
  Sparkles,
  Info,
  Camera,
  User
} from 'lucide-react';

export default function WalletPage({ onOpenProfile }) {
  const { user, refreshUser } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [rankingInfo, setRankingInfo] = useState(null);

  const fetchWalletData = async () => {
    try {
      setLoading(true);
      const [txRes, rankRes] = await Promise.all([
        api.getTransactions(filterType ? `?type=${filterType}` : ''),
        api.getRankings()
      ]);

      setTransactions(txRes.transactions || []);

      if (user && rankRes.participants) {
        const myRank = rankRes.participants.find(p => p.id === user.id);
        setRankingInfo(myRank || null);
      }
    } catch (err) {
      console.error('Erro ao buscar extrato:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, [filterType, user]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Cabeçalho da Carteira */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Coins className="w-4 h-4 text-amber-500" />
            Carteira Virtual Oficial
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Extrato de Pontuação
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Acompanhe seu saldo em tempo real, bônus recebidos, compras em leilão e pontuação da sua unidade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-bold border border-amber-500/30 transition shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            Alterar Foto
          </button>

          <button
            onClick={() => { refreshUser(); fetchWalletData(); }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar Saldo
          </button>
        </div>
      </div>

      {/* Cartões de Pontuação do Usuário */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cartão 1: Saldo Disponível (Destaque Dourado) */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-950 border border-amber-500/40 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Saldo Disponível para Leilão
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Coins className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          <div className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            {user?.points_balance?.toLocaleString('pt-BR') || 0}
            <span className="text-base font-normal text-amber-400 ml-2">pts</span>
          </div>

          <p className="text-xs text-slate-300 mt-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Pontos acumulados sem data de expiração obrigatória.
          </p>
        </div>

        {/* Cartão 2: Posição no Ranking Individual */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Classificação Individual
              </span>
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>

            <div className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
              #{rankingInfo?.rank || '-'}
              <span className="text-xs font-semibold text-slate-400">no Clube Geral</span>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            Desbravador: <strong className="text-white">{user?.name}</strong>
          </p>
        </div>

        {/* Cartão 3: Unidade / Equipe Vinculada */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Sua Unidade
              </span>
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            <div className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-full shrink-0"
                style={{ backgroundColor: user?.team_color || '#3b82f6' }}
              />
              {user?.team_name || 'Sem Unidade Vinculada'}
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            Todos os seus pontos somam para o ranking da sua unidade!
          </p>
        </div>
      </div>

      {/* Extrato Detalhado de Movimentações */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="font-bold text-base text-white">Histórico Completo de Transações</h3>
            <p className="text-xs text-slate-400">Registro auditável e imutável de todas as alterações</p>
          </div>

          {/* Filtros de Tipo */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filtrar:
            </span>
            {[
              { label: 'Todos', value: '' },
              { label: 'Bônus', value: 'bonus' },
              { label: 'Lances de Leilão', value: 'auction_bid' },
              { label: 'Reembolsos', value: 'auction_refund' },
              { label: 'Penalidades', value: 'penalty' }
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterType(f.value)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  filterType === f.value
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela de Transações */}
        {loading ? (
          <div className="py-12 flex justify-center items-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando extrato...
          </div>
        ) : transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Data & Hora</th>
                  <th className="py-3 px-3">Tipo / Descrição</th>
                  <th className="py-3 px-3">Responsável</th>
                  <th className="py-3 px-3 text-right">Valor</th>
                  <th className="py-3 px-3 text-right">Saldo Resultante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  const isRefund = tx.type === 'auction_refund';
                  const isBid = tx.type === 'auction_bid';
                  const isWin = tx.type === 'auction_win';
                  const isPenalty = tx.type === 'penalty';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{tx.reason}</div>
                        {tx.is_reverted ? (
                          <div className="text-[10px] text-red-400 mt-0.5">
                            [Estornado: {tx.reverted_reason}]
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {tx.actor_name || 'Sistema de Leilão'}
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-lg font-black text-xs ${
                          isRefund ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          isBid ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          isWin ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                          isPenalty ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          isPositive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {isPositive ? `+${tx.amount}` : tx.amount} pts
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-slate-200 whitespace-nowrap">
                        {tx.balance_after} pts
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 text-xs">
            Nenhuma transação encontrada para o filtro selecionado.
          </div>
        )}
      </div>
    </div>
  );
}
