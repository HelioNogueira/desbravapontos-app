const express = require('express');
const router = express.Router();
const { db, withTransaction, initNewClubDefaults, logAudit } = require('../db');
const { authMiddleware, requirePlatformAdmin, hashPassword, isClubExpired } = require('../auth');

function makeSlug(name) {
  return String(name || 'clube')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'clube';
}

// GET /api/auth -> /api/master/clubs
// Listar todos os clubes da plataforma
router.get('/clubs', authMiddleware, requirePlatformAdmin, (req, res) => {
  const clubs = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM users u WHERE u.club_id = c.id) as members_count,
      (SELECT COUNT(*) FROM teams t WHERE t.club_id = c.id) as teams_count,
      (SELECT COUNT(*) FROM auctions a WHERE a.club_id = c.id) as auctions_count
    FROM clubs c
    ORDER BY c.id DESC
  `).all();

  const enriched = clubs.map((c) => ({
    ...c,
    isExpired: isClubExpired(c)
  }));

  const stats = {
    totalClubs: enriched.length,
    activeClubs: enriched.filter((c) => c.status === 'active' && !c.isExpired).length,
    trialClubs: enriched.filter((c) => c.status === 'trial' && !c.isExpired).length,
    suspendedOrExpired: enriched.filter((c) => c.isExpired).length,
    estimatedMonthlyRevenue: enriched
      .filter((c) => c.status === 'active' && !c.isExpired)
      .reduce((sum, c) => sum + (Number(c.monthly_price) || 0), 0)
  };

  return res.json({ clubs: enriched, stats });
});

// POST /api/master/clubs
// Criar novo clube manualmente pelo Painel Master
router.post('/clubs', authMiddleware, requirePlatformAdmin, (req, res) => {
  const {
    name,
    join_code,
    plan_name = 'Mensal',
    monthly_price = 39.90,
    days = 30,
    max_members = 100,
    owner_email = '',
    notes = '',
    admin_name,
    admin_email,
    admin_password
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome do clube é obrigatório.' });
  }

  const baseCode = (join_code && join_code.trim())
    ? join_code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    : makeSlug(name).toUpperCase().replace(/-/g, '').slice(0, 10) + Math.floor(10 + Math.random() * 90);

  const existingCode = db.prepare('SELECT id FROM clubs WHERE UPPER(join_code) = UPPER(?)').get(baseCode);
  if (existingCode) {
    return res.status(400).json({ error: `O código "${baseCode}" já está em uso por outro clube.` });
  }

  let slug = makeSlug(name);
  if (db.prepare('SELECT id FROM clubs WHERE slug = ?').get(slug)) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + Number(days || 30) * 86400000).toISOString();

  try {
    const created = withTransaction(() => {
      const insertClub = db.prepare(`
        INSERT INTO clubs (name, slug, join_code, status, plan_name, monthly_price, expires_at, max_members, owner_email, notes, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name.trim(),
        slug,
        baseCode,
        plan_name,
        Number(monthly_price) || 0,
        expiresAt,
        Number(max_members) || 100,
        owner_email?.trim() || admin_email?.trim() || null,
        notes?.trim() || null,
        nowIso,
        nowIso
      );

      const clubId = Number(insertClub.lastInsertRowid);
      initNewClubDefaults(clubId, name.trim());

      if (admin_email && admin_email.trim() && admin_password && admin_password.length >= 6) {
        const dupUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(admin_email.trim());
        if (dupUser) {
          throw new Error('O e-mail informado para o diretor já está cadastrado no sistema.');
        }
        db.prepare(`
          INSERT INTO users (club_id, name, email, password_hash, role, club_role, active, points_balance, total_points, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'superadmin', 'Diretor Geral', 1, 0, 0, ?, ?)
        `).run(
          clubId,
          (admin_name && admin_name.trim()) || 'Diretor Geral',
          admin_email.trim().toLowerCase(),
          hashPassword(admin_password),
          nowIso,
          nowIso
        );
      }

      logAudit(req.user.id, 'MASTER_CREATE_CLUB', 'clubs', clubId, { name, join_code: baseCode, days }, req.clubId);
      return db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
    });

    return res.status(201).json({
      success: true,
      club: created,
      message: `Clube "${created.name}" criado com código ${created.join_code}!`
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erro ao criar clube.' });
  }
});

// PATCH /api/master/clubs/:id/renew
// Renovar assinatura (+30 dias ou quantidade informada)
router.patch('/clubs/:id/renew', authMiddleware, requirePlatformAdmin, (req, res) => {
  const clubId = Number(req.params.id);
  const { days = 30, plan_name, monthly_price } = req.body || {};

  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
  if (!club) {
    return res.status(404).json({ error: 'Clube não encontrado.' });
  }

  const nowMs = Date.now();
  const currentExpMs = club.expires_at ? new Date(club.expires_at).getTime() : nowMs;
  const baseMs = Math.max(nowMs, currentExpMs);
  const newExpiresAt = new Date(baseMs + Number(days) * 86400000).toISOString();
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE clubs
    SET status = 'active',
        expires_at = ?,
        plan_name = COALESCE(?, plan_name),
        monthly_price = COALESCE(?, monthly_price),
        updated_at = ?
    WHERE id = ?
  `).run(
    newExpiresAt,
    plan_name || null,
    monthly_price !== undefined ? Number(monthly_price) : null,
    nowIso,
    clubId
  );

  logAudit(req.user.id, 'MASTER_RENEW_CLUB', 'clubs', clubId, { days, newExpiresAt }, req.clubId);

  const updated = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
  return res.json({
    success: true,
    club: { ...updated, isExpired: isClubExpired(updated) },
    message: `Assinatura de "${club.name}" renovada por +${days} dias!`
  });
});

// PATCH /api/master/clubs/:id/status
// Ativar, colocar em teste ou suspender clube
router.patch('/clubs/:id/status', authMiddleware, requirePlatformAdmin, (req, res) => {
  const clubId = Number(req.params.id);
  const { status } = req.body;

  if (!['active', 'trial', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
  if (!club) {
    return res.status(404).json({ error: 'Clube não encontrado.' });
  }

  db.prepare('UPDATE clubs SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), clubId);
  logAudit(req.user.id, 'MASTER_STATUS_CLUB', 'clubs', clubId, { status }, req.clubId);

  const updated = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
  return res.json({
    success: true,
    club: { ...updated, isExpired: isClubExpired(updated) },
    message: `Status de "${club.name}" alterado para ${status}.`
  });
});

// PUT /api/master/clubs/:id
// Editar dados de um clube
router.put('/clubs/:id', authMiddleware, requirePlatformAdmin, (req, res) => {
  const clubId = Number(req.params.id);
  const { name, join_code, plan_name, monthly_price, max_members, expires_at, notes } = req.body;

  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
  if (!club) {
    return res.status(404).json({ error: 'Clube não encontrado.' });
  }

  const nextCode = join_code ? join_code.trim().toUpperCase() : club.join_code;
  const dup = db.prepare('SELECT id FROM clubs WHERE UPPER(join_code) = UPPER(?) AND id != ?').get(nextCode, clubId);
  if (dup) {
    return res.status(400).json({ error: 'Este código de clube já pertence a outro clube.' });
  }

  db.prepare(`
    UPDATE clubs
    SET name = ?, join_code = ?, plan_name = ?, monthly_price = ?, max_members = ?, expires_at = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name?.trim() || club.name,
    nextCode,
    plan_name || club.plan_name,
    monthly_price !== undefined ? Number(monthly_price) : club.monthly_price,
    max_members !== undefined ? Number(max_members) : club.max_members,
    expires_at || club.expires_at,
    notes !== undefined ? notes : club.notes,
    new Date().toISOString(),
    clubId
  );

  const updated = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
  return res.json({
    success: true,
    club: { ...updated, isExpired: isClubExpired(updated) },
    message: 'Dados do clube atualizados.'
  });
});

module.exports = router;
