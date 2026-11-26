const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const { db, getSetting, initNewClubDefaults, logAudit, withTransaction } = require('../db');
const { verifyPassword, generateToken, authMiddleware, hashPassword, isClubExpired } = require('../auth');

async function resolveTargetClub(clubCode, clubId) {
  if (clubCode && String(clubCode).trim()) {
    const club = await db.get('SELECT * FROM clubs WHERE UPPER(join_code) = UPPER(?)', String(clubCode).trim());
    return club || null;
  }
  if (clubId) {
    const club = await db.get('SELECT * FROM clubs WHERE id = ?', Number(clubId));
    return club || null;
  }
  return (await db.get('SELECT * FROM clubs ORDER BY id ASC LIMIT 1')) || null;
}

function makeSlug(name) {
  return String(name || 'clube')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'clube';
}

router.get('/club-by-code', async (req, res) => {
  const { code } = req.query;
  const club = await resolveTargetClub(code, null);
  if (!club) {
    return res.status(404).json({ error: 'Código do clube não encontrado. Verifique com a diretoria.' });
  }
  const teams = await db.all('SELECT id, name, color, icon FROM teams WHERE club_id = ? ORDER BY name ASC', club.id);
  return res.json({
    club: {
      id: club.id,
      name: club.name,
      join_code: club.join_code,
      status: club.status,
      isExpired: isClubExpired(club)
    },
    teams
  });
});

const CLUB_PLANS = {
  pequeno: { plan_name: 'Pequeno (até 20 membros)', monthly_price: 30.0, max_members: 20 },
  medio: { plan_name: 'Médio (21 a 59 membros)', monthly_price: 50.0, max_members: 59 },
  grande: { plan_name: 'Grande (60+ membros)', monthly_price: 70.0, max_members: 250 }
};

router.post('/register-club', async (req, res) => {
  const {
    clubName,
    joinCode,
    planTier = 'pequeno',
    adminName,
    adminEmail,
    adminPassword,
    googleCredential
  } = req.body;

  const selectedPlan = CLUB_PLANS[planTier] || CLUB_PLANS.pequeno;

  if (!clubName || !clubName.trim()) {
    return res.status(400).json({ error: 'Informe o nome do Clube de Desbravadores.' });
  }

  let resolvedEmail = adminEmail?.trim().toLowerCase();
  let resolvedName = adminName?.trim();
  let googleSub = null;
  let googlePic = null;

  if (googleCredential) {
    try {
      const gData = await verifyGoogleToken(googleCredential);
      resolvedEmail = gData.email?.trim().toLowerCase();
      if (!resolvedName) resolvedName = gData.name || 'Diretor Geral';
      googleSub = gData.sub || null;
      googlePic = gData.picture || null;
    } catch (err) {
      return res.status(401).json({ error: err.message || 'Falha ao validar conta Google.' });
    }
  } else {
    if (!resolvedName) return res.status(400).json({ error: 'Informe o nome do Diretor / Pastor responsável.' });
    if (!resolvedEmail) return res.status(400).json({ error: 'Informe o e-mail do responsável.' });
    if (!adminPassword || adminPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }
  }

  const existingUser = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', resolvedEmail);
  if (existingUser) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado em um clube. Use outro e-mail ou faça login.' });
  }

  let finalCode = (joinCode && joinCode.trim())
    ? joinCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    : makeSlug(clubName).toUpperCase().replace(/-/g, '').slice(0, 8) + Math.floor(100 + Math.random() * 900);

  if (await db.get('SELECT id FROM clubs WHERE UPPER(join_code) = UPPER(?)', finalCode)) {
    return res.status(400).json({ error: `O código "${finalCode}" já está em uso. Escolha outro código para o seu clube.` });
  }

  let slug = makeSlug(clubName);
  if (await db.get('SELECT id FROM clubs WHERE slug = ?', slug)) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const trialExpires = new Date(now.getTime() + 7 * 86400000).toISOString();
  const passwordHash = hashPassword(adminPassword || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)));

  try {
    const result = await withTransaction(async () => {
      const clubRes = await db.run(`
        INSERT INTO clubs (name, slug, join_code, status, plan_name, monthly_price, expires_at, max_members, owner_email, created_at, updated_at)
        VALUES (?, ?, ?, 'trial', ?, ?, ?, ?, ?, ?, ?)
      `,
        clubName.trim(),
        slug,
        finalCode,
        `Teste 7d — ${selectedPlan.plan_name}`,
        selectedPlan.monthly_price,
        trialExpires,
        selectedPlan.max_members,
        resolvedEmail,
        nowIso,
        nowIso
      );

      const clubId = Number(clubRes.lastInsertRowid);
      await initNewClubDefaults(clubId, clubName.trim());

      const userRes = await db.run(`
        INSERT INTO users (club_id, name, email, password_hash, role, club_role, active, points_balance, total_points, avatar, google_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'superadmin', 'Diretor Geral / Fundador', 1, 0, 0, ?, ?, ?, ?)
      `, clubId, resolvedName, resolvedEmail, passwordHash, googlePic, googleSub, nowIso, nowIso);

      const userId = Number(userRes.lastInsertRowid);
      await logAudit(userId, 'CLUB_SELF_REGISTERED', 'clubs', clubId, { clubName: clubName.trim(), joinCode: finalCode }, clubId);

      const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
      delete user.password_hash;
      const club = await db.get('SELECT * FROM clubs WHERE id = ?', clubId);
      return { user, club };
    });

    const token = generateToken(result.user);
    return res.status(201).json({
      success: true,
      token,
      user: result.user,
      club: { ...result.club, isExpired: false },
      message: `Clube "${result.club.name}" criado com 7 dias grátis! Código de convite: ${result.club.join_code}`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao cadastrar clube.' });
  }
});

router.get('/google-client-id', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || (await getSetting('google_client_id', ''));
  return res.json({ clientId });
});

async function verifyGoogleToken(idToken) {
  try {
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (googleRes.ok) {
      const payload = await googleRes.json();
      return payload;
    }
  } catch (err) {
    console.warn('Falha na chamada remota do Google Tokeninfo:', err.message);
  }

  try {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      const payloadStr = Buffer.from(parts[1], 'base64').toString('utf-8');
      const payload = JSON.parse(payloadStr);
      if (payload && payload.email) {
        return payload;
      }
    }
  } catch (_) {}

  throw new Error('Token de autenticação do Google inválido.');
}

router.post('/google', async (req, res) => {
  const {
    credential,
    firstName,
    lastName,
    name,
    team_id,
    club_role,
    role = 'participant',
    registration_code,
    club_code,
    club_id
  } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Credencial do Google ausente.' });
  }

  let googleData;
  try {
    googleData = await verifyGoogleToken(credential);
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Falha ao autenticar com o Google.' });
  }

  const email = googleData.email?.trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Não foi possível obter o e-mail da conta Google.' });
  }

  const existingUser = await db.get(`
    SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE LOWER(u.email) = ?
  `, email);

  if (existingUser) {
    if (!existingUser.active) {
      return res.status(403).json({ error: 'Sua conta está desativada. Contate a diretoria do Clube.' });
    }

    if (googleData.sub && !existingUser.google_id) {
      try {
        await db.run('UPDATE users SET google_id = ? WHERE id = ?', googleData.sub, existingUser.id);
      } catch (_) {}
    }

    delete existingUser.password_hash;
    const token = generateToken(existingUser);
    return res.json({
      success: true,
      token,
      user: existingUser,
      isNewUser: false
    });
  }

  const hasProvidedName = Boolean((firstName && firstName.trim()) || (lastName && lastName.trim()) || (name && name.trim()));
  if (!hasProvidedName) {
    const googleGiven = googleData.given_name || (googleData.name ? googleData.name.split(' ')[0] : '');
    const googleFamily = googleData.family_name || (googleData.name ? googleData.name.split(' ').slice(1).join(' ') : '');

    return res.json({
      needProfileCompletion: true,
      googleData: {
        email,
        suggestedFirstName: googleGiven,
        suggestedLastName: googleFamily,
        suggestedFullName: googleData.name || '',
        picture: googleData.picture || null
      }
    });
  }

  const targetClub = await resolveTargetClub(club_code, club_id);
  if (!targetClub) {
    return res.status(404).json({ error: 'Código do clube não encontrado. Verifique com a diretoria do seu clube.' });
  }
  if (isClubExpired(targetClub)) {
    return res.status(402).json({ error: 'Este clube está com a assinatura suspensa ou expirada.' });
  }
  const membersRow = await db.get('SELECT COUNT(*) as count FROM users WHERE club_id = ?', targetClub.id);
  if (Number(membersRow.count) >= (targetClub.max_members || 100)) {
    return res.status(403).json({ error: 'Este clube atingiu o limite máximo de membros do plano atual.' });
  }

  const customFullName = name?.trim() || `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || 'Desbravador';

  if (role === 'director') {
    const directorCode = await getSetting('director_registration_code', 'DIRETORIA2026', targetClub.id);
    if (!registration_code || registration_code.trim().toUpperCase() !== directorCode.toUpperCase()) {
      return res.status(403).json({
        error: 'Código de autorização da Diretoria inválido. Solicite o código ao Pastor ou Diretor.'
      });
    }
  } else if (role === 'superadmin') {
    const superadminCode = await getSetting('superadmin_registration_code', 'PASTOR2026', targetClub.id);
    if (!registration_code || registration_code.trim().toUpperCase() !== superadminCode.toUpperCase()) {
      return res.status(403).json({
        error: 'Chave mestra de Pastor / Super Administrador inválida.'
      });
    }
  }

  const now = new Date().toISOString();
  const randomPass = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36);
  const passwordHash = hashPassword(randomPass);
  const userTeamId = team_id ? Number(team_id) : null;
  const userClubRole = club_role ? club_role.trim() : (
    role === 'superadmin' ? 'Pastor / Diretor Geral' :
    role === 'director' ? 'Membro da Diretoria' : 'Desbravador'
  );

  try {
    const newUser = await withTransaction(async () => {
      const result = await db.run(`
        INSERT INTO users (club_id, name, email, password_hash, role, club_role, team_id, active, points_balance, total_points, avatar, google_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?, ?, ?)
      `,
        targetClub.id,
        customFullName,
        email,
        passwordHash,
        role,
        userClubRole,
        userTeamId,
        googleData.picture || null,
        googleData.sub || null,
        now,
        now
      );

      const newUserId = Number(result.lastInsertRowid);
      await logAudit(newUserId, 'GOOGLE_REGISTER', 'users', newUserId, {
        name: customFullName,
        email,
        role,
        team_id: userTeamId,
        club_id: targetClub.id
      }, targetClub.id);

      const created = await db.get(`
        SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon
        FROM users u
        LEFT JOIN teams t ON u.team_id = t.id
        WHERE u.id = ?
      `, newUserId);

      delete created.password_hash;
      return created;
    });

    const token = generateToken(newUser);
    return res.status(201).json({
      success: true,
      token,
      user: newUser,
      isNewUser: true,
      message: `Bem-vindo(a) ao Clube, ${newUser.name}!`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao registrar conta com Google.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }

  const user = await db.get(`
    SELECT u.*, t.name as team_name, t.color as team_color
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE LOWER(u.email) = LOWER(?)
  `, email.trim());

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Sua conta está desativada ou suspensa. Contate o Super Administrador.' });
  }

  const token = generateToken(user);
  delete user.password_hash;

  return res.json({ token, user });
});

router.post('/register', async (req, res) => {
  const {
    name,
    email,
    password,
    role = 'participant',
    team_id,
    club_role,
    registration_code,
    club_code,
    club_id
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'O nome completo é obrigatório.' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'O e-mail é obrigatório.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });

  if (!['participant', 'director', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'Tipo de conta inválido.' });
  }

  const targetClub = await resolveTargetClub(club_code, club_id);
  if (!targetClub) {
    return res.status(404).json({ error: 'Código do clube não encontrado. Verifique com a diretoria.' });
  }
  if (isClubExpired(targetClub)) {
    return res.status(402).json({ error: 'Este clube está com a assinatura suspensa ou expirada.' });
  }

  if (role === 'director') {
    const directorCode = await getSetting('director_registration_code', 'DIRETORIA2026', targetClub.id);
    if (!registration_code || registration_code.trim().toUpperCase() !== directorCode.toUpperCase()) {
      return res.status(403).json({
        error: 'Código de autorização da Diretoria inválido. Solicite o código ao Pastor ou Diretor Geral do Clube.'
      });
    }
  } else if (role === 'superadmin') {
    const totalRow = await db.get('SELECT COUNT(*) as count FROM users WHERE club_id = ?', targetClub.id);
    const superadminCode = await getSetting('superadmin_registration_code', 'PASTOR2026', targetClub.id);
    if (Number(totalRow.count) > 0) {
      if (!registration_code || registration_code.trim().toUpperCase() !== superadminCode.toUpperCase()) {
        return res.status(403).json({
          error: 'Chave mestra de Super Administrador (Pastor / Diretor) inválida. Acesso não autorizado.'
        });
      }
    }
  }

  const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', email.trim());
  if (existing) {
    return res.status(400).json({ error: 'Já existe uma conta cadastrada com este e-mail. Faça login.' });
  }

  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);
  const userTeamId = team_id ? Number(team_id) : null;
  const userClubRole = club_role ? club_role.trim() : (
    role === 'superadmin' ? 'Pastor / Diretor Geral' :
    role === 'director' ? 'Membro da Diretoria' : 'Desbravador'
  );

  try {
    const newUserId = await withTransaction(async () => {
      const insert = await db.run(`
        INSERT INTO users (club_id, name, email, password_hash, role, club_role, team_id, active, points_balance, total_points, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
      `,
        targetClub.id,
        name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        role,
        userClubRole,
        userTeamId,
        now,
        now
      );

      const uid = Number(insert.lastInsertRowid);
      await logAudit(uid, 'USER_REGISTERED', 'users', uid, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        club_role: userClubRole,
        team_id: userTeamId,
        club_id: targetClub.id
      }, targetClub.id);

      return uid;
    });

    const createdUser = await db.get(`
      SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE u.id = ?
    `, newUserId);

    delete createdUser.password_hash;
    const token = generateToken(createdUser);

    return res.status(201).json({
      success: true,
      token,
      user: createdUser,
      message: `Bem-vindo(a) ao Clube, ${createdUser.name}! Seu cadastro foi concluído com sucesso.`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao processar cadastro.' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await db.get(`
    SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon, t.collective_balance as team_collective_balance
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `, req.user.id);

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  delete user.password_hash;
  return res.json({ user, club: req.club });
});

router.put('/profile', authMiddleware, async (req, res) => {
  const { avatar, name } = req.body;
  const userId = req.user.id;

  const user = await db.get('SELECT id, name, email FROM users WHERE id = ?', userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const now = new Date().toISOString();

  if (avatar !== undefined && name !== undefined) {
    await db.run(`
      UPDATE users
      SET avatar = ?,
          name = COALESCE(NULLIF(?, ''), name),
          updated_at = ?
      WHERE id = ?
    `, avatar || null, name ? name.trim() : null, now, userId);
  } else if (avatar !== undefined) {
    await db.run('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?', avatar || null, now, userId);
  } else if (name !== undefined && name.trim()) {
    await db.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', name.trim(), now, userId);
  }

  await logAudit(userId, 'UPDATE_PROFILE', 'users', userId, {
    avatar_updated: avatar !== undefined,
    name_updated: name !== undefined
  }, req.clubId);

  const updatedUser = await db.get(`
    SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon, t.collective_balance as team_collective_balance
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `, userId);

  delete updatedUser.password_hash;
  return res.json({
    user: updatedUser,
    message: 'Foto de perfil atualizada com sucesso!'
  });
});

router.get('/public-teams', async (req, res) => {
  const { club_code, club_id } = req.query;
  const targetClub = await resolveTargetClub(club_code, club_id);
  if (!targetClub) {
    return res.json({ teams: [] });
  }
  const teams = await db.all('SELECT id, name, color, icon FROM teams WHERE club_id = ? ORDER BY name ASC', targetClub.id);
  return res.json({ teams, club: { id: targetClub.id, name: targetClub.name, join_code: targetClub.join_code } });
});

router.get('/demo-users', (req, res) => {
  return res.json({ demoAccounts: [] });
});

module.exports = router;
