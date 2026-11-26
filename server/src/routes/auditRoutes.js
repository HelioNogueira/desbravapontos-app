const express = require('express');
const router = express.Router();
const { db, setSetting, logAudit } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

router.get('/logs', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { limit = 50, offset = 0, action } = req.query;

  let query = `
    SELECT al.*, u.name as actor_name, u.email as actor_email, u.role as actor_role
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    WHERE al.club_id = ?
  `;
  const params = [req.clubId];

  if (action) {
    query += ' AND al.action = ?';
    params.push(action);
  }

  query += ' ORDER BY al.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const logs = await db.all(query, ...params);
  const totalRow = await db.get('SELECT COUNT(*) as count FROM audit_logs WHERE club_id = ?', req.clubId);

  return res.json({ logs, total: Number(totalRow.count) });
});

router.get('/settings', authMiddleware, async (req, res) => {
  const globalRows = await db.all('SELECT key, value FROM app_settings');
  const clubRows = await db.all('SELECT key, value FROM club_settings WHERE club_id = ?', req.clubId);
  const settings = {};
  for (const r of globalRows) settings[r.key] = r.value;
  for (const r of clubRows) settings[r.key] = r.value;
  return res.json({ settings });
});

router.put('/settings', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Configurações inválidas.' });
  }

  for (const [key, value] of Object.entries(settings)) {
    if (key === 'google_client_id') {
      if (req.isPlatformAdmin) await setSetting(key, value);
    } else {
      await setSetting(key, value, req.clubId);
    }
  }

  await logAudit(req.user.id, 'UPDATE_SETTINGS', 'club_settings', req.clubId, settings, req.clubId);
  return res.json({ message: 'Configurações atualizadas com sucesso.' });
});

module.exports = router;
