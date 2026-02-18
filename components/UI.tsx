import React from 'react';
import { motion } from 'framer-motion';

// --- BUTTON ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "relative font-mono text-sm font-bold uppercase tracking-widest px-6 py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group";
  
  const variants = {
    primary: "bg-neon-green text-black hover:bg-white hover:text-black",
    secondary: "bg-transparent border border-white/20 text-white hover:border-neon-purple hover:text-neon-purple",
    danger: "bg-red-900/20 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-black"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {isLoading && (
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {children}
      </span>
      {!isLoading && <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />}
    </button>
  );
};

// --- INPUT ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, icon, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-xs font-mono text-gray-400 uppercase">{label}</label>}
      <div className="relative group">
        <input 
          className={`w-full bg-charcoal border border-white/10 focus:border-neon-green outline-none text-white px-4 py-3 font-mono text-sm placeholder-gray-600 transition-colors ${icon ? 'pl-10' : ''} ${error ? 'border-neon-red focus:border-neon-red' : ''} ${className}`}
          {...props}
        />
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-neon-green transition-colors">
            {icon}
          </div>
        )}
      </div>
      {error && <span className="text-xs text-neon-red font-mono">{error}</span>}
    </div>
  );
};

// --- ALERT ---
export const Alert: React.FC<{ children: React.ReactNode; type?: 'error' | 'success' }> = ({ children, type = 'error' }) => (
  <motion.div 
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`p-3 border text-xs font-mono flex items-start gap-2 ${
      type === 'error' 
        ? 'border-neon-red/30 bg-neon-red/5 text-neon-red' 
        : 'border-neon-green/30 bg-neon-green/5 text-neon-green'
    }`}
  >
    {children}
  </motion.div>
);