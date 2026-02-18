import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthResponse } from '../types';
import { loadPrivateKey } from '../services/cryptoService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  privateKey: CryptoKey | null;
  isAuthenticated: boolean;
  loginUser: (data: AuthResponse) => void;
  logoutUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);

  // Phase 5.17: Token Persistence
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('ghost_token');
      const storedUser = localStorage.getItem('ghost_user');
      
      if (storedToken && storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);

        // Try to load private key
        const key = await loadPrivateKey(parsedUser.username);
        if (key) {
          setPrivateKey(key);
        } else {
          console.warn("No private key found for this user on this device. E2EE messaging will be restricted.");
        }
      }
    };
    initAuth();
  }, []);

  const loginUser = async (data: AuthResponse) => {
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('ghost_token', data.token);
    localStorage.setItem('ghost_user', JSON.stringify(data.user));

    // Try load key on login
    const key = await loadPrivateKey(data.user.username);
    setPrivateKey(key);
  };

  const logoutUser = () => {
    setUser(null);
    setToken(null);
    setPrivateKey(null);
    localStorage.removeItem('ghost_token');
    localStorage.removeItem('ghost_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, privateKey, isAuthenticated: !!user, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};