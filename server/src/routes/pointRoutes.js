const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit, getSetting } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

// Motivos padrões do Clube de Desbravadores
const DEFAULT_REASONS = [
  { id: 'uniform', title: 'Uniforme de Gala Completo', defaultPoints: 50, category: 'bonus' },
  { id: 'attendance', title: 'Presença e Pontualidade', defaultPoints: 30, category: 'bonus' },
  { id: 'bible_lesson', title: 'Ano Bíblico e Lição em Dia', defaultPoints: 40, category: 'bonus' },
  { id: 'specialty', title: 'Conclusão de Especialidade', defaultPoints: 100, category: 'bonus' },
  { id: 'community', title: 'Ação Social / Comunitária', defaultPoints: 80, category: 'bonus' },
  { id: 'camp_spirit', title: 'Espírito de Equipe no Acampamento', defaultPoints: 60, category: 'bonus' },
  { id: 'late_penalty', title: 'Atraso Injustificado', defaultPoints: -20, category: 'penalty' },
  { id: 'indiscipline', title: 'Indisciplina / Falta de Atenção', defaultPoints: -30, category: 'penalty' },
  { id: 'missing_material', title: 'Falta de Material Obrigatório', defaultPoints: -15, category: 'penalty' }
];

router.get('/reasons', authMiddleware, (req, res) => {
  return res.json({ reasons: DEFAULT_REASONS });
});

// POST /api/points/award-single
// Lançamento de pontos individual
router.post('/award-single', authMiddleware, requireRole(['superadmin', 'director']), (req, res) => {
  const { user_id, amount, reason, type = 'bonus' } = req.body;
  const actor = req.user;

  const numAmount = parseInt(amount, 10);
  if (isNaN(numAmount) || numAmount === 0) {
    return res.status(400).json({ error: 'Informe um valor numérico válido diferente de zero.' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A justificativa do lançamento é obrigatória.' });
  }

  // Verificação de permissões do Diretor
  if (actor.role === 'director') {
    const directorCanAward = getSetting('director_can_award_points', 'true') === 'true';
    if (!directorCanAward) {
      return res.status(403).json({ error: 'A distribuição de pontos pela diretoria está desativada no momento.' });
    }

    const limit = parseInt(getSetting('director_points_limit', '500'), 10);
    if (Math.abs(numAmount) > limit) {
      return res.status(403).json({
        error: `O limite máximo permitido para lançamentos da diretoria é de ${limit} pontos por operação.`
      });
    }
  }

  const allowNegative = getSetting('allow_negative_balance', 'false') === 'true';
  const now = new Date().toISOString();

  try {
    const transactionRecord = withTransaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
      if (!user) throw new Error('Participante não encontrado.');
      if (!user.active) throw new Error('Não é possível lançar pontos para uma conta inativa.');

      const newBalance = user.points_balance + numAmount;
      if (newBalance < 0 && !allowNegative) {
        throw new Error(`Operação cancelada: saldo não pode ficar negativo (${newBalance} pts).`);
      }

      // Prevenção contra duplicidade acidental nos últimos 30 segundos com mesmo usuário, valor e motivo
      const duplicate = db.prepare(`
        SELECT id FROM point_transactions
        WHERE user_id = ? AND amount = ? AND reason = ? AND actor_id = ?
          AND datetime(created_at) >= datetime(?, '-30 seconds')
      `).get(user_id, numAmount, reason.trim(), actor.id, now);

      if (duplicate) {
        throw new Error('Alerta de duplicidade: um lançamento idêntico foi registrado há poucos segundos. Aguarde para tentar novamente.');
      }

      // Ciclo ativo
      const activeCycle = db.prepare('SELECT id FROM cycles WHERE is_active = 1').get();
      const cycleId = activeCycle ? activeCycle.id : null;

      // Atualizar saldo
      db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(newBalance, now, user_id);

      // Inserir transação
      const txResult = db.prepare(`
        INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user_id, user.team_id, numAmount, newBalance, type, reason.trim(), actor.id, cycleId, now);

      const txId = Number(txResult.lastInsertRowid);
      logAudit(actor.id, 'AWARD_POINTS_SINGLE', 'point_transactions', txId, {
        userId: user_id,
        amount: numAmount,
        reason: reason.trim(),
        balanceAfter: newBalance
      });

      return {
        id: txId,
        user_id,
        userName: user.name,
        amount: numAmount,
        balance_after: newBalance,
        reason: reason.trim()
      };
    });

    return res.status(201).json({
      success: true,
      transaction: transactionRecord,
      message: `Lançamento de ${numAmount > 0 ? '+' : ''}${numAmount} pontos realizado com sucesso!`
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/points/award-batch
// Lançamento em lote (vários participantes ou equipe inteira)
router.post('/award-batch', authMiddleware, requireRole(['superadmin', 'director']), (req, res) => {
  const { user_ids, team_id, amount, custom_allocations, reason, type = 'batch' } = req.body;
  const actor = req.user;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A justificativa do lançamento em lote é obrigatória.' });
  }

  // Verificação de permissões do Diretor
  if (actor.role === 'director') {
    const directorCanAward = getSetting('director_can_award_points', 'true') === 'true';
    if (!directorCanAward) {
      return res.status(403).json({ error: 'A distribuição de pontos pela diretoria está desativada no momento.' });
    }
  }

  const allowNegative = getSetting('allow_negative_balance', 'false') === 'true';
  const directorLimit = parseInt(getSetting('director_points_limit', '500'), 10);
  const now = new Date().toISOString();
  const batchId = `batch-${Date.now()}`;

  try {
    const results = withTransaction(() => {
      // Determinar participantes alvo
      let targetUserIds = [];

      if (team_id) {
        const teamUsers = db.prepare('SELECT id FROM users WHERE team_id = ? AND active = 1').all(team_id);
        targetUserIds = teamUsers.map(u => u.id);
      } else if (Array.isArray(user_ids) && user_ids.length > 0) {
        targetUserIds = user_ids;
      } else if (Array.isArray(custom_allocations) && custom_allocations.length > 0) {
        targetUserIds = custom_allocations.map(c => c.user_id);
      }

      if (targetUserIds.length === 0) {
        throw new Error('Nenhum participante selecionado para o lançamento em lote.');
      }

      const activeCycle = db.prepare('SELECT id FROM cycles WHERE is_active = 1').get();
      const cycleId = activeCycle ? activeCycle.id : null;

      const processed = [];

      for (const uid of targetUserIds) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
        if (!user || !user.active) continue;

        // Valor a ser adicionado
        let userAmount = parseInt(amount, 10);
        if (Array.isArray(custom_allocations)) {
          const custom = custom_allocations.find(c => Number(c.user_id) === Number(uid));
          if (custom && !isNaN(parseInt(custom.amount, 10))) {
            userAmount = parseInt(custom.amount, 10);
          }
        }

        if (isNaN(userAmount) || userAmount === 0) continue;

        if (actor.role === 'director' && Math.abs(userAmount) > directorLimit) {
          throw new Error(`O valor de ${userAmount} para o participante "${user.name}" excede seu limite de ${directorLimit} pts.`);
        }

        const newBal = user.points_balance + userAmount;
        if (newBal < 0 && !allowNegative) {
          throw new Error(`O participante "${user.name}" ficaria com saldo negativo (${newBal} pts).`);
        }

        db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, user.id);

        const txRes = db.prepare(`
          INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, batch_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, user.team_id, userAmount, newBal, type, reason.trim(), actor.id, cycleId, batchId, now);

        processed.push({
          txId: Number(txRes.lastInsertRowid),
          userId: user.id,
          userName: user.name,
          amount: userAmount,
          balanceAfter: newBal
        });
      }

      logAudit(actor.id, 'AWARD_POINTS_BATCH', 'point_transactions', 0, {
        batchId,
        count: processed.length,
        reason: reason.trim()
      });

      return { batchId, processed };
    });

    return res.status(201).json({
      success: true,
      message: `Lançamento em lote concluído para ${results.processed.length} participantes!`,
      data: results
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/points/transactions
// Extrato de transações
router.get('/transactions', authMiddleware, (req, res) => {
  const { user_id, team_id, type, limit = 50, offset = 0 } = req.query;
  const user = req.user;

  let query = `
    SELECT pt.*,
           u.name as user_name, u.email as user_email,
           t.name as team_name, t.color as team_color,
           a.name as actor_name
    FROM point_transactions pt
    LEFT JOIN users u ON pt.user_id = u.id
    LEFT JOIN teams t ON pt.team_id = t.id
    LEFT JOIN users a ON pt.actor_id = a.id
    WHERE 1=1
  `;
  const params = [];

  // Se for participante, só pode ver seu próprio extrato!
  if (user.role === 'participant') {
    query += ' AND pt.user_id = ?';
    params.push(user.id);
  } else {
    if (user_id) {
      query += ' AND pt.user_id = ?';
      params.push(user_id);
    }
    if (team_id) {
      query += ' AND pt.team_id = ?';
      params.push(team_id);
    }
  }

  if (type) {
    query += ' AND pt.type = ?';
    params.push(type);
  }

  query += ' ORDER BY pt.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const transactions = db.prepare(query).all(...params);

  // Totalizador para paginação
  let countQuery = 'SELECT COUNT(*) as total FROM point_transactions WHERE 1=1';
  const countParams = [];
  if (user.role === 'participant') {
    countQuery += ' AND user_id = ?';
    countParams.push(user.id);
  } else if (user_id) {
    countQuery += ' AND user_id = ?';
    countParams.push(user_id);
  }

  const total = db.prepare(countQuery).get(...countParams).total;

  return res.json({ transactions, total });
});

// POST /api/points/revert/:txId
// Correção administrativa sem apagar o registro original (cria transação compensatória)
router.post('/revert/:txId', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { txId } = req.params;
  const { reason = 'Correção administrativa de lançamento incorreto' } = req.body;
  const actor = req.user;
  const now = new Date().toISOString();

  try {
    const result = withTransaction(() => {
      const originalTx = db.prepare('SELECT * FROM point_transactions WHERE id = ?').get(txId);
      if (!originalTx) throw new Error('Transação não encontrada.');
      if (originalTx.is_reverted) throw new Error('Esta transação já foi estornada anteriormente.');

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(originalTx.user_id);
      if (!user) throw new Error('Usuário associado à transação não encontrado.');

      // O valor da reversão é o inverso exato da transação original
      const reverseAmount = -originalTx.amount;
      const newBal = user.points_balance + reverseAmount;

      const allowNegative = getSetting('allow_negative_balance', 'false') === 'true';
      if (newBal < 0 && !allowNegative) {
        throw new Error(`A reversão deixaria o participante com saldo negativo (${newBal} pts).`);
      }

      // Marcar original como revertida
      db.prepare('UPDATE point_transactions SET is_reverted = 1, reverted_reason = ? WHERE id = ?').run(reason.trim(), txId);

      // Atualizar saldo do usuário
      db.prepare('UPDATE users SET points_balance = ?, updated_at = ? WHERE id = ?').run(newBal, now, user.id);

      // Inserir registro compensatório no extrato
      const compTx = db.prepare(`
        INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, created_at)
        VALUES (?, ?, ?, ?, 'correction', ?, ?, ?, ?)
      `).run(
        user.id,
        user.team_id,
        reverseAmount,
        newBal,
        `[Estorno Tx #${txId}] ${reason.trim()} (Original: ${originalTx.amount} pts)`,
        actor.id,
        originalTx.cycle_id,
        now
      );

      logAudit(actor.id, 'REVERT_TRANSACTION', 'point_transactions', txId, {
        revertedTxId: txId,
        compensationTxId: Number(compTx.lastInsertRowid),
        reverseAmount,
        reason
      });

      return { newBal, reverseAmount };
    });

    return res.json({
      success: true,
      message: `Lançamento estornado com sucesso. Saldo recalculado para ${result.newBal} pts.`
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
