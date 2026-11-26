const { db, withTransaction, logAudit, getSetting } = require('./db');

let ioInstance = null;
let timerInterval = null;

function setSocketIO(io) {
  ioInstance = io;
}

function getSocketIO() {
  return ioInstance;
}

// Inicia o loop de monitoramento de leilões ativos (1 tick por segundo)
function startAuctionEngine(io) {
  setSocketIO(io);

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(() => {
    tickAuctions().catch((err) => {
      console.error('Erro no ciclo do motor de leilões:', err);
    });
  }, 1000);
}

async function tickAuctions() {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Iniciar leilões agendados que chegaram na hora
  const scheduledAuctions = await db.all(`
    SELECT * FROM auctions WHERE status = 'scheduled' AND start_time <= ?
  `, nowIso);

  for (const auc of scheduledAuctions) {
    await db.run(`UPDATE auctions SET status = 'active' WHERE id = ?`, auc.id);
    await logAudit(auc.created_by, 'AUCTION_STARTED_AUTO', 'auctions', auc.id, 'Leilão iniciado automaticamente por cronograma.', auc.club_id);
    if (ioInstance) {
      const target = auc.club_id ? ioInstance.to(`club_${auc.club_id}`) : ioInstance;
      target.emit('auction_started', { auctionId: auc.id, title: auc.title });
    }
  }

  // 2. Verificar leilões ativos
  const activeAuctions = await db.all(`
    SELECT * FROM auctions WHERE status = 'active'
  `);

  for (const auc of activeAuctions) {
    const endMs = new Date(auc.end_time).getTime();
    const nowMs = now.getTime();
    const remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));

    if (remainingSeconds <= 0) {
      await endAuction(auc.id, 'Tempo limite esgotado');
    } else if (ioInstance) {
      const target = auc.club_id ? ioInstance.to(`club_${auc.club_id}`) : ioInstance;
      target.emit('auction_tick', {
        auctionId: auc.id,
        remainingSeconds,
        endTime: auc.end_time
      });
    }
  }
}

// Encerramento seguro e atômico do leilão
async function endAuction(auctionId, reason = 'Encerramento') {
  const now = new Date().toISOString();
  let clubId = null;

  await withTransaction(async () => {
    const auction = await db.get('SELECT * FROM auctions WHERE id = ?', auctionId);
    if (!auction || auction.status === 'ended') return;
    clubId = auction.club_id;

    await db.run(`
      UPDATE auctions
      SET status = 'ended', actual_end_time = ?
      WHERE id = ?
    `, now, auctionId);

    const items = await db.all('SELECT * FROM auction_items WHERE auction_id = ?', auctionId);

    for (const item of items) {
      if (item.current_winner_user_id && item.current_bid > 0) {
        await db.run(`
          UPDATE auction_items
          SET status = 'sold', sold_at = ?
          WHERE id = ?
        `, now, item.id);

        await db.run(`
          UPDATE auction_bids
          SET status = 'won'
          WHERE item_id = ? AND status = 'active'
        `, item.id);

        const winner = await db.get('SELECT id, points_balance, team_id FROM users WHERE id = ?', item.current_winner_user_id);
        if (winner) {
          await db.run(`
            INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
            VALUES (?, ?, ?, ?, ?, 'auction_win', ?, ?, ?)
          `,
            auction.club_id,
            winner.id,
            winner.team_id,
            0,
            winner.points_balance,
            `Item arrematado no leilão: "${item.title}" por ${item.current_bid} pts`,
            auction.cycle_id,
            now
          );
        }
      } else {
        await db.run(`
          UPDATE auction_items
          SET status = 'unsold'
          WHERE id = ?
        `, item.id);
      }
    }

    await logAudit(auction.created_by || 1, 'AUCTION_ENDED', 'auctions', auctionId, reason, auction.club_id);
  });

  if (ioInstance) {
    const target = clubId ? ioInstance.to(`club_${clubId}`) : ioInstance;
    target.emit('auction_ended', {
      auctionId,
      reason,
      message: 'O leilão foi encerrado com sucesso!'
    });
    target.emit('ranking_updated', {
      auctionId,
      reason
    });
  }
}

// Dar um lance com validação atômica rigorosa e devolução imediata do lance anterior
async function placeBid({ auctionId, itemId, userId, isTeamBid = false, amount }) {
  const numAmount = parseInt(amount, 10);
  if (!numAmount || numAmount <= 0) {
    throw new Error('O valor do lance deve ser um número positivo.');
  }

  const now = new Date().toISOString();

  return await withTransaction(async () => {
    const auction = await db.get('SELECT * FROM auctions WHERE id = ?', auctionId);
    if (!auction) throw new Error('Leilão não encontrado.');
    if (auction.status !== 'active') throw new Error(`O leilão não está ativo no momento (status atual: ${auction.status}).`);

    const item = await db.get('SELECT * FROM auction_items WHERE id = ? AND auction_id = ?', itemId, auctionId);
    if (!item) throw new Error('Item do leilão não encontrado.');
    if (item.status !== 'open') throw new Error('Este item não está aberto para lances no momento.');

    const minRequired = item.current_bid > 0
      ? item.current_bid + (item.bid_step || 1)
      : item.starting_bid;

    if (numAmount < minRequired) {
      throw new Error(`O lance mínimo exigido para este item é de ${minRequired} pontos (lance atual: ${item.current_bid} pts).`);
    }

    const user = await db.get('SELECT id, name, team_id, active, points_balance FROM users WHERE id = ?', userId);
    if (!user) throw new Error('Participante não encontrado.');
    if (!user.active) throw new Error('Participante bloqueado ou inativo.');

    if (item.current_winner_user_id === user.id) {
      throw new Error('Você já possui o maior lance atual para este item!');
    }

    const requirePoints = (await getSetting('require_points_for_bids', 'true', auction.club_id)) !== 'false';

    let team = null;
    if (requirePoints) {
      if (isTeamBid) {
        if (!user.team_id) throw new Error('Você não está vinculado a nenhuma equipe para dar lance coletivo.');
        team = await db.get('SELECT id, name, collective_balance FROM teams WHERE id = ?', user.team_id);
        if (!team) throw new Error('Equipe não encontrada.');
        if (team.collective_balance < numAmount) {
          throw new Error(`A equipe "${team.name}" não possui saldo coletivo suficiente (Saldo disponível: ${team.collective_balance} pts).`);
        }
      } else if (user.points_balance < numAmount) {
        throw new Error(`Saldo insuficiente! Seu saldo é de ${user.points_balance} pontos, mas este lance exige ${numAmount} pontos.`);
      }
    }

    if (requirePoints && item.current_winner_user_id && item.current_bid > 0) {
      const prevUserId = item.current_winner_user_id;
      const prevBidAmount = item.current_bid;
      const prevTeamId = item.current_winner_team_id;

      const prevBid = await db.get(`
        SELECT id FROM auction_bids
        WHERE item_id = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
      `, item.id);

      if (prevBid) {
        await db.run(`UPDATE auction_bids SET status = 'outbid' WHERE id = ?`, prevBid.id);
      }

      const prevUser = await db.get('SELECT id, name, points_balance FROM users WHERE id = ?', prevUserId);
      if (prevUser) {
        const newPrevBalance = prevUser.points_balance + prevBidAmount;
        await db.run('UPDATE users SET points_balance = ? WHERE id = ?', newPrevBalance, prevUserId);

        await db.run(`
          INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
          VALUES (?, ?, ?, ?, ?, 'auction_refund', ?, ?, ?)
        `,
          auction.club_id,
          prevUserId,
          prevTeamId,
          prevBidAmount,
          newPrevBalance,
          `Devolução de pontos: lance superado no item "${item.title}"`,
          auction.cycle_id,
          now
        );

        if (ioInstance) {
          const target = auction.club_id ? ioInstance.to(`club_${auction.club_id}`) : ioInstance;
          target.emit(`user_outbid_${prevUserId}`, {
            itemId: item.id,
            itemTitle: item.title,
            refundedAmount: prevBidAmount,
            newBalance: newPrevBalance,
            newBidAmount: numAmount
          });
        }
      }
    } else if (!requirePoints && item.current_winner_user_id) {
      const prevBid = await db.get(`
        SELECT id FROM auction_bids
        WHERE item_id = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
      `, item.id);

      if (prevBid) {
        await db.run(`UPDATE auction_bids SET status = 'outbid' WHERE id = ?`, prevBid.id);
      }
    }

    let finalUserBalance = user.points_balance;
    if (requirePoints) {
      if (isTeamBid && team) {
        const newCollective = team.collective_balance - numAmount;
        await db.run('UPDATE teams SET collective_balance = ? WHERE id = ?', newCollective, team.id);
      } else {
        finalUserBalance = user.points_balance - numAmount;
        await db.run('UPDATE users SET points_balance = ? WHERE id = ?', finalUserBalance, user.id);

        await db.run(`
          INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
          VALUES (?, ?, ?, ?, ?, 'auction_bid', ?, ?, ?)
        `,
          auction.club_id,
          user.id,
          user.team_id,
          -numAmount,
          finalUserBalance,
          `Lance dado no item "${item.title}"`,
          auction.cycle_id,
          now
        );
      }
    }

    const bidResult = await db.run(`
      INSERT INTO auction_bids (auction_id, item_id, user_id, team_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `, auctionId, itemId, user.id, isTeamBid ? user.team_id : null, numAmount, now);

    const bidId = Number(bidResult.lastInsertRowid);

    await db.run(`
      UPDATE auction_items
      SET current_bid = ?, current_winner_user_id = ?, current_winner_team_id = ?
      WHERE id = ?
    `, numAmount, user.id, isTeamBid ? user.team_id : null, itemId);

    const antiSniperSec = parseInt(await getSetting('anti_sniper_seconds', '15', auction.club_id), 10);
    const extensionSec = parseInt(await getSetting('anti_sniper_extension', '30', auction.club_id), 10);

    const endMs = new Date(auction.end_time).getTime();
    const nowMs = Date.now();
    const remainingSec = Math.floor((endMs - nowMs) / 1000);

    let extended = false;
    let newEndTime = auction.end_time;

    if (remainingSec <= antiSniperSec) {
      newEndTime = new Date(nowMs + (extensionSec * 1000)).toISOString();
      await db.run(`UPDATE auctions SET end_time = ? WHERE id = ?`, newEndTime, auctionId);
      extended = true;
    }

    await logAudit(user.id, 'BID_PLACED', 'auction_items', itemId, {
      amount: numAmount,
      auctionId,
      extended,
      newEndTime
    }, auction.club_id);

    const payload = {
      bidId,
      auctionId,
      itemId,
      userId: user.id,
      userName: user.name,
      teamId: user.team_id,
      amount: numAmount,
      newBalance: finalUserBalance,
      extended,
      newEndTime,
      timestamp: now
    };

    if (ioInstance) {
      const target = auction.club_id ? ioInstance.to(`club_${auction.club_id}`) : ioInstance;
      target.emit('new_bid', payload);
      target.emit('ranking_updated', { trigger: 'new_bid', teamId: user.team_id });
      if (extended) {
        target.emit('auction_extended', {
          auctionId,
          newEndTime,
          message: `Regra Anti-Sniper ativada! O tempo foi estendido em +${extensionSec}s devido a um lance nos últimos segundos!`
        });
      }
    }

    return payload;
  });
}

// Pausar / Retomar Leilão
async function setAuctionStatus(auctionId, newStatus, reason = '', actorId = 1) {
  const allowed = ['active', 'paused', 'cancelled', 'ended'];
  if (!allowed.includes(newStatus)) throw new Error('Status inválido.');

  const now = new Date().toISOString();
  let clubId = null;

  await withTransaction(async () => {
    const auc = await db.get('SELECT * FROM auctions WHERE id = ?', auctionId);
    if (!auc) throw new Error('Leilão não encontrado.');
    clubId = auc.club_id;

    if (newStatus === 'paused') {
      await db.run('UPDATE auctions SET status = ?, pause_reason = ? WHERE id = ?', 'paused', reason, auctionId);
    } else if (newStatus === 'cancelled') {
      await db.run('UPDATE auctions SET status = ?, cancel_reason = ?, actual_end_time = ? WHERE id = ?', 'cancelled', reason, now, auctionId);
      await db.run("UPDATE auction_items SET status = 'cancelled' WHERE auction_id = ?", auctionId);
      await db.run("UPDATE auction_bids SET status = 'cancelled' WHERE auction_id = ? AND status = 'active'", auctionId);

      const items = await db.all('SELECT * FROM auction_items WHERE auction_id = ?', auctionId);
      for (const item of items) {
        if (item.current_winner_user_id && item.current_bid > 0) {
          const user = await db.get('SELECT id, points_balance FROM users WHERE id = ?', item.current_winner_user_id);
          if (user) {
            const newBal = user.points_balance + item.current_bid;
            await db.run('UPDATE users SET points_balance = ? WHERE id = ?', newBal, user.id);
            await db.run(`
              INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
              VALUES (?, ?, ?, ?, ?, 'auction_refund', ?, ?, ?)
            `,
              auc.club_id,
              user.id,
              item.current_winner_team_id,
              item.current_bid,
              newBal,
              `Devolução por cancelamento do leilão: "${auc.title}"`,
              auc.cycle_id,
              now
            );
          }
        }
      }
    } else if (newStatus === 'active') {
      const durationMin = auc.duration_minutes || 30;
      const endDt = new Date(Date.now() + durationMin * 60 * 1000).toISOString();
      await db.run('UPDATE auctions SET status = ?, pause_reason = NULL, start_time = ?, end_time = ? WHERE id = ?', 'active', now, endDt, auctionId);
    } else if (newStatus === 'ended') {
      await endAuction(auctionId, reason);
      return;
    }

    await logAudit(actorId, `AUCTION_${newStatus.toUpperCase()}`, 'auctions', auctionId, reason, auc.club_id);
  });

  if (ioInstance) {
    const target = clubId ? ioInstance.to(`club_${clubId}`) : ioInstance;
    target.emit('auction_status_changed', {
      auctionId,
      status: newStatus,
      reason
    });
  }
}

module.exports = {
  startAuctionEngine,
  setSocketIO,
  getSocketIO,
  placeBid,
  endAuction,
  setAuctionStatus
};
