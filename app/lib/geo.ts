import { getApiConfig, type CommuteRouteMode } from './storage';

export type CommuteResult = {
  distance: string;
  duration: string;
  success: boolean;
  errorReason?: string; // 失败原因诊断
  routeMode?: CommuteRouteMode;
  routeModeLabel?: string;
};

type Coord = { lng: number; lat: number };

// 城市代码到城市名映射（用于高德地理编码的city参数）
const CITY_CODE_MAP: Record<string, string> = {
  bj: '北京',
  sh: '上海',
  gz: '广州',
  sz: '深圳',
  wh: '武汉',
  cd: '成都',
  cq: '重庆',
  hz: '杭州',
  nj: '南京',
  xm: '厦门',
};

// 清理和优化地址字符串
function cleanAddress(rawAddress: string): string {
  let addr = rawAddress.trim();
  
  // 移除多余的空格和特殊字符
  addr = addr.replace(/\s+/g, ' ');
  
  // 移除价格信息（如 "4500元"）
  addr = addr.replace(/\d+元/g, '');
  
  // 移除房型信息（如 "2室1厅"）
  addr = addr.replace(/\d室\d厅/g, '');
  addr = addr.replace(/\d室/g, '');
  
  // 移除面积信息
  addr = addr.replace(/\d+(?:\.\d+)?(?:㎡|平|平方米)/g, '');
  
  // 移除整租、合租等标签
  addr = addr.replace(/整租|合租|主卧|次卧/g, '');
  
  // 移除连续的特殊字符
  addr = addr.replace(/[·｜,，\s]+/g, ' ');
  
  return addr.trim();
}

/** 高德 Web 服务地理编码（与地图 JS API 分离，在 RN 中更可靠） */
export async function geocodeAddress(address: string, cityCode?: string): Promise<Coord | null> {
  const { amapKey } = await getApiConfig();
  if (!amapKey) {
    throw new Error('未配置高德地图 Key');
  }

  // 清理地址
  const cleanedAddress = cleanAddress(address);
  if (!cleanedAddress || cleanedAddress.length < 2) {
    return null;
  }

  const params = new URLSearchParams({
    key: amapKey,
    address: cleanedAddress,
  });
  
  // 如果提供了城市代码，添加city参数限定范围
  if (cityCode && CITY_CODE_MAP[cityCode.toLowerCase()]) {
    params.set('city', CITY_CODE_MAP[cityCode.toLowerCase()]);
  }

  const resp = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params.toString()}`);
  if (!resp.ok) {
    throw new Error(`高德地理编码请求失败（${resp.status}）`);
  }
  const data: any = await resp.json();
  if (data.status !== '1' || !data.geocodes || data.geocodes.length === 0) {
    console.log('[geo] 地理编码失败:', cleanedAddress, data);
    return null;
  }

  const loc = data.geocodes[0].location as string;
  const [lngStr, latStr] = loc.split(',');
  const lng = parseFloat(lngStr);
  const lat = parseFloat(latStr);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  
  console.log('[geo] 地理编码成功:', cleanedAddress, '→', { lng, lat, city: data.geocodes[0].city });
  return { lng, lat };
}

/** 高德 Web 服务逆地理编码（地图 WebView 内 Geocoder 失败时的兜底） */
export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  const { amapKey } = await getApiConfig();
  if (!amapKey || Number.isNaN(lng) || Number.isNaN(lat)) return null;
  const params = new URLSearchParams({
    key: amapKey,
    location: `${lng},${lat}`,
    radius: '200',
    extensions: 'base',
  });
  try {
    const resp = await fetch(`https://restapi.amap.com/v3/geocode/regeo?${params.toString()}`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    if (data.status !== '1' || !data.regeocode) return null;
    const formatted = String(data.regeocode.formatted_address || '').trim();
    return formatted.length >= 4 ? formatted : null;
  } catch {
    return null;
  }
}

/** 按顺序尝试多个地址串，返回首个解析成功的坐标（无法保证每个房源都能命中） */
export async function geocodeFirstMatch(
  candidates: string[],
  cityCode?: string,
): Promise<{ coord: Coord; matchedQuery: string } | null> {
  const seen = new Set<string>();
  for (const raw of candidates) {
    const q = cleanAddress(String(raw || '').trim());
    if (q.length < 2 || seen.has(q)) continue;
    seen.add(q);
    const coord = await geocodeAddress(q, cityCode);
    if (coord) return { coord, matchedQuery: q };
  }
  return null;
}

/** 为房源终点构建地理编码候选，提高命中率 */
export function buildListingDestinationCandidates(listing: {
  district?: string;
  community?: string;
  title?: string;
  cityCode?: string;
}): string[] {
  const city = listing.cityCode ? CITY_CODE_MAP[String(listing.cityCode).toLowerCase()] : '';
  const d = (listing.district || '').trim();
  const c = (listing.community || '').trim();
  const title = (listing.title || '').trim();
  const seen = new Set<string>();
  const out: string[] = [];

  function push(s: string) {
    const t = cleanAddress(s).trim();
    if (t.length < 2) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  }

  if (c && c !== '未知小区' && c !== '未知') {
    if (city) {
      push(`${city}${c}`);
      push(`${city} ${c}`);
    }
    push(c);
    if (d && d !== '未知区域' && d !== '未知') {
      push(`${d} ${c}`);
      if (city) push(`${city}${d}${c}`);
    }
  } else if (d && d !== '未知区域' && d !== '未知') {
    if (city) push(`${city}${d}`);
    push(d);
  }

  if (title.length >= 4) {
    const stripped = title
      .replace(/^(整租|合租|短租|公寓)[·｜|\s]*/u, '')
      .replace(/\d+室\d*厅?/g, ' ')
      .trim();
    if (stripped.length >= 4 && stripped.length <= 48) push(stripped);
  }

  return out;
}

function cityLabelForTransit(cityCode?: string): string {
  const c = String(cityCode || '').trim().toLowerCase();
  if (c && CITY_CODE_MAP[c]) return CITY_CODE_MAP[c];
  return '北京';
}

/** 按高德 Web 路径规划拉取时间与距离（公交地铁 / 驾车 / 步行 / 骑行） */
async function fetchAmapRouteByMode(
  mode: CommuteRouteMode,
  key: string,
  originLoc: string,
  destLoc: string,
  cityLabel: string,
): Promise<{ distanceMeters: number; durationSeconds: number; distanceLabel?: string } | null> {
  if (mode === 'transit') {
    const params = new URLSearchParams({
      key,
      origin: originLoc,
      destination: destLoc,
      city: cityLabel,
      extensions: 'base',
    });
    const resp = await fetch(`https://restapi.amap.com/v3/direction/transit/integrated?${params.toString()}`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    if (data.status !== '1' || !data.route) return null;
    const transits = data.route.transits;
    if (!Array.isArray(transits) || transits.length === 0) return null;
    const t0 = transits[0];
    const durationSeconds = Number(t0.duration || 0);
    const walkingM = Number(t0.walking_distance || 0);
    if (!durationSeconds) return null;
    const distanceLabel =
      walkingM > 150 ? `步行衔接约${(walkingM / 1000).toFixed(1)}km` : '公共交通';
    return { distanceMeters: 0, durationSeconds, distanceLabel };
  }

  const pathUrl =
    mode === 'driving'
      ? 'https://restapi.amap.com/v3/direction/driving'
      : mode === 'walking'
        ? 'https://restapi.amap.com/v3/direction/walking'
        : 'https://restapi.amap.com/v3/direction/bicycling';
  const params = new URLSearchParams({
    key,
    origin: originLoc,
    destination: destLoc,
  });
  const resp = await fetch(`${pathUrl}?${params.toString()}`);
  if (!resp.ok) return null;
  const data: any = await resp.json();
  if (data.status !== '1') return null;
  const path = data?.route?.paths?.[0];
  const distanceMeters = Number(path?.distance || 0);
  const durationSeconds = Number(path?.duration || 0);
  if (!distanceMeters || !durationSeconds) return null;
  return { distanceMeters, durationSeconds };
}

export async function calculateCommute(
  origin: string,
  destination: string,
  cityCode?: string,
  /** 主地址解析失败时继续尝试的其它写法 */
  destinationFallbacks?: string[],
): Promise<CommuteResult> {
  try {
    const from = origin.trim();
    const to = destination.trim();

    const { amapKey } = await getApiConfig();
    console.log('[geo] amapKey:', amapKey);
    console.log('[geo] origin:', from);
    console.log('[geo] destination:', to);
    console.log('[geo] cityCode:', cityCode);

    if (!from || !to) {
      return { distance: '', duration: '', success: false, errorReason: '起点或终点地址为空' };
    }

    const [originCoord, destHit] = await Promise.all([
      geocodeAddress(from, cityCode),
      geocodeFirstMatch(
        [to, ...(destinationFallbacks || [])].filter((s) => String(s || '').trim().length >= 2),
        cityCode,
      ),
    ]);

    if (!originCoord) {
      // #region agent log
      fetch('http://127.0.0.1:7750/ingest/c7852349-c1c4-418e-b862-f082a33bb43e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cb84fa'},body:JSON.stringify({sessionId:'cb84fa',location:'geo.ts:calculateCommute',message:'origin_geocode_miss',data:{fromLen:from.length,fromLooksLikeCoordParen:/地图选点|[（(]\s*\d+\.\d+/.test(from),cityCode:String(cityCode||'')},timestamp:Date.now(),hypothesisId:'H-C'})}).catch(()=>{});
      // #endregion
      return {
        distance: '',
        duration: '',
        success: false,
        errorReason: `起点地址解析失败：${from}`,
      };
    }

    if (!destHit) {
      return {
        distance: '',
        duration: '',
        success: false,
        errorReason: '目的地未能解析为坐标（已尝试多种地址写法，部分房源在高德中无精确匹配）',
      };
    }

    const destCoord = destHit.coord;

    const apiCfg = await getApiConfig();
    const { amapKey: keyForRoute } = apiCfg;
    const mode: CommuteRouteMode = apiCfg.commuteRouteMode || 'transit';
    const routeModeLabel =
      mode === 'transit'
        ? '公共交通'
        : mode === 'driving'
          ? '驾车'
          : mode === 'walking'
            ? '步行'
            : '骑行';
    const originLoc = `${originCoord.lng},${originCoord.lat}`;
    const destinationLoc = `${destCoord.lng},${destCoord.lat}`;
    const cityLabel = cityLabelForTransit(cityCode);

    const routed = await fetchAmapRouteByMode(mode, keyForRoute, originLoc, destinationLoc, cityLabel);
    if (!routed) {
      return {
        distance: '',
        duration: '',
        success: false,
        errorReason:
          mode === 'transit'
            ? '未找到可行的公交/地铁路线（起终点过远或超出当前城市公交数据范围），可在「我的」设置中改为驾车/步行等方式重试'
            : '未找到有效的导航路线',
        routeMode: mode,
        routeModeLabel,
      };
    }

    const { distanceMeters, durationSeconds, distanceLabel } = routed;
    const mins = Math.max(1, Math.round(durationSeconds / 60));
    const distStr =
      distanceLabel ||
      (distanceMeters > 0 ? `${(distanceMeters / 1000).toFixed(1)}km` : '—');
    return {
      distance: distStr,
      duration: `${mins}分钟`,
      success: true,
      routeMode: mode,
      routeModeLabel,
    };
  } catch (error: any) {
    return { 
      distance: '', 
      duration: '', 
      success: false, 
      errorReason: error?.message || '网络异常或系统错误' 
    };
  }
}
 
