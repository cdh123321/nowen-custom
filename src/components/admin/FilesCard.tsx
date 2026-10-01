import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
import { cn } from '../../lib/utils'
import {
  fetchFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  formatFileSize,
  FILE_TRANSFER_MAX_SIZE,
  type FileTransferItem,
} from '../../lib/api'
import { useToast } from './Toast'

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

export function FilesCard() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [files, setFiles] = useState<FileTransferItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    loadFiles()
  }, [loadFiles])

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
    const files = e.target.files
    if (!files || files.length === 0) return
    handleUpload(files[0])
    // 重置 input，允许重复选择同一文件
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
    <div className="space-y-6">
      {/* 上传区域 */}
      <div
        className="relative overflow-hidden rounded-2xl backdrop-blur-xl p-6"
        style={{
          background: 'var(--color-glass)',
          border: `1px ${isDragging ? 'dashed' : 'solid'} var(--color-glass-border)`,
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-sm font-medium flex items-center gap-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <CloudUpload className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
            {t('admin.files.title')}
          </h3>
          <button
            onClick={() => loadFiles()}
            className="p-2 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: 'var(--color-text-muted)' }}
            title={t('admin.files.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className={cn(
            'w-full py-10 rounded-xl border-2 border-dashed transition-colors',
            'flex flex-col items-center justify-center gap-3',
            'hover:border-white/30 disabled:opacity-60 disabled:cursor-not-allowed'
          )}
          style={{ borderColor: isDragging ? 'var(--color-primary)' : 'var(--color-glass-border)' }}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
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
              <Upload className="w-8 h-8" style={{ color: 'var(--color-text-muted)' }} />
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
      <div
        className="relative overflow-hidden rounded-2xl backdrop-blur-xl p-6"
        style={{
          background: 'var(--color-glass)',
          border: '1px solid var(--color-glass-border)',
        }}
      >
        <h3
          className="text-sm font-medium flex items-center gap-2 mb-4"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {t('admin.files.list_title')}
          <span
            className="px-2 py-0.5 rounded-full text-xs"
            style={{
              color: 'var(--color-text-muted)',
              background: 'var(--color-bg-tertiary)',
            }}
          >
            {files.length}
          </span>
        </h3>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
            <CloudUpload className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t('admin.files.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {files.map((item) => {
                const IconComp = getFileIcon(item.mimeType, item.name)
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-white/5"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-bg-tertiary)' }}
                    >
                      <IconComp className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
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

      {/* Toast 视觉占位（实际提示由 ToastProvider 渲染） */}
      <div className="hidden">
        <CheckCircle />
        <AlertCircle />
      </div>
    </div>
  )
}
