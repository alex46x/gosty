import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search as SearchIcon, User, AlertTriangle, ArrowRight } from 'lucide-react';
import { searchUsers } from '../services/mockBackend';
import { SearchResult } from '../types';
import { Button, Input, Alert } from '../components/UI';
import { useAuth } from '../context/AuthContext';

interface SearchProps {
  onSelectUser?: (username: string) => void;
}

export const Search: React.FC<SearchProps> = ({ onSelectUser }) => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Frontend validation to save API calls
    if (query.length < 3) {
      setError("Query too short. Minimum 3 characters required for secure search.");
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      if (user) {
        const data = await searchUsers(query, user.id);
        setResults(data);
      }
    } catch (err) {
      setError("Search request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Search Header */}
      <div className="mb-8 border-b border-white/5 pb-6">
        <h1 className="text-3xl font-bold text-white font-mono tracking-tight mb-2">USER_SEARCH</h1>
        <p className="text-gray-500 text-xs font-mono">
          Locate other encrypted identities. Partial matches allowed.
        </p>
      </div>

      {/* Search Form */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <form onSubmit={handleSearch} className="flex gap-4 items-end">
          <div className="flex-1">
            <Input 
              label="Search Query"
              placeholder="Enter username (min 3 chars)"
              icon={<SearchIcon className="w-4 h-4" />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-[#0f0f0f]"
            />
          </div>
          <Button type="submit" isLoading={loading} disabled={!query.trim()}>
            SCAN
          </Button>
        </form>
      </motion.div>

      {/* Error Display */}
      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        {hasSearched && !loading && results.length === 0 && !error && (
          <div className="text-center py-12 text-gray-600 font-mono border border-dashed border-white/10 rounded-sm bg-white/5">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-20" />
            NO MATCHING IDENTITIES FOUND.
          </div>
        )}

        {results.map((result, index) => (
          <motion.div
            key={result.username}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`flex items-center gap-4 p-4 bg-[#0f0f0f] border border-white/5 rounded-sm hover:border-neon-purple/30 transition-colors group ${onSelectUser ? 'cursor-pointer' : ''}`}
            onClick={() => onSelectUser && onSelectUser(result.username)}
          >
            <div className="w-10 h-10 bg-white/5 rounded-sm flex items-center justify-center text-gray-400 group-hover:text-neon-purple group-hover:bg-neon-purple/10 transition-colors">
              <User className="w-5 h-5" />
            </div>
            
            <div className="flex-1">
              <span className="block text-white font-mono font-bold tracking-wide group-hover:text-neon-purple transition-colors">
                {result.username}
              </span>
              <span className="text-[10px] text-gray-600 font-mono uppercase">
                Encrypted User
              </span>
            </div>

            {onSelectUser && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-neon-purple">
                <ArrowRight className="w-5 h-5" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};