import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  Crown,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  CalendarPlus,
  Ban,
  Play,
  DollarSign
} from 'lucide-react';

export default function MasterPage() {
  const [clubs, setClubs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState({ error: '', success: '' });
  const [showCreate, setShowCreate] = useState(false);

  // Novo clube manual
  const [form, setForm] = useState({
    name: '',
    join_code: '',
    plan_name: 'Mensal',
    monthly_price: '39.90',
    days: '30',
    max_members: '100',
    admin_name: '',
    admin_email: '',
    admin_password: ''
  });

  const loadClubs = async () => {
    setLoading(true);
    try {
      const res = await api.getMasterClubs();
      setClubs(res.clubs || []);
      setStats(res.stats || null);
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClubs();
  }, []);

  const handleCreateClub = async (e) => {
    e.preventDefault();
    setFeedback({ error: '', success: '' });
    try {
      const res = await api.createMasterClub(form);
      setFeedback({ error: '', success: res.message });
      setForm({
        name: '',
        join_code: '',
        plan_name: 'Mensal',
        monthly_price: '39.90',
        days: '30',
        max_members: '100',
        admin_name: '',
        admin_email: '',
        admin_password: ''
      });
      setShowCreate(false);
      loadClubs();
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    }
  };

  const handleRenew = async (club, days = 30) => {
    setFeedback({ error: '', success: '' });
    try {
      const res = await api.renewMasterClub(club.id, { days });
      setFeedback({ error: '', success: res.message });
      loadClubs();
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    }
  };

  const handleToggleStatus = async (club) => {
    setFeedback({ error: '', success: '' });
    const nextStatus = club.status === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await api.setMasterClubStatus(club.id, nextStatus);
      setFeedback({ error: '', success: res.message });
      loadClubs();
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    }
  };

  const filtered = clubs.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.join_code.toLowerCase().includes(q) ||
      (c.owner_email && c.owner_email.toLowerCase().includes(q))
    );
  });

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  };

  const daysRemaining = (iso) => {
    if (!iso) return 0;
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header Master */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 border border-emerald-500/20 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Crown className="w-4 h-4" />
            Painel Master SaaS — Controle da Plataforma
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Gestão de Clubes e Mensalidades
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Cadastre novos clubes, acompanhe períodos de teste (7 dias) e renove mensalidades com 1 clique.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadClubs}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            Novo Clube
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 uppercase">Total de Clubes</div>
            <div className="text-2xl font-black text-white mt-1">{stats.totalClubs}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/20">
            <div className="text-[11px] font-bold text-emerald-400 uppercase">Ativos Pagantes</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{stats.activeClubs}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/20">
            <div className="text-[11px] font-bold text-amber-400 uppercase">Em Teste / Vencidos</div>
            <div className="text-2xl font-black text-amber-400 mt-1">
              {stats.trialClubs} <span className="text-xs text-red-400 font-bold">({stats.suspendedOrExpired} bloq.)</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Receita Mensal Est.
            </div>
            <div className="text-2xl font-black text-white mt-1">
              R$ {Number(stats.estimatedMonthlyRevenue || 0).toFixed(2).replace('.', ',')}
            </div>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback.error && (
        <div className="p-4 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{feedback.error}</span>
        </div>
      )}
      {feedback.success && (
        <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{feedback.success}</span>
        </div>
      )}

      {/* Formulário de Criação Manual */}
      {showCreate && (
        <form onSubmit={handleCreateClub} className="p-5 sm:p-6 rounded-3xl bg-slate-900 border border-emerald-500/30 space-y-4 shadow-xl">
          <h2 className="text-base font-black text-white">Cadastrar Clube Manualmente</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Nome do Clube *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Clube Águias do Sul"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Código de Acesso (opcional)</label>
              <input
                type="text"
                value={form.join_code}
                onChange={(e) => setForm({ ...form, join_code: e.target.value.toUpperCase() })}
                placeholder="Ex: AGUIAS2026"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Dias de Validade</label>
              <input
                type="number"
                value={form.days}
                onChange={(e) => setForm({ ...form, days: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Plano</label>
              <input
                type="text"
                value={form.plan_name}
                onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Mensalidade (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.monthly_price}
                onChange={(e) => setForm({ ...form, monthly_price: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Limite de Membros</label>
              <input
                type="number"
                value={form.max_members}
                onChange={(e) => setForm({ ...form, max_members: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <div className="text-[11px] font-bold text-amber-400 mb-2">
              Diretor Inicial do Clube (opcional — deixe em branco se o diretor for se cadastrar depois):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={form.admin_name}
                onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                placeholder="Nome do Diretor"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
              <input
                type="email"
                value={form.admin_email}
                onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                placeholder="E-mail do Diretor"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
              <input
                type="password"
                value={form.admin_password}
                onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                placeholder="Senha inicial (min 6)"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black"
            >
              Criar Clube
            </button>
          </div>
        </form>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar clube por nome, código ou e-mail do responsável..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Lista de Clubes */}
      <div className="space-y-3">
        {filtered.map((club) => {
          const daysLeft = daysRemaining(club.expires_at);
          return (
            <div
              key={club.id}
              className={`p-4 sm:p-5 rounded-3xl bg-slate-900 border transition flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                club.isExpired
                  ? 'border-red-500/40 bg-red-950/10'
                  : club.status === 'trial'
                    ? 'border-amber-500/30'
                    : 'border-slate-800'
              }`}
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-black text-white">{club.name}</span>
                  <span className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-mono font-bold text-amber-400">
                    Código: {club.join_code}
                  </span>
                  {club.status === 'suspended' ? (
                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> Suspenso
                    </span>
                  ) : club.isExpired ? (
                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Vencido
                    </span>
                  ) : club.status === 'trial' ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      Teste ({daysLeft}d restantes)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Ativo ({daysLeft}d)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    {club.members_count} / {club.max_members} membros
                  </span>
                  <span>Plano: <strong className="text-slate-200">{club.plan_name}</strong> (R$ {Number(club.monthly_price || 0).toFixed(2).replace('.', ',')})</span>
                  <span>Vence em: <strong className="text-slate-200">{formatDate(club.expires_at)}</strong></span>
                  {club.owner_email && <span>Resp: {club.owner_email}</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRenew(club, 30)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  +30 Dias (Pix)
                </button>

                <button
                  onClick={() => handleToggleStatus(club)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                    club.status === 'suspended'
                      ? 'bg-blue-500/15 hover:bg-blue-500/25 border-blue-500/30 text-blue-300'
                      : 'bg-red-500/15 hover:bg-red-500/25 border-red-500/30 text-red-300'
                  }`}
                >
                  {club.status === 'suspended' ? (
                    <>
                      <Play className="w-3.5 h-3.5" /> Reativar
                    </>
                  ) : (
                    <>
                      <Ban className="w-3.5 h-3.5" /> Suspender
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
