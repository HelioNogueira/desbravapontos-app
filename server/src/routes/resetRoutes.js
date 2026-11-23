const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit } = require('../db');
const { authMiddleware, requireRole, verifyPassword } = require('../auth');

// GET /api/reset/history
// Listar histórico de todos os resets efetuados
router.get('/history', authMiddleware, requireRole('superadmin'), (req, res) => {
  const history = db.prepare(`
    SELECT rh.*, u.name as actor_name, u.email as actor_email
    FROM reset_history rh
    LEFT JOIN users u ON rh.actor_id = u.id
    ORDER BY rh.id DESC
  `).all();

  return res.json({ history });
});

// POST /api/reset/execute
// Executar reset seguro com confirmação de senha do Superadmin e criação de snapshot
router.post('/execute', authMiddleware, requireRole('superadmin'), (req, res) => {
  const {
    admin_password,
    reset_type, // 'all_individual', 'all_collective', 'selected_users', 'season_reset', 'ranking_reset'
    target_user_ids = [],
    target_team_ids = [],
    reason
  } = req.body;

  const actor = req.user;

  // 1. Confirmação segura de senha do Superadmin
  if (!admin_password) {
    return res.status(400).json({ error: 'Confirmação de segurança: digite a senha do Super Administrador.' });
  }

  const currentUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id);
  if (!verifyPassword(admin_password, currentUser.password_hash)) {
    return res.status(403).json({ error: 'Senha do Super Administrador incorreta! Ação de reset abortada.' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'É obrigatório informar a justificativa detalhada para o reset.' });
  }

  const now = new Date().toISOString();

  try {
    const result = withTransaction(() => {
      // 2. Coletar dados para o SNAPSHOT antes da alteração (garante rollback e imutabilidade)
      const currentUsersState = db.prepare('SELECT id, name, email, team_id, points_balance, role FROM users').all();
      const currentTeamsState = db.prepare('SELECT id, name, collective_balance FROM teams').all();
      const activeCycle = db.prepare('SELECT * FROM cycles WHERE is_active = 1').get();

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
        // Zerar todos os saldos individuais
        const nonAdmins = db.prepare("SELECT id, points_balance, team_id FROM users WHERE role = 'participant' AND points_balance != 0").all();
        affectedCount = nonAdmins.length;
        targetDescription = `Todos os ${affectedCount} participantes individuais`;

        // Registrar no extrato de cada um o ajuste de zeragem sem apagar o histórico
        for (const u of nonAdmins) {
          db.prepare(`
            INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
            VALUES (?, ?, ?, 0, 'reset_adjustment', ?, ?, ?, ?)
          `).run(
            u.id,
            u.team_id,
            -u.points_balance,
            `Zeragem Geral Administrativa: ${reason.trim()}`,
            actor.id,
            activeCycle ? activeCycle.id : null,
            now
          );
        }

        db.prepare("UPDATE users SET points_balance = 0 WHERE role = 'participant'").run();

      } else if (reset_type === 'all_collective') {
        // Zerar saldo coletivo das equipes
        const teams = db.prepare('SELECT id, collective_balance FROM teams WHERE collective_balance != 0').all();
        affectedCount = teams.length;
        targetDescription = `Saldos coletivos de ${affectedCount} equipes`;

        db.prepare('UPDATE teams SET collective_balance = 0').run();

      } else if (reset_type === 'selected_users') {
        // Zerar somente participantes selecionados
        if (!Array.isArray(target_user_ids) || target_user_ids.length === 0) {
          throw new Error('Nenhum participante selecionado para zerar.');
        }

        const selectedUsers = db.prepare(`
          SELECT id, name, points_balance, team_id FROM users
          WHERE id IN (${target_user_ids.map(() => '?').join(',')})
        `).all(...target_user_ids);

        affectedCount = selectedUsers.length;
        targetDescription = `${affectedCount} participantes selecionados (${selectedUsers.map(u => u.name).join(', ')})`;

        for (const u of selectedUsers) {
          db.prepare(`
            INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
            VALUES (?, ?, ?, 0, 'reset_adjustment', ?, ?, ?, ?)
          `).run(
            u.id,
            u.team_id,
            -u.points_balance,
            `Zeragem Individual Administrativa: ${reason.trim()}`,
            actor.id,
            activeCycle ? activeCycle.id : null,
            now
          );
          db.prepare('UPDATE users SET points_balance = 0 WHERE id = ?').run(u.id);
        }

      } else if (reset_type === 'season_reset') {
        // Reiniciar temporada: fecha a atual, cria nova e zera saldos
        const currentCycle = db.prepare('SELECT * FROM cycles WHERE is_active = 1').get();
        if (currentCycle) {
          db.prepare('UPDATE cycles SET is_active = 0, end_date = ? WHERE id = ?').run(now, currentCycle.id);
        }

        const newCycleRes = db.prepare(`
          INSERT INTO cycles (name, type, start_date, is_active, created_at)
          VALUES (?, 'continuous', ?, 1, ?)
        `).run(`Nova Temporada ${new Date().toLocaleDateString('pt-BR')}`, now, now);

        const newCycleId = Number(newCycleRes.lastInsertRowid);

        // Zerar todos os participantes
        const allParticipants = db.prepare("SELECT id, points_balance, team_id FROM users WHERE role = 'participant'").all();
        affectedCount = allParticipants.length;
        targetDescription = `Encerramento de Temporada #${currentCycle ? currentCycle.id : ''} e início da Temporada #${newCycleId}`;

        for (const u of allParticipants) {
          if (u.points_balance !== 0) {
            db.prepare(`
              INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
              VALUES (?, ?, ?, 0, 'reset_adjustment', ?, ?, ?, ?)
            `).run(
              u.id,
              u.team_id,
              -u.points_balance,
              `Virada de Temporada: ${reason.trim()}`,
              actor.id,
              newCycleId,
              now
            );
          }
        }

        db.prepare("UPDATE users SET points_balance = 0 WHERE role = 'participant'").run();
        db.prepare('UPDATE teams SET collective_balance = 0').run();

      } else {
        throw new Error('Tipo de reset não reconhecido.');
      }

      // Salvar snapshot no histórico de resets
      const resetLog = db.prepare(`
        INSERT INTO reset_history (actor_id, reset_type, target_description, affected_count, reason, snapshot_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        actor.id,
        reset_type,
        targetDescription,
        affectedCount,
        reason.trim(),
        JSON.stringify(snapshot),
        now
      );

      const resetId = Number(resetLog.lastInsertRowid);
      logAudit(actor.id, 'EXECUTE_RESET', 'reset_history', resetId, {
        reset_type,
        affectedCount,
        reason: reason.trim()
      });

      return {
        resetId,
        reset_type,
        targetDescription,
        affectedCount
      };
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

// POST /api/reset/restore/:id
// Restaurar saldos a partir de um snapshot (Desfazer reset)
router.post('/restore/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const resetId = req.params.id;
  const { admin_password } = req.body;
  const actor = req.user;

  if (!admin_password) {
    return res.status(400).json({ error: 'Informe a senha do Super Administrador para confirmar a restauração.' });
  }

  const currentUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id);
  if (!verifyPassword(admin_password, currentUser.password_hash)) {
    return res.status(403).json({ error: 'Senha incorreta.' });
  }

  const resetRecord = db.prepare('SELECT * FROM reset_history WHERE id = ?').get(resetId);
  if (!resetRecord) {
    return res.status(404).json({ error: 'Registro de snapshot não encontrado.' });
  }

  const now = new Date().toISOString();

  try {
    withTransaction(() => {
      const snapshot = JSON.parse(resetRecord.snapshot_data);

      // Restaurar saldos dos usuários
      if (Array.isArray(snapshot.users)) {
        for (const u of snapshot.users) {
          db.prepare('UPDATE users SET points_balance = ? WHERE id = ?').run(u.points_balance, u.id);
          db.prepare(`
            INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, created_at)
            VALUES (?, ?, ?, ?, 'correction', ?, ?, ?)
          `).run(
            u.id,
            u.team_id,
            u.points_balance,
            u.points_balance,
            `Restauração via Snapshot #${resetId}`,
            actor.id,
            now
          );
        }
      }

      // Restaurar saldos das equipes
      if (Array.isArray(snapshot.teams)) {
        for (const t of snapshot.teams) {
          db.prepare('UPDATE teams SET collective_balance = ? WHERE id = ?').run(t.collective_balance, t.id);
        }
      }

      logAudit(actor.id, 'RESTORE_SNAPSHOT', 'reset_history', resetId, 'Restauração de snapshot concluída.');
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
