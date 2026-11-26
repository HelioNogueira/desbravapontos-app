const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit } = require('../db');
const { authMiddleware, requireRole, hashPassword } = require('../auth');

router.get('/', authMiddleware, async (req, res) => {
  const { team_id, role, search } = req.query;

  let query = `
    SELECT u.id, u.name, u.email, u.role, u.team_id, u.active, u.points_balance,
           CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END as total_points,
           u.avatar, u.created_at,
           t.name as team_name, t.color as team_color
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.club_id = ?
  `;
  const params = [req.clubId];

  if (team_id) {
    query += ' AND u.team_id = ?';
    params.push(team_id);
  }
  if (role) {
    query += ' AND u.role = ?';
    params.push(role);
  }
  if (search) {
    query += ' AND (LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)';
    params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
  }

  query += ' ORDER BY u.points_balance DESC, u.name ASC';
  const users = await db.all(query, ...params);
  return res.json({ users });
});

router.post('/', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { name, email, password, role = 'participant', team_id, initial_points = 0 } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', email.trim());
  if (existing) {
    return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
  }

  const now = new Date().toISOString();
  const passHash = hashPassword(password);

  const result = await withTransaction(async () => {
    const insertRes = await db.run(`
      INSERT INTO users (club_id, name, email, password_hash, role, team_id, active, points_balance, total_points, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `, req.clubId, name.trim(), email.trim().toLowerCase(), passHash, role, team_id || null, initial_points || 0, initial_points || 0, now, now);

    const newUserId = Number(insertRes.lastInsertRowid);

    if (initial_points > 0) {
      await db.run(`
        INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, actor_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'manual', 'Saldo inicial de cadastro', ?, ?)
      `, req.clubId, newUserId, team_id || null, initial_points, initial_points, req.user.id, now);
    }

    await logAudit(req.user.id, 'CREATE_USER', 'users', newUserId, { name, email, role, team_id }, req.clubId);
    return newUserId;
  });

  const createdUser = await db.get(`
    SELECT u.id, u.name, u.email, u.role, u.team_id, u.active, u.points_balance, t.name as team_name
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `, result);

  return res.status(201).json({ user: createdUser, message: 'Usuário cadastrado com sucesso.' });
});

router.put('/:id', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const userId = req.params.id;
  const { name, email, role, team_id, active } = req.body;

  const user = await db.get('SELECT * FROM users WHERE id = ? AND club_id = ?', userId, req.clubId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const now = new Date().toISOString();

  await withTransaction(async () => {
    await db.run(`
      UPDATE users
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          role = COALESCE(?, role),
          team_id = ?,
          active = COALESCE(?, active),
          updated_at = ?
      WHERE id = ?
    `,
      name ? name.trim() : null,
      email ? email.trim().toLowerCase() : null,
      role || null,
      team_id !== undefined ? (team_id || null) : user.team_id,
      active !== undefined ? (active ? 1 : 0) : null,
      now,
      userId
    );

    await logAudit(req.user.id, 'UPDATE_USER', 'users', userId, req.body, req.clubId);
  });

  const updated = await db.get('SELECT id, name, email, role, team_id, active, points_balance FROM users WHERE id = ?', userId);
  return res.json({ user: updated, message: 'Usuário atualizado com sucesso.' });
});

router.patch('/:id/status', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const userId = req.params.id;
  const { active } = req.body;

  if (active === undefined) return res.status(400).json({ error: 'Status "active" não informado.' });
  if (Number(userId) === Number(req.user.id)) {
    return res.status(400).json({ error: 'Você não pode desativar sua própria conta de Super Administrador.' });
  }

  const now = new Date().toISOString();
  await db.run('UPDATE users SET active = ?, updated_at = ? WHERE id = ? AND club_id = ?', active ? 1 : 0, now, userId, req.clubId);
  await logAudit(req.user.id, active ? 'UNBLOCK_USER' : 'BLOCK_USER', 'users', userId, { active }, req.clubId);

  return res.json({ message: active ? 'Conta ativada com sucesso.' : 'Conta bloqueada com sucesso.' });
});

router.patch('/:id/password', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const userId = req.params.id;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
  }

  const hash = hashPassword(new_password);
  const now = new Date().toISOString();

  await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND club_id = ?', hash, now, userId, req.clubId);
  await logAudit(req.user.id, 'RESET_PASSWORD', 'users', userId, 'Senha redefinida pelo Superadmin.', req.clubId);

  return res.json({ message: 'Senha redefinida com sucesso.' });
});

router.delete('/:id', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta de Super Administrador.' });
  }

  const user = await db.get('SELECT id, name FROM users WHERE id = ? AND club_id = ?', userId, req.clubId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  try {
    await withTransaction(async () => {
      await db.run('UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ?', userId);
      await db.run("DELETE FROM audit_logs WHERE entity_type = 'users' AND entity_id = ?", userId);
      await db.run('DELETE FROM point_transactions WHERE user_id = ?', userId);
      await db.run('UPDATE point_transactions SET actor_id = NULL WHERE actor_id = ?', userId);
      await db.run('DELETE FROM auction_bids WHERE user_id = ?', userId);
      await db.run('UPDATE auction_items SET current_winner_user_id = NULL WHERE current_winner_user_id = ?', userId);
      await db.run('UPDATE auctions SET created_by = NULL WHERE created_by = ?', userId);
      await db.run('UPDATE reset_history SET actor_id = ? WHERE actor_id = ?', req.user.id, userId);
      await db.run('DELETE FROM users WHERE id = ?', userId);
      await logAudit(req.user.id, 'DELETE_USER', 'users', userId, { deleted_name: user.name }, req.clubId);
    });

    return res.json({ message: `Membro ${user.name} excluído com sucesso.` });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    return res.status(500).json({ error: `Erro ao excluir usuário: ${err.message}` });
  }
});

module.exports = router;
