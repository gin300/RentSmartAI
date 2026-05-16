import AsyncStorage from '@react-native-async-storage/async-storage';

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
  aiScore: number;
  aiComment: string;
  url?: string;
  imageUrl?: string;
  platform?: string;
  scrapedAt?: string;
};

export type UserPrefs = {
  city: string;
  cityLabel: string;
  budgetMin: string;
  budgetMax: string;
  district: string;
  commuteAddr: string;
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
};

// ── 存储 Key ──────────────────────────────────────────────────
const KEYS = {
  FAVORITES: 'rentsmart_favorites',
  HISTORY: 'rentsmart_history',
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

// ── 历史记录（去重）────────────────────────────────────────────
export async function getHistory(): Promise<Listing[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function addToHistory(listings: Listing[]): Promise<{ added: number; skipped: number }> {
  const history = await getHistory();
  const existingIds = new Set(history.map(h => h.id));
  const newOnes = listings.filter(l => !existingIds.has(l.id));
  const updated = [...newOnes, ...history].slice(0, 500);
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify(updated));
  await updateStats({ analyzed: updated.length });
  return { added: newOnes.length, skipped: listings.length - newOnes.length };
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.setItem(KEYS.HISTORY, JSON.stringify([]));
  await updateStats({ analyzed: 0 });
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
export type ApiConfig = {
  textModel: string;
  visionModel: string;
  apiKey: string;
  apiBase: string;
};

export async function getApiConfig(): Promise<ApiConfig> {
  try {
    const data = await AsyncStorage.getItem(KEYS.API_CONFIG);
    return data ? JSON.parse(data) : { textModel: 'deepseek', visionModel: 'glm4v', apiKey: '', apiBase: '' };
  } catch { return { textModel: 'deepseek', visionModel: 'glm4v', apiKey: '', apiBase: '' }; }
}

export async function saveApiConfig(config: Partial<ApiConfig>): Promise<void> {
  const current = await getApiConfig();
  await AsyncStorage.setItem(KEYS.API_CONFIG, JSON.stringify({ ...current, ...config }));
}
