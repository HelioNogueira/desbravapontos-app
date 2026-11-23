const express = require('express');
const router = express.Router();
const { db, getSetting, setSetting, logAudit } = require('../db');
const { authMiddleware, requireRole } = require('../auth');

// GET /api/audit/logs
// Consultar histórico completo de atividades (Superadmin)
router.get('/logs', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { limit = 50, offset = 0, action } = req.query;

  let query = `
    SELECT al.*, u.name as actor_name, u.email as actor_email, u.role as actor_role
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (action) {
    query += ' AND al.action = ?';
    params.push(action);
  }

  query += ' ORDER BY al.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const logs = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;

  return res.json({ logs, total });
});

// GET /api/audit/settings
// Obter todas as configurações do sistema
router.get('/settings', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT key, value, updated_at FROM app_settings').all();
  const settings = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }
  return res.json({ settings });
});

// PUT /api/audit/settings
// Atualizar configurações críticas (Apenas Superadmin)
router.put('/settings', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Configurações inválidas.' });
  }

  for (const [key, value] of Object.entries(settings)) {
    setSetting(key, value);
  }

  logAudit(req.user.id, 'UPDATE_SETTINGS', 'app_settings', 0, settings);

  return res.json({ message: 'Configurações atualizadas com sucesso.' });
});

module.exports = router;
