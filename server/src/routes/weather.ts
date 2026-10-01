import { Router } from 'express'
import type { Request, Response } from 'express'
import { pinyin } from 'pinyin-pro'

const router = Router()

// ========== 简单内存缓存（降低 Open-Meteo 免费配额消耗） ==========
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 分钟
const weatherCache = new Map<string, { data: unknown; expires: number }>()
const geocodeCache = new Map<string, { data: { lat: number; lon: number; name: string } | null; expires: number }>()

function getCache<T>(map: Map<string, { data: T; expires: number }>, key: string): T | null {
  const hit = map.get(key)
  if (hit && hit.expires > Date.now()) return hit.data
  if (hit) map.delete(key)
  return null
}

function setCache<T>(map: Map<string, { data: T; expires: number }>, key: string, data: T): void {
  map.set(key, { data, expires: Date.now() + CACHE_TTL_MS })
  // 防止无限增长
  if (map.size > 200) {
    const firstKey = map.keys().next().value
    if (firstKey) map.delete(firstKey)
  }
}

// 城市名 -> 经纬度（Open-Meteo Geocoding；中文城市名自动转拼音重试）
async function geocodeCity(cityName: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const key = cityName.toLowerCase()
  const cached = getCache(geocodeCache, key)
  if (cached !== null) return cached

  const searchOnce = async (name: string): Promise<{ lat: number; lon: number; name: string } | null> => {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) return null
      const data = await res.json()
      if (data.results && data.results.length > 0) {
        const r = data.results[0]
        return { lat: r.latitude, lon: r.longitude, name: r.name || cityName }
      }
      return null
    } catch {
      return null
    }
  }

  // 第一次：用原始输入（兼容英文/拼音）
  let result = await searchOnce(cityName)

  // 第二次：中文输入转拼音重试（Open-Meteo 地理编码不识别大部分中文）
  if (!result && /[\u4e00-\u9fff]/.test(cityName)) {
    const py = pinyin(cityName, { toneType: 'none', type: 'array' }).join('')
    if (py && py.toLowerCase() !== cityName.toLowerCase()) {
      result = await searchOnce(py)
    }
  }

  setCache(geocodeCache, key, result)
  return result
}

// 经纬度 -> 城市名（仅用于展示，失败不影响主流程）
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return '当前位置'
    const data = await res.json()
    return data.city || data.locality || data.principalSubdivision || '当前位置'
  } catch {
    return '当前位置'
  }
}

/**
 * GET /api/weather?lat=&lon=  或  ?city=城市名
 * 服务端代理 Open-Meteo 天气请求（浏览器直连该 API 常因共享出口 IP 触发每日配额限制）
 * 返回：{ city, data: <Open-Meteo forecast 原始 JSON> }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    let lat: number | undefined = undefined
    let lon: number | undefined = undefined
    let cityName = ''

    const cityParam = typeof req.query.city === 'string' ? req.query.city.trim() : ''
    const latParam = parseFloat(String(req.query.lat || ''))
    const lonParam = parseFloat(String(req.query.lon || ''))

    if (cityParam) {
      const geo = await geocodeCity(cityParam)
      if (!geo) {
        res.status(404).json({ error: `城市未找到: ${cityParam}` })
        return
      }
      lat = geo.lat
      lon = geo.lon
      cityName = geo.name
    } else if (!isNaN(latParam) && !isNaN(lonParam)) {
      lat = latParam
      lon = lonParam
    } else {
      res.status(400).json({ error: '缺少 lat/lon 或 city 参数' })
      return
    }

    // 命中缓存直接返回
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`
    const cached = getCache(weatherCache, cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const apiUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean` +
      `&timezone=auto&forecast_days=7`

    const res2 = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) })
    if (!res2.ok) {
      const body = await res2.text().catch(() => '')
      res.status(502).json({ error: `Open-Meteo ${res2.status}: ${body.slice(0, 120)}` })
      return
    }
    const data = await res2.json()

    // 未指定城市名时尝试反查（失败用默认值）
    if (!cityName) {
      cityName = await reverseGeocode(lat, lon)
    }

    const payload = { city: cityName, data }
    setCache(weatherCache, cacheKey, payload)
    res.json(payload)
  } catch (err) {
    const reason = err instanceof Error ? err.message : '天气代理请求失败'
    res.status(502).json({ error: reason })
  }
})

export default router
