const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit, getSetting } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

// Listar todas as equipes com pontuações somadas e contagem de membros
router.get('/', authMiddleware, (req, res) => {
  const scoreMode = getSetting('team_score_mode', 'sum');

  const teams = db.prepare(`
    SELECT t.id, t.name, t.color, t.icon, t.motto, t.collective_balance, t.created_at,
           COUNT(u.id) as members_count,
           COALESCE(SUM(CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END), 0) as total_individual_points,
           COALESCE(SUM(u.points_balance), 0) as total_wallet_balance
    FROM teams t
    LEFT JOIN users u ON u.team_id = t.id AND u.active = 1
    GROUP BY t.id
    ORDER BY total_individual_points DESC, total_wallet_balance DESC, t.name ASC
  `).all();

  const formatted = teams.map((team, idx) => {
    const effectivePoints = scoreMode === 'collective' ? team.collective_balance : team.total_individual_points;
    return {
      ...team,
      effective_points: effectivePoints,
      wallet_points: team.total_wallet_balance,
      rank: idx + 1
    };
  });

  // Reordenar por effective_points se for coletivo
  if (scoreMode === 'collective') {
    formatted.sort((a, b) => b.effective_points - a.effective_points);
    formatted.forEach((t, i) => { t.rank = i + 1; });
  }

  return res.json({ teams: formatted, scoreMode });
});

// Detalhes da equipe e seus membros
router.get('/:id', authMiddleware, (req, res) => {
  const teamId = req.params.id;

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) {
    return res.status(404).json({ error: 'Equipe não encontrada.' });
  }

  const members = db.prepare(`
    SELECT id, name, email, role, points_balance, total_points, avatar, active
    FROM users
    WHERE team_id = ?
    ORDER BY CASE WHEN total_points > 0 THEN total_points ELSE points_balance END DESC, points_balance DESC, name ASC
  `).all(teamId);

  const totalPoints = members.reduce((acc, m) => acc + (m.active ? (m.total_points > 0 ? m.total_points : m.points_balance) : 0), 0);
  const totalWallet = members.reduce((acc, m) => acc + (m.active ? m.points_balance : 0), 0);

  // Histórico de pontos da equipe
  const recentHistory = db.prepare(`
    SELECT pt.*, u.name as user_name, a.name as actor_name
    FROM point_transactions pt
    LEFT JOIN users u ON pt.user_id = u.id
    LEFT JOIN users a ON pt.actor_id = a.id
    WHERE pt.team_id = ?
    ORDER BY pt.id DESC
    LIMIT 20
  `).all(teamId);

  return res.json({
    team: {
      ...team,
      members_count: members.length,
      total_points: totalPoints,
      total_wallet: totalWallet,
      members,
      recent_history: recentHistory
    }
  });
});

// Criar equipe (Superadmin)
router.post('/', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { name, color = '#1e40af', icon = 'Shield', motto = '', collective_balance = 0 } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da unidade/equipe é obrigatório.' });
  }

  const existing = db.prepare('SELECT id FROM teams WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (existing) {
    return res.status(400).json({ error: 'Já existe uma equipe com este nome.' });
  }

  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO teams (name, color, icon, motto, collective_balance, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name.trim(), color, icon, motto.trim(), parseInt(collective_balance, 10) || 0, now);

  const newId = Number(insert.lastInsertRowid);
  logAudit(req.user.id, 'CREATE_TEAM', 'teams', newId, { name, color, motto });

  const created = db.prepare('SELECT * FROM teams WHERE id = ?').get(newId);
  return res.status(201).json({ team: created, message: 'Unidade criada com sucesso.' });
});

// Editar equipe (Superadmin)
router.put('/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const teamId = req.params.id;
  const { name, color, icon, motto, collective_balance } = req.body;

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) {
    return res.status(404).json({ error: 'Equipe não encontrada.' });
  }

  db.prepare(`
    UPDATE teams
    SET name = COALESCE(?, name),
        color = COALESCE(?, color),
        icon = COALESCE(?, icon),
        motto = COALESCE(?, motto),
        collective_balance = COALESCE(?, collective_balance)
    WHERE id = ?
  `).run(
    name ? name.trim() : null,
    color || null,
    icon || null,
    motto !== undefined ? motto.trim() : null,
    collective_balance !== undefined ? parseInt(collective_balance, 10) : null,
    teamId
  );

  logAudit(req.user.id, 'UPDATE_TEAM', 'teams', teamId, req.body);
  const updated = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  return res.json({ team: updated, message: 'Equipe atualizada com sucesso.' });
});

// Transferir membro de equipe (Superadmin ou Diretor autorizado)
router.post('/:id/transfer-member', authMiddleware, requireRole(['superadmin', 'director']), (req, res) => {
  const targetTeamId = req.params.id;
  const { user_id, reason = 'Transferência de Unidade' } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Informe o ID do participante.' });
  }

  const targetTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(targetTeamId);
  if (!targetTeam) {
    return res.status(404).json({ error: 'Equipe de destino não encontrada.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  if (!user) {
    return res.status(404).json({ error: 'Participante não encontrado.' });
  }

  const previousTeamId = user.team_id;
  const now = new Date().toISOString();

  withTransaction(() => {
    db.prepare('UPDATE users SET team_id = ?, updated_at = ? WHERE id = ?').run(targetTeamId, now, user_id);
    logAudit(req.user.id, 'TRANSFER_MEMBER', 'users', user_id, {
      fromTeamId: previousTeamId,
      toTeamId: targetTeamId,
      reason
    });
  });

  return res.json({
    message: `Participante "${user.name}" transferido para a unidade "${targetTeam.name}" com sucesso.`
  });
});

// Excluir equipe (Superadmin)
router.delete('/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const teamId = req.params.id;

  withTransaction(() => {
    // Desvincular participantes da equipe antes de excluir
    db.prepare('UPDATE users SET team_id = NULL WHERE team_id = ?').run(teamId);
    db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
    logAudit(req.user.id, 'DELETE_TEAM', 'teams', teamId, 'Equipe excluída. Membros desvinculados.');
  });

  return res.json({ message: 'Equipe excluída com sucesso.' });
});

module.exports = router;
