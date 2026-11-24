const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');

const { initDatabase } = require('./db');
const { seedDatabase } = require('./seed');
const { startAuctionEngine } = require('./auctionEngine');

// Importação das Rotas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const teamRoutes = require('./routes/teamRoutes');
const pointRoutes = require('./routes/pointRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const cycleRoutes = require('./routes/cycleRoutes');
const resetRoutes = require('./routes/resetRoutes');
const statsRoutes = require('./routes/statsRoutes');
const auditRoutes = require('./routes/auditRoutes');

const app = express();
const server = http.createServer(app);

// Configuração do CORS
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuração do Socket.IO para eventos em tempo real (lances, timer regressivo, atualizações)
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  // Conexão de cliente
  socket.on('join_auction', (auctionId) => {
    socket.join(`auction_${auctionId}`);
  });

  socket.on('leave_auction', (auctionId) => {
    socket.leave(`auction_${auctionId}`);
  });
});

// Inicializar banco de dados persistente
initDatabase();
if (process.env.SEED_DEMO_DATA === 'true') {
  seedDatabase();
}

// Iniciar o motor em tempo real de leilões
startAuctionEngine(io);

// Registro das Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/points', pointRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/cycles', cycleRoutes);
app.use('/api/reset', resetRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/audit', auditRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'DesbravaPontos & Leilão Virtual',
    timestamp: new Date().toISOString()
  });
});

// Servir frontend compilado em produção se existir
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`⚔️  DESBRAVAPONTOS & LEILÃO VIRTUAL - SERVIDOR ATIVO  ⚔️`);
  console.log(`   Porta: http://localhost:${PORT}`);
  console.log(`   Status: Banco de dados SQLite persistente conectado`);
  console.log(`   Motor de Leilão em tempo real rodando (1s tick)`);
  console.log(`=======================================================`);
});

module.exports = { app, server, io };
