import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import {
  Shield,
  Users,
  Award,
  ArrowRightLeft,
  PlusCircle,
  Edit2,
  Trash2,
  TrendingUp,
  UserCheck
} from 'lucide-react';

export default function TeamsPage() {
  const { user, isSuperAdmin, isDirector } = useAuth();
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamDetails, setTeamDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  // Transfer Member Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferUserId, setTransferUserId] = useState('');
  const [targetTeamId, setTargetTeamId] = useState('');
  const [transferReason, setTransferReason] = useState('');

  // Create Team Modal
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', color: '#1e40af', icon: 'Shield', motto: '', collective_balance: 0 });

  const loadTeams = async () => {
    try {
      setLoading(true);
      const res = await api.getTeams();
      setTeams(res.teams || []);
      if (res.teams?.length > 0 && !selectedTeam) {
        setSelectedTeam(res.teams[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamDetails = async (id) => {
    try {
      const res = await api.getTeamDetails(id);
      setTeamDetails(res.team);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      loadTeamDetails(selectedTeam);
    }
  }, [selectedTeam]);

  const handleTransfer = async (e) => {
    e.preventDefault();
    try {
      const res = await api.transferMember(targetTeamId, transferUserId, transferReason);
      alert(res.message);
      setShowTransferModal(false);
      loadTeams();
      if (selectedTeam) loadTeamDetails(selectedTeam);
    } catch (err) {
      alert(err.message || 'Erro ao transferir.');
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      await api.createTeam(newTeam);
      setShowCreateTeamModal(false);
      setNewTeam({ name: '', color: '#1e40af', icon: 'Shield', motto: '', collective_balance: 0 });
      loadTeams();
    } catch (err) {
      alert(err.message || 'Erro ao criar unidade.');
    }
  };

  const handleDeleteTeam = async () => {
    if (!teamDetails) return;
    if (!confirm(`Tem certeza que deseja excluir a unidade "${teamDetails.name}"? Os membros cadastrados ficarão como "Sem Unidade".`)) return;

    try {
      await api.deleteTeam(teamDetails.id);
      alert(`Unidade "${teamDetails.name}" excluída com sucesso!`);
      setSelectedTeam(null);
      setTeamDetails(null);
      loadTeams();
    } catch (err) {
      alert(err.message || 'Erro ao excluir unidade.');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4 text-amber-500" />
            Unidades de Desbravadores
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Equipes & Rankings Coletivos
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Acompanhe a pontuação total das unidades, lista de membros e histórico de conquistas.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => setShowCreateTeamModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            Nova Unidade
          </button>
        )}
      </div>

      {/* Grid de Unidades */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {teams.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTeam(t.id)}
            className={`p-5 rounded-3xl border text-left transition flex flex-col justify-between ${
              selectedTeam === t.id
                ? 'bg-slate-850 border-amber-500 shadow-xl shadow-amber-500/10'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                  t.rank === 1 ? 'bg-amber-500 text-slate-950 font-black' :
                  t.rank === 2 ? 'bg-slate-300 text-slate-950' :
                  t.rank === 3 ? 'bg-amber-700 text-white' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  #{t.rank}
                </span>
              </div>

              <h3 className="font-extrabold text-base text-white">{t.name}</h3>
              <p className="text-xs text-slate-400 mt-1 italic line-clamp-1">{t.motto || 'Sem lema'}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">{t.members_count} membros</span>
              <span className="font-black text-amber-400 text-sm">
                {t.effective_points?.toLocaleString('pt-BR')} pts
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Detalhes da Unidade Selecionada */}
      {teamDetails && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: teamDetails.color }} />
                <h2 className="text-xl font-bold text-white">{teamDetails.name}</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1 italic">"{teamDetails.motto}"</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Pontuação Total</span>
                <span className="text-2xl font-black text-amber-400">
                  {teamDetails.total_points?.toLocaleString('pt-BR')} pts
                </span>
              </div>

              {(isSuperAdmin || isDirector) && (
                <button
                  onClick={() => {
                    setTargetTeamId(teams.find(t => t.id !== selectedTeam)?.id || '');
                    setShowTransferModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Transferir Membro
                </button>
              )}

              {isSuperAdmin && (
                <button
                  onClick={handleDeleteTeam}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 border border-red-500/30 transition"
                  title="Excluir esta unidade"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Unidade
                </button>
              )}
            </div>
          </div>

          {/* Lista de Integrantes */}
          <div>
            <h3 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" /> Integrantes da Unidade ({teamDetails.members?.length || 0})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamDetails.members?.map((m, idx) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-2xl bg-slate-850/80 border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={m.avatar}
                      name={m.name}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{m.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{m.email}</div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-amber-400">{m.points_balance} pts</div>
                    <div className="text-[10px] text-slate-500">#{idx + 1} na equipe</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Transferência */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Transferir Desbravador</h3>
            <p className="text-xs text-slate-400 mb-4">Mude o participante de unidade mantendo seus pontos.</p>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Participante</label>
                <select
                  value={transferUserId}
                  onChange={(e) => setTransferUserId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                >
                  <option value="">Selecione o membro...</option>
                  {teamDetails?.members?.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.points_balance} pts)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Unidade de Destino</label>
                <select
                  value={targetTeamId}
                  onChange={(e) => setTargetTeamId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                >
                  {teams.filter(t => t.id !== selectedTeam).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Motivo da Transferência</label>
                <input
                  type="text"
                  required
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Ex: Reorganização por faixa etária"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl"
                >
                  Confirmar Transferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Criação de Unidade */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Criar Nova Unidade</h3>
            <p className="text-xs text-slate-400 mb-4">Adicione uma unidade oficial ao clube.</p>

            <form onSubmit={handleCreateTeam} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome da Unidade</label>
                <input
                  type="text"
                  required
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                  placeholder="Ex: Unidade Leão de Judá"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Lema da Unidade</label>
                <input
                  type="text"
                  value={newTeam.motto}
                  onChange={(e) => setNewTeam({ ...newTeam, motto: e.target.value })}
                  placeholder="Ex: Fortes na fé e leais na missão!"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Cor Representativa</label>
                <input
                  type="color"
                  value={newTeam.color}
                  onChange={(e) => setNewTeam({ ...newTeam, color: e.target.value })}
                  className="w-full h-10 p-1 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl"
                >
                  Salvar Unidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
