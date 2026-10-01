import React from 'react';
import { motion } from 'framer-motion';
import { Bookmark as BookmarkIcon } from 'lucide-react';
import { Sparkles } from '../ui/effects';

interface EmptyStateProps {
  isLiteMode?: boolean;
  isLoggedIn?: boolean;
  onAddBookmark: () => void;
}

export function EmptyState({ isLiteMode, isLoggedIn, onAddBookmark }: EmptyStateProps) {
  return (
    <motion.div
      className="text-center py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-nebula-purple/20 to-nebula-pink/20 flex items-center justify-center">
        {isLiteMode ? (
          <BookmarkIcon className="w-7 h-7" style={{ color: 'var(--color-text-muted)' }} />
        ) : (
          <Sparkles>
            <BookmarkIcon className="w-7 h-7" style={{ color: 'var(--color-text-muted)' }} />
          </Sparkles>
        )}
      </div>
      <h3 className="text-xl font-serif mb-2" style={{ color: 'var(--color-text-primary)' }}>
        开启你的星云之旅
      </h3>
      <p className="mb-5 max-w-md mx-auto text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        按{' '}
        <kbd className="px-2 py-1 rounded text-xs" style={{ background: 'var(--color-bg-tertiary)' }}>
          ⌘K
        </kbd>{' '}
        打开命令面板， 粘贴链接即可添加第一个书签
      </p>
      {isLoggedIn && (
        <motion.button
          onClick={onAddBookmark}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-nebula-purple to-nebula-pink text-white font-medium shadow-glow-md"
          whileHover={{ scale: isLiteMode ? 1.02 : 1.05 }}
          whileTap={{ scale: isLiteMode ? 0.98 : 0.95 }}
        >
          添加第一个书签
        </motion.button>
      )}
    </motion.div>
  );
}

export default EmptyState;
