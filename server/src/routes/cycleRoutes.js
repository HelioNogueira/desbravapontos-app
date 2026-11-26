const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

router.get('/', authMiddleware, async (req, res) => {
  const cycles = await db.all(`
    SELECT c.*,
           (SELECT COUNT(*) FROM auctions WHERE cycle_id = c.id AND club_id = c.club_id) as auctions_count,
           (SELECT COUNT(*) FROM point_transactions WHERE cycle_id = c.id AND club_id = c.club_id) as transactions_count
    FROM cycles c
    WHERE c.club_id = ?
    ORDER BY c.is_active DESC, c.id DESC
  `, req.clubId);

  return res.json({ cycles });
});

router.post('/', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { name, type = 'continuous', start_date, end_date, set_as_active = false } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome do ciclo / temporada é obrigatório.' });
  }

  const now = new Date().toISOString();
  const startDt = start_date ? new Date(start_date).toISOString() : now;
  const endDt = end_date ? new Date(end_date).toISOString() : null;

  try {
    const newId = await withTransaction(async () => {
      if (set_as_active) {
        await db.run('UPDATE cycles SET is_active = 0 WHERE club_id = ?', req.clubId);
      }

      const insert = await db.run(`
        INSERT INTO cycles (club_id, name, type, start_date, end_date, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, req.clubId, name.trim(), type, startDt, endDt, set_as_active ? 1 : 0, now);

      const id = Number(insert.lastInsertRowid);
      await logAudit(req.user.id, 'CREATE_CYCLE', 'cycles', id, { name, type, set_as_active }, req.clubId);
      return id;
    });

    return res.status(201).json({
      success: true,
      cycle_id: newId,
      message: 'Ciclo / temporada criado com sucesso.'
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/activate', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const cycleId = req.params.id;
  const target = await db.get('SELECT id FROM cycles WHERE id = ? AND club_id = ?', cycleId, req.clubId);
  if (!target) {
    return res.status(404).json({ error: 'Temporada não encontrada.' });
  }

  await withTransaction(async () => {
    await db.run('UPDATE cycles SET is_active = 0 WHERE club_id = ?', req.clubId);
    await db.run('UPDATE cycles SET is_active = 1 WHERE id = ? AND club_id = ?', cycleId, req.clubId);
    await logAudit(req.user.id, 'ACTIVATE_CYCLE', 'cycles', cycleId, 'Ciclo ativado.', req.clubId);
  });

  return res.json({ message: 'Temporada ativada com sucesso.' });
});

module.exports = router;
