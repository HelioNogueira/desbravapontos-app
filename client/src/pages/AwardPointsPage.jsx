import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import {
  Award,
  Users,
  User,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Shield,
  Layers,
  ArrowRight,
  Info,
  Clock,
  RotateCcw,
  Search,
  ChevronDown,
  Check,
  X,
  Filter
} from 'lucide-react';

export default function AwardPointsPage() {
  const { user, isSuperAdmin, isDirector, refreshUser } = useAuth();

  const [mode, setMode] = useState('single'); // 'single' ou 'batch'
  const [usersList, setUsersList] = useState([]);
  const [teamsList, setTeamsList] = useState([]);
  const [reasonsList, setReasonsList] = useState([]);
  const [recentTx, setRecentTx] = useState([]);

  // Form Individual
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [pointType, setPointType] = useState('bonus');

  // Form Lote
  const [batchTargetType, setBatchTargetType] = useState('team'); // 'team' ou 'multiple'
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [batchAmount, setBatchAmount] = useState('');
  const [batchReason, setBatchReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ error: '', success: '' });

  // Controle de busca e seleção estilizada de membros
  const [memberSearch, setMemberSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');

  // Modal de Estorno (para Superadmin)
  const [revertTxId, setRevertTxId] = useState(null);
  const [revertReason, setRevertReason] = useState('');

  const loadData = async () => {
    try {
      const [uRes, tRes, rRes, txRes] = await Promise.all([
        api.getUsers('?role=participant'),
        api.getTeams(),
        api.getReasons(),
        api.getTransactions('?limit=10')
      ]);

      setUsersList(uRes.users || []);
      setTeamsList(tRes.teams || []);
      setReasonsList(rRes.reasons || []);
      setRecentTx(txRes.transactions || []);

      if (uRes.users?.length > 0 && !selectedUserId) {
        setSelectedUserId(uRes.users[0].id);
      }
      if (tRes.teams?.length > 0 && !selectedTeamId) {
        setSelectedTeamId(tRes.teams[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApplyPresetReason = (preset) => {
    setAmountInput(preset.defaultPoints);
    setReasonInput(preset.title);
    setPointType(preset.category);
  };

  const handleApplyBatchPreset = (preset) => {
    setBatchAmount(preset.defaultPoints);
    setBatchReason(preset.title);
  };

  // Submissão Individual
  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ error: '', success: '' });

    if (!selectedUserId || !amountInput || !reasonInput) {
      setFeedback({ error: 'Preencha todos os campos obrigatórios.', success: '' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.awardSingle({
        user_id: Number(selectedUserId),
        amount: parseInt(amountInput, 10),
        reason: reasonInput,
        type: pointType
      });

      setFeedback({ error: '', success: res.message });
      setAmountInput('');
      setReasonInput('');
      loadData();
      refreshUser();
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    } finally {
      setSubmitting(false);
    }
  };

  // Submissão em Lote
  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ error: '', success: '' });

    if (!batchReason || !batchAmount) {
      setFeedback({ error: 'Informe a quantidade de pontos e a justificativa.', success: '' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        amount: parseInt(batchAmount, 10),
        reason: batchReason,
        type: parseInt(batchAmount, 10) < 0 ? 'penalty' : 'batch'
      };

      if (batchTargetType === 'team') {
        payload.team_id = Number(selectedTeamId);
      } else {
        payload.user_ids = selectedUserIds;
      }

      const res = await api.awardBatch(payload);
      setFeedback({ error: '', success: res.message });
      setBatchAmount('');
      setBatchReason('');
      setSelectedUserIds([]);
      loadData();
      refreshUser();
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    } finally {
      setSubmitting(false);
    }
  };

  // Estorno Administrativo Compensatório
  const handleRevert = async (txId) => {
    if (!revertReason.trim()) {
      alert('Informe o motivo do estorno.');
      return;
    }
    try {
      const res = await api.revertTransaction(txId, revertReason);
      alert(res.message);
      setRevertTxId(null);
      setRevertReason('');
      loadData();
      refreshUser();
    } catch (err) {
      alert(err.message || 'Erro ao estornar.');
    }
  };

  const toggleSelectUser = (id) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectedUser = usersList.find((u) => Number(u.id) === Number(selectedUserId));

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Award className="w-4 h-4 text-amber-500" />
            Módulo de Atribuição de Pontos
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Distribuição de Pontos
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Lançamento rápido individual ou coletivo por tarefas, presença, lição e comportamento.
          </p>
        </div>

        {isDirector && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 shrink-0">
            <Info className="w-4 h-4 text-amber-400" />
            <span>Limite por operação: <strong>500 pts</strong></span>
          </div>
        )}
      </div>

      {/* Alternador de Modalidade: Individual vs Lote */}
      <div className="flex p-1 rounded-2xl bg-slate-900 border border-slate-800 max-w-md mx-auto">
        <button
          onClick={() => { setMode('single'); setFeedback({ error: '', success: '' }); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            mode === 'single'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <User className="w-4 h-4" />
          Lançamento Individual
        </button>

        <button
          onClick={() => { setMode('batch'); setFeedback({ error: '', success: '' }); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            mode === 'batch'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          Lançamento em Lote / Equipe
        </button>
      </div>

      {/* Alertas de Sucesso / Erro */}
      {feedback.error && (
        <div className="p-4 rounded-2xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{feedback.error}</span>
        </div>
      )}

      {feedback.success && (
        <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{feedback.success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário Principal (Colunas 1 e 2) */}
        <div className="lg:col-span-2">
          {mode === 'single' ? (
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <User className="w-4 h-4 text-amber-500" /> Lançar Pontos para 1 Participante
              </h2>

              {/* Botões Rápidos de Motivos Oficiais do Clube */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">
                  Atalhos de Motivos do Clube (1 Clique para Preencher):
                </label>
                <div className="flex flex-wrap gap-2">
                  {reasonsList.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPresetReason(preset)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        preset.defaultPoints > 0
                          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50'
                          : 'bg-red-950/30 border-red-500/30 text-red-300 hover:bg-red-900/50'
                      }`}
                    >
                      {preset.title} ({preset.defaultPoints > 0 ? `+${preset.defaultPoints}` : preset.defaultPoints} pts)
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSingleSubmit} className="space-y-4">
                {/* Seletor Estilizado de Participante */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Participante Destinatário
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowMemberPicker(!showMemberPicker)}
                      className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition flex items-center gap-1"
                    >
                      {showMemberPicker ? 'Fechar Seleção' : 'Alterar Membro'}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMemberPicker ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Card do Membro Atualmente Selecionado */}
                  {selectedUser ? (
                    <div
                      onClick={() => setShowMemberPicker(!showMemberPicker)}
                      className="p-3.5 rounded-2xl bg-slate-800/90 border border-slate-700/80 hover:border-amber-500/50 cursor-pointer transition flex items-center justify-between gap-3 shadow-md group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          src={selectedUser.avatar}
                          name={selectedUser.name}
                          size="md"
                          className="ring-2 ring-amber-500/30 group-hover:ring-amber-500 transition"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-black text-white truncate flex items-center gap-2">
                            {selectedUser.name}
                            {selectedUser.team_name && (
                              <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white shrink-0"
                                style={{ backgroundColor: selectedUser.team_color || '#1e40af' }}
                              >
                                {selectedUser.team_name}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{selectedUser.email}</div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-amber-400 block">
                          {(selectedUser.total_points || selectedUser.points_balance)?.toLocaleString('pt-BR')} pts geral
                        </span>
                        <span className="text-[10px] text-slate-400 block font-normal">
                          Saldo leilão: {selectedUser.points_balance?.toLocaleString('pt-BR')} pts
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setShowMemberPicker(true)}
                      className="p-3.5 rounded-2xl bg-slate-800/60 border border-dashed border-slate-700 text-center text-xs text-slate-400 cursor-pointer hover:border-amber-500"
                    >
                      Nenhum desbravador selecionado. Clique para escolher.
                    </div>
                  )}

                  {/* Gaveta / Dropdown Estilizado de Escolha */}
                  {showMemberPicker && (
                    <div className="mt-2.5 p-3 rounded-2xl bg-slate-850 border border-slate-750 shadow-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                      {/* Campo de Busca Rápida */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Buscar por nome, e-mail ou unidade..."
                          className="w-full pl-9 pr-8 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                        {memberSearch && (
                          <button
                            type="button"
                            onClick={() => setMemberSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Filtro Rápido de Unidades */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
                        <button
                          type="button"
                          onClick={() => setTeamFilter('all')}
                          className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition ${
                            teamFilter === 'all'
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          Todas as Unidades ({usersList.length})
                        </button>
                        {teamsList.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setTeamFilter(String(t.id))}
                            className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition flex items-center gap-1.5 ${
                              teamFilter === String(t.id)
                                ? 'bg-amber-500 text-slate-950 shadow-sm'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </button>
                        ))}
                      </div>

                      {/* Lista de Membros Filtrados */}
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40">
                        {usersList
                          .filter((u) => {
                            const term = memberSearch.trim().toLowerCase();
                            const matchesSearch = !term ||
                              u.name.toLowerCase().includes(term) ||
                              (u.team_name && u.team_name.toLowerCase().includes(term)) ||
                              (u.email && u.email.toLowerCase().includes(term));
                            const matchesTeam = teamFilter === 'all' || String(u.team_id) === String(teamFilter);
                            return matchesSearch && matchesTeam;
                          })
                          .map((u) => {
                            const isSelected = Number(selectedUserId) === Number(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  setSelectedUserId(u.id);
                                  setShowMemberPicker(false);
                                }}
                                className={`w-full p-2.5 rounded-xl text-left transition flex items-center justify-between gap-3 ${
                                  isSelected
                                    ? 'bg-amber-500/15 border border-amber-500/40 text-white'
                                    : 'hover:bg-slate-800/80 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Avatar src={u.avatar} name={u.name} size="sm" />
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                      {u.name}
                                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                      {u.team_name ? (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: u.team_color || '#1e40af' }} />
                                          <span>{u.team_name}</span>
                                        </>
                                      ) : (
                                        <span>Sem Unidade</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-xs font-black text-amber-400 block">
                                    {(u.total_points || u.points_balance)?.toLocaleString('pt-BR')} pts
                                  </span>
                                  <span className="text-[9px] text-slate-400 block">
                                    Saldo: {u.points_balance?.toLocaleString('pt-BR')}
                                  </span>
                                </div>
                              </button>
                            );
                          })}

                        {usersList.filter((u) => {
                          const term = memberSearch.trim().toLowerCase();
                          const matchesSearch = !term ||
                            u.name.toLowerCase().includes(term) ||
                            (u.team_name && u.team_name.toLowerCase().includes(term)) ||
                            (u.email && u.email.toLowerCase().includes(term));
                          const matchesTeam = teamFilter === 'all' || String(u.team_id) === String(teamFilter);
                          return matchesSearch && matchesTeam;
                        }).length === 0 && (
                          <div className="py-6 text-center text-xs text-slate-500">
                            Nenhum participante encontrado com esse filtro.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Quantidade de Pontos (+ para bônus, - para penalidade)
                    </label>
                    <input
                      type="number"
                      required
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="Ex: 50 ou -20"
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Categoria do Lançamento
                    </label>
                    <select
                      value={pointType}
                      onChange={(e) => setPointType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="bonus">Bônus / Recompensa (+)</option>
                      <option value="penalty">Penalidade / Desconto (-)</option>
                      <option value="manual">Lançamento Geral / Ajuste</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Justificativa Obrigatória
                  </label>
                  <input
                    type="text"
                    required
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder="Ex: Uniforme de gala impecável na inspeção matinal..."
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'Registrando...' : 'Confirmar Lançamento de Pontos'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            /* Formulário em Lote */
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" /> Distribuição em Lote para Equipe ou Vários
              </h2>

              <div className="flex gap-4 border-b border-slate-800 pb-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="batchTarget"
                    checked={batchTargetType === 'team'}
                    onChange={() => setBatchTargetType('team')}
                    className="accent-amber-500"
                  />
                  Unidade Inteira (Todos os membros ativos)
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="batchTarget"
                    checked={batchTargetType === 'multiple'}
                    onChange={() => setBatchTargetType('multiple')}
                    className="accent-amber-500"
                  />
                  Selecionar Participantes Manuais
                </label>
              </div>

              {/* Botões Rápidos */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">
                  Atalhos de Motivos:
                </label>
                <div className="flex flex-wrap gap-2">
                  {reasonsList.slice(0, 5).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyBatchPreset(preset)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50 transition"
                    >
                      {preset.title} (+{preset.defaultPoints} pts)
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleBatchSubmit} className="space-y-4">
                {batchTargetType === 'team' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Selecione a Unidade de Destino
                    </label>
                    <select
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
                    >
                      {teamsList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.members_count} membros)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <label className="block text-xs font-semibold text-slate-300">
                        Marque os Participantes ({selectedUserIds.length} selecionados):
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds(usersList.map(u => u.id))}
                          className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition"
                        >
                          Selecionar Todos
                        </button>
                        <span className="text-slate-600">•</span>
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds([])}
                          className="text-[11px] font-bold text-slate-400 hover:text-white transition"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {/* Busca Rápida no Lote */}
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={batchSearch}
                        onChange={(e) => setBatchSearch(e.target.value)}
                        placeholder="Filtrar por nome ou unidade..."
                        className="w-full pl-8 pr-7 py-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                      {batchSearch && (
                        <button
                          type="button"
                          onClick={() => setBatchSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-slate-950/60 rounded-2xl border border-slate-800">
                      {usersList
                        .filter((u) => {
                          const term = batchSearch.trim().toLowerCase();
                          return !term ||
                            u.name.toLowerCase().includes(term) ||
                            (u.team_name && u.team_name.toLowerCase().includes(term)) ||
                            (u.email && u.email.toLowerCase().includes(term));
                        })
                        .map((u) => {
                          const isChecked = selectedUserIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className={`flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs transition border ${
                                isChecked
                                  ? 'bg-amber-500/10 border-amber-500/40 text-white'
                                  : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-850'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSelectUser(u.id)}
                                  className="accent-amber-500 rounded w-4 h-4"
                                />
                                <Avatar src={u.avatar} name={u.name} size="xs" />
                                <div className="min-w-0">
                                  <div className="font-bold truncate text-[11px]">{u.name}</div>
                                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                    {u.team_name ? (
                                      <>
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: u.team_color || '#1e40af' }} />
                                        <span>{u.team_name}</span>
                                      </>
                                    ) : (
                                      'Sem Unidade'
                                    )}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[10px] font-black text-amber-400 shrink-0 ml-1">
                                {(u.total_points || u.points_balance)?.toLocaleString('pt-BR')} pts
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Pontos para Cada Integrante
                    </label>
                    <input
                      type="number"
                      required
                      value={batchAmount}
                      onChange={(e) => setBatchAmount(e.target.value)}
                      placeholder="Ex: 40"
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Justificativa Coletiva
                    </label>
                    <input
                      type="text"
                      required
                      value={batchReason}
                      onChange={(e) => setBatchReason(e.target.value)}
                      placeholder="Ex: Presença integral e pontual no domingo"
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'Processando Lote...' : 'Distribuir Pontos para Todos'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Coluna 3: Histórico Recente de Lançamentos com Estorno (para Superadmin) */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-white">Lançamentos Recentes</h3>
              <p className="text-[11px] text-slate-400">Auditoria das últimas operações</p>
            </div>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-1">
            {recentTx.map((tx) => (
              <div
                key={tx.id}
                className="p-3 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white truncate max-w-[140px]">{tx.user_name}</span>
                  <span className={`px-2 py-0.5 rounded-lg font-black text-xs ${
                    tx.amount > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount} pts
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 leading-snug">{tx.reason}</div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500">
                  <span>por {tx.actor_name || 'Sistema'}</span>

                  {/* Superadmin pode estornar com registro compensatório */}
                  {isSuperAdmin && !tx.is_reverted && (
                    <button
                      onClick={() => { setRevertTxId(tx.id); setRevertReason(''); }}
                      className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition"
                    >
                      <RotateCcw className="w-3 h-3" /> Estornar
                    </button>
                  )}
                  {tx.is_reverted ? (
                    <span className="text-red-400 font-bold">[Estornado]</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal de Estorno Administrativo */}
      {revertTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Estornar Lançamento #{revertTxId}</h3>
            <p className="text-xs text-slate-400 mb-4">
              O registro original permanecerá no histórico e uma transação compensatória será criada.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Motivo do Estorno</label>
                <input
                  type="text"
                  required
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  placeholder="Ex: Erro de digitação no valor de pontos"
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRevertTxId(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleRevert(revertTxId)}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl"
                >
                  Confirmar Estorno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
