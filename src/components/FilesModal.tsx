import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Upload,
  File as FileIcon,
  FileText,
  FileImage,
  FileArchive,
  Download,
  Trash2,
  Loader2,
  RefreshCw,
  CloudUpload,
  FileJson,
  FileCode,
  FileAudio,
  FileVideo,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'
import {
  fetchFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  formatFileSize,
  FILE_TRANSFER_MAX_SIZE,
  type FileTransferItem,
} from '../lib/api'

// 根据文件类型选择图标
function getFileIcon(mimeType: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.startsWith('audio/')) return FileAudio
  if (mimeType.startsWith('video/')) return FileVideo
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive
  if (['json', 'csv'].includes(ext)) return FileJson
  if (['js', 'ts', 'tsx', 'py', 'sh', 'html', 'css', 'vue'].includes(ext)) return FileCode
  if (['txt', 'md', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return FileText
  return FileIcon
}

interface FilesModalProps {
  open: boolean
  onClose: () => void
}

// 轻量 toast（前台无 Admin 的 ToastProvider，自行维护）
type ToastType = { type: 'success' | 'error'; message: string } | null

export function FilesModal({ open, onClose }: FilesModalProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<FileTransferItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastType>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const loadFiles = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const list = await fetchFiles()
      setFiles(list)
    } catch (err: any) {
      if (!silent) {
        showToast('error', err?.message || t('admin.files.load_error'))
      }
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [showToast, t])

  useEffect(() => {
    if (open) loadFiles()
  }, [open, loadFiles])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleUpload = useCallback(async (file: File) => {
    if (file.size > FILE_TRANSFER_MAX_SIZE) {
      showToast('error', t('admin.files.too_large'))
      return
    }
    setIsUploading(true)
    setUploadProgress(0)
    try {
      const item = await uploadFile(file, setUploadProgress)
      setFiles(prev => [item, ...prev])
      showToast('success', t('admin.files.upload_success', { name: item.name }))
    } catch (err: any) {
      showToast('error', err?.message || t('admin.files.upload_error'))
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [showToast, t])

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected || selected.length === 0) return
    handleUpload(selected[0])
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const handleDownload = async (item: FileTransferItem) => {
    setDownloadingId(item.id)
    try {
      await downloadFile(item)
    } catch (err: any) {
      showToast('error', err?.message || t('admin.files.download_error'))
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (item: FileTransferItem) => {
    if (!confirm(t('admin.files.delete_confirm', { name: item.name }))) return
    try {
      await deleteFile(item.id)
      setFiles(prev => prev.filter(f => f.id !== item.id))
      showToast('success', t('admin.files.delete_success'))
    } catch (err: any) {
      showToast('error', err?.message || t('admin.files.delete_error'))
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/50 command-backdrop"
            onClick={onClose}
          />

          {/* 模态框 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[121] w-[calc(100vw-2rem)] max-w-lg max-h-[80vh] overflow-hidden flex flex-col rounded-2xl backdrop-blur-xl shadow-2xl"
            style={{ background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)' }}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-glass-border)' }}>
              <h2 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                <CloudUpload className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                {t('admin.files.title')}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => loadFiles()}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: 'var(--color-text-muted)' }}
                  title={t('admin.files.refresh')}
                >
                  <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: 'var(--color-text-muted)' }}
                  aria-label={t('common.cancel', '关闭')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 内容区 */}
            <div className="overflow-y-auto p-5 space-y-4">
              {/* 上传区域 */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={cn(
                    'w-full py-8 rounded-xl border-2 border-dashed transition-colors',
                    'flex flex-col items-center justify-center gap-2',
                    'hover:border-white/30 disabled:opacity-60 disabled:cursor-not-allowed'
                  )}
                  style={{ borderColor: isDragging ? 'var(--color-primary)' : 'var(--color-glass-border)' }}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--color-primary)' }} />
                      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        {t('admin.files.uploading', { percent: uploadProgress })}
                      </span>
                      <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'var(--color-primary)' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="w-7 h-7" style={{ color: 'var(--color-text-muted)' }} />
                      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        {t('admin.files.upload_hint')}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t('admin.files.upload_limit')}
                      </span>
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>

              {/* 文件列表 */}
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                  <CloudUpload className="w-9 h-9 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">{t('admin.files.empty')}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <AnimatePresence initial={false}>
                    {files.map((item) => {
                      const IconComp = getFileIcon(item.mimeType, item.name)
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:bg-white/5"
                        >
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--color-bg-tertiary)' }}
                          >
                            <IconComp className="w-4.5 h-4.5" style={{ color: 'var(--color-primary)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm font-medium truncate"
                              style={{ color: 'var(--color-text-primary)' }}
                              title={item.name}
                            >
                              {item.name}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              {formatFileSize(item.size)} · {new Date(item.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleDownload(item)}
                              disabled={downloadingId === item.id}
                              className="p-2 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-50"
                              style={{ color: 'var(--color-text-secondary)' }}
                              title={t('admin.files.download')}
                            >
                              {downloadingId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleDelete(item)}
                              className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                              style={{ color: '#f87171' }}
                              title={t('admin.files.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* 内嵌 Toast */}
            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl backdrop-blur-xl shadow-lg whitespace-nowrap max-w-[90%]"
                  style={{
                    background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                  }}
                >
                  {toast.type === 'success'
                    ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    : <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {toast.message}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
