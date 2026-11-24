const { db, withTransaction, logAudit, initDatabase } = require('./db');
const { hashPassword } = require('./auth');

function seedDatabase() {
  initDatabase();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    console.log('Banco de dados já contém registros. Seed ignorado.');
    return;
  }

  console.log('Populando banco de dados com dados de teste do Clube de Desbravadores...');

  withTransaction(() => {
    const now = new Date().toISOString();

    // 1. Criar Ciclo / Temporada
    const cycleResult = db.prepare(`
      INSERT INTO cycles (name, type, start_date, end_date, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run('Campori de Ouro - 2º Semestre', 'continuous', '2026-08-01T00:00:00.000Z', '2026-12-20T23:59:59.000Z', now);
    const cycleId = Number(cycleResult.lastInsertRowid);

    // 2. Criar Unidades (Equipes)
    const teamsData = [
      { name: 'Unidade Águia Imperial', color: '#1E40AF', icon: 'Shield', motto: 'Sempre altos e leais!', collective: 120 },
      { name: 'Unidade Falcão Dourado', color: '#D97706', icon: 'Award', motto: 'Velozes e pontuais!', collective: 95 },
      { name: 'Unidade Pantera Negra', color: '#111827', icon: 'Flame', motto: 'Coragem em qualquer missão!', collective: 140 },
      { name: 'Unidade Castor Guardião', color: '#047857', icon: 'Compass', motto: 'Trabalho unido e fidelidade!', collective: 80 }
    ];

    const teamIds = [];
    const teamInsert = db.prepare(`
      INSERT INTO teams (name, color, icon, motto, collective_balance, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const t of teamsData) {
      const res = teamInsert.run(t.name, t.color, t.icon, t.motto, t.collective, now);
      teamIds.push(Number(res.lastInsertRowid));
    }

    // 3. Criar Usuários
    // A. Superadministrador
    const adminPass = hashPassword('admin123');
    const adminRes = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, team_id, active, points_balance, avatar, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 1, 0, NULL, ?, ?)
    `).run('Pastor Lucas Silva (Super Admin)', 'admin@clube.org', adminPass, 'superadmin', now, now);
    const adminId = Number(adminRes.lastInsertRowid);

    // B. Diretores
    const directorPass = hashPassword('diretor123');
    const dir1Res = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, team_id, active, points_balance, avatar, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, NULL, ?, ?)
    `).run('Diretora Mariana Ramos', 'diretora@clube.org', directorPass, 'director', teamIds[0], now, now);
    const dir1Id = Number(dir1Res.lastInsertRowid);

    const dir2Res = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, team_id, active, points_balance, avatar, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, NULL, ?, ?)
    `).run('Instrutor Carlos Mendes', 'instrutor@clube.org', directorPass, 'director', teamIds[1], now, now);

    // C. Participantes (Desbravadores)
    const partPass = hashPassword('123456');
    const participants = [
      { name: 'Gabriel Santos', email: 'gabriel@clube.org', team_id: teamIds[0], points: 480, avatar: null },
      { name: 'Sofia Oliveira', email: 'sofia@clube.org', team_id: teamIds[0], points: 520, avatar: null },
      { name: 'Pedro Henrique', email: 'pedro@clube.org', team_id: teamIds[1], points: 390, avatar: null },
      { name: 'Beatriz Lima', email: 'beatriz@clube.org', team_id: teamIds[1], points: 410, avatar: null },
      { name: 'Lucas Ferreira', email: 'lucas@clube.org', team_id: teamIds[2], points: 610, avatar: null },
      { name: 'Laura Alcantara', email: 'laura@clube.org', team_id: teamIds[2], points: 590, avatar: null },
      { name: 'Matheus Costa', email: 'matheus@clube.org', team_id: teamIds[3], points: 320, avatar: null },
      { name: 'Isabela Ribeiro', email: 'isabela@clube.org', team_id: teamIds[3], points: 350, avatar: null }
    ];

    const userInsert = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, team_id, active, points_balance, avatar, created_at, updated_at)
      VALUES (?, ?, ?, 'participant', ?, 1, ?, ?, ?, ?)
    `);

    const userIds = [];
    for (const p of participants) {
      const res = userInsert.run(p.name, p.email, partPass, p.team_id, p.points, p.avatar, now, now);
      userIds.push(Number(res.lastInsertRowid));
    }

    // 4. Inserir Histórico de Pontuações de Exemplo
    const txInsert = db.prepare(`
      INSERT INTO point_transactions (user_id, team_id, amount, balance_after, type, reason, actor_id, cycle_id, batch_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleReasons = [
      { reason: 'Uniforme de Gala Completo e Impecável', amount: 50, type: 'bonus' },
      { reason: 'Presença e Pontualidade na Abertura de Domingo', amount: 30, type: 'bonus' },
      { reason: 'Estudo Diário do Ano Bíblico e Lição', amount: 40, type: 'bonus' },
      { reason: 'Conclusão da Especialidade de Nós e Amarras', amount: 100, type: 'bonus' },
      { reason: 'Participação Destacada no Projeto Comunitário', amount: 80, type: 'bonus' }
    ];

    for (let i = 0; i < userIds.length; i++) {
      const uid = userIds[i];
      const tid = participants[i].team_id;
      let running = 0;
      for (const sr of sampleReasons) {
        running += sr.amount;
        txInsert.run(uid, tid, sr.amount, running, sr.type, sr.reason, dir1Id, cycleId, 'batch-seed-01', now);
      }
    }

    // 5. Criar Leilão Ativo e Leilão Agendado
    const auctionInsert = db.prepare(`
      INSERT INTO auctions (title, description, round_number, mode, status, start_time, end_time, duration_minutes, cycle_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Leilão 1: ATIVO AGORA (termina em 20 minutos para demonstração ao vivo)
    const activeStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const activeEnd = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const a1Res = auctionInsert.run(
      'Grande Leilão de Equipamentos de Campori',
      'Itens oficiais de acampamento, aventura e sobrevivência para o Clube!',
      1,
      'both',
      'active',
      activeStart,
      activeEnd,
      25,
      cycleId,
      adminId,
      now
    );
    const auction1Id = Number(a1Res.lastInsertRowid);

    // Itens do Leilão 1
    const itemsData = [
      {
        title: 'Barraca Camping Coleman 4 Pessoas com Sobreteto',
        description: 'Barraca impermeável com coluna d’água 2000mm, perfeita para chuva e acampamentos de instrução.',
        image_url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop&q=80',
        starting: 100,
        current: 220,
        winner_user: userIds[4], // Lucas Ferreira
        status: 'open',
        order: 1
      },
      {
        title: 'Cantil Militar Tático Alumínio 1L com Caneca',
        description: 'Cantil clássico verde oliva com porta-cantil de lona e presilha ALICE para cinto de campanha.',
        image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80',
        starting: 30,
        current: 75,
        winner_user: userIds[0], // Gabriel Santos
        status: 'open',
        order: 2
      },
      {
        title: 'Canivete Suíço Victorinox Huntsman 15 Funções',
        description: 'Com serra para madeira, lâminas afiadas, tesoura, abridor e saca-rolhas. Aço inoxidável suíço original.',
        image_url: 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=600&auto=format&fit=crop&q=80',
        starting: 50,
        current: 130,
        winner_user: userIds[1], // Sofia Oliveira
        status: 'open',
        order: 3
      },
      {
        title: 'Mochila de Trilha Guepardo 45 Litros com Capa de Chuva',
        description: 'Costado respirável e ergonômico, suporte para bastão de caminhada e apito de emergência integrado.',
        image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop&q=80',
        starting: 80,
        current: 80,
        winner_user: null,
        status: 'open',
        order: 4
      },
      {
        title: 'Manual Oficial de Especialidades dos Desbravadores - Capa Dura',
        description: 'Edição de colecionador ilustrada com todos os requisitos de mais de 500 especialidades atualizadas.',
        image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
        starting: 40,
        current: 40,
        winner_user: null,
        status: 'open',
        order: 5
      }
    ];

    const itemInsert = db.prepare(`
      INSERT INTO auction_items (auction_id, title, description, image_url, starting_bid, bid_step, current_bid, current_winner_user_id, status, order_num)
      VALUES (?, ?, ?, ?, ?, 10, ?, ?, ?, ?)
    `);

    const itemIds = [];
    for (const it of itemsData) {
      const res = itemInsert.run(auction1Id, it.title, it.description, it.image_url, it.starting, it.current, it.winner_user, it.status, it.order);
      itemIds.push(Number(res.lastInsertRowid));
    }

    // Lances iniciais de teste
    const bidInsert = db.prepare(`
      INSERT INTO auction_bids (auction_id, item_id, user_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Item 1: Barraca
    bidInsert.run(auction1Id, itemIds[0], userIds[2], 120, 'outbid', new Date(Date.now() - 4 * 60 * 1000).toISOString());
    bidInsert.run(auction1Id, itemIds[0], userIds[3], 150, 'outbid', new Date(Date.now() - 3 * 60 * 1000).toISOString());
    bidInsert.run(auction1Id, itemIds[0], userIds[4], 220, 'active', new Date(Date.now() - 1 * 60 * 1000).toISOString());

    // Item 2: Cantil
    bidInsert.run(auction1Id, itemIds[1], userIds[0], 75, 'active', new Date(Date.now() - 2 * 60 * 1000).toISOString());

    // Item 3: Canivete
    bidInsert.run(auction1Id, itemIds[2], userIds[5], 90, 'outbid', new Date(Date.now() - 3 * 60 * 1000).toISOString());
    bidInsert.run(auction1Id, itemIds[2], userIds[1], 130, 'active', new Date(Date.now() - 1 * 60 * 1000).toISOString());

    // Leilão 2: AGENDADO para o próximo sábado
    const nextSat = new Date();
    nextSat.setDate(nextSat.getDate() + ((6 - nextSat.getDay() + 7) % 7 || 7));
    nextSat.setHours(19, 30, 0, 0);
    const endSat = new Date(nextSat.getTime() + 45 * 60 * 1000);

    auctionInsert.run(
      'Rodada Semanal de Sábado - Especial Pioneiria',
      'Leilão de encerramento das atividades da semana. Acumule pontos e prepare seus lances!',
      2,
      'both',
      'scheduled',
      nextSat.toISOString(),
      endSat.toISOString(),
      45,
      cycleId,
      adminId,
      now
    );

    // Registrar no Log de Auditoria
    logAudit(adminId, 'SEED_DATABASE', 'SYSTEM', 0, 'Seed inicial carregado com sucesso.');
  });

  console.log('Seed do Clube de Desbravadores concluído com sucesso!');
}

module.exports = { seedDatabase };
