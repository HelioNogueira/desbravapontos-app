const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db');
const { authMiddleware } = require('../auth');

// GET /api/stats/dashboard
// KPIs e dados consolidados para o Painel Principal (Item 7 da especificação)
router.get('/dashboard', authMiddleware, (req, res) => {
  const activeCycle = db.prepare('SELECT * FROM cycles WHERE is_active = 1').get();
  const scoreMode = getSetting('team_score_mode', 'sum');

  // 1. Total de participantes ativos
  const totalParticipants = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'participant' AND active = 1").get().count;

  // 2. Número de equipes
  const totalTeams = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;

  // 3. Total de pontos em circulação (saldo de todos os participantes ativos + coletivo se ativo)
  const indPoints = db.prepare("SELECT COALESCE(SUM(points_balance), 0) as total FROM users WHERE role = 'participant' AND active = 1").get().total;
  const colPoints = db.prepare('SELECT COALESCE(SUM(collective_balance), 0) as total FROM teams').get().total;
  const totalPointsInCirculation = scoreMode === 'collective' ? (indPoints + colPoints) : indPoints;

  // 4. Rodada atualmente ativa
  const activeAuction = db.prepare(`
    SELECT a.*,
           (SELECT COUNT(*) FROM auction_items WHERE auction_id = a.id) as items_count,
           (SELECT COUNT(*) FROM auction_bids WHERE auction_id = a.id) as total_bids
    FROM auctions a
    WHERE a.status = 'active'
    ORDER BY a.start_time ASC
    LIMIT 1
  `).get();

  let activeAuctionFormatted = null;
  if (activeAuction) {
    const endMs = new Date(activeAuction.end_time).getTime();
    const nowMs = Date.now();
    activeAuctionFormatted = {
      ...activeAuction,
      remaining_seconds: Math.max(0, Math.floor((endMs - nowMs) / 1000))
    };
  }

  // 5. Próximo leilão programado
  const nextScheduledAuction = db.prepare(`
    SELECT a.*,
           (SELECT COUNT(*) FROM auction_items WHERE auction_id = a.id) as items_count
    FROM auctions a
    WHERE a.status = 'scheduled'
    ORDER BY a.start_time ASC
    LIMIT 1
  `).get();

  // 6. Ranking das Equipes
  const teamsRank = db.prepare(`
    SELECT t.id, t.name, t.color, t.icon, t.motto, t.collective_balance,
           COUNT(u.id) as members_count,
           COALESCE(SUM(CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END), 0) as total_points,
           COALESCE(SUM(u.points_balance), 0) as total_wallet_balance
    FROM teams t
    LEFT JOIN users u ON u.team_id = t.id AND u.active = 1 AND u.role = 'participant'
    GROUP BY t.id
    ORDER BY total_points DESC, total_wallet_balance DESC, t.name ASC
  `).all();

  const formattedTeams = teamsRank.map((t, i) => ({
    ...t,
    rank: i + 1,
    effective_points: scoreMode === 'collective' ? t.collective_balance : t.total_points,
    wallet_points: t.total_wallet_balance
  }));

  if (scoreMode === 'collective') {
    formattedTeams.sort((a, b) => b.effective_points - a.effective_points);
    formattedTeams.forEach((t, i) => { t.rank = i + 1; });
  }

  // 7. Ranking dos Participantes (Top 10)
  const topParticipants = db.prepare(`
    SELECT u.id, u.name, u.email, u.points_balance,
           CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END as total_points,
           u.avatar,
           t.name as team_name, t.color as team_color
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.role = 'participant' AND u.active = 1
    ORDER BY CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END DESC, u.points_balance DESC, u.name ASC
    LIMIT 10
  `).all().map((p, i) => ({ ...p, rank: i + 1 }));

  // 8. Últimas movimentações de pontos
  const recentTransactions = db.prepare(`
    SELECT pt.*,
           u.name as user_name,
           t.name as team_name, t.color as team_color,
           a.name as actor_name
    FROM point_transactions pt
    LEFT JOIN users u ON pt.user_id = u.id
    LEFT JOIN teams t ON pt.team_id = t.id
    LEFT JOIN users a ON pt.actor_id = a.id
    ORDER BY pt.id DESC
    LIMIT 8
  `).all();

  return res.json({
    kpis: {
      total_participants: totalParticipants,
      total_teams: totalTeams,
      total_points_in_circulation: totalPointsInCirculation,
      score_mode: scoreMode
    },
    active_auction: activeAuctionFormatted,
    next_scheduled_auction: nextScheduledAuction || null,
    teams_ranking: formattedTeams,
    participants_ranking: topParticipants,
    recent_transactions: recentTransactions,
    active_cycle: activeCycle || null
  });
});

// GET /api/stats/rankings
// Rankings completos com paginação e busca
router.get('/rankings', authMiddleware, (req, res) => {
  const { team_id } = req.query;

  let query = `
    SELECT u.id, u.name, u.email, u.points_balance,
           CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END as total_points,
           u.avatar,
           t.id as team_id, t.name as team_name, t.color as team_color
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.role = 'participant' AND u.active = 1
  `;
  const params = [];

  if (team_id) {
    query += ' AND u.team_id = ?';
    params.push(team_id);
  }

  query += ' ORDER BY CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END DESC, u.points_balance DESC, u.name ASC';

  const participants = db.prepare(query).all(...params).map((p, i) => ({
    ...p,
    rank: i + 1
  }));

  return res.json({ participants });
});

module.exports = router;
