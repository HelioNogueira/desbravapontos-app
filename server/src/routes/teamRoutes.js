const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit, getSetting } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

router.get('/', authMiddleware, async (req, res) => {
  const scoreMode = await getSetting('team_score_mode', 'sum', req.clubId);

  const teams = await db.all(`
    SELECT t.id, t.name, t.color, t.icon, t.motto, t.collective_balance, t.created_at,
           COUNT(u.id) as members_count,
           COALESCE(SUM(CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END), 0) as total_individual_points,
           COALESCE(SUM(u.points_balance), 0) as total_wallet_balance
    FROM teams t
    LEFT JOIN users u ON u.team_id = t.id AND u.active = 1 AND u.club_id = t.club_id
    WHERE t.club_id = ?
    GROUP BY t.id
    ORDER BY total_individual_points DESC, total_wallet_balance DESC, t.name ASC
  `, req.clubId);

  const formatted = teams.map((team, idx) => {
    const indPts = Number(team.total_individual_points || 0);
    const walletPts = Number(team.total_wallet_balance || 0);
    const effectivePoints = scoreMode === 'collective' ? Number(team.collective_balance || 0) : indPts;
    return {
      ...team,
      members_count: Number(team.members_count || 0),
      total_individual_points: indPts,
      total_wallet_balance: walletPts,
      effective_points: effectivePoints,
      wallet_points: walletPts,
      rank: idx + 1
    };
  });

  if (scoreMode === 'collective') {
    formatted.sort((a, b) => b.effective_points - a.effective_points);
    formatted.forEach((t, i) => { t.rank = i + 1; });
  }

  return res.json({ teams: formatted, scoreMode });
});

router.get('/:id', authMiddleware, async (req, res) => {
  const teamId = req.params.id;
  const team = await db.get('SELECT * FROM teams WHERE id = ? AND club_id = ?', teamId, req.clubId);
  if (!team) return res.status(404).json({ error: 'Equipe não encontrada.' });

  const members = await db.all(`
    SELECT id, name, email, role, points_balance, total_points, avatar, active
    FROM users
    WHERE team_id = ? AND club_id = ?
    ORDER BY CASE WHEN total_points > 0 THEN total_points ELSE points_balance END DESC, points_balance DESC, name ASC
  `, teamId, req.clubId);

  const totalPoints = members.reduce((acc, m) => acc + (m.active ? (m.total_points > 0 ? m.total_points : m.points_balance) : 0), 0);
  const totalWallet = members.reduce((acc, m) => acc + (m.active ? m.points_balance : 0), 0);

  const recentHistory = await db.all(`
    SELECT pt.*, u.name as user_name, a.name as actor_name
    FROM point_transactions pt
    LEFT JOIN users u ON pt.user_id = u.id
    LEFT JOIN users a ON pt.actor_id = a.id
    WHERE pt.team_id = ? AND pt.club_id = ?
    ORDER BY pt.id DESC
    LIMIT 20
  `, teamId, req.clubId);

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

router.post('/', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { name, color = '#1e40af', icon = 'Shield', motto = '', collective_balance = 0 } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da unidade/equipe é obrigatório.' });
  }

  const existing = await db.get('SELECT id FROM teams WHERE LOWER(name) = LOWER(?) AND club_id = ?', name.trim(), req.clubId);
  if (existing) {
    return res.status(400).json({ error: 'Já existe uma equipe com este nome.' });
  }

  const now = new Date().toISOString();
  const insert = await db.run(`
    INSERT INTO teams (club_id, name, color, icon, motto, collective_balance, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, req.clubId, name.trim(), color, icon, motto.trim(), parseInt(collective_balance, 10) || 0, now);

  const newId = Number(insert.lastInsertRowid);
  await logAudit(req.user.id, 'CREATE_TEAM', 'teams', newId, { name, color, motto }, req.clubId);

  const created = await db.get('SELECT * FROM teams WHERE id = ?', newId);
  return res.status(201).json({ team: created, message: 'Unidade criada com sucesso.' });
});

router.put('/:id', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const teamId = req.params.id;
  const { name, color, icon, motto, collective_balance } = req.body;

  const team = await db.get('SELECT * FROM teams WHERE id = ? AND club_id = ?', teamId, req.clubId);
  if (!team) return res.status(404).json({ error: 'Equipe não encontrada.' });

  await db.run(`
    UPDATE teams
    SET name = COALESCE(?, name),
        color = COALESCE(?, color),
        icon = COALESCE(?, icon),
        motto = COALESCE(?, motto),
        collective_balance = COALESCE(?, collective_balance)
    WHERE id = ? AND club_id = ?
  `,
    name ? name.trim() : null,
    color || null,
    icon || null,
    motto !== undefined ? motto.trim() : null,
    collective_balance !== undefined ? parseInt(collective_balance, 10) : null,
    teamId,
    req.clubId
  );

  await logAudit(req.user.id, 'UPDATE_TEAM', 'teams', teamId, req.body, req.clubId);
  const updated = await db.get('SELECT * FROM teams WHERE id = ?', teamId);
  return res.json({ team: updated, message: 'Equipe atualizada com sucesso.' });
});

router.post('/:id/transfer-member', authMiddleware, requireRole(['superadmin', 'director']), async (req, res) => {
  const targetTeamId = req.params.id;
  const { user_id, reason = 'Transferência de Unidade' } = req.body;

  if (!user_id) return res.status(400).json({ error: 'Informe o ID do participante.' });

  const targetTeam = await db.get('SELECT * FROM teams WHERE id = ? AND club_id = ?', targetTeamId, req.clubId);
  if (!targetTeam) return res.status(404).json({ error: 'Equipe de destino não encontrada.' });

  const user = await db.get('SELECT * FROM users WHERE id = ? AND club_id = ?', user_id, req.clubId);
  if (!user) return res.status(404).json({ error: 'Participante não encontrado.' });

  const previousTeamId = user.team_id;
  const now = new Date().toISOString();

  await withTransaction(async () => {
    await db.run('UPDATE users SET team_id = ?, updated_at = ? WHERE id = ?', targetTeamId, now, user_id);
    await logAudit(req.user.id, 'TRANSFER_MEMBER', 'users', user_id, {
      fromTeamId: previousTeamId,
      toTeamId: targetTeamId,
      reason
    }, req.clubId);
  });

  return res.json({
    message: `Participante "${user.name}" transferido para a unidade "${targetTeam.name}" com sucesso.`
  });
});

router.delete('/:id', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const teamId = req.params.id;

  await withTransaction(async () => {
    await db.run('UPDATE users SET team_id = NULL WHERE team_id = ? AND club_id = ?', teamId, req.clubId);
    await db.run('DELETE FROM teams WHERE id = ? AND club_id = ?', teamId, req.clubId);
    await logAudit(req.user.id, 'DELETE_TEAM', 'teams', teamId, 'Equipe excluída. Membros desvinculados.', req.clubId);
  });

  return res.json({ message: 'Equipe excluída com sucesso.' });
});

module.exports = router;
