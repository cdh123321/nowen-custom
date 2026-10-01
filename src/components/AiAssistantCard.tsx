import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Send,
  Trash2,
  User,
  Bot,
  ExternalLink,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { aiApi } from '../lib/api'
import type { AiChatResponse } from '../lib/api'

interface AiAssistantCardProps {
  className?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  bookmarks?: AiChatResponse['bookmarks']
  timestamp: number
}

/**
 * AiAssistantCard - AI 助手独立卡片（与监控组件同规格）
 * 直接在卡片内输入对话，无需打开弹窗
 */
export function AiAssistantCard({ className }: AiAssistantCardProps) {
  const { t, i18n } = useTranslation()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 检查 AI 状态（仅一次）
  useEffect(() => {
    if (aiConfigured === null) {
      aiApi.status()
        .then(s => setAiConfigured(s.configured))
        .catch(() => setAiConfigured(false))
    }
  }, [aiConfigured])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const result = await aiApi.chat({
        message: msg,
        lang: i18n.language,
      })

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.reply || result.error || t('ai_assistant.error'),
        bookmarks: result.bookmarks,
        timestamp: Date.now(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err?.message || t('ai_assistant.error'),
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, i18n.language, t])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isDisabled = aiConfigured === false || isLoading

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl flex flex-col",
      "backdrop-blur-xl",
      "p-3",
      "h-full min-h-[240px]",
      "dark:bg-gradient-to-br dark:from-slate-900/95 dark:via-slate-800/90 dark:to-slate-900/95 dark:border dark:border-purple-500/20",
      "bg-gradient-to-br from-white/95 via-slate-50/90 to-white/95 border border-purple-200/50 shadow-xl shadow-purple-500/5",
      className
    )}>
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial dark:from-purple-500/10 from-purple-400/15 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial dark:from-cyan-500/10 from-cyan-400/10 via-transparent to-transparent" />
      </div>

      {/* 标题栏 */}
      <div className="relative z-10 flex items-center gap-2 mb-2 flex-shrink-0">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'rgb(168,85,247)' }} />
        </motion.div>
        <span className={cn(
          "text-xs font-medium tracking-wider",
          "dark:text-white/80 text-slate-700"
        )}>
          NOWEN AI
        </span>

        <div className="ml-auto flex items-center gap-1">
          {/* 状态指示灯 */}
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              backgroundColor: aiConfigured === false ? '#ef4444' : isLoading ? '#f59e0b' : '#22c55e',
            }}
          />
          {/* 清空对话 */}
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-0.5 rounded-md transition-colors dark:hover:bg-white/10 hover:bg-slate-100 dark:text-white/40 text-slate-400 hover:text-purple-500"
              title={t('ai_assistant.clear_history')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 消息区域 */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto space-y-2.5">
        {/* AI 未配置提示 */}
        {aiConfigured === false && (
          <div className="flex flex-col items-center justify-center h-full min-h-[140px] text-center">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
              style={{
                background: 'linear-gradient(135deg, rgba(147,51,234,0.1) 0%, rgba(6,182,212,0.1) 100%)',
                border: '1px solid rgba(147,51,234,0.15)',
              }}
            >
              <Bot className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {t('ai_assistant.not_configured')}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {t('ai_assistant.not_configured_hint')}
            </p>
          </div>
        )}

        {/* 欢迎状态 + 快捷提问 */}
        {aiConfigured !== false && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[140px] text-center">
            <Sparkles className="w-6 h-6 mb-1.5" style={{ color: 'rgb(168,85,247)' }} />
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--color-text-primary)' }}>
              {t('ai_assistant.welcome')}
            </p>
            <p className="text-[10px] max-w-[240px] leading-relaxed mb-3" style={{ color: 'var(--color-text-muted)' }}>
              {t('ai_assistant.welcome_hint')}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {[
                t('ai_assistant.quick_1'),
                t('ai_assistant.quick_2'),
                t('ai_assistant.quick_3'),
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => setInput(q)}
                  className="px-2.5 py-1 rounded-lg text-[10px] transition-all hover:scale-[1.03] active:scale-[0.97]"
                  style={{
                    background: 'var(--color-glass)',
                    border: '1px solid var(--color-glass-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'flex gap-2',
              msg.role === 'user' ? 'flex-row-reverse' : '',
            )}
          >
            {/* 头像 */}
            <div
              className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{
                background: msg.role === 'assistant'
                  ? 'linear-gradient(135deg, rgba(147,51,234,0.2) 0%, rgba(6,182,212,0.2) 100%)'
                  : 'var(--color-glass)',
                border: msg.role === 'assistant'
                  ? '1px solid rgba(147,51,234,0.2)'
                  : '1px solid var(--color-glass-border)',
              }}
            >
              {msg.role === 'assistant' ? (
                <Sparkles className="w-2.5 h-2.5" style={{ color: 'rgb(168,85,247)' }} />
              ) : (
                <User className="w-2.5 h-2.5" style={{ color: 'var(--color-text-muted)' }} />
              )}
            </div>

            {/* 消息内容 */}
            <div className={cn('flex-1 min-w-0', msg.role === 'user' ? 'text-right' : '')}>
              <div
                className={cn(
                  'inline-block px-3 py-2 rounded-xl text-xs leading-relaxed max-w-[90%] text-left',
                  msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm',
                )}
                style={{
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, rgba(147,51,234,0.18) 0%, rgba(6,182,212,0.18) 100%)'
                    : 'var(--color-glass)',
                  border: msg.role === 'user'
                    ? '1px solid rgba(147,51,234,0.25)'
                    : '1px solid var(--color-glass-border)',
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'pre-wrap' as const,
                  wordBreak: 'break-word' as const,
                }}
              >
                {msg.content}
              </div>

              {/* 推荐书签 */}
              {msg.bookmarks && msg.bookmarks.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {msg.bookmarks.map((bm) => (
                    <a
                      key={bm.id}
                      href={bm.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all group"
                      style={{
                        background: 'var(--color-glass)',
                        border: '1px solid var(--color-glass-border)',
                      }}
                    >
                      <div className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=32`}
                          alt=""
                          className="w-3 h-3"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {bm.title}
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--color-text-muted)' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* 思考中 */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2"
          >
            <div
              className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{
                background: 'linear-gradient(135deg, rgba(147,51,234,0.2) 0%, rgba(6,182,212,0.2) 100%)',
                border: '1px solid rgba(147,51,234,0.2)',
              }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles className="w-2.5 h-2.5" style={{ color: 'rgb(168,85,247)' }} />
              </motion.div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl rounded-bl-sm" style={{
              background: 'var(--color-glass)',
              border: '1px solid var(--color-glass-border)',
            }}>
              {[0, 0.2, 0.4].map((delay) => (
                <motion.div
                  key={delay}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay }}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'rgb(168,85,247)' }}
                />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="relative z-10 pt-2 mt-1 flex-shrink-0" style={{ borderTop: '1px solid var(--color-glass-border)' }}>
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiConfigured === false ? t('ai_assistant.not_configured') : t('ai_assistant.placeholder')}
            disabled={isDisabled}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs outline-none transition-all disabled:opacity-50 focus:border-purple-400/40"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-glass-border)',
              color: 'var(--color-text-primary)',
            }}
          />
          <motion.button
            onClick={handleSend}
            disabled={!input.trim() || isDisabled}
            className={cn(
              'p-2 rounded-lg transition-all flex-shrink-0',
              'disabled:opacity-30 disabled:cursor-not-allowed',
            )}
            style={{
              background: input.trim()
                ? 'linear-gradient(135deg, rgba(147,51,234,0.25) 0%, rgba(6,182,212,0.25) 100%)'
                : 'var(--color-glass)',
              border: input.trim()
                ? '1px solid rgba(147,51,234,0.35)'
                : '1px solid var(--color-glass-border)',
            }}
            whileHover={input.trim() ? { scale: 1.06 } : {}}
            whileTap={input.trim() ? { scale: 0.94 } : {}}
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: 'rgb(168,85,247)' }} />
              </motion.div>
            ) : (
              <Send className="w-3.5 h-3.5" style={{ color: input.trim() ? 'rgb(168,85,247)' : 'var(--color-text-muted)' }} />
            )}
          </motion.button>
        </div>
      </div>

      {/* 加载遮罩（状态检查中） */}
      <AnimatePresence>
        {aiConfigured === null && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center z-20 dark:bg-black/40 bg-white/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            >
              <Sparkles className="w-6 h-6" style={{ color: 'rgb(168,85,247)' }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AiAssistantCard
