const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');

const { initDatabase, isPostgres } = require('./db');
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
const masterRoutes = require('./routes/masterRoutes');

const app = express();
const server = http.createServer(app);

// Configuração do CORS
app.use(cors());

// Desabilitar completamente cache de navegador para toda a API REST (evitar dados obsoletos em F5)
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

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
  // Conexão de cliente: entra na sala do seu clube para isolar leilões e rankings em tempo real
  socket.on('join_club', (clubId) => {
    if (clubId) {
      socket.join(`club_${clubId}`);
    }
  });

  socket.on('join_auction', (auctionId) => {
    socket.join(`auction_${auctionId}`);
  });

  socket.on('leave_auction', (auctionId) => {
    socket.leave(`auction_${auctionId}`);
  });
});

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
app.use('/api/master', masterRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'DesbravaPontos & Leilão Virtual',
    database: isPostgres ? 'postgresql' : 'sqlite',
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

async function bootstrap() {
  await initDatabase();
  if (process.env.SEED_DEMO_DATA === 'true') {
    await seedDatabase();
  }
  startAuctionEngine(io);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`⚔️  DESBRAVAPONTOS & LEILÃO VIRTUAL - SERVIDOR ATIVO  ⚔️`);
    console.log(`   Porta: http://localhost:${PORT}`);
    console.log(`   Banco: ${isPostgres ? 'PostgreSQL (Persistente na Nuvem)' : 'SQLite local'}`);
    console.log(`   Motor de Leilão em tempo real rodando (1s tick)`);
    console.log(`=======================================================`);
  });
}

bootstrap().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
  process.exit(1);
});

module.exports = { app, server, io };
