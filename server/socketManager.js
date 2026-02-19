import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from './models/User.js';

// In-memory map: userId (string) -> socketId (string)
// This is PRIVATE — never sent to clients.
const userSocketMap = new Map();

/**
 * Returns the socket ID for a given userId, or undefined if not connected.
 * Used by messageRoutes.js to push events to specific users.
 */
export const getSocketId = (userId) => userSocketMap.get(userId.toString());

/**
 * Returns the io instance for use across the app.
 */
let _io = null;
export const getIO = () => _io;

/**
 * Initialise Socket.IO on an existing HTTP server.
 * Call this once from server.js.
 */
export const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: '*', // Tighten in production (match your frontend URL)
            methods: ['GET', 'POST'],
        },
    });

    _io = io;

    // ─── JWT Authentication Middleware ───────────────────────────────────────
    // Runs BEFORE the connection is accepted. Rejects unauthenticated sockets.
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');

            if (!user) {
                return next(new Error('User not found'));
            }

            // Attach user to socket so all handlers can access it
            socket.user = user;
            next();
        } catch (err) {
            next(new Error('Invalid or expired token'));
        }
    });

    // ─── Connection Handler ───────────────────────────────────────────────────
    io.on('connection', (socket) => {
        const userId = socket.user._id.toString();

        // Register this socket for the user
        userSocketMap.set(userId, socket.id);
        console.log(`[Socket] User connected: ${socket.user.username} (${socket.id})`);

        // ── Typing Indicator ─────────────────────────────────────────────────
        // Client emits: { recipientId: string }
        // Server relays to recipient only (does NOT broadcast)
        socket.on('typing', ({ recipientId }) => {
            if (!recipientId) return;
            const recipientSocketId = userSocketMap.get(recipientId.toString());
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('typing', {
                    senderId: userId,
                    senderUsername: socket.user.username,
                });
            }
        });

        // ── Stop Typing ──────────────────────────────────────────────────────
        socket.on('stop_typing', ({ recipientId }) => {
            if (!recipientId) return;
            const recipientSocketId = userSocketMap.get(recipientId.toString());
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('stop_typing', { senderId: userId });
            }
        });

        // ── Disconnect ───────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            userSocketMap.delete(userId);
            console.log(`[Socket] User disconnected: ${socket.user.username}`);
        });
    });

    return io;
};
