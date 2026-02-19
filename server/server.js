import 'dotenv/config';  // Must be first — loads .env before anything references process.env
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './config/db.js';
import { initSocket } from './socketManager.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import translateRoutes from './routes/translateRoutes.js';

// Connect to Database
connectDB();

const app = express();

// Middleware
app.use(express.json());

// CORS — allow preflight OPTIONS on all routes (required for POST from frontend)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors()); // Handle all preflight requests

app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP that can block API responses

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/translate', translateRoutes);

// Health Check
app.get('/', (req, res) => {
  res.send('GhostProtocol Backend is running...');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: `Global Server Error: ${err.message}`, error: err.message });
});

// Wrap Express with an HTTP server so Socket.IO can share the same port
const httpServer = http.createServer(app);

// Initialise Socket.IO (JWT auth + real-time events)
initSocket(httpServer);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (REST + WebSocket)`);
});
