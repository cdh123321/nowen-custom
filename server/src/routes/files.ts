import { Router } from 'express'
import type { Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { queryAll, queryOne, run } from '../utils/index.js'
import { authMiddleware } from '../middleware/index.js'
import { generateId, getDatabasePath } from '../db.js'

const router = Router()

// 文件存储目录：与数据库同级的 data 目录下（Docker 中已挂载为持久卷，更新容器不丢数据）
const FILES_DIR = path.join(path.dirname(getDatabasePath()), 'files')
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true })
}

// 单文件大小上限：200MB
const MAX_FILE_SIZE = 200 * 1024 * 1024

// multer 磁盘存储配置
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, FILES_DIR)
  },
  filename: (_req, file, cb) => {
    // 存储名使用随机 ID + 时间戳，避免重名与路径注入；原始文件名保存在数据库
    const ext = path.extname(file.originalname).slice(0, 20)
    cb(null, `${Date.now()}-${generateId()}${ext}`)
  },
})

// 过滤非法字符的原始文件名
function sanitizeOriginalName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\u0000]/g, '_').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 200) : 'unnamed'
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
})

interface FileRow {
  id: string
  originalName: string
  storedName: string
  size: number
  mimeType: string | null
  createdAt: string
}

function shapeFile(row: FileRow) {
  return {
    id: row.id,
    name: row.originalName,
    size: row.size,
    mimeType: row.mimeType || 'application/octet-stream',
    createdAt: row.createdAt,
  }
}

// 获取文件列表（需要登录）
router.get('/', authMiddleware, (_req: Request, res: Response) => {
  try {
    const rows = queryAll('SELECT * FROM files ORDER BY createdAt DESC') as unknown as FileRow[]
    res.json(rows.map(shapeFile))
  } catch (error) {
    console.error('获取文件列表失败:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 上传文件（需要登录）
router.post('/', authMiddleware, upload.single('file'), (req: Request, res: Response) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: '未收到文件' })
    }

    const record: FileRow = {
      id: generateId(),
      originalName: sanitizeOriginalName(file.originalname),
      storedName: file.filename,
      size: file.size,
      mimeType: file.mimetype || null,
      createdAt: new Date().toISOString(),
    }

    run(
      'INSERT INTO files (id, originalName, storedName, size, mimeType, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [record.id, record.originalName, record.storedName, record.size, record.mimeType, record.createdAt]
    )

    res.status(201).json(shapeFile(record))
  } catch (error) {
    console.error('上传文件失败:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 下载文件（需要登录，前端通过 fetch + Blob 方式触发下载以携带 Token）
router.get('/:id/download', authMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const row = queryOne('SELECT * FROM files WHERE id = ?', [id]) as unknown as FileRow | null
    if (!row) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // storedName 由服务端生成（时间戳-ID-扩展名），无路径注入风险
    const filePath = path.join(FILES_DIR, path.basename(row.storedName))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件已丢失' })
    }

    res.download(filePath, row.originalName)
  } catch (error) {
    console.error('下载文件失败:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 删除文件（需要登录）
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const row = queryOne('SELECT * FROM files WHERE id = ?', [id]) as unknown as FileRow | null
    if (!row) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(FILES_DIR, path.basename(row.storedName))
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    run('DELETE FROM files WHERE id = ?', [id])

    res.status(204).send()
  } catch (error) {
    console.error('删除文件失败:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

export default router
