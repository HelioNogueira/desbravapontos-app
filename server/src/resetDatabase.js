const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('🔄 Iniciando limpeza e zeragem completa do banco de dados...');

// Limpar todas as tabelas transacionais e de dados
db.exec(`
  PRAGMA foreign_keys = OFF;
  
  DELETE FROM point_transactions;
  DELETE FROM auction_bids;
  DELETE FROM auction_items;
  DELETE FROM auctions;
  DELETE FROM reset_history;
  DELETE FROM audit_logs;
  DELETE FROM users;
  
  -- Resetar saldo das equipes para zero
  UPDATE teams SET collective_balance = 0;

  -- Resetar contadores de autoincrement
  DELETE FROM sqlite_sequence WHERE name IN ('point_transactions', 'auction_bids', 'auction_items', 'auctions', 'reset_history', 'audit_logs', 'users');

  PRAGMA foreign_keys = ON;
`);

console.log('✅ Banco de dados zerado com sucesso!');
console.log('   - Usuários: 0 (pronto para cadastrar o Pastor / Superadmin, Diretoria e Desbravadores)');
console.log('   - Pontuações e transações: 0');
console.log('   - Leilões e lances: 0');
console.log('   - Unidades oficiais mantidas com saldo 0');
console.log('   - Códigos de segurança: DIRETORIA2026 / PASTOR2026');
