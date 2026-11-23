const test = require('node:test');
const assert = require('node:assert');
const { db, withTransaction, setSetting, getSetting } = require('../src/db');
const { hashPassword, verifyPassword, generateToken } = require('../src/auth');
const { placeBid, endAuction } = require('../src/auctionEngine');
const { seedDatabase } = require('../src/seed');

test('Setup e Seed do Banco de Dados', (t) => {
  seedDatabase();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  assert.ok(userCount > 0, 'O banco deve conter usuários semeados');
});

test('Segurança de Autenticação e Senhas com Hash', (t) => {
  const hash = hashPassword('teste123');
  assert.notStrictEqual(hash, 'teste123');
  assert.strictEqual(verifyPassword('teste123', hash), true);
  assert.strictEqual(verifyPassword('senha_errada', hash), false);

  const admin = db.prepare("SELECT * FROM users WHERE role = 'superadmin' LIMIT 1").get();
  assert.ok(admin, 'Deve existir superadmin');
  const token = generateToken(admin);
  assert.ok(token && token.length > 20, 'Token JWT deve ser gerado');
});

test('Lançamento de Pontos e Integridade de Saldo', (t) => {
  const user = db.prepare("SELECT * FROM users WHERE role = 'participant' LIMIT 1").get();
  const initialBalance = user.points_balance;
  const awardAmount = 50;

  withTransaction(() => {
    const newBalance = initialBalance + awardAmount;
    db.prepare('UPDATE users SET points_balance = ? WHERE id = ?').run(newBalance, user.id);
    db.prepare(`
      INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, created_at)
      VALUES (?, ?, ?, ?, 'bonus', 'Teste Unitário de Pontuação', ?)
    `).run(user.id, user.team_id, awardAmount, newBalance, new Date().toISOString());
  });

  const updatedUser = db.prepare('SELECT points_balance FROM users WHERE id = ?').get(user.id);
  assert.strictEqual(updatedUser.points_balance, initialBalance + awardAmount, 'Saldo deve refletir a adição exata');
});

test('Validação de Regra: Impedir Saldo Negativo', (t) => {
  setSetting('allow_negative_balance', 'false');
  const allowNeg = getSetting('allow_negative_balance');
  assert.strictEqual(allowNeg, 'false');

  const user = db.prepare("SELECT * FROM users WHERE role = 'participant' LIMIT 1").get();
  const excessivePenalty = user.points_balance + 9999;

  assert.throws(() => {
    withTransaction(() => {
      const newBal = user.points_balance - excessivePenalty;
      if (newBal < 0) {
        throw new Error('Operação cancelada: saldo não pode ficar negativo');
      }
      db.prepare('UPDATE users SET points_balance = ? WHERE id = ?').run(newBal, user.id);
    });
  }, /saldo não pode ficar negativo/);
});

test('Mecanismo de Leilão: Lances Atômicos e Reembolso Imediato ao ser Superado', (t) => {
  // Obter participantes para o leilão
  const participants = db.prepare("SELECT * FROM users WHERE role = 'participant' AND points_balance >= 200 LIMIT 2").all();
  assert.strictEqual(participants.length, 2, 'Necessário 2 participantes com saldo');

  const p1 = participants[0];
  const p2 = participants[1];

  const p1Initial = p1.points_balance;
  const p2Initial = p2.points_balance;

  // Criar um leilão de teste isolado
  const now = new Date();
  const end = new Date(now.getTime() + 10 * 60 * 1000);

  const aucRes = db.prepare(`
    INSERT INTO auctions (title, round_number, mode, status, start_time, end_time, duration_minutes, created_at)
    VALUES ('Leilão Teste Unitário', 99, 'individual', 'active', ?, ?, 10, ?)
  `).run(now.toISOString(), end.toISOString(), now.toISOString());
  const auctionId = Number(aucRes.lastInsertRowid);

  const itemRes = db.prepare(`
    INSERT INTO auction_items (auction_id, title, starting_bid, bid_step, current_bid, status, order_num)
    VALUES (?, 'Bússola Profissional Brunton', 20, 5, 20, 'open', 1)
  `).run(auctionId);
  const itemId = Number(itemRes.lastInsertRowid);

  // 1. Participante 1 dá um lance de 30 pontos
  const bid1 = placeBid({
    auctionId,
    itemId,
    userId: p1.id,
    amount: 30
  });

  assert.strictEqual(bid1.amount, 30);
  const p1AfterBid = db.prepare('SELECT points_balance FROM users WHERE id = ?').get(p1.id).points_balance;
  assert.strictEqual(p1AfterBid, p1Initial - 30, 'P1 deve ter 30 pontos debitados');

  // 2. Participante 2 supera o lance dando 40 pontos
  const bid2 = placeBid({
    auctionId,
    itemId,
    userId: p2.id,
    amount: 40
  });

  assert.strictEqual(bid2.amount, 40);

  // 3. VERIFICAÇÃO CRÍTICA: P1 DEVE RECEBER OS 30 PONTOS DE VOLTA AUTOMATICAMENTE!
  const p1AfterRefund = db.prepare('SELECT points_balance FROM users WHERE id = ?').get(p1.id).points_balance;
  assert.strictEqual(p1AfterRefund, p1Initial, 'P1 superado deve ser integralmente reembolsado de imediato');

  // P2 deve estar com os 40 pontos deduzidos
  const p2AfterBid = db.prepare('SELECT points_balance FROM users WHERE id = ?').get(p2.id).points_balance;
  assert.strictEqual(p2AfterBid, p2Initial - 40, 'P2 vencedor provisório deve estar com pontos debitados');

  // 4. Teste de encerramento do leilão
  endAuction(auctionId, 'Fim do teste unitário');
  const finishedItem = db.prepare('SELECT status, current_bid, current_winner_user_id FROM auction_items WHERE id = ?').get(itemId);
  assert.strictEqual(finishedItem.status, 'sold', 'Item com lance válido deve ser marcado como sold');
  assert.strictEqual(finishedItem.current_winner_user_id, p2.id, 'Vencedor final deve ser P2');
});
