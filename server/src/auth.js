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

const PLATFORM_PIX_KEY = process.env.PLATFORM_PIX_KEY || '92994020715';
const PLATFORM_WHATSAPP = process.env.PLATFORM_WHATSAPP || '5592994020715';

function getSaoPauloDayOfWeek(date) {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short'
    }).format(date);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[weekday] ?? date.getUTCDay();
  } catch (_) {
    return date.getUTCDay();
  }
}

function getGraceInfo(club) {
  if (!club) {
    return { isExpired: false, inGracePeriod: false, graceEndsAt: null };
  }
  if (club.status === 'suspended') {
    return { isExpired: true, inGracePeriod: false, graceEndsAt: club.expires_at };
  }
  if (!club.expires_at) {
    return { isExpired: false, inGracePeriod: false, graceEndsAt: null };
  }

  const nowMs = Date.now();
  const expDate = new Date(club.expires_at);
  const expMs = expDate.getTime();

  if (nowMs <= expMs) {
    return { isExpired: false, inGracePeriod: false, graceEndsAt: club.expires_at };
  }

  // Carência inteligente: nunca bloqueia na hora; se cair na Sexta ou Sábado, estende até passar o fim de semana
  const day = getSaoPauloDayOfWeek(expDate);
  let graceHours = 36; // ~1 dia e meio de tolerância padrão
  if (day === 5) {
    // Caiu na Sexta-feira -> libera Sexta, Sábado e Domingo (72h)
    graceHours = 72;
  } else if (day === 6) {
    // Caiu no Sábado -> libera Sábado e Domingo (48h)
    graceHours = 48;
  }

  const graceEndMs = expMs + graceHours * 3600 * 1000;
  const graceEndsAt = new Date(graceEndMs).toISOString();

  if (nowMs < graceEndMs) {
    return { isExpired: false, inGracePeriod: true, graceEndsAt };
  }

  return { isExpired: true, inGracePeriod: false, graceEndsAt };
}

function isClubExpired(club) {
  return getGraceInfo(club).isExpired;
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token ausente.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get(`
      SELECT id, name, email, role, club_role, team_id, club_id, is_platform_admin, active, points_balance, total_points
      FROM users WHERE id = ?
    `, decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Sua conta foi desativada ou bloqueada pela administração.' });
    }

    const club = user.club_id
      ? await db.get('SELECT id, name, slug, join_code, status, plan_name, monthly_price, expires_at, max_members FROM clubs WHERE id = ?', user.club_id)
      : null;

    const grace = !user.is_platform_admin ? getGraceInfo(club) : { isExpired: false, inGracePeriod: false, graceEndsAt: null };
    if (club) {
      club.isExpired = grace.isExpired;
      club.inGracePeriod = grace.inGracePeriod;
      club.graceEndsAt = grace.graceEndsAt;
      club.pixKey = PLATFORM_PIX_KEY;
      club.whatsapp = PLATFORM_WHATSAPP;
    }

    req.user = user;
    req.clubId = user.club_id;
    req.club = club;
    req.isPlatformAdmin = Boolean(user.is_platform_admin);

    // Permitir /api/auth/me mesmo com clube expirado para que o front exiba a tela de renovação
    if (grace.isExpired && !req.originalUrl.startsWith('/api/auth/me')) {
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
  getGraceInfo,
  JWT_SECRET
};
