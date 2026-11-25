const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'desbravadores-super-secret-key-2026';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      team_id: user.team_id,
      club_id: user.club_id,
      is_platform_admin: Boolean(user.is_platform_admin)
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function isClubExpired(club) {
  if (!club) return false;
  if (club.status === 'suspended') return true;
  if (club.expires_at && new Date(club.expires_at).getTime() < Date.now()) return true;
  return false;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token ausente.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`
      SELECT id, name, email, role, club_role, team_id, club_id, is_platform_admin, active, points_balance, total_points
      FROM users WHERE id = ?
    `).get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Sua conta foi desativada ou bloqueada pela administração.' });
    }

    const club = user.club_id
      ? db.prepare('SELECT id, name, slug, join_code, status, plan_name, monthly_price, expires_at, max_members FROM clubs WHERE id = ?').get(user.club_id)
      : null;

    const expired = !user.is_platform_admin && isClubExpired(club);
    if (club) {
      club.isExpired = expired;
    }

    req.user = user;
    req.clubId = user.club_id;
    req.club = club;
    req.isPlatformAdmin = Boolean(user.is_platform_admin);

    // Permitir /api/auth/me mesmo com clube expirado para que o front exiba a tela de renovação
    if (expired && !req.originalUrl.startsWith('/api/auth/me')) {
      return res.status(402).json({
        error: 'A assinatura do seu clube expirou ou foi suspensa. Entre em contato com o suporte para renovar.',
        code: 'CLUB_SUBSCRIPTION_EXPIRED',
        club
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
}

function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.isPlatformAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador da plataforma.' });
  }
  next();
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Acesso negado. Nível de permissão insuficiente para realizar esta operação.'
      });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  authMiddleware,
  requireRole,
  requirePlatformAdmin,
  isClubExpired,
  JWT_SECRET
};
