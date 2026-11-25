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
    try {
      tickAuctions();
    } catch (err) {
      console.error('Erro no ciclo do motor de leilões:', err);
    }
  }, 1000);
}

function tickAuctions() {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Iniciar leilões agendados que chegaram na hora
  const scheduledAuctions = db.prepare(`
    SELECT * FROM auctions WHERE status = 'scheduled' AND start_time <= ?
  `).all(nowIso);

  for (const auc of scheduledAuctions) {
    db.prepare(`UPDATE auctions SET status = 'active' WHERE id = ?`).run(auc.id);
    logAudit(auc.created_by, 'AUCTION_STARTED_AUTO', 'auctions', auc.id, 'Leilão iniciado automaticamente por cronograma.');
    if (ioInstance) {
      const target = auc.club_id ? ioInstance.to(`club_${auc.club_id}`) : ioInstance;
      target.emit('auction_started', { auctionId: auc.id, title: auc.title });
    }
  }

  // 2. Verificar leilões ativos
  const activeAuctions = db.prepare(`
    SELECT * FROM auctions WHERE status = 'active'
  `).all();

  for (const auc of activeAuctions) {
    const endMs = new Date(auc.end_time).getTime();
    const nowMs = now.getTime();
    const remainingSeconds = Math.max(0, Math.floor((endMs - nowMs) / 1000));

    if (remainingSeconds <= 0) {
      // Leilão terminou!
      endAuction(auc.id, 'Tempo limite esgotado');
    } else {
      // Emitir tick de contagem regressiva para os clientes do clube ouvindo
      if (ioInstance) {
        const target = auc.club_id ? ioInstance.to(`club_${auc.club_id}`) : ioInstance;
        target.emit('auction_tick', {
          auctionId: auc.id,
          remainingSeconds,
          endTime: auc.end_time
        });
      }
    }
  }
}

// Encerramento seguro e atômico do leilão
function endAuction(auctionId, reason = 'Encerramento') {
  const now = new Date().toISOString();

  let clubId = null;

  withTransaction(() => {
    const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
    if (!auction || auction.status === 'ended') return;
    clubId = auction.club_id;

    // Atualizar status do leilão
    db.prepare(`
      UPDATE auctions
      SET status = 'ended', actual_end_time = ?
      WHERE id = ?
    `).run(now, auctionId);

    // Processar cada item do leilão
    const items = db.prepare('SELECT * FROM auction_items WHERE auction_id = ?').all(auctionId);

    for (const item of items) {
      if (item.current_winner_user_id && item.current_bid > 0) {
        // Item vendido!
        db.prepare(`
          UPDATE auction_items
          SET status = 'sold', sold_at = ?
          WHERE id = ?
        `).run(now, item.id);

        // Marcar lance vencedor
        db.prepare(`
          UPDATE auction_bids
          SET status = 'won'
          WHERE item_id = ? AND status = 'active'
        `).run(item.id);

        // Registrar no extrato do ganhador como compra confirmada de leilão
        const winner = db.prepare('SELECT id, points_balance, team_id FROM users WHERE id = ?').get(item.current_winner_user_id);
        if (winner) {
          db.prepare(`
            INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
            VALUES (?, ?, ?, ?, ?, 'auction_win', ?, ?, ?)
          `).run(
            auction.club_id,
            winner.id,
            winner.team_id,
            0, // O débito já ocorreu no momento do lance ativo
            winner.points_balance,
            `Item arrematado no leilão: "${item.title}" por ${item.current_bid} pts`,
            auction.cycle_id,
            now
          );
        }
      } else {
        // Sem lances
        db.prepare(`
          UPDATE auction_items
          SET status = 'unsold'
          WHERE id = ?
        `).run(item.id);
      }
    }

    logAudit(auction.created_by || 1, 'AUCTION_ENDED', 'auctions', auctionId, reason);
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
function placeBid({ auctionId, itemId, userId, isTeamBid = false, amount }) {
  const numAmount = parseInt(amount, 10);
  if (!numAmount || numAmount <= 0) {
    throw new Error('O valor do lance deve ser um número positivo.');
  }

  const now = new Date().toISOString();

  return withTransaction(() => {
    // 1. Validar leilão
    const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
    if (!auction) throw new Error('Leilão não encontrado.');
    if (auction.status !== 'active') throw new Error(`O leilão não está ativo no momento (status atual: ${auction.status}).`);

    // 2. Validar item
    const item = db.prepare('SELECT * FROM auction_items WHERE id = ? AND auction_id = ?').get(itemId, auctionId);
    if (!item) throw new Error('Item do leilão não encontrado.');
    if (item.status !== 'open') throw new Error('Este item não está aberto para lances no momento.');

    // 3. Validar se o lance é maior que o atual e atende ao incremento mínimo
    const minRequired = item.current_bid > 0
      ? item.current_bid + (item.bid_step || 1)
      : item.starting_bid;

    if (numAmount < minRequired) {
      throw new Error(`O lance mínimo exigido para este item é de ${minRequired} pontos (lance atual: ${item.current_bid} pts).`);
    }

    // 4. Validar usuário ou equipe
    const user = db.prepare('SELECT id, name, team_id, active, points_balance FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('Participante não encontrado.');
    if (!user.active) throw new Error('Participante bloqueado ou inativo.');

    // Se o usuário já é o atual maior lance no mesmo item, impedir auto-superação desnecessária
    if (item.current_winner_user_id === user.id) {
      throw new Error('Você já possui o maior lance atual para este item!');
    }

    const requirePoints = getSetting('require_points_for_bids', 'true', auction.club_id) !== 'false';

    let team = null;
    if (requirePoints) {
      if (isTeamBid) {
        if (!user.team_id) throw new Error('Você não está vinculado a nenhuma equipe para dar lance coletivo.');
        team = db.prepare('SELECT id, name, collective_balance FROM teams WHERE id = ?').get(user.team_id);
        if (!team) throw new Error('Equipe não encontrada.');
        if (team.collective_balance < numAmount) {
          throw new Error(`A equipe "${team.name}" não possui saldo coletivo suficiente (Saldo disponível: ${team.collective_balance} pts).`);
        }
      } else {
        // Saldo individual
        if (user.points_balance < numAmount) {
          throw new Error(`Saldo insuficiente! Seu saldo é de ${user.points_balance} pontos, mas este lance exige ${numAmount} pontos.`);
        }
      }
    }

    // 5. DEVOLVER OS PONTOS DO LANCE SUPERADO ANTERIOR (se o modo de pontos estiver ativado)
    if (requirePoints && item.current_winner_user_id && item.current_bid > 0) {
      const prevUserId = item.current_winner_user_id;
      const prevBidAmount = item.current_bid;
      const prevTeamId = item.current_winner_team_id;

      // Buscar último lance ativo deste item
      const prevBid = db.prepare(`
        SELECT id FROM auction_bids
        WHERE item_id = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
      `).get(item.id);

      if (prevBid) {
        db.prepare(`UPDATE auction_bids SET status = 'outbid' WHERE id = ?`).run(prevBid.id);
      }

      // Reembolsar o usuário anterior
      const prevUser = db.prepare('SELECT id, name, points_balance FROM users WHERE id = ?').get(prevUserId);
      if (prevUser) {
        const newPrevBalance = prevUser.points_balance + prevBidAmount;
        db.prepare('UPDATE users SET points_balance = ? WHERE id = ?').run(newPrevBalance, prevUserId);

        // Registrar extrato de reembolso
        db.prepare(`
          INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
          VALUES (?, ?, ?, ?, ?, 'auction_refund', ?, ?, ?)
        `).run(
          auction.club_id,
          prevUserId,
          prevTeamId,
          prevBidAmount,
          newPrevBalance,
          `Devolução de pontos: lance superado no item "${item.title}"`,
          auction.cycle_id,
          now
        );

        // Notificar o usuário superado via socket
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
      // No modo sem pontos, apenas marca o lance anterior como superado
      const prevBid = db.prepare(`
        SELECT id FROM auction_bids
        WHERE item_id = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1
      `).get(item.id);

      if (prevBid) {
        db.prepare(`UPDATE auction_bids SET status = 'outbid' WHERE id = ?`).run(prevBid.id);
      }
    }

    // 6. DEDUZIR OS PONTOS DO NOVO LICITANTE (se o modo de pontos estiver ativado)
    let finalUserBalance = user.points_balance;
    if (requirePoints) {
      if (isTeamBid && team) {
        const newCollective = team.collective_balance - numAmount;
        db.prepare('UPDATE teams SET collective_balance = ? WHERE id = ?').run(newCollective, team.id);
      } else {
        finalUserBalance = user.points_balance - numAmount;
        db.prepare('UPDATE users SET points_balance = ? WHERE id = ?').run(finalUserBalance, user.id);

        // Registrar extrato de lance
        db.prepare(`
          INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
          VALUES (?, ?, ?, ?, ?, 'auction_bid', ?, ?, ?)
        `).run(
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

    // 7. INSERIR NOVO LANCE NA TABELA
    const bidResult = db.prepare(`
      INSERT INTO auction_bids (auction_id, item_id, user_id, team_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(auctionId, itemId, user.id, isTeamBid ? user.team_id : null, numAmount, now);

    const bidId = Number(bidResult.lastInsertRowid);

    // 8. ATUALIZAR ITEM DO LEILÃO
    db.prepare(`
      UPDATE auction_items
      SET current_bid = ?, current_winner_user_id = ?, current_winner_team_id = ?
      WHERE id = ?
    `).run(numAmount, user.id, isTeamBid ? user.team_id : null, itemId);

    // 9. MECANISMO ANTI-SNIPING:
    // Se o lance ocorreu nos últimos X segundos, prorrogar o término para garantir que todos tenham tempo de contra-atacar
    const antiSniperSec = parseInt(getSetting('anti_sniper_seconds', '15', auction.club_id), 10);
    const extensionSec = parseInt(getSetting('anti_sniper_extension', '30', auction.club_id), 10);

    const endMs = new Date(auction.end_time).getTime();
    const nowMs = Date.now();
    const remainingSec = Math.floor((endMs - nowMs) / 1000);

    let extended = false;
    let newEndTime = auction.end_time;

    if (remainingSec <= antiSniperSec) {
      newEndTime = new Date(nowMs + (extensionSec * 1000)).toISOString();
      db.prepare(`UPDATE auctions SET end_time = ? WHERE id = ?`).run(newEndTime, auctionId);
      extended = true;
    }

    logAudit(user.id, 'BID_PLACED', 'auction_items', itemId, {
      amount: numAmount,
      auctionId,
      extended,
      newEndTime
    });

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

    // Emitir para todos do clube em tempo real
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
function setAuctionStatus(auctionId, newStatus, reason = '', actorId = 1) {
  const allowed = ['active', 'paused', 'cancelled', 'ended'];
  if (!allowed.includes(newStatus)) throw new Error('Status inválido.');

  const now = new Date().toISOString();

  let clubId = null;

  withTransaction(() => {
    const auc = db.prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
    if (!auc) throw new Error('Leilão não encontrado.');
    clubId = auc.club_id;

    if (newStatus === 'paused') {
      db.prepare('UPDATE auctions SET status = ?, pause_reason = ? WHERE id = ?').run('paused', reason, auctionId);
    } else if (newStatus === 'cancelled') {
      db.prepare('UPDATE auctions SET status = ?, cancel_reason = ?, actual_end_time = ? WHERE id = ?').run('cancelled', reason, now, auctionId);
      db.prepare("UPDATE auction_items SET status = 'cancelled' WHERE auction_id = ?").run(auctionId);
      db.prepare("UPDATE auction_bids SET status = 'cancelled' WHERE auction_id = ? AND status = 'active'").run(auctionId);

      // Devolver todos os lances ativos de todos os itens deste leilão
      const items = db.prepare('SELECT * FROM auction_items WHERE auction_id = ?').all(auctionId);
      for (const item of items) {
        if (item.current_winner_user_id && item.current_bid > 0) {
          const user = db.prepare('SELECT id, points_balance FROM users WHERE id = ?').get(item.current_winner_user_id);
          if (user) {
            const newBal = user.points_balance + item.current_bid;
            db.prepare('UPDATE users SET points_balance = ? WHERE id = ?').run(newBal, user.id);
            db.prepare(`
              INSERT INTO point_transactions (club_id, user_id, team_id, amount, balance_after, type, reason, cycle_id, created_at)
              VALUES (?, ?, ?, ?, ?, 'auction_refund', ?, ?, ?)
            `).run(
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
      // Se estava agendado ou pausado, ativar imediatamente recalculando end_time
      const durationMin = auc.duration_minutes || 30;
      const endDt = new Date(Date.now() + durationMin * 60 * 1000).toISOString();
      db.prepare('UPDATE auctions SET status = ?, pause_reason = NULL, start_time = ?, end_time = ? WHERE id = ?')
        .run('active', now, endDt, auctionId);
    } else if (newStatus === 'ended') {
      endAuction(auctionId, reason);
      return;
    }

    logAudit(actorId, `AUCTION_${newStatus.toUpperCase()}`, 'auctions', auctionId, reason);
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
