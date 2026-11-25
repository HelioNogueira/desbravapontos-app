const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit } = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { placeBid, setAuctionStatus, endAuction } = require('../auctionEngine');

// Listar todos os leilões
router.get('/', authMiddleware, (req, res) => {
  const { status } = req.query;

  let query = `
    SELECT a.*,
           u.name as creator_name,
           (SELECT COUNT(*) FROM auction_items WHERE auction_id = a.id) as items_count,
           (SELECT COUNT(*) FROM auction_bids WHERE auction_id = a.id) as total_bids
    FROM auctions a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.club_id = ?
  `;
  const params = [req.clubId];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }

  query += ` ORDER BY
    CASE a.status
      WHEN 'active' THEN 1
      WHEN 'scheduled' THEN 2
      WHEN 'paused' THEN 3
      ELSE 4
    END, a.start_time ASC`;

  const auctions = db.prepare(query).all(...params);

  // Calcular segundos restantes para leilões ativos
  const nowMs = Date.now();
  const formatted = auctions.map(auc => {
    let remainingSeconds = null;
    if (auc.status === 'active') {
      const endMs = new Date(auc.end_time).getTime();
      remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));
    }
    return {
      ...auc,
      remaining_seconds: remainingSeconds
    };
  });

  return res.json({ auctions: formatted });
});

// Detalhes completos de um leilão
router.get('/:id', authMiddleware, (req, res) => {
  const auctionId = req.params.id;

  const auction = db.prepare(`
    SELECT a.*, u.name as creator_name
    FROM auctions a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.id = ? AND a.club_id = ?
  `).get(auctionId, req.clubId);

  if (!auction) {
    return res.status(404).json({ error: 'Leilão não encontrado.' });
  }

  // Itens do leilão
  const items = db.prepare(`
    SELECT i.*,
           w.name as winner_name, w.avatar as winner_avatar,
           t.name as winner_team_name, t.color as winner_team_color,
           (SELECT COUNT(*) FROM auction_bids WHERE item_id = i.id) as bids_count
    FROM auction_items i
    LEFT JOIN users w ON i.current_winner_user_id = w.id
    LEFT JOIN teams t ON i.current_winner_team_id = t.id
    WHERE i.auction_id = ?
    ORDER BY i.order_num ASC, i.id ASC
  `).all(auctionId);

  // Últimos 30 lances do leilão
  const recentBids = db.prepare(`
    SELECT b.*,
           u.name as user_name, u.avatar as user_avatar,
           t.name as team_name, t.color as team_color,
           i.title as item_title
    FROM auction_bids b
    LEFT JOIN users u ON b.user_id = u.id
    LEFT JOIN teams t ON b.team_id = t.id
    LEFT JOIN auction_items i ON b.item_id = i.id
    WHERE b.auction_id = ?
    ORDER BY b.id DESC
    LIMIT 30
  `).all(auctionId);

  const endMs = new Date(auction.end_time).getTime();
  const nowMs = Date.now();
  const remainingSeconds = auction.status === 'active'
    ? Math.max(0, Math.floor((endMs - nowMs) / 1000))
    : 0;

  return res.json({
    auction: {
      ...auction,
      remaining_seconds: remainingSeconds,
      items,
      recent_bids: recentBids
    }
  });
});

// Criar leilão (Superadmin ou Diretoria)
router.post('/', authMiddleware, requireRole(['superadmin', 'director']), (req, res) => {
  const {
    title,
    description,
    round_number = 1,
    mode = 'both',
    start_time,
    duration_minutes = 30,
    items = []
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Título do leilão é obrigatório.' });
  }
  if (!start_time) {
    return res.status(400).json({ error: 'Data e horário de início são obrigatórios.' });
  }

  const durationMin = parseInt(duration_minutes, 10) || 30;
  const startDt = new Date(start_time);
  if (isNaN(startDt.getTime())) {
    return res.status(400).json({ error: 'Data de início inválida.' });
  }

  const endDt = new Date(startDt.getTime() + durationMin * 60 * 1000);
  const now = new Date();
  const status = startDt <= now && now < endDt ? 'active' : (startDt > now ? 'scheduled' : 'ended');
  const nowIso = now.toISOString();

  // Ciclo ativo
  const activeCycle = db.prepare('SELECT id FROM cycles WHERE is_active = 1 AND club_id = ?').get(req.clubId);
  const cycleId = activeCycle ? activeCycle.id : null;

  try {
    const newAuctionId = withTransaction(() => {
      const result = db.prepare(`
        INSERT INTO auctions (club_id, title, description, round_number, mode, status, start_time, end_time, duration_minutes, cycle_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.clubId,
        title.trim(),
        description ? description.trim() : '',
        parseInt(round_number, 10) || 1,
        mode,
        status,
        startDt.toISOString(),
        endDt.toISOString(),
        durationMin,
        cycleId,
        req.user.id,
        nowIso
      );

      const aId = Number(result.lastInsertRowid);

      // Inserir itens se fornecidos
      if (Array.isArray(items) && items.length > 0) {
        const itemStmt = db.prepare(`
          INSERT INTO auction_items (auction_id, title, description, image_url, starting_bid, bid_step, current_bid, status, order_num)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
        `);

        items.forEach((it, idx) => {
          const starting = parseInt(it.starting_bid, 10) || 10;
          const step = parseInt(it.bid_step, 10) || 5;
          itemStmt.run(
            aId,
            it.title.trim(),
            it.description ? it.description.trim() : '',
            it.image_url || null,
            starting,
            step,
            starting,
            idx + 1
          );
        });
      }

      logAudit(req.user.id, 'CREATE_AUCTION', 'auctions', aId, { title, mode, durationMin });
      return aId;
    });

    return res.status(201).json({
      success: true,
      auction_id: newAuctionId,
      message: 'Leilão criado com sucesso!'
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Dar lance no leilão (Participante, Diretor ou Superadmin)
router.post('/:id/bid', authMiddleware, (req, res) => {
  const auctionId = req.params.id;
  const { item_id, amount, is_team_bid = false } = req.body;
  const user = req.user;

  const auction = db.prepare('SELECT id FROM auctions WHERE id = ? AND club_id = ?').get(auctionId, req.clubId);
  if (!auction) {
    return res.status(404).json({ error: 'Leilão não encontrado neste clube.' });
  }

  try {
    const result = placeBid({
      auctionId: Number(auctionId),
      itemId: Number(item_id),
      userId: user.id,
      isTeamBid: Boolean(is_team_bid),
      amount: parseInt(amount, 10)
    });

    return res.json({
      success: true,
      message: `Lance de ${result.amount} pontos confirmado com sucesso!`,
      bid: result
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Alterar status do leilão: Pausar, Retomar, Cancelar, Encerrar (Superadmin ou Diretoria)
router.post('/:id/status', authMiddleware, requireRole(['superadmin', 'director']), (req, res) => {
  const auctionId = req.params.id;
  const { status, reason = '' } = req.body;

  const auction = db.prepare('SELECT id FROM auctions WHERE id = ? AND club_id = ?').get(auctionId, req.clubId);
  if (!auction) {
    return res.status(404).json({ error: 'Leilão não encontrado.' });
  }

  try {
    setAuctionStatus(Number(auctionId), status, reason, req.user.id);
    return res.json({
      success: true,
      message: `Status do leilão alterado para "${status}" com sucesso.`
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Adicionar item a um leilão (Superadmin ou Diretoria)
router.post('/:id/items', authMiddleware, requireRole(['superadmin', 'director']), (req, res) => {
  const auctionId = req.params.id;
  const { title, description, image_url, starting_bid = 10, bid_step = 5 } = req.body;

  const auction = db.prepare('SELECT id FROM auctions WHERE id = ? AND club_id = ?').get(auctionId, req.clubId);
  if (!auction) {
    return res.status(404).json({ error: 'Leilão não encontrado.' });
  }

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Título do item é obrigatório.' });
  }

  const starting = parseInt(starting_bid, 10) || 10;
  const step = parseInt(bid_step, 10) || 5;

  const count = db.prepare('SELECT COUNT(*) as count FROM auction_items WHERE auction_id = ?').get(auctionId).count;

  const result = db.prepare(`
    INSERT INTO auction_items (auction_id, title, description, image_url, starting_bid, bid_step, current_bid, status, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(auctionId, title.trim(), description || '', image_url || null, starting, step, starting, count + 1);

  const itemId = Number(result.lastInsertRowid);
  logAudit(req.user.id, 'ADD_AUCTION_ITEM', 'auction_items', itemId, { auctionId, title, starting });

  return res.status(201).json({
    success: true,
    message: 'Item adicionado ao leilão.',
    item_id: itemId
  });
});

// Excluir leilão (Superadmin ou Diretoria)
router.delete('/:id', authMiddleware, requireRole(['superadmin', 'director']), (req, res) => {
  const auctionId = req.params.id;

  const auction = db.prepare('SELECT id FROM auctions WHERE id = ? AND club_id = ?').get(auctionId, req.clubId);
  if (!auction) {
    return res.status(404).json({ error: 'Leilão não encontrado.' });
  }

  withTransaction(() => {
    db.prepare('DELETE FROM auction_bids WHERE auction_id = ?').run(auctionId);
    db.prepare('DELETE FROM auction_items WHERE auction_id = ?').run(auctionId);
    db.prepare('DELETE FROM auctions WHERE id = ? AND club_id = ?').run(auctionId, req.clubId);
    logAudit(req.user.id, 'DELETE_AUCTION', 'auctions', auctionId, 'Leilão excluído.', req.clubId);
  });

  return res.json({ message: 'Leilão excluído com sucesso.' });
});

module.exports = router;
