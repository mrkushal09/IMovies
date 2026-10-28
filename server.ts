import 'dotenv/config';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SeatHold {
  seatCode: string;
  userId: string;
  userName: string;
  socketId: string;
  expiresAt: number;
}

// Authoritative in-memory map of temporary seat holds per showId
// Key: showId -> Map<seatCode, SeatHold>
const showSeatHolds = new Map<string, Map<string, SeatHold>>();

const HOLD_TTL_MS = 5 * 60 * 1000; // 5-minute seat hold window

function pruneExpiredHolds(showId: string): boolean {
  const holds = showSeatHolds.get(showId);
  if (!holds) return false;
  const now = Date.now();
  let changed = false;
  for (const [seatCode, hold] of holds.entries()) {
    if (hold.expiresAt <= now) {
      holds.delete(seatCode);
      changed = true;
    }
  }
  if (holds.size === 0) {
    showSeatHolds.delete(showId);
  }
  return changed;
}

function serializeHolds(showId: string): SeatHold[] {
  pruneExpiredHolds(showId);
  const holds = showSeatHolds.get(showId);
  return holds ? Array.from(holds.values()) : [];
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  // Centralized API Rate Limiting (Role-Based & DoS Protection)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again in a minute.' },
  });

  const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Payment rate limit reached. Please wait briefly before retrying.' },
  });

  app.use('/api', apiLimiter);

  // Health & System Architecture Endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'imovies-cinema-api',
      activeShowRooms: showSeatHolds.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Live Seat Holds Snapshot via REST
  app.get('/api/shows/:showId/holds', (req, res) => {
    const showId = String(req.params.showId || '').slice(0, 128);
    if (!/^[a-zA-Z0-9_-]+$/.test(showId)) {
      res.status(400).json({ error: 'Invalid show identifier.' });
      return;
    }
    res.json({
      showId,
      holds: serializeHolds(showId),
    });
  });

  // Payment Checkout Verification & Transaction Reference Generator
  app.post('/api/payments/authorize', paymentLimiter, (req, res) => {
    const { showId, seatCodes, amount, method, userId, simulateFailure } = req.body ?? {};

    if (
      typeof showId !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(showId) ||
      !Array.isArray(seatCodes) ||
      seatCodes.length < 1 ||
      seatCodes.length > 10 ||
      typeof amount !== 'number' ||
      amount < 50 ||
      amount > 55000 ||
      typeof userId !== 'string' ||
      !['upi', 'card', 'netbanking', 'wallet'].includes(method)
    ) {
      res.status(400).json({ error: 'Invalid payment authorization payload.' });
      return;
    }

    if (simulateFailure === true) {
      res.status(402).json({
        error: 'Payment declined by issuing bank. Your held seats remain reserved for retry.',
        code: 'PAYMENT_DECLINED',
      });
      return;
    }

    // Verify no other user holds any of these seats right now
    pruneExpiredHolds(showId);
    const holds = showSeatHolds.get(showId);
    if (holds) {
      for (const code of seatCodes) {
        const existingHold = holds.get(code);
        if (existingHold && existingHold.userId !== userId) {
          res.status(409).json({
            error: `Seat ${code} is currently held by another patron.`,
            code: 'SEAT_CONFLICT',
          });
          return;
        }
      }
    }

    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionRef = `TXN_${Date.now()}_${randomPart}`;
    const bookingCode = `IMV-${randomPart}`;

    res.json({
      authorized: true,
      transactionRef,
      bookingCode,
      currency: 'INR',
      authorizedAt: new Date().toISOString(),
    });
  });

  // Real-time Socket.io Auditorium Seat Locking Engine
  io.on('connection', (socket) => {
    let currentShowRoom: string | null = null;

    socket.on('show:join', ({ showId }: { showId: string }) => {
      if (typeof showId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(showId)) return;
      if (currentShowRoom && currentShowRoom !== showId) {
        socket.leave(`show:${currentShowRoom}`);
      }
      currentShowRoom = showId;
      socket.join(`show:${showId}`);
      socket.emit('holds:sync', {
        showId,
        holds: serializeHolds(showId),
      });
    });

    socket.on(
      'seat:toggle_hold',
      ({
        showId,
        seatCode,
        userId,
        userName,
      }: {
        showId: string;
        seatCode: string;
        userId: string;
        userName: string;
      }) => {
        if (
          typeof showId !== 'string' ||
          !/^[a-zA-Z0-9_-]+$/.test(showId) ||
          typeof seatCode !== 'string' ||
          !/^[A-Z][0-9]{1,2}$/.test(seatCode) ||
          typeof userId !== 'string' ||
          !userId
        ) {
          return;
        }

        pruneExpiredHolds(showId);
        let holds = showSeatHolds.get(showId);
        if (!holds) {
          holds = new Map<string, SeatHold>();
          showSeatHolds.set(showId, holds);
        }

        const currentHold = holds.get(seatCode);
        if (currentHold && currentHold.userId !== userId) {
          socket.emit('seat:hold_rejected', {
            showId,
            seatCode,
            reason: 'Seat is currently being selected by another patron.',
          });
          return;
        }

        if (currentHold && currentHold.userId === userId) {
          holds.delete(seatCode);
        } else {
          // Enforce max 10 held seats per user in a show
          const userHoldCount = Array.from(holds.values()).filter((h) => h.userId === userId).length;
          if (userHoldCount >= 10) {
            socket.emit('seat:hold_rejected', {
              showId,
              seatCode,
              reason: 'Maximum 10 seats can be selected per booking.',
            });
            return;
          }
          holds.set(seatCode, {
            seatCode,
            userId,
            userName: String(userName || 'Patron').slice(0, 40),
            socketId: socket.id,
            expiresAt: Date.now() + HOLD_TTL_MS,
          });
        }

        io.to(`show:${showId}`).emit('holds:sync', {
          showId,
          holds: serializeHolds(showId),
        });
      }
    );

    socket.on(
      'seat:release_user_holds',
      ({ showId, userId }: { showId: string; userId: string }) => {
        if (typeof showId !== 'string' || typeof userId !== 'string') return;
        const holds = showSeatHolds.get(showId);
        if (!holds) return;
        let changed = false;
        for (const [code, hold] of holds.entries()) {
          if (hold.userId === userId) {
            holds.delete(code);
            changed = true;
          }
        }
        if (changed) {
          io.to(`show:${showId}`).emit('holds:sync', {
            showId,
            holds: serializeHolds(showId),
          });
        }
      }
    );

    socket.on('disconnect', () => {
      for (const [showId, holds] of showSeatHolds.entries()) {
        let changed = false;
        for (const [code, hold] of holds.entries()) {
          if (hold.socketId === socket.id) {
            holds.delete(code);
            changed = true;
          }
        }
        if (changed) {
          io.to(`show:${showId}`).emit('holds:sync', {
            showId,
            holds: serializeHolds(showId),
          });
        }
      }
    });
  });

  // Periodic background sweep for expired holds
  setInterval(() => {
    for (const showId of showSeatHolds.keys()) {
      if (pruneExpiredHolds(showId)) {
        io.to(`show:${showId}`).emit('holds:sync', {
          showId,
          holds: serializeHolds(showId),
        });
      }
    }
  }, 15000);

  // Centralized Error Handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[IMovies Server Error]:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  });

  // Vite Dev Middleware or Production Static Assets
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`IMovies Cinema Server & Socket.io running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
