import { Router } from 'express'
import type { Request, Response } from 'express'
import { pinyin } from 'pinyin-pro'
import dns from 'node:dns/promises'

const router = Router()

// 调试开关：WEATHER_FORCE_FALLBACK=1 时跳过 Open-Meteo 主源，强制走 wttr.in 备源
const FORCE_FALLBACK = process.env.WEATHER_FORCE_FALLBACK === '1'

// ========== 简单内存缓存（降低上游免费配额消耗） ==========
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

function num(v: unknown): number {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// ========== Open-Meteo 地理编码（中文城市名自动转拼音重试） ==========
// 返回 result 为 null 时通过 networkError 区分「网络失败」和「真查不到」
async function geocodeCity(
  cityName: string
): Promise<{ result: { lat: number; lon: number; name: string } | null; networkError?: string }> {
  const key = cityName.toLowerCase()
  const cached = getCache(geocodeCache, key)
  if (cached !== null) return { result: cached }

  let networkError: string | undefined
  const searchOnce = async (name: string): Promise<{ lat: number; lon: number; name: string } | null> => {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) {
        networkError = `地理编码服务返回 ${res.status}`
        return null
      }
      const data = await res.json()
      if (data.results && data.results.length > 0) {
        const r = data.results[0]
        return { lat: r.latitude, lon: r.longitude, name: r.name || cityName }
      }
      return null
    } catch (err) {
      networkError = err instanceof Error ? err.message : '地理编码请求失败'
      return null
    }
  }

  // 第一次：用原始输入（新版 Open-Meteo 已能识别部分中文）
  let result = await searchOnce(cityName)

  // 第二次：中文输入转拼音重试（兼容 Open-Meteo 不识别的中文地名）
  if (!result && /[\u4e00-\u9fff]/.test(cityName)) {
    const py = pinyin(cityName, { toneType: 'none', type: 'array' }).join('')
    if (py && py.toLowerCase() !== cityName.toLowerCase()) {
      result = await searchOnce(py)
    }
  }

  setCache(geocodeCache, key, result)
  return { result, networkError }
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

// ========== 天气数据源 ==========

// 主源：Open-Meteo forecast（返回原始 JSON，前端 buildWeatherData 直接消费）
async function fetchOpenMeteoForecast(lat: number, lon: number): Promise<unknown> {
  const apiUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean` +
    `&timezone=auto&forecast_days=7`

  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Open-Meteo HTTP ${res.status}: ${body.slice(0, 120)}`)
  }
  return res.json()
}

// WWO(wttr.in) 天气代码 -> WMO 代码（wttr.in 使用 WWO 代码体系）
function wwoToWmo(code: string | number | undefined): number {
  const map: Record<string, number> = {
    '113': 0, '116': 2, '119': 3, '122': 3, '143': 45, '248': 45, '260': 45,
    '176': 80, '263': 51, '266': 51, '281': 56, '293': 61, '296': 61,
    '299': 63, '302': 63, '305': 65, '308': 65, '311': 66, '314': 67,
    '350': 77, '374': 77, '377': 77,
    '179': 85, '182': 85, '185': 51, '317': 71, '320': 73,
    '323': 71, '326': 71, '329': 73, '332': 75, '335': 75, '338': 75,
    '362': 85, '365': 86, '368': 85, '371': 86,
    '200': 95, '386': 95, '389': 99, '392': 96, '395': 96,
    '227': 71, '230': 75,
  }
  const key = String(code ?? '')
  return map[key] ?? 2
}

// wttr.in 日出日落 "06:32 AM" -> "YYYY-MM-DDTHH:MM:00"（浏览器按本地时间解析）
function astroTime(date: string, t: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t || '')
  if (!m) return `${date}T06:00:00`
  let h = parseInt(m[1], 10)
  const min = m[2]
  const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return `${date}T${String(h).padStart(2, '0')}:${min}:00`
}

// 备源：wttr.in（国内一般可达，支持中文城市名/经纬度），转换为 Open-Meteo 兼容格式
async function fetchWttrWeather(query: string): Promise<unknown> {
  const res = await fetch(`https://wttr.in/${query}?format=j1`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    throw new Error(`wttr.in HTTP ${res.status}`)
  }
  const j: any = await res.json()

  const cur = j?.current_condition?.[0]
  if (!cur) throw new Error('wttr.in 返回数据为空')
  const days: any[] = j?.weather || []

  // 当天代表代码取 12:00 时段
  const dayCode = (d: any): string | number | undefined => {
    const hourly: any[] = d?.hourly || []
    const noon = hourly.find((h) => String(h.time) === '1200')
    return (noon || hourly[0])?.weatherCode
  }

  return {
    current: {
      temperature_2m: num(cur.temp_C),
      relative_humidity_2m: num(cur.humidity),
      apparent_temperature: num(cur.FeelsLikeC),
      weather_code: wwoToWmo(cur.weatherCode),
      wind_speed_10m: num(cur.windspeedKmph),
      wind_direction_10m: num(cur.winddirDegree),
      surface_pressure: num(cur.pressure),
    },
    daily: {
      time: days.map((d) => d.date),
      weather_code: days.map((d) => wwoToWmo(dayCode(d))),
      temperature_2m_max: days.map((d) => num(d.maxtempC)),
      temperature_2m_min: days.map((d) => num(d.mintempC)),
      apparent_temperature_max: days.map((d) => num(d.maxtempC)),
      apparent_temperature_min: days.map((d) => num(d.mintempC)),
      sunrise: days.map((d) => astroTime(d.date, d?.astronomy?.[0]?.sunrise)),
      sunset: days.map((d) => astroTime(d.date, d?.astronomy?.[0]?.sunset)),
      precipitation_sum: days.map((d) => num(d.totalprecipMm)),
      precipitation_probability_max: days.map((d) =>
        Math.round(Math.max(0, ...((d?.hourly || []).map((h: any) => num(h.chanceofrain)))))
      ),
      wind_speed_10m_max: days.map((d) =>
        Math.round(Math.max(0, ...((d?.hourly || []).map((h: any) => num(h.windspeedKmph)))) * 10) / 10
      ),
      relative_humidity_2m_mean: days.map((d) =>
        Math.round(avg((d?.hourly || []).map((h: any) => num(h.humidity))))
      ),
    },
  }
}

// wttr.in 响应中提取城市名（nearest_area）
function wttrCityName(j: unknown): string {
  try {
    const area = (j as any)?.nearest_area?.[0]
    const name = area?.areaName?.[0]?.value
    return typeof name === 'string' && name ? name : ''
  } catch {
    return ''
  }
}

// ========== 路由 ==========

/**
 * GET /api/weather/diag — 容器网络诊断（DNS + HTTP 连通性）
 */
router.get('/diag', async (_req: Request, res: Response) => {
  const targets = [
    { name: 'www.baidu.com（连通性基准）', host: 'www.baidu.com', url: 'https://www.baidu.com' },
    { name: 'geocoding-api.open-meteo.com（主源·地理编码）', host: 'geocoding-api.open-meteo.com', url: 'https://geocoding-api.open-meteo.com/v1/search?name=beijing&count=1' },
    { name: 'api.open-meteo.com（主源·天气）', host: 'api.open-meteo.com', url: 'https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=116.4&current=temperature_2m' },
    { name: 'wttr.in（备用天气源）', host: 'wttr.in', url: 'https://wttr.in/Beijing?format=j1' },
  ]
  const results = await Promise.all(
    targets.map(async (t) => {
      let dnsResult = 'ok'
      try {
        await dns.lookup(t.host)
      } catch (err) {
        dnsResult = `失败: ${err instanceof Error ? err.message : '未知错误'}`
      }
      let http = ''
      try {
        const r = await fetch(t.url, { signal: AbortSignal.timeout(12000) })
        http = `HTTP ${r.status}`
      } catch (err) {
        http = `失败: ${err instanceof Error ? err.message : '未知错误'}`
      }
      return { target: t.name, dns: dnsResult, http }
    })
  )
  res.json({ time: new Date().toISOString(), results })
})

/**
 * GET /api/weather?lat=&lon=  或  ?city=城市名
 * 天气代理：主源 Open-Meteo，网络不可达时自动切换备用源 wttr.in
 * 返回：{ city, data: <Open-Meteo 兼容 JSON> }
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
      if (geo.result) {
        lat = geo.result.lat
        lon = geo.result.lon
        cityName = geo.result.name
      } else if (geo.networkError) {
        // 主源地理编码网络不通：直接用城市名走 wttr.in 备源（wttr.in 支持中文城市名）
        try {
          if (FORCE_FALLBACK) throw new Error('调试模式：强制使用备用源')
          const data = await fetchWttrWeather(encodeURIComponent(cityParam))
          const fallbackCity = wttrCityName(data) || cityParam
          const payload = { city: fallbackCity, data }
          setCache(weatherCache, `city:${cityParam.toLowerCase()}`, payload)
          res.json(payload)
        } catch (err) {
          const reason = err instanceof Error ? err.message : '请求失败'
          res.status(502).json({
            error: `主源与备用源均不可达（Open-Meteo: ${geo.networkError}；wttr.in: ${reason}）`,
          })
        }
        return
      } else {
        res.status(404).json({ error: `城市未找到: ${cityParam}` })
        return
      }
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

    // 主源请求，网络失败切换备源
    let data: unknown
    try {
      if (FORCE_FALLBACK) throw new Error('调试模式：强制使用备用源')
      data = await fetchOpenMeteoForecast(lat, lon)
    } catch (primaryErr) {
      const primaryReason = primaryErr instanceof Error ? primaryErr.message : '请求失败'
      try {
        data = await fetchWttrWeather(`${lat},${lon}`)
      } catch (fallbackErr) {
        const fallbackReason = fallbackErr instanceof Error ? fallbackErr.message : '请求失败'
        res.status(502).json({
          error: `主源与备用源均不可达（Open-Meteo: ${primaryReason}；wttr.in: ${fallbackReason}）`,
        })
        return
      }
    }

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
