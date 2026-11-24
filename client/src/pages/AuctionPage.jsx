import React, { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Avatar from '../components/Avatar';
import {
  Gavel,
  Clock,
  Coins,
  Shield,
  Award,
  AlertCircle,
  CheckCircle2,
  Play,
  Pause,
  XCircle,
  PlusCircle,
  Ban,
  Trash2,
  Flame,
  User,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Sparkles,
  Package,
  Upload,
  Camera,
  X
} from 'lucide-react';

export default function AuctionPage() {
  const { user, isSuperAdmin, isDirector, refreshUser } = useAuth();
  const { socket, addNotification } = useSocket();

  const [auctions, setAuctions] = useState([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState(null);
  const [auctionData, setAuctionData] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [bidAmountInput, setBidAmountInput] = useState('');
  const [activeItemId, setActiveItemId] = useState(null);
  const [isTeamBid, setIsTeamBid] = useState(false);
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidSuccess, setBidSuccess] = useState('');

  const canManageAuction = isSuperAdmin || isDirector || (user && auctionData && auctionData.created_by === user.id);

  // Modais de Criação e Ações do Superadmin
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseAction, setPauseAction] = useState('pause');
  const [adminReason, setAdminReason] = useState('');

  // Formulário de Criação de Leilão
  const [newAuctionForm, setNewAuctionForm] = useState({
    title: '',
    description: '',
    round_number: 1,
    mode: 'both',
    start_time: new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16),
    duration_minutes: 30
  });

  // Formulário de Adicionar Item
  const [newItemForm, setNewItemForm] = useState({
    title: '',
    description: '',
    image_url: '',
    starting_bid: 20,
    bid_step: 5
  });

  const itemImageInputRef = useRef(null);

  const handleItemImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecione um arquivo de imagem válido (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
        setNewItemForm(prev => ({ ...prev, image_url: compressedBase64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Carregar lista de leilões
  const fetchAuctions = async () => {
    try {
      const res = await api.getAuctions();
      setAuctions(res.auctions || []);

      // Se não há selecionado, seleciona o primeiro ativo ou agendado
      if (!selectedAuctionId && res.auctions && res.auctions.length > 0) {
        const active = res.auctions.find(a => a.status === 'active') || res.auctions[0];
        setSelectedAuctionId(active.id);
      }
    } catch (err) {
      console.error('Erro ao buscar leilões:', err);
    }
  };

  // Carregar detalhes do leilão selecionado
  const fetchAuctionDetails = async (id) => {
    if (!id) return;
    try {
      const res = await api.getAuctionDetails(id);
      setAuctionData(res.auction);
      if (res.auction.status === 'active') {
        setRemainingSeconds(res.auction.remaining_seconds);
      }

      // Definir item ativo selecionado
      if (res.auction.items && res.auction.items.length > 0) {
        if (!activeItemId || !res.auction.items.find(i => i.id === activeItemId)) {
          setActiveItemId(res.auction.items[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do leilão:', err);
    }
  };

  useEffect(() => {
    fetchAuctions();
  }, []);

  useEffect(() => {
    if (selectedAuctionId) {
      fetchAuctionDetails(selectedAuctionId);
    }
  }, [selectedAuctionId]);

  // Escutar eventos do Socket.IO
  useEffect(() => {
    if (!socket || !selectedAuctionId) return;

    socket.emit('join_auction', selectedAuctionId);

    const handleTick = (payload) => {
      if (Number(payload.auctionId) === Number(selectedAuctionId)) {
        setRemainingSeconds(payload.remainingSeconds);
      }
    };

    const handleNewBid = (payload) => {
      if (Number(payload.auctionId) === Number(selectedAuctionId)) {
        fetchAuctionDetails(selectedAuctionId);
        refreshUser();

        if (user && payload.userId === user.id) {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.7 }
          });
        }
      }
    };

    const handleExtended = (payload) => {
      if (Number(payload.auctionId) === Number(selectedAuctionId)) {
        addNotification({
          type: 'sniper',
          title: 'Tempo Prorrogado!',
          message: payload.message,
          duration: 6000
        });
        fetchAuctionDetails(selectedAuctionId);
      }
    };

    const handleStatusChanged = (payload) => {
      if (Number(payload.auctionId) === Number(selectedAuctionId)) {
        fetchAuctionDetails(selectedAuctionId);
        fetchAuctions();
      }
    };

    const handleEnded = (payload) => {
      if (Number(payload.auctionId) === Number(selectedAuctionId)) {
        fetchAuctionDetails(selectedAuctionId);
        fetchAuctions();
        refreshUser();
        addNotification({
          type: 'info',
          title: 'Leilão Encerrado!',
          message: payload.message,
          duration: 7000
        });
      }
    };

    socket.on('auction_tick', handleTick);
    socket.on('new_bid', handleNewBid);
    socket.on('auction_extended', handleExtended);
    socket.on('auction_status_changed', handleStatusChanged);
    socket.on('auction_ended', handleEnded);

    return () => {
      socket.emit('leave_auction', selectedAuctionId);
      socket.off('auction_tick', handleTick);
      socket.off('new_bid', handleNewBid);
      socket.off('auction_extended', handleExtended);
      socket.off('auction_status_changed', handleStatusChanged);
      socket.off('auction_ended', handleEnded);
    };
  }, [socket, selectedAuctionId, user]);

  const activeItem = auctionData?.items?.find(i => i.id === activeItemId) || auctionData?.items?.[0];

  const minBidRequired = activeItem
    ? (activeItem.current_bid > 0 ? activeItem.current_bid + (activeItem.bid_step || 5) : activeItem.starting_bid)
    : 0;

  // Enviar Lance
  const handlePlaceBid = async (customAmount = null) => {
    if (!user) {
      setBidError('Faça login para dar lances.');
      return;
    }

    const amount = customAmount || parseInt(bidAmountInput, 10);
    if (!amount || isNaN(amount)) {
      setBidError('Informe um valor de lance válido.');
      return;
    }

    if (amount < minBidRequired) {
      setBidError(`O lance mínimo é de ${minBidRequired} pontos.`);
      return;
    }

    const userBalance = user ? (user.points_balance || 0) : 0;
    if (amount > userBalance) {
      setBidError(`Saldo insuficiente! Seu saldo é de ${userBalance} pts, mas o lance exige ${amount} pts.`);
      return;
    }

    setSubmittingBid(true);
    setBidError('');
    setBidSuccess('');

    try {
      const res = await api.placeBid(selectedAuctionId, activeItem.id, amount, isTeamBid);
      setBidSuccess(`Lance de ${amount} pts registrado com sucesso!`);
      setBidAmountInput('');
      fetchAuctionDetails(selectedAuctionId);
      refreshUser();
    } catch (err) {
      setBidError(err.message || 'Erro ao registrar lance.');
    } finally {
      setSubmittingBid(false);
    }
  };

  // Criar Leilão (Superadmin)
  const handleCreateAuction = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createAuction(newAuctionForm);
      setShowCreateModal(false);
      await fetchAuctions();
      if (res.auction_id) {
        setSelectedAuctionId(res.auction_id);
      }
    } catch (err) {
      alert(err.message || 'Erro ao criar leilão.');
    }
  };

  // Adicionar Item (Superadmin)
  const handleAddItem = async (e) => {
    e.preventDefault();
    try {
      await api.addAuctionItem(selectedAuctionId, newItemForm);
      setShowAddItemModal(false);
      setNewItemForm({ title: '', description: '', image_url: '', starting_bid: 20, bid_step: 5 });
      fetchAuctionDetails(selectedAuctionId);
    } catch (err) {
      alert(err.message || 'Erro ao adicionar item.');
    }
  };

  // Alterar Status do Leilão (Superadmin ou Diretoria)
  const handleStatusAction = async () => {
    try {
      await api.setAuctionStatus(selectedAuctionId, pauseAction, adminReason);
      setShowPauseModal(false);
      setAdminReason('');
      fetchAuctionDetails(selectedAuctionId);
      fetchAuctions();
      addNotification({
        type: pauseAction === 'cancelled' ? 'warning' : 'info',
        title: 'Status Atualizado',
        message: `Transmissão alterada para: ${pauseAction === 'cancelled' ? 'Cancelada' : pauseAction}`
      });
    } catch (err) {
      alert(err.message || 'Erro na operação.');
    }
  };

  // Excluir Leilão
  const handleDeleteAuction = async () => {
    if (!confirm(`Deseja realmente excluir o leilão "${auctionData?.title}"? Esta ação removerá o leilão e todos os seus lotes.`)) return;
    try {
      await api.deleteAuction(selectedAuctionId);
      addNotification({
        type: 'info',
        title: 'Leilão Excluído',
        message: 'O leilão foi removido com sucesso.'
      });
      setSelectedAuctionId(null);
      setAuctionData(null);
      fetchAuctions();
    } catch (err) {
      alert(err.message || 'Erro ao excluir leilão.');
    }
  };

  const formatCountdown = (secs) => {
    if (secs === null || secs === undefined || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isUserWinning = user && activeItem && activeItem.current_winner_user_id === user.id;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in">
      {/* Barra de Seleção de Leilões & Botões de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1.5">
            <Gavel className="w-4 h-4 text-amber-500" /> Rodadas:
          </span>
          {auctions.map((auc) => (
            <button
              key={auc.id}
              onClick={() => setSelectedAuctionId(auc.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-2 shrink-0 ${
                selectedAuctionId === auc.id
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {auc.status === 'active' && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
              {auc.title}
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                auc.status === 'active' ? 'bg-red-500 text-white' :
                auc.status === 'scheduled' ? 'bg-blue-500/20 text-blue-300' :
                auc.status === 'paused' ? 'bg-amber-500/20 text-amber-300' :
                auc.status === 'cancelled' ? 'bg-zinc-700 text-zinc-300' :
                'bg-slate-700 text-slate-400'
              }`}>
                {auc.status === 'active' ? 'Ao Vivo' :
                 auc.status === 'scheduled' ? 'Agendado' :
                 auc.status === 'paused' ? 'Pausado' :
                 auc.status === 'cancelled' ? 'Cancelado' : 'Encerrado'}
              </span>
            </button>
          ))}
        </div>

        {/* Botão para Criar Rodada */}
        {(isSuperAdmin || isDirector) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md transition shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            Nova Rodada
          </button>
        )}
      </div>

      {auctionData ? (
        <div className="space-y-6">
          {/* Header do Leilão Selecionado */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1.5">
                  <span className={`px-2.5 py-0.5 rounded-full border ${
                    auctionData.status === 'active' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
                    auctionData.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' :
                    auctionData.status === 'paused' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' :
                    auctionData.status === 'cancelled' ? 'bg-zinc-700/50 text-zinc-300 border-zinc-600' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {auctionData.status === 'active' ? '● AO VIVO' :
                     auctionData.status === 'scheduled' ? 'Agendado' :
                     auctionData.status === 'paused' ? 'Pausado' :
                     auctionData.status === 'cancelled' ? '🚫 Cancelado' : 'Finalizado'}
                  </span>
                  <span className="text-slate-400">Rodada #{auctionData.round_number}</span>
                  <span className="text-slate-400">• Modalidade: {auctionData.mode === 'both' ? 'Individual e Equipes' : auctionData.mode}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {auctionData.title}
                </h1>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                  {auctionData.description || 'Acumule pontos em suas tarefas do clube e dispute os melhores equipamentos de acampamento!'}
                </p>

                {auctionData.pause_reason && (
                  <div className="mt-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-500/30 p-2 rounded-xl">
                    ⚠️ Motivo da pausa: {auctionData.pause_reason}
                  </div>
                )}
                {auctionData.cancel_reason && (
                  <div className="mt-2 text-xs text-red-400 bg-red-950/40 border border-red-500/30 p-2 rounded-xl">
                    🚫 Motivo do cancelamento: {auctionData.cancel_reason}
                  </div>
                )}
              </div>

              {/* Cronômetro e Controles Administrativos */}
              <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
                {auctionData.status === 'active' && (
                  <div className="flex flex-col items-center p-3.5 px-6 rounded-2xl bg-slate-950 border border-red-500/40 shadow-inner">
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5" /> Tempo Restante
                    </span>
                    <div className={`text-4xl font-mono font-black tracking-wider ${
                      remainingSeconds !== null && remainingSeconds <= 30 ? 'text-red-500 animate-bounce' : 'text-white'
                    }`}>
                      {formatCountdown(remainingSeconds)}
                    </div>
                  </div>
                )}

                {/* Controles da Transmissão do Leilão */}
                {canManageAuction && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Se estiver agendado: Iniciar Agora */}
                    {auctionData.status === 'scheduled' && (
                      <button
                        onClick={() => { setPauseAction('active'); setShowPauseModal(true); }}
                        className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition text-xs font-bold flex items-center gap-1.5"
                        title="Iniciar Transmissão Agora"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Iniciar Agora
                      </button>
                    )}

                    {/* Se estiver ativo: Pausar */}
                    {auctionData.status === 'active' && (
                      <button
                        onClick={() => { setPauseAction('paused'); setShowPauseModal(true); }}
                        className="p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition"
                        title="Pausar Transmissão"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    )}

                    {/* Se estiver pausado: Retomar */}
                    {auctionData.status === 'paused' && (
                      <button
                        onClick={() => { setPauseAction('active'); setShowPauseModal(true); }}
                        className="p-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition"
                        title="Retomar Transmissão"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}

                    {/* CANCELAR TRANSMISSÃO: se não estiver finalizado nem cancelado */}
                    {auctionData.status !== 'ended' && auctionData.status !== 'cancelled' && (
                      <button
                        onClick={() => { setPauseAction('cancelled'); setShowPauseModal(true); }}
                        className="px-3 py-2 rounded-xl bg-red-950/70 hover:bg-red-900/80 text-red-300 border border-red-500/50 transition text-xs font-bold flex items-center gap-1.5 shadow-sm"
                        title="Cancelar Transmissão do Leilão"
                      >
                        <Ban className="w-3.5 h-3.5 text-red-400" />
                        Cancelar Transmissão
                      </button>
                    )}

                    {/* Encerrar normalmente se ativo */}
                    {auctionData.status === 'active' && (
                      <button
                        onClick={() => { setPauseAction('ended'); setShowPauseModal(true); }}
                        className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition text-xs font-semibold flex items-center gap-1"
                        title="Encerrar Leilão"
                      >
                        <XCircle className="w-4 h-4" />
                        Encerrar
                      </button>
                    )}

                    {/* Excluir leilão se agendado, finalizado ou cancelado */}
                    {(auctionData.status === 'scheduled' || auctionData.status === 'ended' || auctionData.status === 'cancelled') && (
                      <button
                        onClick={handleDeleteAuction}
                        className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition"
                        title="Excluir este Leilão"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => setShowAddItemModal(true)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Novo Lote
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Área Principal de Lances e Itens */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna 1 & 2: Lote Ativo em Destaque e Painel de Lances */}
            <div className="lg:col-span-2 space-y-6">
              {activeItem ? (
                <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
                  {/* Foto e Detalhes do Lote */}
                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="w-full sm:w-64 h-56 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 relative group">
                      <img
                        src={activeItem.image_url || 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop&q=80'}
                        alt={activeItem.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md text-amber-400 font-extrabold text-xs border border-amber-500/30">
                        Lote #{activeItem.order_num}
                      </div>

                      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md text-[11px] text-slate-300 border border-slate-800">
                        <span>Inicial: {activeItem.starting_bid} pts</span>
                        <span>Passo: +{activeItem.bid_step} pts</span>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            activeItem.status === 'open' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            activeItem.status === 'sold' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {activeItem.status === 'open' ? 'Aberto para Lances' :
                             activeItem.status === 'sold' ? 'Arrematado / Vendido' : 'Sem lances'}
                          </span>
                        </div>

                        <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                          {activeItem.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                          {activeItem.description || 'Equipamento de alta durabilidade para instruções, acampamentos e atividades práticas de pioneiria.'}
                        </p>
                      </div>

                      {/* Card do Maior Lance Atual */}
                      <div className="mt-4 p-4 rounded-2xl bg-slate-950/90 border border-slate-800/90 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Maior Lance Atual
                          </span>
                          <div className="text-2xl sm:text-3xl font-black text-amber-400 flex items-baseline gap-1">
                            {activeItem.current_bid?.toLocaleString('pt-BR') || activeItem.starting_bid}
                            <span className="text-xs font-normal text-slate-400">pontos</span>
                          </div>
                        </div>

                        {activeItem.winner_name ? (
                          <div className="flex items-center gap-2.5 text-right">
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-1 justify-end">
                                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                {activeItem.winner_name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {activeItem.winner_team_name || 'Individual'}
                              </div>
                            </div>
                            <Avatar
                              src={activeItem.winner_avatar}
                              name={activeItem.winner_name}
                              size="md"
                              className="border-2 border-amber-500 shadow-md"
                            />
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 italic">
                            Nenhum lance ainda
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Alerta de Status do Usuário Atual */}
                  {user && (
                    <div className="pt-2">
                      {isUserWinning ? (
                        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span><strong>Parabéns!</strong> Você é o maior lance atual para este item. Se o tempo esgotar, o item é seu!</span>
                        </div>
                      ) : null}

                      {bidError && (
                        <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 mt-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{bidError}</span>
                        </div>
                      )}

                      {bidSuccess && (
                        <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 mt-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>{bidSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Painel Interativo de Envio de Lance */}
                  {auctionData.status === 'active' && activeItem.status === 'open' ? (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-amber-500/30 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-300 flex items-center gap-1.5">
                          <Coins className="w-4 h-4 text-amber-400" />
                          Dar um Lance no Lote
                        </span>
                        <span className="text-slate-400">
                          Seu Saldo: <strong className="text-amber-400">{user ? user.points_balance : 0} pts</strong>
                        </span>
                      </div>

                      {/* Alerta de Saldo Insuficiente para Lances */}
                      {user && user.points_balance < minBidRequired && (
                        <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2.5">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <div>
                            <span className="font-bold">Limite de saldo atingido: </span>
                            <span>O próximo lance mínimo é de <strong>{minBidRequired} pts</strong>, mas seu saldo em carteira é de <strong>{user.points_balance} pts</strong>.</span>
                          </div>
                        </div>
                      )}

                      {/* Botões de Lances Rápidos */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[minBidRequired, minBidRequired + 10, minBidRequired + 25, minBidRequired + 50].map((quickVal) => {
                          const hasBalance = user && user.points_balance >= quickVal;
                          return (
                            <button
                              key={quickVal}
                              onClick={() => handlePlaceBid(quickVal)}
                              disabled={submittingBid || !hasBalance}
                              className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                                hasBalance
                                  ? 'bg-slate-800 hover:bg-slate-700 active:scale-95 border-slate-700 text-white'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-600 opacity-40 cursor-not-allowed'
                              }`}
                              title={hasBalance ? `Dar lance de ${quickVal} pontos` : 'Saldo insuficiente em carteira'}
                            >
                              <span>+{quickVal - (activeItem.current_bid || 0)} pts</span>
                              <span className={`text-[10px] font-normal ${hasBalance ? 'text-amber-400' : 'text-slate-600'}`}>
                                ({quickVal} total)
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Lance Personalizado */}
                      <div className="flex gap-2 pt-1">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min={minBidRequired}
                            max={user ? user.points_balance : undefined}
                            step={activeItem.bid_step || 5}
                            value={bidAmountInput}
                            onChange={(e) => setBidAmountInput(e.target.value)}
                            placeholder={`Mínimo: ${minBidRequired} pontos`}
                            className="w-full pl-4 pr-16 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                          />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                            PONTOS
                          </span>
                        </div>

                        <button
                          onClick={() => handlePlaceBid()}
                          disabled={
                            submittingBid ||
                            !bidAmountInput ||
                            (user && parseInt(bidAmountInput, 10) > user.points_balance) ||
                            parseInt(bidAmountInput, 10) < minBidRequired
                          }
                          className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          {submittingBid ? 'Enviando...' : 'Confirmar Lance'}
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1.5">
                        <Shield className="w-3 h-3 text-emerald-400" />
                        Garantia de estorno: se seu lance for superado, os pontos retornam imediatamente ao seu saldo.
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                      {auctionData.status === 'ended'
                        ? 'Este leilão foi encerrado.'
                        : 'Lances disponíveis apenas durante o período ativo da rodada.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                    <Package className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Nenhum lote aberto para lances ainda</h3>
                    <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto">
                      {canManageAuction
                        ? 'Para que os desbravadores possam disputar lances ao vivo, adicione ao menos um lote/item (ex: Barraca, Lanterna, Troféu, Cantil, etc.).'
                        : 'A diretoria abriu a rodada de leilão, mas os lotes ainda estão sendo cadastrados. Assim que um lote for liberado, os botões de lance aparecerão aqui!'}
                    </p>
                  </div>
                  {canManageAuction && (
                    <button
                      onClick={() => setShowAddItemModal(true)}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs inline-flex items-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-95"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Cadastrar Primeiro Lote deste Leilão
                    </button>
                  )}
                </div>
              )}

              {/* Lista dos Outros Lotes do Leilão */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-md">
                <h3 className="font-bold text-sm text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>📦 Todos os Lotes da Rodada</span>
                  <span className="text-xs text-slate-500 font-normal">({auctionData.items?.length || 0} itens)</span>
                </h3>

                {(!auctionData.items || auctionData.items.length === 0) ? (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                    Nenhum item cadastrado nesta rodada de leilão.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {auctionData.items?.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveItemId(item.id)}
                        className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 ${
                          activeItemId === item.id
                            ? 'bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10'
                            : 'bg-slate-850/60 border-slate-800 hover:bg-slate-800/80'
                        }`}
                      >
                        <img
                          src={item.image_url || 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=200&auto=format&fit=crop&q=80'}
                          alt=""
                          className="w-14 h-14 rounded-xl object-cover border border-slate-800 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{item.title}</div>
                          <div className="text-[11px] text-amber-400 font-extrabold mt-0.5">
                            {item.current_bid} pts
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {item.winner_name ? `Líder: ${item.winner_name}` : 'Sem lances'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna 3: Histórico de Lances da Rodada em Tempo Real */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
                    <Flame className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">Lances em Tempo Real</h3>
                    <p className="text-[11px] text-slate-400">Atividade ao vivo na rodada</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[550px] pr-1">
                {auctionData.recent_bids && auctionData.recent_bids.length > 0 ? (
                  auctionData.recent_bids.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl bg-slate-850/80 border border-slate-800 flex items-center justify-between gap-2 animate-in fade-in"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          src={b.user_avatar}
                          name={b.user_name}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-200 truncate">
                            {b.user_name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {b.item_title}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-amber-400">
                          {b.amount} pts
                        </span>
                        <div className="text-[9px] text-slate-500">
                          {new Date(b.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    Nenhum lance registrado nesta rodada ainda. Seja o primeiro a dar um lance!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400">
          Selecione uma rodada de leilão acima.
        </div>
      )}

      {/* MODAL: Criar Nova Rodada de Leilão (Superadmin) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Criar Nova Rodada de Leilão</h3>
            <p className="text-xs text-slate-400 mb-6">Programe eventos únicos ou recorrentes para o clube.</p>

            <form onSubmit={handleCreateAuction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Título da Rodada</label>
                <input
                  type="text"
                  required
                  value={newAuctionForm.title}
                  onChange={(e) => setNewAuctionForm({ ...newAuctionForm, title: e.target.value })}
                  placeholder="Ex: Leilão de Sábado - Especial Pioneiria"
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descrição</label>
                <textarea
                  value={newAuctionForm.description}
                  onChange={(e) => setNewAuctionForm({ ...newAuctionForm, description: e.target.value })}
                  placeholder="Informações sobre os lotes..."
                  rows={2}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Início Programado</label>
                  <input
                    type="datetime-local"
                    required
                    value={newAuctionForm.start_time}
                    onChange={(e) => setNewAuctionForm({ ...newAuctionForm, start_time: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Duração (Minutos)</label>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={newAuctionForm.duration_minutes}
                    onChange={(e) => setNewAuctionForm({ ...newAuctionForm, duration_minutes: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md"
                >
                  Criar e Agendar Leilão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Adicionar Lote / Item (Superadmin) */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Adicionar Lote ao Leilão</h3>
            <p className="text-xs text-slate-400 mb-4">Insira o equipamento ou benefício a ser disputado.</p>

            <form onSubmit={handleAddItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Título do Item</label>
                <input
                  type="text"
                  required
                  value={newItemForm.title}
                  onChange={(e) => setNewItemForm({ ...newItemForm, title: e.target.value })}
                  placeholder="Ex: Cantil Militar 1L"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descrição</label>
                <textarea
                  value={newItemForm.description}
                  onChange={(e) => setNewItemForm({ ...newItemForm, description: e.target.value })}
                  placeholder="Detalhes do equipamento..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              {/* Upload da Foto do Lote */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Foto do Lote</label>
                <input
                  type="file"
                  ref={itemImageInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleItemImageFile}
                />

                {newItemForm.image_url ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 mb-2">
                    <img
                      src={newItemForm.image_url}
                      alt="Prévia do lote"
                      className="w-full h-36 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setNewItemForm(prev => ({ ...prev, image_url: '' }))}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-950/80 hover:bg-red-600 text-white transition shadow-md"
                      title="Remover foto"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => itemImageInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-bold transition active:scale-95"
                  >
                    <Upload className="w-4 h-4" />
                    Escolher Foto da Galeria do Celular / PC
                  </button>
                )}

                <details className="text-[11px] text-slate-400 mt-1 cursor-pointer">
                  <summary className="hover:text-slate-200">Ou colar link/URL direto de imagem</summary>
                  <input
                    type="url"
                    value={newItemForm.image_url}
                    onChange={(e) => setNewItemForm({ ...newItemForm, image_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full mt-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500"
                  />
                </details>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Lance Inicial (pts)</label>
                  <input
                    type="number"
                    min="1"
                    value={newItemForm.starting_bid}
                    onChange={(e) => setNewItemForm({ ...newItemForm, starting_bid: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Passo Mínimo (pts)</label>
                  <input
                    type="number"
                    min="1"
                    value={newItemForm.bid_step}
                    onChange={(e) => setNewItemForm({ ...newItemForm, bid_step: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl"
                >
                  Salvar Lote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ação Administrativa (Pausar / Retomar / Cancelar / Encerrar com Justificativa) */}
      {showPauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">
              {pauseAction === 'paused' ? 'Pausar Transmissão' :
               pauseAction === 'active' ? 'Iniciar / Retomar Transmissão' :
               pauseAction === 'cancelled' ? 'Cancelar Transmissão do Leilão' : 'Encerrar Leilão'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {pauseAction === 'cancelled'
                ? 'Ao cancelar, a transmissão ao vivo será interrompida imediatamente e todos os lances dados pelos desbravadores serão estornados.'
                : 'A ação e justificativa serão registradas no histórico de auditoria oficial.'}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Justificativa da Ação</label>
                <textarea
                  value={adminReason}
                  onChange={(e) => setAdminReason(e.target.value)}
                  placeholder={
                    pauseAction === 'cancelled' ? 'Ex: Cancelado por problemas técnicos ou adiado para outra reunião...' :
                    pauseAction === 'paused' ? 'Ex: Intervalo para orientações do diretor...' :
                    'Ex: Justificativa opcional...'
                  }
                  rows={3}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Voltar
                </button>
                <button
                  onClick={handleStatusAction}
                  className={`px-5 py-2 text-white font-bold text-xs rounded-xl transition ${
                    pauseAction === 'cancelled'
                      ? 'bg-red-600 hover:bg-red-500'
                      : pauseAction === 'active'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {pauseAction === 'cancelled' ? 'Confirmar Cancelamento' : 'Confirmar Ação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
