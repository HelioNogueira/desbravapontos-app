const express = require('express');
const router = express.Router();
const { db, getSetting, logAudit, withTransaction } = require('../db');
const { verifyPassword, generateToken, authMiddleware, hashPassword } = require('../auth');

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
    registration_code
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

  // 1. Validação de Segurança por Nível
  if (role === 'director') {
    const directorCode = getSetting('director_registration_code', 'DIRETORIA2026');
    if (!registration_code || registration_code.trim().toUpperCase() !== directorCode.toUpperCase()) {
      return res.status(403).json({
        error: 'Código de autorização da Diretoria inválido. Solicite o código ao Pastor ou Diretor Geral do Clube.'
      });
    }
  } else if (role === 'superadmin') {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const superadminCode = getSetting('superadmin_registration_code', 'PASTOR2026');
    // Se não for o primeiro cadastro do sistema, exige a chave mestra
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
        INSERT INTO users (name, email, password_hash, role, club_role, team_id, active, points_balance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
      `).run(
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
        team_id: userTeamId
      });

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
  return res.json({ user });
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
  const teams = db.prepare('SELECT id, name, color, icon FROM teams ORDER BY name ASC').all();
  return res.json({ teams });
});

// GET /api/auth/demo-users (Desativado para proteção da privacidade dos membros)
router.get('/demo-users', (req, res) => {
  return res.json({ demoAccounts: [] });
});

module.exports = router;
