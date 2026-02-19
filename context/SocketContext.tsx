import React, { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SOCKET_URL = 'http://localhost:5000';

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { token, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect when authenticated, disconnect otherwise
    if (isAuthenticated && token) {
      // Create socket connection with JWT in auth handshake
      const socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'], // Skip long-polling for lower latency
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      socket.on('connect', () => {
        console.log('[Socket] Connected to real-time server');
      });

      socket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
        // Graceful degradation: app still works via REST
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
      });

      socketRef.current = socket;
    } else {
      // User logged out — cleanly disconnect
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
