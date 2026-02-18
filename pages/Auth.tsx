import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, ArrowRight, AlertTriangle, Info, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { login, register } from '../services/mockBackend';
import { generateKeyPair, savePrivateKey } from '../services/cryptoService';
import { Button, Input, Alert } from '../components/UI';
import { ViewState } from '../types';

interface AuthProps {
  view: ViewState;
  onChangeView: (view: ViewState) => void;
}

export const Auth: React.FC<AuthProps> = ({ view, onChangeView }) => {
  const { loginUser } = useAuth();
  const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isLogin = view === ViewState.LOGIN;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setStatus('');

    try {
      if (!isLogin) {
        // --- REGISTRATION FLOW ---
        
        // 1. Validate
        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        if (formData.password.length < 8) {
          throw new Error("Password too weak. Min 8 chars.");
        }

        // 2. Generate E2EE Keys (Client Side)
        setStatus('Generating encryption keys...');
        const keys = await generateKeyPair();

        // 3. Register (Send Public Key to Server)
        setStatus('Registering identity...');
        const response = await register(formData.username, formData.password, keys.publicKey);

        // 4. Save Private Key (Client Side Only)
        // In a real app, this should be wrapped/encrypted with the user's password.
        await savePrivateKey(response.user.username, keys.privateKey);

        loginUser(response);
      } else {
        // --- LOGIN FLOW ---
        const response = await login(formData.username, formData.password);
        loginUser(response);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-6 md:mt-20 px-2 sm:px-0">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-graphite/50 border border-white/5 p-6 md:p-8 relative overflow-hidden backdrop-blur-xl rounded-sm"
      >
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>

        <div className="relative z-10">
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold font-mono tracking-tighter text-white">
              {isLogin ? 'ACCESS_TERMINAL' : 'NEW_IDENTITY'}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {isLogin 
                ? 'Enter credentials to decrypt your session.' 
                : 'Create a zero-knowledge anonymous account.'}
            </p>
          </div>

          {error && <div className="mb-6"><Alert>{error}</Alert></div>}

          {!isLogin && (
             <div className="mb-6 space-y-2">
               <div className="p-3 bg-neon-purple/5 border border-neon-purple/20 text-neon-purple text-xs font-mono flex gap-2">
                  <Info className="w-4 h-4 shrink-0" />
                  <p>IMPORTANT: There is NO password recovery. If you lose your credentials, your account is lost forever.</p>
               </div>
               <div className="p-3 bg-neon-green/5 border border-neon-green/20 text-neon-green text-xs font-mono flex gap-2">
                  <Shield className="w-4 h-4 shrink-0" />
                  <p>E2E Encryption Enabled: A cryptographic key pair will be generated locally. Your private key never leaves this device.</p>
               </div>
             </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input 
              label="Codename" 
              placeholder="username"
              icon={<User className="w-4 h-4" />}
              value={formData.username}
              onChange={e => setFormData({...formData, username: e.target.value})}
              autoComplete="off"
            />
            
            <Input 
              label="Passphrase" 
              type="password"
              placeholder="••••••••"
              icon={<Lock className="w-4 h-4" />}
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
            />

            {!isLogin && (
              <Input 
                label="Confirm Passphrase" 
                type="password"
                placeholder="••••••••"
                icon={<Lock className="w-4 h-4" />}
                value={formData.confirmPassword}
                onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
              />
            )}

            <div className="pt-4">
              <Button type="submit" isLoading={loading} className="w-full">
                {loading && status ? status : (isLogin ? 'Decrypt & Enter' : 'Initialize Identity')}
              </Button>
            </div>
          </form>

          <div className="mt-6 flex justify-center">
            <button 
              onClick={() => {
                setError(null);
                onChangeView(isLogin ? ViewState.REGISTER : ViewState.LOGIN);
              }}
              className="text-xs font-mono text-gray-500 hover:text-neon-green transition-colors flex items-center gap-1 text-center"
            >
              {isLogin ? 'NO IDENTITY? GENERATE ONE' : 'ALREADY HAVE AN IDENTITY? LOGIN'}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};