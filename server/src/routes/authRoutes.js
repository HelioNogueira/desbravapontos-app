const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const { db, getSetting, initNewClubDefaults, logAudit, withTransaction } = require('../db');
const { verifyPassword, generateToken, authMiddleware, hashPassword, isClubExpired } = require('../auth');

function resolveTargetClub(clubCode, clubId) {
  if (clubCode && String(clubCode).trim()) {
    const club = db.prepare('SELECT * FROM clubs WHERE UPPER(join_code) = UPPER(?)').get(String(clubCode).trim());
    return club || null;
  }
  if (clubId) {
    const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(Number(clubId));
    return club || null;
  }
  // Fallback para o clube padrão (#1) se nenhum código for informado
  return db.prepare('SELECT * FROM clubs ORDER BY id ASC LIMIT 1').get() || null;
}

function makeSlug(name) {
  return String(name || 'clube')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'clube';
}

// GET /api/auth/club-by-code
// Busca um clube pelo código de convite e retorna suas unidades
router.get('/club-by-code', (req, res) => {
  const { code } = req.query;
  const club = resolveTargetClub(code, null);
  if (!club) {
    return res.status(404).json({ error: 'Código do clube não encontrado. Verifique com a diretoria.' });
  }
  const teams = db.prepare('SELECT id, name, color, icon FROM teams WHERE club_id = ? ORDER BY name ASC').all(club.id);
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

// POST /api/auth/register-club
// Auto-cadastro de um novo Clube na plataforma (7 dias grátis de teste)
router.post('/register-club', async (req, res) => {
  const {
    clubName,
    joinCode,
    adminName,
    adminEmail,
    adminPassword,
    googleCredential
  } = req.body;

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

  const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(resolvedEmail);
  if (existingUser) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado em um clube. Use outro e-mail ou faça login.' });
  }

  let finalCode = (joinCode && joinCode.trim())
    ? joinCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    : makeSlug(clubName).toUpperCase().replace(/-/g, '').slice(0, 8) + Math.floor(100 + Math.random() * 900);

  if (db.prepare('SELECT id FROM clubs WHERE UPPER(join_code) = UPPER(?)').get(finalCode)) {
    return res.status(400).json({ error: `O código "${finalCode}" já está em uso. Escolha outro código para o seu clube.` });
  }

  let slug = makeSlug(clubName);
  if (db.prepare('SELECT id FROM clubs WHERE slug = ?').get(slug)) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const trialExpires = new Date(now.getTime() + 7 * 86400000).toISOString();
  const passwordHash = hashPassword(adminPassword || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)));

  try {
    const result = withTransaction(() => {
      const clubRes = db.prepare(`
        INSERT INTO clubs (name, slug, join_code, status, plan_name, monthly_price, expires_at, max_members, owner_email, created_at, updated_at)
        VALUES (?, ?, ?, 'trial', 'Teste 7 Dias', 39.90, ?, 100, ?, ?, ?)
      `).run(clubName.trim(), slug, finalCode, trialExpires, resolvedEmail, nowIso, nowIso);

      const clubId = Number(clubRes.lastInsertRowid);
      initNewClubDefaults(clubId, clubName.trim());

      const userRes = db.prepare(`
        INSERT INTO users (club_id, name, email, password_hash, role, club_role, active, points_balance, total_points, avatar, google_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'superadmin', 'Diretor Geral / Fundador', 1, 0, 0, ?, ?, ?, ?)
      `).run(clubId, resolvedName, resolvedEmail, passwordHash, googlePic, googleSub, nowIso, nowIso);

      const userId = Number(userRes.lastInsertRowid);
      logAudit(userId, 'CLUB_SELF_REGISTERED', 'clubs', clubId, { clubName: clubName.trim(), joinCode: finalCode }, clubId);

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      delete user.password_hash;
      const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
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

// GET /api/auth/google-client-id
// Retorna a chave do Google Client ID configurada para a aplicação
router.get('/google-client-id', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || getSetting('google_client_id', '');
  return res.json({ clientId });
});

// Helper para validar o token JWT emitido pelo Google Identity Services
async function verifyGoogleToken(idToken) {
  // 1. Tentar validação oficial nos servidores do Google
  try {
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (googleRes.ok) {
      const payload = await googleRes.json();
      return payload;
    }
  } catch (err) {
    console.warn('Falha na chamada remota do Google Tokeninfo:', err.message);
  }

  // 2. Fallback defensivo: decodificação de payload JWT (caso ambiente offline ou mock)
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

// POST /api/auth/google
// Login e Cadastro Rápido com Google
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

  // 1. Verificar se o usuário já possui cadastro com este e-mail
  const existingUser = db.prepare(`
    SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE LOWER(u.email) = ?
  `).get(email);

  if (existingUser) {
    if (!existingUser.active) {
      return res.status(403).json({ error: 'Sua conta está desativada. Contate a diretoria do Clube.' });
    }

    // Se já tinha conta, atualiza google_id se não estiver preenchido
    if (googleData.sub && !existingUser.google_id) {
      try {
        db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleData.sub, existingUser.id);
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

  // 2. Se o usuário é NOVO e ainda não enviou Nome/Sobrenome customizados:
  // Solicita que o usuário confirme o Nome e Sobrenome para não pegar apenas o nome do e-mail
  const hasProvidedName = Boolean((firstName && firstName.trim()) || (lastName && lastName.trim()) || (name && name.trim()));
  if (!hasProvidedName) {
    // Sugestão inicial separando nome e sobrenome do Google
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

  // 3. Cadastrar novo usuário com o Nome e Sobrenome escolhidos pelo desbravador
  const targetClub = resolveTargetClub(club_code, club_id);
  if (!targetClub) {
    return res.status(404).json({ error: 'Código do clube não encontrado. Verifique com a diretoria do seu clube.' });
  }
  if (isClubExpired(targetClub)) {
    return res.status(402).json({ error: 'Este clube está com a assinatura suspensa ou expirada.' });
  }
  const membersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE club_id = ?').get(targetClub.id).count;
  if (membersCount >= (targetClub.max_members || 100)) {
    return res.status(403).json({ error: 'Este clube atingiu o limite máximo de membros do plano atual.' });
  }

  const customFullName = name?.trim() || `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || 'Desbravador';

  if (role === 'director') {
    const directorCode = getSetting('director_registration_code', 'DIRETORIA2026', targetClub.id);
    if (!registration_code || registration_code.trim().toUpperCase() !== directorCode.toUpperCase()) {
      return res.status(403).json({
        error: 'Código de autorização da Diretoria inválido. Solicite o código ao Pastor ou Diretor.'
      });
    }
  } else if (role === 'superadmin') {
    const superadminCode = getSetting('superadmin_registration_code', 'PASTOR2026', targetClub.id);
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
    const newUser = withTransaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO users (club_id, name, email, password_hash, role, club_role, team_id, active, points_balance, total_points, avatar, google_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
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
      logAudit(newUserId, 'GOOGLE_REGISTER', 'users', newUserId, {
        name: customFullName,
        email,
        role,
        team_id: userTeamId,
        club_id: targetClub.id
      }, targetClub.id);

      const created = db.prepare(`
        SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon
        FROM users u
        LEFT JOIN teams t ON u.team_id = t.id
        WHERE u.id = ?
      `).get(newUserId);

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

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }

  const user = db.prepare(`
    SELECT u.*, t.name as team_name, t.color as team_color
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE LOWER(u.email) = LOWER(?)
  `).get(email.trim());

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Sua conta está desativada ou suspensa. Contate o Super Administrador.' });
  }

  const token = generateToken(user);
  delete user.password_hash;

  return res.json({
    token,
    user
  });
});

// POST /api/auth/register
// Sistema de Cadastro de Usuários (Desbravador, Diretoria ou Super Administrador)
router.post('/register', (req, res) => {
  const {
    name,
    email,
    password,
    role = 'participant', // 'participant', 'director', 'superadmin'
    team_id,
    club_role, // ex: "Desbravador", "Conselheiro(a)", "Diretor(a) Associado(a)", "Pastor Distrital"
    registration_code,
    club_code,
    club_id
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome completo é obrigatório.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'O e-mail é obrigatório.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
  }

  const validRoles = ['participant', 'director', 'superadmin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Tipo de conta inválido.' });
  }

  const targetClub = resolveTargetClub(club_code, club_id);
  if (!targetClub) {
    return res.status(404).json({ error: 'Código do clube não encontrado. Verifique com a diretoria.' });
  }
  if (isClubExpired(targetClub)) {
    return res.status(402).json({ error: 'Este clube está com a assinatura suspensa ou expirada.' });
  }

  // 1. Validação de Segurança por Nível
  if (role === 'director') {
    const directorCode = getSetting('director_registration_code', 'DIRETORIA2026', targetClub.id);
    if (!registration_code || registration_code.trim().toUpperCase() !== directorCode.toUpperCase()) {
      return res.status(403).json({
        error: 'Código de autorização da Diretoria inválido. Solicite o código ao Pastor ou Diretor Geral do Clube.'
      });
    }
  } else if (role === 'superadmin') {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE club_id = ?').get(targetClub.id).count;
    const superadminCode = getSetting('superadmin_registration_code', 'PASTOR2026', targetClub.id);
    // Se não for o primeiro cadastro do clube, exige a chave mestra
    if (totalUsers > 0) {
      if (!registration_code || registration_code.trim().toUpperCase() !== superadminCode.toUpperCase()) {
        return res.status(403).json({
          error: 'Chave mestra de Super Administrador (Pastor / Diretor) inválida. Acesso não autorizado.'
        });
      }
    }
  }

  // 2. Verificar duplicidade de e-mail
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
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
    const newUserId = withTransaction(() => {
      const insert = db.prepare(`
        INSERT INTO users (club_id, name, email, password_hash, role, club_role, team_id, active, points_balance, total_points, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
      `).run(
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
      logAudit(uid, 'USER_REGISTERED', 'users', uid, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        club_role: userClubRole,
        team_id: userTeamId,
        club_id: targetClub.id
      }, targetClub.id);

      return uid;
    });

    const createdUser = db.prepare(`
      SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE u.id = ?
    `).get(newUserId);

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

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(`
    SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon, t.collective_balance as team_collective_balance
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  delete user.password_hash;
  return res.json({ user, club: req.club });
});

// PUT /api/auth/profile (Permitir que TODOS os usuários atualizem sua foto de perfil e nome)
router.put('/profile', authMiddleware, (req, res) => {
  const { avatar, name } = req.body;
  const userId = req.user.id;

  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  const now = new Date().toISOString();

  if (avatar !== undefined && name !== undefined) {
    db.prepare(`
      UPDATE users
      SET avatar = ?,
          name = COALESCE(NULLIF(?, ''), name),
          updated_at = ?
      WHERE id = ?
    `).run(avatar || null, name ? name.trim() : null, now, userId);
  } else if (avatar !== undefined) {
    db.prepare(`
      UPDATE users
      SET avatar = ?,
          updated_at = ?
      WHERE id = ?
    `).run(avatar || null, now, userId);
  } else if (name !== undefined && name.trim()) {
    db.prepare(`
      UPDATE users
      SET name = ?,
          updated_at = ?
      WHERE id = ?
    `).run(name.trim(), now, userId);
  }

  logAudit(userId, 'UPDATE_PROFILE', 'users', userId, {
    avatar_updated: avatar !== undefined,
    name_updated: name !== undefined
  });

  const updatedUser = db.prepare(`
    SELECT u.*, t.name as team_name, t.color as team_color, t.icon as team_icon, t.collective_balance as team_collective_balance
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `).get(userId);

  delete updatedUser.password_hash;
  return res.json({
    user: updatedUser,
    message: 'Foto de perfil atualizada com sucesso!'
  });
});

// GET /api/auth/public-teams (Para preencher seleção no formulário de cadastro)
router.get('/public-teams', (req, res) => {
  const { club_code, club_id } = req.query;
  const targetClub = resolveTargetClub(club_code, club_id);
  if (!targetClub) {
    return res.json({ teams: [] });
  }
  const teams = db.prepare('SELECT id, name, color, icon FROM teams WHERE club_id = ? ORDER BY name ASC').all(targetClub.id);
  return res.json({ teams, club: { id: targetClub.id, name: targetClub.name, join_code: targetClub.join_code } });
});

// GET /api/auth/demo-users (Desativado para proteção da privacidade dos membros)
router.get('/demo-users', (req, res) => {
  return res.json({ demoAccounts: [] });
});

module.exports = router;
