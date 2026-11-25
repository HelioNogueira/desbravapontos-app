const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new DatabaseSync(dbPath);

// Configuração do SQLite para máxima integridade e concorrência
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
  PRAGMA wal_autocheckpoint = 10;
`);

function initDatabase() {
  db.exec(`
    -- Tabela de Configurações
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Tabela de Ciclos / Temporadas
    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('continuous', 'weekly', 'monthly', 'custom')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Tabela de Equipes / Unidades de Desbravadores
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#1e40af',
      icon TEXT NOT NULL DEFAULT 'Shield',
      motto TEXT,
      collective_balance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Tabela de Usuários
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('superadmin', 'director', 'participant')),
      club_role TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      active INTEGER NOT NULL DEFAULT 1,
      points_balance INTEGER NOT NULL DEFAULT 0,
      avatar TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Tabela de Transações de Pontos (Extrato imutável)
    CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bonus', 'penalty', 'manual', 'batch', 'auction_bid', 'auction_refund', 'auction_win', 'reset_adjustment', 'correction')),
      reason TEXT NOT NULL,
      actor_id INTEGER REFERENCES users(id),
      cycle_id INTEGER REFERENCES cycles(id),
      batch_id TEXT,
      is_reverted INTEGER NOT NULL DEFAULT 0,
      reverted_reason TEXT,
      created_at TEXT NOT NULL
    );

    -- Tabela de Leilões
    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      round_number INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL CHECK(mode IN ('individual', 'team', 'both')),
      status TEXT NOT NULL CHECK(status IN ('scheduled', 'active', 'paused', 'ended', 'cancelled')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      actual_end_time TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      cycle_id INTEGER REFERENCES cycles(id),
      pause_reason TEXT,
      cancel_reason TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    -- Tabela de Itens de Leilão (Lotes)
    CREATE TABLE IF NOT EXISTS auction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      starting_bid INTEGER NOT NULL DEFAULT 10,
      bid_step INTEGER NOT NULL DEFAULT 5,
      current_bid INTEGER NOT NULL DEFAULT 0,
      current_winner_user_id INTEGER REFERENCES users(id),
      current_winner_team_id INTEGER REFERENCES teams(id),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('waiting', 'open', 'sold', 'unsold', 'cancelled')),
      order_num INTEGER NOT NULL DEFAULT 1,
      sold_at TEXT
    );

    -- Tabela de Lances
    CREATE TABLE IF NOT EXISTS auction_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL REFERENCES auctions(id),
      item_id INTEGER NOT NULL REFERENCES auction_items(id),
      user_id INTEGER REFERENCES users(id),
      team_id INTEGER REFERENCES teams(id),
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'outbid', 'won', 'refunded', 'cancelled')),
      created_at TEXT NOT NULL
    );

    -- Tabela de Histórico de Resets (Snapshots de Segurança)
    CREATE TABLE IF NOT EXISTS reset_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER NOT NULL REFERENCES users(id),
      reset_type TEXT NOT NULL,
      target_description TEXT NOT NULL,
      affected_count INTEGER NOT NULL,
      reason TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Tabela de Auditoria Completa
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL
    );

    -- Índices para alta performance em tempo real
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
    CREATE INDEX IF NOT EXISTS idx_tx_user ON point_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_tx_team ON point_transactions(team_id);
    CREATE INDEX IF NOT EXISTS idx_tx_created ON point_transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_bids_item ON auction_bids(item_id);
    CREATE INDEX IF NOT EXISTS idx_bids_user ON auction_bids(user_id);
    CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
  `);

  // Migração defensiva para colunas adicionais
  try {
    db.exec('ALTER TABLE users ADD COLUMN club_role TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN google_id TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN total_points INTEGER NOT NULL DEFAULT 0;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0;');
  } catch (_) {}

  // =========================================================
  // MULTI-CLUBE (SaaS): Tabela de Clubes e Configurações por Clube
  // =========================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      join_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'trial' CHECK(status IN ('trial', 'active', 'suspended')),
      plan_name TEXT NOT NULL DEFAULT 'Teste 7 Dias',
      monthly_price REAL NOT NULL DEFAULT 39.90,
      expires_at TEXT NOT NULL,
      max_members INTEGER NOT NULL DEFAULT 100,
      owner_email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS club_settings (
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (club_id, key)
    );
  `);

  // Migrar tabela teams para remover UNIQUE global de name e usar UNIQUE(club_id, name)
  try {
    const teamsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='teams'").get();
    if (teamsSchema && teamsSchema.sql && !teamsSchema.sql.includes('club_id')) {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec(`
        CREATE TABLE teams_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#1e40af',
          icon TEXT NOT NULL DEFAULT 'Shield',
          motto TEXT,
          collective_balance INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          UNIQUE(club_id, name)
        );
        INSERT INTO teams_new (id, club_id, name, color, icon, motto, collective_balance, created_at)
        SELECT id, NULL, name, color, icon, motto, collective_balance, created_at FROM teams;
        DROP TABLE teams;
        ALTER TABLE teams_new RENAME TO teams;
      `);
      db.exec('PRAGMA foreign_keys = ON;');
    }
  } catch (err) {
    console.warn('Aviso ao migrar tabela teams:', err.message);
    try { db.exec('PRAGMA foreign_keys = ON;'); } catch (_) {}
  }

  // Adicionar club_id nas demais tabelas
  const tablesWithClubId = ['users', 'teams', 'cycles', 'point_transactions', 'auctions', 'reset_history', 'audit_logs'];
  for (const tbl of tablesWithClubId) {
    try {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN club_id INTEGER REFERENCES clubs(id);`);
    } catch (_) {}
  }

  // Índices para club_id
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_club ON users(club_id);
      CREATE INDEX IF NOT EXISTS idx_teams_club ON teams(club_id);
      CREATE INDEX IF NOT EXISTS idx_tx_club ON point_transactions(club_id);
      CREATE INDEX IF NOT EXISTS idx_auctions_club ON auctions(club_id);
      CREATE INDEX IF NOT EXISTS idx_cycles_club ON cycles(club_id);
    `);
  } catch (_) {}

  // Sincronizar total_points inicial com base em points_balance caso esteja zerado
  try {
    db.exec(`
      UPDATE users
      SET total_points = CASE
        WHEN total_points > 0 THEN total_points
        WHEN points_balance > 0 THEN points_balance
        ELSE 0
      END;
    `);
  } catch (_) {}

  // Configurações padrão se ainda não existirem
  const defaultSettings = [
    { key: 'allow_negative_balance', value: 'false' },
    { key: 'team_score_mode', value: 'sum' }, // 'sum' = soma dos membros, 'collective' = cofre coletivo
    { key: 'anti_sniper_seconds', value: '15' },
    { key: 'anti_sniper_extension', value: '30' },
    { key: 'default_bid_step', value: '10' },
    { key: 'director_points_limit', value: '500' },
    { key: 'director_can_award_points', value: 'true' },
    { key: 'reset_keep_auction_points', value: 'true' },
    { key: 'director_registration_code', value: 'DIRETORIA2026' },
    { key: 'superadmin_registration_code', value: 'PASTOR2026' },
    { key: 'require_points_for_bids', value: 'true' }, // 'true' = exige saldo em carteira; 'false' = lances livres sem trava de saldo
    { key: 'enable_points_system', value: 'true' }, // 'true' = pontuação ativa; 'false' = modo simplificado
    { key: 'club_name', value: 'Clube de Desbravadores Albatroz' },
    { key: 'timezone', value: 'America/Sao_Paulo' },
    { key: 'google_client_id', value: '' }
  ];

  const checkStmt = db.prepare('SELECT key FROM app_settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)');
  const now = new Date().toISOString();

  for (const s of defaultSettings) {
    const existing = checkStmt.get(s.key);
    if (!existing) {
      insertStmt.run(s.key, s.value, now);
    }
  }

  // Garantir que existe ao menos o Clube #1 padrão e vincular registros legados
  let defaultClub = db.prepare('SELECT id FROM clubs ORDER BY id ASC LIMIT 1').get();
  if (!defaultClub) {
    const existingClubName = getSetting('club_name', 'Clube de Desbravadores Albatroz');
    const clubRes = db.prepare(`
      INSERT INTO clubs (name, slug, join_code, status, plan_name, monthly_price, expires_at, max_members, created_at, updated_at)
      VALUES (?, 'albatroz', 'ALBATROZ', 'active', 'Fundador', 0, '2099-12-31T23:59:59.000Z', 500, ?, ?)
    `).run(existingClubName, now, now);
    defaultClub = { id: Number(clubRes.lastInsertRowid) };
  }

  const defaultClubId = defaultClub.id;
  for (const tbl of ['users', 'teams', 'cycles', 'point_transactions', 'auctions', 'reset_history', 'audit_logs']) {
    try {
      db.prepare(`UPDATE ${tbl} SET club_id = ? WHERE club_id IS NULL`).run(defaultClubId);
    } catch (_) {}
  }

  // Copiar app_settings para club_settings do Clube #1 se estiver vazio
  const clubSettingsCount = db.prepare('SELECT COUNT(*) as count FROM club_settings WHERE club_id = ?').get(defaultClubId).count;
  if (clubSettingsCount === 0) {
    const globalSettings = db.prepare('SELECT key, value, updated_at FROM app_settings').all();
    const csInsert = db.prepare('INSERT OR IGNORE INTO club_settings (club_id, key, value, updated_at) VALUES (?, ?, ?, ?)');
    for (const gs of globalSettings) {
      if (gs.key !== 'google_client_id') {
        csInsert.run(defaultClubId, gs.key, gs.value, gs.updated_at);
      }
    }
  }

  // Garantir ao menos 1 Platform Admin (dono do SaaS)
  const hasPlatformAdmin = db.prepare('SELECT id FROM users WHERE is_platform_admin = 1 LIMIT 1').get();
  if (!hasPlatformAdmin) {
    const firstSuperAdmin = db.prepare("SELECT id FROM users WHERE role = 'superadmin' ORDER BY id ASC LIMIT 1").get();
    if (firstSuperAdmin) {
      db.prepare('UPDATE users SET is_platform_admin = 1 WHERE id = ?').run(firstSuperAdmin.id);
    }
  }

  // Ciclo padrão ativo para o clube padrão
  const activeCycle = db.prepare('SELECT id FROM cycles WHERE is_active = 1 AND club_id = ?').get(defaultClubId);
  if (!activeCycle) {
    db.prepare(`
      INSERT INTO cycles (club_id, name, type, start_date, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(defaultClubId, 'Temporada Atual - 2026/2', 'continuous', now, now);
  }

  // Unidades oficiais padrão se a tabela estiver vazia
  const teamsCount = db.prepare('SELECT COUNT(*) as count FROM teams WHERE club_id = ?').get(defaultClubId).count;
  if (teamsCount === 0) {
    const teamsData = [
      { name: 'Unidade Águia Imperial', color: '#1E40AF', icon: 'Shield', motto: 'Sempre altos e leais!' },
      { name: 'Unidade Falcão Dourado', color: '#D97706', icon: 'Award', motto: 'Velozes e pontuais!' },
      { name: 'Unidade Pantera Negra', color: '#111827', icon: 'Flame', motto: 'Coragem em qualquer missão!' },
      { name: 'Unidade Castor Guardião', color: '#047857', icon: 'Compass', motto: 'Trabalho unido e fidelidade!' }
    ];
    for (const t of teamsData) {
      db.prepare(`
        INSERT INTO teams (club_id, name, color, icon, motto, collective_balance, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `).run(defaultClubId, t.name, t.color, t.icon, t.motto, now);
    }
  }
}

// Inicializar configurações e estrutura básica para um novo clube
function initNewClubDefaults(clubId, clubName) {
  const now = new Date().toISOString();
  const defaults = [
    { key: 'allow_negative_balance', value: 'false' },
    { key: 'team_score_mode', value: 'sum' },
    { key: 'anti_sniper_seconds', value: '15' },
    { key: 'anti_sniper_extension', value: '30' },
    { key: 'default_bid_step', value: '10' },
    { key: 'director_points_limit', value: '500' },
    { key: 'director_can_award_points', value: 'true' },
    { key: 'reset_keep_auction_points', value: 'true' },
    { key: 'director_registration_code', value: 'DIRETORIA2026' },
    { key: 'superadmin_registration_code', value: 'PASTOR2026' },
    { key: 'require_points_for_bids', value: 'true' },
    { key: 'enable_points_system', value: 'true' },
    { key: 'club_name', value: clubName || 'Meu Clube de Desbravadores' },
    { key: 'timezone', value: 'America/Sao_Paulo' }
  ];

  const csInsert = db.prepare('INSERT OR IGNORE INTO club_settings (club_id, key, value, updated_at) VALUES (?, ?, ?, ?)');
  for (const d of defaults) {
    csInsert.run(clubId, d.key, d.value, now);
  }

  db.prepare(`
    INSERT INTO cycles (club_id, name, type, start_date, is_active, created_at)
    VALUES (?, 'Temporada Inicial', 'continuous', ?, 1, ?)
  `).run(clubId, now, now);

  const starterTeams = [
    { name: 'Unidade Águia', color: '#1E40AF', icon: 'Shield', motto: 'Sempre altos e leais!' },
    { name: 'Unidade Falcão', color: '#D97706', icon: 'Award', motto: 'Velozes e pontuais!' }
  ];
  for (const t of starterTeams) {
    db.prepare(`
      INSERT OR IGNORE INTO teams (club_id, name, color, icon, motto, collective_balance, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(clubId, t.name, t.color, t.icon, t.motto, now);
  }
}

// Helper para transações atômicas com tratamento de erro
function withTransaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {}
    throw err;
  }
}

// Helper para registrar log de auditoria (com suporte a club_id)
function logAudit(actorId, action, entityType, entityId, details = null, clubId = null) {
  const now = new Date().toISOString();
  let resolvedClubId = clubId;
  if (!resolvedClubId && actorId) {
    try {
      const actor = db.prepare('SELECT club_id FROM users WHERE id = ?').get(actorId);
      if (actor) resolvedClubId = actor.club_id;
    } catch (_) {}
  }
  db.prepare(`
    INSERT INTO audit_logs (club_id, actor_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    resolvedClubId || null,
    actorId,
    action,
    entityType,
    entityId,
    details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
    now
  );
}

// Helper para obter configuração (por clube se clubId informado, senão global)
function getSetting(key, defaultValue = null, clubId = null) {
  if (clubId) {
    const clubRow = db.prepare('SELECT value FROM club_settings WHERE club_id = ? AND key = ?').get(clubId, key);
    if (clubRow) return clubRow.value;
  }
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

// Helper para salvar configuração (por clube se clubId informado, senão global)
function setSetting(key, value, clubId = null) {
  const now = new Date().toISOString();
  if (clubId) {
    db.prepare(`
      INSERT INTO club_settings (club_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(club_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(clubId, key, String(value), now);
    return;
  }
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), now);
}

module.exports = {
  db,
  initDatabase,
  initNewClubDefaults,
  withTransaction,
  logAudit,
  getSetting,
  setSetting
};
