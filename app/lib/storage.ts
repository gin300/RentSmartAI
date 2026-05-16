import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitAgentEvent } from './agent-events';

// ── 类型定义 ──────────────────────────────────────────────────
export type Listing = {
  id: string;
  title: string;
  community: string;
  district: string;
  roomType: string;
  area: string;
  floor: string;
  price: number;
  tags: string[];
  hasSubway: boolean;
  hasPets: boolean;
  isWhole: boolean;
  isShortTerm?: boolean;   // 是否短租
  isApartment?: boolean;    // 是否公寓
  rentDuration?: string;    // 租期（短租专用）
  aiScore: number;
  aiComment: string;
  url?: string;
  imageUrl?: string;
  platform?: string;
  scrapedAt?: string;
  cityCode?: string;
};

export type UserPrefs = {
  city: string;
  cityLabel: string;
  budgetMin: string;
  budgetMax: string;
  district: string;
  commuteAddr: string;
  workAddress?: string;
  /** 地图选点保存的经度（十进制字符串，与高德一致） */
  workLng?: string;
  /** 地图选点保存的纬度 */
  workLat?: string;
  needSubway: boolean;
  needPets: boolean;
  otherReqs: string;
  rentMode: string;
  subFilter: string;
};

export type AppStats = {
  analyzed: number;
  favorited: number;
  deepAnalyzed: number;
};

export type DeepAnalysisRecord = {
  listingId: string;
  title: string;
  score: number;
  summary: string;
  raw: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  topic: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  updatedAt: string;
};

// ── 默认值 ────────────────────────────────────────────────────
export const DEFAULT_PREFS: UserPrefs = {
  city: 'bj',
  cityLabel: '北京',
  budgetMin: '',
  budgetMax: '',
  district: '',
  commuteAddr: '',
  needSubway: false,
  needPets: false,
  otherReqs: '',
  rentMode: '整租',
  subFilter: '不限',
  workAddress: '',
};

// ── 存储 Key ──────────────────────────────────────────────────
const KEYS = {
  FAVORITES: 'rentsmart_favorites',
  HISTORY: 'rentsmart_history',
  COMPARE: 'rentsmart_compare',
  DEEP_ANALYSIS: 'rentsmart_deep_analysis',
  CHAT_SESSIONS: 'rentsmart_chat_sessions',
  PREFS: 'rentsmart_prefs',
  STATS: 'rentsmart_stats',
  API_CONFIG: 'rentsmart_api',
};

// ── 收藏夹 ────────────────────────────────────────────────────
export async function getFavorites(): Promise<Listing[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.FAVORITES);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function addFavorite(listing: Listing): Promise<Listing[]> {
  const favs = await getFavorites();
  if (favs.some(f => f.id === listing.id)) return favs;
  const updated = [listing, ...favs];
  await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(updated));
  await updateStats({ favorited: updated.length });

  // 事件驱动：收藏达到阈值时主动触发 Agent 提示
  if (updated.length === 3 || (updated.length >= 5 && updated.length % 2 === 1)) {
    emitAgentEvent('FAVORITES_THRESHOLD', { count: updated.length });
  }

  return updated;
}

export async function removeFavorite(id: string): Promise<Listing[]> {
  const favs = await getFavorites();
  const updated = favs.filter(f => f.id !== id);
  await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(updated));
  await updateStats({ favorited: updated.length });
  return updated;
}

export async function isFavorited(id: string): Promise<boolean> {
  const favs = await getFavorites();
  return favs.some(f => f.id === id);
}

export async function clearFavorites(): Promise<void> {
  await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify([]));
  await updateStats({ favorited: 0 });
}

// ── 历史记录（去重）────────────────────────────────────────────
export async function getHistory(): Promise<Listing[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function normalizeHistoryUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function listingFingerprint(item: Listing): string {
  const normalizedUrl = normalizeHistoryUrl(item.url);
  if (normalizedUrl) {
    return `url:${normalizedUrl}`;
  }
  return [
    'fallback',
    item.platform || 'unknown',
    item.cityCode || '',
    (item.community || '').trim().toLowerCase(),
    (item.district || '').trim().toLowerCase(),
    (item.roomType || '').trim().toLowerCase(),
    String(item.price || 0),
  ].join('|');
}

// 质量检查（第二道防线）
function isListingValid(listing: Listing): boolean {
  if (!listing.url || listing.url.length < 10) return false;
  if (!listing.price || listing.price < 300 || listing.price > 50000) return false;
  const title = (listing.title || '').trim();
  if (title.length < 4) return false;
  if (/^[\d\s元月]+$/.test(title)) return false;
  if (/^(未知|unknown)/i.test(title)) return false;
  const hasCommunity = listing.community && listing.community.length >= 2 && listing.community !== '未知小区';
  const hasDistrict = listing.district && listing.district.length >= 2 && listing.district !== '未知';
  if (!hasCommunity && !hasDistrict) return false;
  return true;
}

export async function addToHistory(listings: Listing[]): Promise<{ added: number; skipped: number }> {
  const history = await getHistory();
  const existingIds = new Set(history.map(h => h.id));
  const existingFingerprints = new Set(history.map(listingFingerprint));
  const incomingFingerprints = new Set<string>();
  const newOnes = listings.filter((l) => {
    // 质量检查（第二道防线）
    if (!isListingValid(l)) return false;
    if (existingIds.has(l.id)) return false;
    const fp = listingFingerprint(l);
    if (existingFingerprints.has(fp)) return false;
    if (incomingFingerprints.has(fp)) return false;
    incomingFingerprints.add(fp);
    return true;
  });
  const updated = [...newOnes, ...history].slice(0, 500);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  await updateStats({ analyzed: updated.length });
  return { added: newOnes.length, skipped: listings.length - newOnes.length };
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify([]));
  await updateStats({ analyzed: 0 });
}

export async function clearHistoryByCity(cityCode: string): Promise<number> {
  const history = await getHistory();
  const updated = history.filter(item => item.cityCode !== cityCode);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  await updateStats({ analyzed: updated.length });
  return history.length - updated.length;
}

export async function upsertHistoryListings(listings: Listing[]): Promise<void> {
  const history = await getHistory();
  const byId = new Map(history.map(item => [item.id, item]));
  for (const listing of listings) {
    byId.set(listing.id, { ...(byId.get(listing.id) || {}), ...listing });
  }

  const updated = Array.from(byId.values())
    .sort((a, b) => {
      const aTs = new Date(a.scrapedAt || 0).getTime();
      const bTs = new Date(b.scrapedAt || 0).getTime();
      return bTs - aTs;
    })
    .slice(0, 500);

  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
}

// ── 对比列表 ────────────────────────────────────────────────────
const MAX_COMPARE_ITEMS = 5;

export async function getCompareList(): Promise<Listing[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.COMPARE);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addToCompare(listing: Listing): Promise<Listing[]> {
  const current = await getCompareList();
  if (current.some(item => item.id === listing.id)) return current;

  // 限制最多 5 套，保留最近加入项
  const updated = [listing, ...current].slice(0, MAX_COMPARE_ITEMS);
  await AsyncStorage.setItem(KEYS.COMPARE, JSON.stringify(updated));
  return updated;
}

export async function removeFromCompare(id: string): Promise<Listing[]> {
  const current = await getCompareList();
  const updated = current.filter(item => item.id !== id);
  await AsyncStorage.setItem(KEYS.COMPARE, JSON.stringify(updated));
  return updated;
}

export async function clearCompare(): Promise<void> {
  await AsyncStorage.setItem(KEYS.COMPARE, JSON.stringify([]));
}

// ── 精筛记录 ────────────────────────────────────────────────────
export async function getDeepAnalysisRecords(): Promise<DeepAnalysisRecord[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.DEEP_ANALYSIS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveDeepAnalysisRecord(record: DeepAnalysisRecord): Promise<void> {
  const current = await getDeepAnalysisRecords();
  const filtered = current.filter(item => item.listingId !== record.listingId);
  const updated = [record, ...filtered].slice(0, 300);
  await AsyncStorage.setItem(KEYS.DEEP_ANALYSIS, JSON.stringify(updated));
  await updateStats({ deepAnalyzed: updated.length });
}

export async function clearDeepAnalysisRecords(): Promise<void> {
  await AsyncStorage.setItem(KEYS.DEEP_ANALYSIS, JSON.stringify([]));
  await updateStats({ deepAnalyzed: 0 });
}

// ── 聊天会话记录 ────────────────────────────────────────────────
export async function getChatSessions(): Promise<ChatSession[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.CHAT_SESSIONS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function upsertChatSession(session: ChatSession): Promise<void> {
  const sessions = await getChatSessions();
  const rest = sessions.filter(item => item.id !== session.id);
  const updated = [session, ...rest]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 100);
  await AsyncStorage.setItem(KEYS.CHAT_SESSIONS, JSON.stringify(updated));
}

export async function clearChatSessions(): Promise<void> {
  await AsyncStorage.setItem(KEYS.CHAT_SESSIONS, JSON.stringify([]));
}

// ── 用户偏好 ──────────────────────────────────────────────────
export async function getPrefs(): Promise<UserPrefs> {
  try {
    const data = await AsyncStorage.getItem(KEYS.PREFS);
    return data ? { ...DEFAULT_PREFS, ...JSON.parse(data) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}

export async function savePrefs(prefs: Partial<UserPrefs>): Promise<UserPrefs> {
  const current = await getPrefs();
  const updated = { ...current, ...prefs };
  await AsyncStorage.setItem(KEYS.PREFS, JSON.stringify(updated));
  return updated;
}

// ── 统计数据 ──────────────────────────────────────────────────
export async function getStats(): Promise<AppStats> {
  try {
    const data = await AsyncStorage.getItem(KEYS.STATS);
    return data ? JSON.parse(data) : { analyzed: 0, favorited: 0, deepAnalyzed: 0 };
  } catch { return { analyzed: 0, favorited: 0, deepAnalyzed: 0 }; }
}

async function updateStats(partial: Partial<AppStats>): Promise<void> {
  const stats = await getStats();
  await AsyncStorage.setItem(KEYS.STATS, JSON.stringify({ ...stats, ...partial }));
}

// ── API 配置 ──────────────────────────────────────────────────
/** 通勤路径规划方式（与高德 Web 服务路径规划一致，可在「我的」中修改） */
export type CommuteRouteMode = 'transit' | 'driving' | 'walking' | 'bicycling';

export type ApiConfig = {
  textModel: string;
  visionModel: string;
  apiKey: string;        // 兼容旧版字段
  deepseekApiKey?: string;
  glmApiKey?: string;
  apiBase: string;       // 自定义 OpenAI 兼容 Base URL
  amapKey: string;       // 高德地图 Web 服务 Key（REST 接口，用于地理编码/路径规划）
  amapJsKey?: string;    // 高德地图 Web JS API Key（用于地图 WebView 渲染）
  /** 默认公交地铁；可改为驾车/步行/骑行 */
  commuteRouteMode?: CommuteRouteMode;
};

const DEFAULT_API_CONFIG: ApiConfig = {
  textModel: 'deepseek',
  visionModel: 'glm4v',
  apiKey: 'sk-43641fd0f8104328a54bdceb818fb3bf',
  deepseekApiKey: 'sk-43641fd0f8104328a54bdceb818fb3bf',
  glmApiKey: 'f8b60c5307e04ead8b1071b40720e3ee.nMNUtT6WfmVPv0I5',
  apiBase: '',
  amapKey: '1beebb29ec2b17017ec1603083aef3c4',
  amapJsKey: '4447746781cb9aed094acc536da334df',
  commuteRouteMode: 'transit',
};

export async function getApiConfig(): Promise<ApiConfig> {
  try {
    const data = await AsyncStorage.getItem(KEYS.API_CONFIG);
    const merged: ApiConfig = data
      ? { ...DEFAULT_API_CONFIG, ...JSON.parse(data) }
      : DEFAULT_API_CONFIG;
    // 本地若曾保存空字符串，会覆盖内置高德 Web Key，导致通勤/地理编码误报「未配置」
    if (!String(merged.amapKey ?? '').trim()) {
      merged.amapKey = DEFAULT_API_CONFIG.amapKey;
    }
    if (!String(merged.amapJsKey ?? '').trim()) {
      merged.amapJsKey = DEFAULT_API_CONFIG.amapJsKey;
    }
    return merged;
  } catch {
    return DEFAULT_API_CONFIG;
  }
}

export async function saveApiConfig(config: Partial<ApiConfig>): Promise<void> {
  const current = await getApiConfig();
  await AsyncStorage.setItem(KEYS.API_CONFIG, JSON.stringify({ ...current, ...config }));
}
