const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit } = require('../db');
const { authMiddleware, requireRole, verifyPassword } = require('../auth');

router.get('/history', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const history = await db.all(`
    SELECT rh.*, u.name as actor_name, u.email as actor_email
    FROM reset_history rh
    LEFT JOIN users u ON rh.actor_id = u.id
    WHERE rh.club_id = ?
    ORDER BY rh.id DESC
  `, req.clubId);

  return res.json({ history });
});

router.post('/execute', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const {
    admin_password,
    reset_type,
    target_user_ids = [],
    reason
  } = req.body;

  const actor = req.user;

  if (!admin_password) {
    return res.status(400).json({ error: 'Confirmação de segurança: digite a senha do Super Administrador.' });
  }

  const currentUser = await db.get('SELECT password_hash FROM users WHERE id = ?', actor.id);
  if (!verifyPassword(admin_password, currentUser.password_hash)) {
    return res.status(403).json({ error: 'Senha do Super Administrador incorreta! Ação de reset abortada.' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'É obrigatório informar a justificativa detalhada para o reset.' });
  }

  const now = new Date().toISOString();

  try {
    const result = await withTransaction(async () => {
      const currentUsersState = await db.all('SELECT id, name, email, team_id, points_balance, role FROM users WHERE club_id = ?', req.clubId);
      const currentTeamsState = await db.all('SELECT id, name, collective_balance FROM teams WHERE club_id = ?', req.clubId);
      const activeCycle = await db.get('SELECT * FROM cycles WHERE is_active = 1 AND club_id = ?', req.clubId);

      const snapshot = {
        timestamp: now,
        actorId: actor.id,
        resetType: reset_type,
        reason: reason.trim(),
        users: currentUsersState,
        teams: currentTeamsState,
        cycle: activeCycle
      };

      let affectedCount = 0;
      let targetDescription = '';

      if (reset_type === 'all_individual') {
        const nonAdmins = await db.all("SELECT id, points_balance, team_id FROM users WHERE role = 'participant' AND points_balance != 0 AND club_id = ?", req.clubId);
        affectedCount = nonAdmins.length;
        targetDescription = `Todos os ${affectedCount} participantes individuais`;

        for (const u of nonAdmins) {
          await db.run(`
            INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
            VALUES (?, ?, ?, ?, 0, 'reset_adjustment', ?, ?, ?, ?)
          `, req.clubId, u.id, u.team_id, -u.points_balance, `Zeragem Geral Administrativa: ${reason.trim()}`, actor.id, activeCycle ? activeCycle.id : null, now);
        }

        await db.run("UPDATE users SET points_balance = 0 WHERE role = 'participant' AND club_id = ?", req.clubId);
      } else if (reset_type === 'all_collective') {
        const teams = await db.all('SELECT id, collective_balance FROM teams WHERE collective_balance != 0 AND club_id = ?', req.clubId);
        affectedCount = teams.length;
        targetDescription = `Saldos coletivos de ${affectedCount} equipes`;

        await db.run('UPDATE teams SET collective_balance = 0 WHERE club_id = ?', req.clubId);
      } else if (reset_type === 'selected_users') {
        if (!Array.isArray(target_user_ids) || target_user_ids.length === 0) {
          throw new Error('Nenhum participante selecionado para zerar.');
        }

        const selectedUsers = await db.all(`
          SELECT id, name, points_balance, team_id FROM users
          WHERE club_id = ? AND id IN (${target_user_ids.map(() => '?').join(',')})
        `, req.clubId, ...target_user_ids);

        affectedCount = selectedUsers.length;
        targetDescription = `${affectedCount} participantes selecionados (${selectedUsers.map(u => u.name).join(', ')})`;

        for (const u of selectedUsers) {
          await db.run(`
            INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
            VALUES (?, ?, ?, ?, 0, 'reset_adjustment', ?, ?, ?, ?)
          `, req.clubId, u.id, u.team_id, -u.points_balance, `Zeragem Individual Administrativa: ${reason.trim()}`, actor.id, activeCycle ? activeCycle.id : null, now);
          await db.run('UPDATE users SET points_balance = 0 WHERE id = ? AND club_id = ?', u.id, req.clubId);
        }
      } else if (reset_type === 'season_reset') {
        const currentCycle = await db.get('SELECT * FROM cycles WHERE is_active = 1 AND club_id = ?', req.clubId);
        if (currentCycle) {
          await db.run('UPDATE cycles SET is_active = 0, end_date = ? WHERE id = ?', now, currentCycle.id);
        }

        const newCycleRes = await db.run(`
          INSERT INTO cycles (club_id, name, type, start_date, is_active, created_at)
          VALUES (?, ?, 'continuous', ?, 1, ?)
        `, req.clubId, `Nova Temporada ${new Date().toLocaleDateString('pt-BR')}`, now, now);

        const newCycleId = Number(newCycleRes.lastInsertRowid);
        const allParticipants = await db.all("SELECT id, points_balance, team_id FROM users WHERE role = 'participant' AND club_id = ?", req.clubId);
        affectedCount = allParticipants.length;
        targetDescription = `Encerramento de Temporada #${currentCycle ? currentCycle.id : ''} e início da Temporada #${newCycleId}`;

        for (const u of allParticipants) {
          if (u.points_balance !== 0) {
            await db.run(`
              INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
              VALUES (?, ?, ?, ?, 0, 'reset_adjustment', ?, ?, ?, ?)
            `, req.clubId, u.id, u.team_id, -u.points_balance, `Virada de Temporada: ${reason.trim()}`, actor.id, newCycleId, now);
          }
        }

        await db.run("UPDATE users SET points_balance = 0, total_points = 0 WHERE role = 'participant' AND club_id = ?", req.clubId);
        await db.run('UPDATE teams SET collective_balance = 0 WHERE club_id = ?', req.clubId);
      } else {
        throw new Error('Tipo de reset não reconhecido.');
      }

      const resetLog = await db.run(`
        INSERT INTO reset_history (club_id, actor_id, reset_type, target_description, affected_count, reason, snapshot_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, req.clubId, actor.id, reset_type, targetDescription, affectedCount, reason.trim(), JSON.stringify(snapshot), now);

      const resetId = Number(resetLog.lastInsertRowid);
      await logAudit(actor.id, 'EXECUTE_RESET', 'reset_history', resetId, {
        reset_type,
        affectedCount,
        reason: reason.trim()
      }, req.clubId);

      return { resetId, reset_type, targetDescription, affectedCount };
    });

    return res.json({
      success: true,
      message: `Reset executado com sucesso! Cópia de segurança (snapshot #${result.resetId}) salva.`,
      result
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/restore/:id', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const resetId = req.params.id;
  const { admin_password } = req.body;
  const actor = req.user;

  if (!admin_password) {
    return res.status(400).json({ error: 'Informe a senha do Super Administrador para confirmar a restauração.' });
  }

  const currentUser = await db.get('SELECT password_hash FROM users WHERE id = ?', actor.id);
  if (!verifyPassword(admin_password, currentUser.password_hash)) {
    return res.status(403).json({ error: 'Senha incorreta.' });
  }

  const resetRecord = await db.get('SELECT * FROM reset_history WHERE id = ? AND club_id = ?', resetId, req.clubId);
  if (!resetRecord) {
    return res.status(404).json({ error: 'Registro de snapshot não encontrado.' });
  }

  const now = new Date().toISOString();

  try {
    await withTransaction(async () => {
      const snapshot = JSON.parse(resetRecord.snapshot_data);

      if (Array.isArray(snapshot.users)) {
        for (const u of snapshot.users) {
          await db.run('UPDATE users SET points_balance = ? WHERE id = ? AND club_id = ?', u.points_balance, u.id, req.clubId);
          await db.run(`
            INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, actor_id, created_at)
            VALUES (?, ?, ?, ?, ?, 'correction', ?, ?, ?)
          `, req.clubId, u.id, u.team_id, u.points_balance, u.points_balance, `Restauração via Snapshot #${resetId}`, actor.id, now);
        }
      }

      if (Array.isArray(snapshot.teams)) {
        for (const t of snapshot.teams) {
          await db.run('UPDATE teams SET collective_balance = ? WHERE id = ?', t.collective_balance, t.id);
        }
      }

      await logAudit(actor.id, 'RESTORE_SNAPSHOT', 'reset_history', resetId, 'Restauração de snapshot concluída.', req.clubId);
    });

    return res.json({
      success: true,
      message: `Dados restaurados com sucesso a partir do snapshot #${resetId}!`
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
