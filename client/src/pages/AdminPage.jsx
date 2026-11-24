import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import {
  Sliders, Shield, Trash2, AlertTriangle, CheckCircle2, Lock,
  Users, RotateCcw, History, Settings, Database, PlusCircle,
  UserCheck, UserX, KeyRound, Crown, Compass, Award, Search
} from 'lucide-react';

export default function AdminPage() {
  const { user, refreshUser } = useAuth();
  const [activeSection, setActiveSection] = useState('members'); // 'members', 'reset', 'settings', 'audit', 'history'
  
  // Estados de Membros
  const [allUsers, setAllUsers] = useState([]);
  const [teamsList, setTeamsList] = useState([]);
  const [userFilter, setUserFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false);
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    password: '',
    role: 'participant',
    club_role: '',
    team_id: '',
    initial_points: 0
  });

  // Estados de Reset
  const [resetType, setResetType] = useState('all_individual');
  const [adminPassword, setAdminPassword] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ error: '', success: '' });
  const [resetHistory, setResetHistory] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [rh, al, st, us, tm] = await Promise.all([
        api.getResetHistory().catch(() => ({ history: [] })),
        api.getAuditLogs('?limit=40').catch(() => ({ logs: [] })),
        api.getSettings().catch(() => ({ settings: {} })),
        api.getUsers().catch(() => ({ users: [] })),
        api.getTeams().catch(() => ({ teams: [] }))
      ]);
      setResetHistory(rh.history || []);
      setAuditLogs(al.logs || []);
      setSettings(st.settings || {});
      setAllUsers(us.users || []);
      setTeamsList(tm.teams || []);
      if (tm.teams?.length > 0 && !newMember.team_id) {
        setNewMember(prev => ({ ...prev, team_id: tm.teams[0].id }));
      }
    } catch (_) {}
  };

  // Cadastrar Novo Membro pelo Painel Administrativo
  const handleCreateMember = async (e) => {
    e.preventDefault();
    setFeedback({ error: '', success: '' });
    try {
      const payload = {
        ...newMember,
        team_id: newMember.role === 'superadmin' ? null : (newMember.team_id ? Number(newMember.team_id) : null),
        initial_points: parseInt(newMember.initial_points, 10) || 0
      };

      const res = await api.createUser(payload);
      setShowCreateMemberModal(false);
      setNewMember({
        name: '',
        email: '',
        password: '',
        role: 'participant',
        club_role: '',
        team_id: teamsList[0]?.id || '',
        initial_points: 0
      });
      alert(res.message || 'Membro cadastrado com sucesso!');
      loadAll();
      refreshUser();
    } catch (err) {
      alert(err.message || 'Erro ao cadastrar membro.');
    }
  };

  // Bloquear / Desbloquear Usuário
  const handleToggleStatus = async (targetUser) => {
    try {
      const nextStatus = targetUser.active ? 0 : 1;
      await api.toggleUserStatus(targetUser.id, nextStatus);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  // Redefinir Senha de Membro
  const handleResetPassword = async (targetUser) => {
    const newPwd = prompt(`Digite a nova senha para ${targetUser.name} (mínimo 6 caracteres):`);
    if (!newPwd) return;
    try {
      await api.resetUserPassword(targetUser.id, newPwd);
      alert('Senha redefinida com sucesso!');
    } catch (err) {
      alert(err.message);
    }
  };

  // Excluir Conta de Membro
  const handleDeleteUser = async (targetUser) => {
    if (!confirm(`Tem certeza que deseja excluir o cadastro de ${targetUser.name}?`)) return;
    try {
      await api.deleteUser(targetUser.id);
      loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  // Executar Reset
  const handleReset = async (e) => {
    e.preventDefault();
    if (!adminPassword) { setFeedback({ error: 'Digite sua senha para confirmar.', success: '' }); return; }
    if (!reason.trim()) { setFeedback({ error: 'Justificativa obrigatória.', success: '' }); return; }
    if (!confirm(`ATENÇÃO: Você está prestes a executar um RESET do tipo "${resetType}". Esta ação é irreversível. Deseja continuar?`)) return;

    setSubmitting(true);
    setFeedback({ error: '', success: '' });
    try {
      const res = await api.executeReset({
        admin_password: adminPassword,
        reset_type: resetType,
        target_user_ids: selectedUserIds,
        reason
      });
      setFeedback({ error: '', success: res.message });
      setAdminPassword('');
      setReason('');
      setSelectedUserIds([]);
      loadAll();
      refreshUser();
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await api.updateSettings(settings);
      alert('Configurações salvas com sucesso!');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRestore = async (id) => {
    const pwd = prompt('Digite a senha do Super Administrador para restaurar este snapshot:');
    if (!pwd) return;
    try {
      const res = await api.restoreReset(id, pwd);
      alert(res.message);
      loadAll();
      refreshUser();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredUsers = allUsers.filter(u => {
    const matchesSearch = !userFilter || u.name.toLowerCase().includes(userFilter.toLowerCase()) || u.email.toLowerCase().includes(userFilter.toLowerCase());
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const sections = [
    { id: 'members', label: 'Membros & Cadastros', icon: Users },
    { id: 'reset', label: 'Resets & Zeragem', icon: RotateCcw },
    { id: 'settings', label: 'Configurações do Clube', icon: Settings },
    { id: 'audit', label: 'Logs de Auditoria', icon: History },
    { id: 'history', label: 'Histórico de Resets', icon: Database }
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Header do Pastor / Superadmin */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-amber-950/30 border border-purple-500/40 shadow-xl">
        <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1">
          <Crown className="w-4 h-4 text-amber-400" /> Painel do Pastor & Direção Geral
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">Administração do Clube</h1>
        <p className="text-xs text-slate-400 mt-1">
          Gerenciamento de desbravadores, diretoria, senhas, resets com segurança e auditoria.
        </p>
      </div>

      {/* Abas */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeSection === s.id
                ? 'bg-purple-600 text-white shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <s.icon className="w-4 h-4" /> {s.label}
          </button>
        ))}
      </div>

      {/* ABA 1: MEMBROS & CADASTROS */}
      {activeSection === 'members' && (
        <div className="p-5 sm:p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" /> Cadastro & Controle de Membros ({filteredUsers.length})
              </h2>
              <p className="text-xs text-slate-400">
                Cadastre e gerencie desbravadores, membros da diretoria e pastores.
              </p>
            </div>

            <button
              onClick={() => setShowCreateMemberModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs shadow-md transition shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              Cadastrar Novo Membro
            </button>
          </div>

          {/* Filtros de Membros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>

            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              >
                <option value="">Todos os Níveis</option>
                <option value="participant">Desbravadores (Participantes)</option>
                <option value="director">Diretoria</option>
                <option value="superadmin">Super Administradores (Pastores)</option>
              </select>
            </div>
          </div>

          {/* Lista de Usuários */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Membro</th>
                  <th className="py-2.5 px-3">Nível / Cargo</th>
                  <th className="py-2.5 px-3">Unidade</th>
                  <th className="py-2.5 px-3 text-right">Saldo</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.map((u) => {
                  const isSuper = u.role === 'superadmin';
                  const isDir = u.role === 'director';

                  return (
                    <tr key={u.id} className="hover:bg-slate-850/40 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white flex items-center gap-2">
                          <Avatar
                            src={u.avatar}
                            name={u.name}
                            size="sm"
                          />
                          <div>
                            <div>{u.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          isSuper ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                          isDir ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {isSuper ? <Crown className="w-3 h-3 text-red-400" /> :
                           isDir ? <Shield className="w-3 h-3 text-amber-400" /> :
                           <Compass className="w-3 h-3 text-blue-400" />}
                          {isSuper ? 'Pastor / Geral' : isDir ? 'Diretoria' : 'Desbravador'}
                        </span>
                        {u.club_role && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{u.club_role}</div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                        {u.team_name ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: u.team_color || '#3b82f6' }} />
                            {u.team_name}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Sem Unidade</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-black text-amber-400 whitespace-nowrap">
                        {u.points_balance?.toLocaleString('pt-BR')} pts
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {u.active ? 'Ativo' : 'Bloqueado'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Redefinir Senha */}
                          <button
                            onClick={() => handleResetPassword(u)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Redefinir Senha"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Bloquear / Desbloquear */}
                          {u.id !== user?.id && (
                            <button
                              onClick={() => handleToggleStatus(u)}
                              className={`p-1.5 rounded-lg transition ${
                                u.active
                                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                              }`}
                              title={u.active ? 'Bloquear Conta' : 'Ativar Conta'}
                            >
                              {u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {/* Excluir Conta */}
                          {u.id !== user?.id && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition"
                              title="Excluir Conta"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 2: RESET */}
      {activeSection === 'reset' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
          <h2 className="font-bold text-white flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-red-400" /> Executar Reset de Pontuação
          </h2>
          <p className="text-xs text-slate-400">
            Um snapshot completo dos saldos atuais será salvo automaticamente antes de qualquer alteração para permitir restauração (rollback).
          </p>

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tipo de Reset</label>
              <select
                value={resetType}
                onChange={(e) => setResetType(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              >
                <option value="all_individual">Zerar todos os saldos individuais de participantes</option>
                <option value="all_collective">Zerar saldo coletivo de todas as equipes</option>
                <option value="selected_users">Zerar apenas participantes selecionados</option>
                <option value="season_reset">Reiniciar temporada (encerra a atual e cria nova)</option>
              </select>
            </div>

            {resetType === 'selected_users' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Selecione os Participantes ({selectedUserIds.length})
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-slate-800">
                  {allUsers.filter(u => u.role === 'participant').map((u) => (
                    <label key={u.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(u.id)}
                        onChange={() => setSelectedUserIds(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                        className="accent-red-500"
                      />
                      {u.name} ({u.points_balance}pts)
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Justificativa Obrigatória</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={2}
                placeholder="Ex: Virada de temporada do 2º semestre 2026..."
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              />
            </div>

            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 space-y-3">
              <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                <Lock className="w-4 h-4" /> Confirmação de Segurança (Etapa 2)
              </div>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                placeholder="Digite sua senha de Pastor / Super Admin para confirmar"
                className="w-full px-4 py-2.5 bg-slate-900 border border-red-500/40 rounded-xl text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-sm rounded-xl shadow-lg shadow-red-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" /> {submitting ? 'Processando Reset...' : 'Executar Reset com Snapshot de Segurança'}
            </button>
          </form>
        </div>
      )}

      {/* ABA 3: CONFIGURAÇÕES DO CLUBE */}
      {activeSection === 'settings' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" /> Configurações do Clube & Códigos de Registro
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'club_name', label: 'Nome do Clube de Desbravadores', type: 'text' },
              { key: 'timezone', label: 'Fuso Horário', type: 'text' },
              { key: 'director_registration_code', label: 'Código de Cadastro da Diretoria', type: 'text' },
              { key: 'superadmin_registration_code', label: 'Chave Mestra de Cadastro do Pastor', type: 'text' },
              { key: 'director_points_limit', label: 'Limite de Pts por Operação (Diretoria)', type: 'number' },
              { key: 'anti_sniper_seconds', label: 'Anti-Sniper: Segundos Finais', type: 'number' },
              { key: 'anti_sniper_extension', label: 'Anti-Sniper: Extensão de Tempo (seg)', type: 'number' },
              { key: 'default_bid_step', label: 'Passo Mínimo de Lance Padrão', type: 'number' }
            ].map((s) => (
              <div key={s.key}>
                <label className="block text-xs font-semibold text-slate-300 mb-1">{s.label}</label>
                <input
                  type={s.type}
                  value={settings[s.key] || ''}
                  onChange={(e) => setSettings({ ...settings, [s.key]: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>
            ))}

            {[
              { key: 'require_points_for_bids', label: 'Exigir Saldo de Pontos para Dar Lances (se desligado, lances são livres)' },
              { key: 'enable_points_system', label: 'Habilitar Carteira e Sistema de Pontos no Clube' },
              { key: 'allow_negative_balance', label: 'Permitir Saldo Negativo' },
              { key: 'director_can_award_points', label: 'Diretoria Pode Lançar Pontos' }
            ].map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings[s.key] === 'true'}
                    onChange={(e) => setSettings({ ...settings, [s.key]: e.target.checked ? 'true' : 'false' })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-checked:bg-amber-500 rounded-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
                <span className="text-xs font-semibold text-slate-300">{s.label}</span>
              </div>
            ))}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Modo de Pontuação das Equipes</label>
              <select
                value={settings.team_score_mode || 'sum'}
                onChange={(e) => setSettings({ ...settings, team_score_mode: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
              >
                <option value="sum">Soma dos saldos individuais dos membros</option>
                <option value="collective">Cofre coletivo independente</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition"
          >
            Salvar Configurações
          </button>
        </div>
      )}

      {/* ABA 4: AUDITORIA */}
      {activeSection === 'audit' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <h2 className="font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-blue-400" /> Logs de Auditoria Completos
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Ação</th>
                  <th className="py-2 px-3">Entidade</th>
                  <th className="py-2 px-3">Responsável</th>
                  <th className="py-2 px-3">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-500">{log.id}</td>
                    <td className="py-2 px-3 font-semibold text-white">{log.action}</td>
                    <td className="py-2 px-3 text-slate-400">{log.entity_type} #{log.entity_id}</td>
                    <td className="py-2 px-3 text-slate-400">{log.actor_name || 'Sistema'}</td>
                    <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 5: HISTÓRICO DE RESETS */}
      {activeSection === 'history' && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" /> Histórico de Resets & Snapshots
          </h2>
          {resetHistory.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">Nenhum reset executado até o momento.</p>
          ) : (
            <div className="space-y-3">
              {resetHistory.map((rh) => (
                <div key={rh.id} className="p-4 rounded-2xl bg-slate-850/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Snapshot #{rh.id} — {rh.reset_type}</span>
                    <span className="text-[10px] text-slate-500">{new Date(rh.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="text-xs text-slate-400">{rh.target_description}</p>
                  <p className="text-[11px] text-slate-500">Motivo: {rh.reason}</p>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-[10px] text-slate-500">Por: {rh.actor_name} | Afetados: {rh.affected_count}</span>
                    <button
                      onClick={() => handleRestore(rh.id)}
                      className="text-amber-400 hover:text-amber-300 text-xs font-semibold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Restaurar Snapshot
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Cadastrar Novo Membro pelo Painel */}
      {showCreateMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Cadastrar Membro no Clube</h3>
            <p className="text-xs text-slate-400">
              Cadastre desbravadores, membros da diretoria ou pastores diretamente.
            </p>

            <form onSubmit={handleCreateMember} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nível de Permissão</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMember({ ...newMember, role: 'participant' })}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition ${
                      newMember.role === 'participant'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Desbravador
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMember({ ...newMember, role: 'director' })}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition ${
                      newMember.role === 'director'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Diretoria
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMember({ ...newMember, role: 'superadmin' })}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition ${
                      newMember.role === 'superadmin'
                        ? 'bg-red-500/20 border-red-500 text-red-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Pastor / Geral
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  placeholder="Nome do membro"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    placeholder="email@clube.org"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Senha Provisória</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newMember.password}
                    onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {newMember.role !== 'superadmin' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Unidade</label>
                    <select
                      value={newMember.team_id}
                      onChange={(e) => setNewMember({ ...newMember, team_id: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                    >
                      <option value="">Sem Unidade</option>
                      {teamsList.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={newMember.role === 'superadmin' ? 'sm:col-span-2' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Cargo no Clube</label>
                  <input
                    type="text"
                    value={newMember.club_role}
                    onChange={(e) => setNewMember({ ...newMember, club_role: e.target.value })}
                    placeholder="Ex: Pastor, Conselheiro, Desbravador"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              {newMember.role === 'participant' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Pontos Iniciais de Boas-Vindas</label>
                  <input
                    type="number"
                    min="0"
                    value={newMember.initial_points}
                    onChange={(e) => setNewMember({ ...newMember, initial_points: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateMemberModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md"
                >
                  Concluir Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
