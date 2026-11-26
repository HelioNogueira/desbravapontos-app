const express = require('express');
const router = express.Router();
const { db, withTransaction, initNewClubDefaults, logAudit } = require('../db');
const { authMiddleware, requirePlatformAdmin, hashPassword, isClubExpired, getGraceInfo } = require('../auth');

function makeSlug(name) {
  return String(name || 'clube')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'clube';
}

router.get('/clubs', authMiddleware, requirePlatformAdmin, async (req, res) => {
  const clubs = await db.all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM users u WHERE u.club_id = c.id) as members_count,
      (SELECT COUNT(*) FROM teams t WHERE t.club_id = c.id) as teams_count,
      (SELECT COUNT(*) FROM auctions a WHERE a.club_id = c.id) as auctions_count
    FROM clubs c
    ORDER BY c.id DESC
  `);

  const enriched = clubs.map((c) => {
    const grace = getGraceInfo(c);
    return {
      ...c,
      members_count: Number(c.members_count || 0),
      teams_count: Number(c.teams_count || 0),
      auctions_count: Number(c.auctions_count || 0),
      isExpired: grace.isExpired,
      inGracePeriod: grace.inGracePeriod,
      graceEndsAt: grace.graceEndsAt
    };
  });

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

router.post('/clubs', authMiddleware, requirePlatformAdmin, async (req, res) => {
  const {
    name, join_code, plan_name = 'Mensal', monthly_price = 39.90,
    days = 30, max_members = 100, owner_email = '', notes = '',
    admin_name, admin_email, admin_password
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome do clube é obrigatório.' });
  }

  const baseCode = (join_code && join_code.trim())
    ? join_code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    : makeSlug(name).toUpperCase().replace(/-/g, '').slice(0, 10) + Math.floor(10 + Math.random() * 90);

  const existingCode = await db.get('SELECT id FROM clubs WHERE UPPER(join_code) = UPPER(?)', baseCode);
  if (existingCode) {
    return res.status(400).json({ error: `O código "${baseCode}" já está em uso por outro clube.` });
  }

  let slug = makeSlug(name);
  if (await db.get('SELECT id FROM clubs WHERE slug = ?', slug)) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + Number(days || 30) * 86400000).toISOString();

  try {
    const created = await withTransaction(async () => {
      const insertClub = await db.run(`
        INSERT INTO clubs (name, slug, join_code, status, plan_name, monthly_price, expires_at, max_members, owner_email, notes, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        name.trim(), slug, baseCode, plan_name, Number(monthly_price) || 0, expiresAt,
        Number(max_members) || 100, owner_email?.trim() || admin_email?.trim() || null, notes?.trim() || null, nowIso, nowIso
      );

      const clubId = Number(insertClub.lastInsertRowid);
      await initNewClubDefaults(clubId, name.trim());

      if (admin_email && admin_email.trim() && admin_password && admin_password.length >= 6) {
        const dupUser = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', admin_email.trim());
        if (dupUser) {
          throw new Error('O e-mail informado para o diretor já está cadastrado no sistema.');
        }
        await db.run(`
          INSERT INTO users (club_id, name, email, password_hash, role, club_role, active, points_balance, total_points, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'superadmin', 'Diretor Geral', 1, 0, 0, ?, ?)
        `, clubId, (admin_name && admin_name.trim()) || 'Diretor Geral', admin_email.trim().toLowerCase(), hashPassword(admin_password), nowIso, nowIso);
      }

      await logAudit(req.user.id, 'MASTER_CREATE_CLUB', 'clubs', clubId, { name, join_code: baseCode, days }, req.clubId);
      return await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
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

router.patch('/clubs/:id/renew', authMiddleware, requirePlatformAdmin, async (req, res) => {
  const clubId = Number(req.params.id);
  const { days = 30, plan_name, monthly_price } = req.body || {};

  const club = await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
  if (!club) return res.status(404).json({ error: 'Clube não encontrado.' });

  const nowMs = Date.now();
  const currentExpMs = club.expires_at ? new Date(club.expires_at).getTime() : nowMs;
  const baseMs = Math.max(nowMs, currentExpMs);
  const newExpiresAt = new Date(baseMs + Number(days) * 86400000).toISOString();
  const nowIso = new Date().toISOString();

  await db.run(`
    UPDATE clubs
    SET status = 'active',
        expires_at = ?,
        plan_name = COALESCE(?, plan_name),
        monthly_price = COALESCE(?, monthly_price),
        updated_at = ?
    WHERE id = ?
  `, newExpiresAt, plan_name || null, monthly_price !== undefined ? Number(monthly_price) : null, nowIso, clubId);

  await logAudit(req.user.id, 'MASTER_RENEW_CLUB', 'clubs', clubId, { days, newExpiresAt }, req.clubId);
  const updated = await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
  return res.json({
    success: true,
    club: { ...updated, isExpired: isClubExpired(updated) },
    message: `Assinatura de "${club.name}" renovada por +${days} dias!`
  });
});

router.patch('/clubs/:id/status', authMiddleware, requirePlatformAdmin, async (req, res) => {
  const clubId = Number(req.params.id);
  const { status } = req.body;
  if (!['active', 'trial', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }

  const club = await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
  if (!club) return res.status(404).json({ error: 'Clube não encontrado.' });

  await db.run('UPDATE clubs SET status = ?, updated_at = ? WHERE id = ?', status, new Date().toISOString(), clubId);
  await logAudit(req.user.id, 'MASTER_STATUS_CLUB', 'clubs', clubId, { status }, req.clubId);

  const updated = await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
  return res.json({
    success: true,
    club: { ...updated, isExpired: isClubExpired(updated) },
    message: `Status de "${club.name}" alterado para ${status}.`
  });
});

router.put('/clubs/:id', authMiddleware, requirePlatformAdmin, async (req, res) => {
  const clubId = Number(req.params.id);
  const { name, join_code, plan_name, monthly_price, max_members, expires_at, notes } = req.body;

  const club = await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
  if (!club) return res.status(404).json({ error: 'Clube não encontrado.' });

  const nextCode = join_code ? join_code.trim().toUpperCase() : club.join_code;
  const dup = await db.get('SELECT id FROM clubs WHERE UPPER(join_code) = UPPER(?) AND id != ?', nextCode, clubId);
  if (dup) return res.status(400).json({ error: 'Este código de clube já pertence a outro clube.' });

  await db.run(`
    UPDATE clubs
    SET name = ?, join_code = ?, plan_name = ?, monthly_price = ?, max_members = ?, expires_at = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `,
    name?.trim() || club.name, nextCode, plan_name || club.plan_name,
    monthly_price !== undefined ? Number(monthly_price) : club.monthly_price,
    max_members !== undefined ? Number(max_members) : club.max_members,
    expires_at || club.expires_at, notes !== undefined ? notes : club.notes,
    new Date().toISOString(), clubId
  );

  const updated = await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
  return res.json({
    success: true,
    club: { ...updated, isExpired: isClubExpired(updated) },
    message: 'Dados do clube atualizados.'
  });
});

module.exports = router;
