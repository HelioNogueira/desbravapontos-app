const express = require('express');
const router = express.Router();
const { db, withTransaction, logAudit } = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { placeBid, setAuctionStatus } = require('../auctionEngine');

router.get('/', authMiddleware, async (req, res) => {
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

  const auctions = await db.all(query, ...params);

  const nowMs = Date.now();
  const formatted = auctions.map(auc => {
    let remainingSeconds = null;
    if (auc.status === 'active') {
      const endMs = new Date(auc.end_time).getTime();
      remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));
    }
    return {
      ...auc,
      items_count: Number(auc.items_count || 0),
      total_bids: Number(auc.total_bids || 0),
      remaining_seconds: remainingSeconds
    };
  });

  return res.json({ auctions: formatted });
});

router.get('/:id', authMiddleware, async (req, res) => {
  const auctionId = req.params.id;

  const auction = await db.get(`
    SELECT a.*, u.name as creator_name
    FROM auctions a
    LEFT JOIN users u ON a.created_by = u.id
    WHERE a.id = ? AND a.club_id = ?
  `, auctionId, req.clubId);

  if (!auction) {
    return res.status(404).json({ error: 'Leilão não encontrado.' });
  }

  const items = await db.all(`
    SELECT i.*,
           w.name as winner_name, w.avatar as winner_avatar,
           t.name as winner_team_name, t.color as winner_team_color,
           (SELECT COUNT(*) FROM auction_bids WHERE item_id = i.id) as bids_count
    FROM auction_items i
    LEFT JOIN users w ON i.current_winner_user_id = w.id
    LEFT JOIN teams t ON i.current_winner_team_id = t.id
    WHERE i.auction_id = ?
    ORDER BY i.order_num ASC, i.id ASC
  `, auctionId);

  const recentBids = await db.all(`
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
  `, auctionId);

  const endMs = new Date(auction.end_time).getTime();
  const remainingSeconds = auction.status === 'active'
    ? Math.max(0, Math.floor((endMs - Date.now()) / 1000))
    : 0;

  return res.json({
    auction: {
      ...auction,
      remaining_seconds: remainingSeconds,
      items: items.map(it => ({ ...it, bids_count: Number(it.bids_count || 0) })),
      recent_bids: recentBids
    }
  });
});

router.post('/', authMiddleware, requireRole(['superadmin', 'director']), async (req, res) => {
  const {
    title,
    description,
    round_number = 1,
    mode = 'both',
    start_time,
    duration_minutes = 30,
    items = []
  } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: 'Título do leilão é obrigatório.' });
  if (!start_time) return res.status(400).json({ error: 'Data e horário de início são obrigatórios.' });

  const durationMin = parseInt(duration_minutes, 10) || 30;
  const startDt = new Date(start_time);
  if (isNaN(startDt.getTime())) return res.status(400).json({ error: 'Data de início inválida.' });

  const endDt = new Date(startDt.getTime() + durationMin * 60 * 1000);
  const now = new Date();
  const status = startDt <= now && now < endDt ? 'active' : (startDt > now ? 'scheduled' : 'ended');
  const nowIso = now.toISOString();

  const activeCycle = await db.get('SELECT id FROM cycles WHERE is_active = 1 AND club_id = ?', req.clubId);
  const cycleId = activeCycle ? activeCycle.id : null;

  try {
    const newAuctionId = await withTransaction(async () => {
      const result = await db.run(`
        INSERT INTO auctions (club_id, title, description, round_number, mode, status, start_time, end_time, duration_minutes, cycle_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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

      if (Array.isArray(items) && items.length > 0) {
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          const starting = parseInt(it.starting_bid, 10) || 10;
          const step = parseInt(it.bid_step, 10) || 5;
          await db.run(`
            INSERT INTO auction_items (auction_id, title, description, image_url, starting_bid, bid_step, current_bid, status, order_num)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
          `,
            aId,
            it.title.trim(),
            it.description ? it.description.trim() : '',
            it.image_url || null,
            starting,
            step,
            starting,
            idx + 1
          );
        }
      }

      await logAudit(req.user.id, 'CREATE_AUCTION', 'auctions', aId, { title, mode, durationMin }, req.clubId);
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

router.post('/:id/bid', authMiddleware, async (req, res) => {
  const auctionId = req.params.id;
  const { item_id, amount, is_team_bid = false } = req.body;
  const user = req.user;

  const auction = await db.get('SELECT id FROM auctions WHERE id = ? AND club_id = ?', auctionId, req.clubId);
  if (!auction) {
    return res.status(404).json({ error: 'Leilão não encontrado neste clube.' });
  }

  try {
    const result = await placeBid({
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

router.post('/:id/status', authMiddleware, requireRole(['superadmin', 'director']), async (req, res) => {
  const auctionId = req.params.id;
  const { status, reason = '' } = req.body;

  const auction = await db.get('SELECT id FROM auctions WHERE id = ? AND club_id = ?', auctionId, req.clubId);
  if (!auction) return res.status(404).json({ error: 'Leilão não encontrado.' });

  try {
    await setAuctionStatus(Number(auctionId), status, reason, req.user.id);
    return res.json({
      success: true,
      message: `Status do leilão alterado para "${status}" com sucesso.`
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/:id/items', authMiddleware, requireRole(['superadmin', 'director']), async (req, res) => {
  const auctionId = req.params.id;
  const { title, description, image_url, starting_bid = 10, bid_step = 5 } = req.body;

  const auction = await db.get('SELECT id FROM auctions WHERE id = ? AND club_id = ?', auctionId, req.clubId);
  if (!auction) return res.status(404).json({ error: 'Leilão não encontrado.' });

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Título do item é obrigatório.' });
  }

  const starting = parseInt(starting_bid, 10) || 10;
  const step = parseInt(bid_step, 10) || 5;

  const countRow = await db.get('SELECT COUNT(*) as count FROM auction_items WHERE auction_id = ?', auctionId);
  const count = Number(countRow.count || 0);

  const result = await db.run(`
    INSERT INTO auction_items (auction_id, title, description, image_url, starting_bid, bid_step, current_bid, status, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `, auctionId, title.trim(), description || '', image_url || null, starting, step, starting, count + 1);

  const itemId = Number(result.lastInsertRowid);
  await logAudit(req.user.id, 'ADD_AUCTION_ITEM', 'auction_items', itemId, { auctionId, title, starting }, req.clubId);

  return res.status(201).json({
    success: true,
    message: 'Item adicionado ao leilão.',
    item_id: itemId
  });
});

router.delete('/:id', authMiddleware, requireRole(['superadmin', 'director']), async (req, res) => {
  const auctionId = req.params.id;

  const auction = await db.get('SELECT id FROM auctions WHERE id = ? AND club_id = ?', auctionId, req.clubId);
  if (!auction) return res.status(404).json({ error: 'Leilão não encontrado.' });

  await withTransaction(async () => {
    await db.run('DELETE FROM auction_bids WHERE auction_id = ?', auctionId);
    await db.run('DELETE FROM auction_items WHERE auction_id = ?', auctionId);
    await db.run('DELETE FROM auctions WHERE id = ? AND club_id = ?', auctionId, req.clubId);
    await logAudit(req.user.id, 'DELETE_AUCTION', 'auctions', auctionId, 'Leilão excluído.', req.clubId);
  });

  return res.json({ message: 'Leilão excluído com sucesso.' });
});

module.exports = router;
