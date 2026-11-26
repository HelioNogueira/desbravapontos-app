const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db');
const { authMiddleware } = require('../auth');

router.get('/dashboard', authMiddleware, async (req, res) => {
  const clubId = req.clubId;
  const activeCycle = await db.get('SELECT * FROM cycles WHERE is_active = 1 AND club_id = ?', clubId);
  const scoreMode = await getSetting('team_score_mode', 'sum', clubId);

  const totalParticipantsRow = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'participant' AND active = 1 AND club_id = ?", clubId);
  const totalTeamsRow = await db.get('SELECT COUNT(*) as count FROM teams WHERE club_id = ?', clubId);
  const indPointsRow = await db.get("SELECT COALESCE(SUM(points_balance), 0) as total FROM users WHERE role = 'participant' AND active = 1 AND club_id = ?", clubId);
  const colPointsRow = await db.get('SELECT COALESCE(SUM(collective_balance), 0) as total FROM teams WHERE club_id = ?', clubId);

  const indPoints = Number(indPointsRow.total || 0);
  const colPoints = Number(colPointsRow.total || 0);
  const totalPointsInCirculation = scoreMode === 'collective' ? (indPoints + colPoints) : indPoints;

  const activeAuction = await db.get(`
    SELECT a.*,
           (SELECT COUNT(*) FROM auction_items WHERE auction_id = a.id) as items_count,
           (SELECT COUNT(*) FROM auction_bids WHERE auction_id = a.id) as total_bids
    FROM auctions a
    WHERE a.status = 'active' AND a.club_id = ?
    ORDER BY a.start_time ASC
    LIMIT 1
  `, clubId);

  let activeAuctionFormatted = null;
  if (activeAuction) {
    const endMs = new Date(activeAuction.end_time).getTime();
    activeAuctionFormatted = {
      ...activeAuction,
      remaining_seconds: Math.max(0, Math.floor((endMs - Date.now()) / 1000))
    };
  }

  const nextScheduledAuction = await db.get(`
    SELECT a.*,
           (SELECT COUNT(*) FROM auction_items WHERE auction_id = a.id) as items_count
    FROM auctions a
    WHERE a.status = 'scheduled' AND a.club_id = ?
    ORDER BY a.start_time ASC
    LIMIT 1
  `, clubId);

  const teamsRank = await db.all(`
    SELECT t.id, t.name, t.color, t.icon, t.motto, t.collective_balance,
           COUNT(u.id) as members_count,
           COALESCE(SUM(CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END), 0) as total_points,
           COALESCE(SUM(u.points_balance), 0) as total_wallet_balance
    FROM teams t
    LEFT JOIN users u ON u.team_id = t.id AND u.active = 1 AND u.role = 'participant' AND u.club_id = t.club_id
    WHERE t.club_id = ?
    GROUP BY t.id
    ORDER BY total_points DESC, total_wallet_balance DESC, t.name ASC
  `, clubId);

  const formattedTeams = teamsRank.map((t, i) => {
    const totalPts = Number(t.total_points || 0);
    const walletPts = Number(t.total_wallet_balance || 0);
    return {
      ...t,
      members_count: Number(t.members_count || 0),
      total_points: totalPts,
      total_wallet_balance: walletPts,
      rank: i + 1,
      effective_points: scoreMode === 'collective' ? Number(t.collective_balance || 0) : totalPts,
      wallet_points: walletPts
    };
  });

  if (scoreMode === 'collective') {
    formattedTeams.sort((a, b) => b.effective_points - a.effective_points);
    formattedTeams.forEach((t, i) => { t.rank = i + 1; });
  }

  const topParticipants = (await db.all(`
    SELECT u.id, u.name, u.email, u.points_balance,
           CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END as total_points,
           u.avatar,
           t.name as team_name, t.color as team_color
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.role = 'participant' AND u.active = 1 AND u.club_id = ?
    ORDER BY CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END DESC, u.points_balance DESC, u.name ASC
    LIMIT 10
  `, clubId)).map((p, i) => ({ ...p, rank: i + 1 }));

  const recentTransactions = await db.all(`
    SELECT pt.*,
           u.name as user_name,
           t.name as team_name, t.color as team_color,
           a.name as actor_name
    FROM point_transactions pt
    LEFT JOIN users u ON pt.user_id = u.id
    LEFT JOIN teams t ON pt.team_id = t.id
    LEFT JOIN users a ON pt.actor_id = a.id
    WHERE pt.club_id = ?
    ORDER BY pt.id DESC
    LIMIT 8
  `, clubId);

  return res.json({
    kpis: {
      total_participants: Number(totalParticipantsRow.count || 0),
      total_teams: Number(totalTeamsRow.count || 0),
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

router.get('/rankings', authMiddleware, async (req, res) => {
  const { team_id } = req.query;

  let query = `
    SELECT u.id, u.name, u.email, u.points_balance,
           CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END as total_points,
           u.avatar,
           t.id as team_id, t.name as team_name, t.color as team_color
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.role = 'participant' AND u.active = 1 AND u.club_id = ?
  `;
  const params = [req.clubId];

  if (team_id) {
    query += ' AND u.team_id = ?';
    params.push(team_id);
  }

  query += ' ORDER BY CASE WHEN u.total_points > 0 THEN u.total_points ELSE u.points_balance END DESC, u.points_balance DESC, u.name ASC';

  const participants = (await db.all(query, ...params)).map((p, i) => ({
    ...p,
    rank: i + 1
  }));

  return res.json({ participants });
});

module.exports = router;
