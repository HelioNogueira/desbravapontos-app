const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit } = require('../db');
const { authMiddleware, requireRole, hashPassword } = require('../auth');

// Listar todos os usuários (Superadmin e Diretoria podem ver; participantes veem resumo público)
router.get('/', authMiddleware, (req, res) => {
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

  const users = db.prepare(query).all(...params);
  return res.json({ users });
});

// Criar usuário (Superadmin apenas)
router.post('/', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { name, email, password, role = 'participant', team_id, initial_points = 0 } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  if (existing) {
    return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
  }

  const now = new Date().toISOString();
  const passHash = hashPassword(password);

  const result = withTransaction(() => {
    const insertRes = db.prepare(`
      INSERT INTO users (club_id, name, email, password_hash, role, team_id, active, points_balance, total_points, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(req.clubId, name.trim(), email.trim().toLowerCase(), passHash, role, team_id || null, initial_points || 0, initial_points || 0, now, now);

    const newUserId = Number(insertRes.lastInsertRowid);

    if (initial_points > 0) {
      db.prepare(`
        INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, actor_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'manual', 'Saldo inicial de cadastro', ?, ?)
      `).run(req.clubId, newUserId, team_id || null, initial_points, initial_points, req.user.id, now);
    }

    logAudit(req.user.id, 'CREATE_USER', 'users', newUserId, { name, email, role, team_id }, req.clubId);
    return newUserId;
  });

  const createdUser = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.team_id, u.active, u.points_balance, t.name as team_name
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `).get(result);

  return res.status(201).json({ user: createdUser, message: 'Usuário cadastrado com sucesso.' });
});

// Atualizar usuário (Superadmin)
router.put('/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const userId = req.params.id;
  const { name, email, role, team_id, active } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND club_id = ?').get(userId, req.clubId);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const now = new Date().toISOString();

  withTransaction(() => {
    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          role = COALESCE(?, role),
          team_id = ?,
          active = COALESCE(?, active),
          updated_at = ?
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      email ? email.trim().toLowerCase() : null,
      role || null,
      team_id !== undefined ? (team_id || null) : user.team_id,
      active !== undefined ? (active ? 1 : 0) : null,
      now,
      userId
    );

    logAudit(req.user.id, 'UPDATE_USER', 'users', userId, req.body);
  });

  const updated = db.prepare('SELECT id, name, email, role, team_id, active, points_balance FROM users WHERE id = ?').get(userId);
  return res.json({ user: updated, message: 'Usuário atualizado com sucesso.' });
});

// Bloquear / Desbloquear usuário (Superadmin)
router.patch('/:id/status', authMiddleware, requireRole('superadmin'), (req, res) => {
  const userId = req.params.id;
  const { active } = req.body;

  if (active === undefined) {
    return res.status(400).json({ error: 'Status "active" não informado.' });
  }

  if (Number(userId) === Number(req.user.id)) {
    return res.status(400).json({ error: 'Você não pode desativar sua própria conta de Super Administrador.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET active = ?, updated_at = ? WHERE id = ? AND club_id = ?').run(active ? 1 : 0, now, userId, req.clubId);
  logAudit(req.user.id, active ? 'UNBLOCK_USER' : 'BLOCK_USER', 'users', userId, { active }, req.clubId);

  return res.json({ message: active ? 'Conta ativada com sucesso.' : 'Conta bloqueada com sucesso.' });
});

// Redefinir senha (Superadmin)
router.patch('/:id/password', authMiddleware, requireRole('superadmin'), (req, res) => {
  const userId = req.params.id;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
  }

  const hash = hashPassword(new_password);
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND club_id = ?').run(hash, now, userId, req.clubId);
  logAudit(req.user.id, 'RESET_PASSWORD', 'users', userId, 'Senha redefinida pelo Superadmin.', req.clubId);

  return res.json({ message: 'Senha redefinida com sucesso.' });
});

// Excluir usuário (Superadmin)
router.delete('/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const userId = Number(req.params.id);

  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta de Super Administrador.' });
  }

  const user = db.prepare('SELECT id, name FROM users WHERE id = ? AND club_id = ?').get(userId, req.clubId);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  try {
    withTransaction(() => {
      // 1. Desvincular de auditoria
      db.prepare('UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ?').run(userId);
      db.prepare("DELETE FROM audit_logs WHERE entity_type = 'users' AND entity_id = ?").run(userId);

      // 2. Limpar transações de pontos vinculadas
      db.prepare('DELETE FROM point_transactions WHERE user_id = ?').run(userId);
      db.prepare('UPDATE point_transactions SET actor_id = NULL WHERE actor_id = ?').run(userId);

      // 3. Limpar leilões e lances
      db.prepare('DELETE FROM auction_bids WHERE user_id = ?').run(userId);
      db.prepare('UPDATE auction_items SET current_winner_user_id = NULL WHERE current_winner_user_id = ?').run(userId);
      db.prepare('UPDATE auctions SET created_by = NULL WHERE created_by = ?').run(userId);

      // 4. Histórico de resets
      db.prepare('UPDATE reset_history SET actor_id = ? WHERE actor_id = ?').run(req.user.id, userId);

      // 5. Excluir o registro do usuário
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      logAudit(req.user.id, 'DELETE_USER', 'users', userId, { deleted_name: user.name });
    });

    return res.json({ message: `Membro ${user.name} excluído com sucesso.` });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    return res.status(500).json({ error: `Erro ao excluir usuário: ${err.message}` });
  }
});

module.exports = router;
