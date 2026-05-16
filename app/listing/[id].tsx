import { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking, Clipboard, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import {
  getHistory, getFavorites, addFavorite, removeFavorite, getPrefs,
  getCompareList, addToCompare, removeFromCompare, clearDeepAnalysisRecords, saveDeepAnalysisRecord,
  type Listing,
} from '../lib/storage';
import { deepAnalyzeListing, isLikelyInvalidBeikePosterUrl } from '../lib/api';
import {
  buildListingSearchSnippet,
  detectListingSourceFromUrl,
  getListingExternalOpenDisclaimer,
  getListingWechatHintLines,
} from '../lib/listing-share-hints';
import { calculateCommute, buildListingDestinationCandidates, type CommuteResult } from '../lib/geo';
import { MarkdownView } from '../lib/markdown';
import { Colors, Typography, Spacing, Radius, Shadow } from '../lib/design';

// ── 精筛结果类型 ──────────────────────────────────────────────
type DeepAnalysis = {
  summary: string;
  pros: string[];
  cons: string[];
  risks: string[];
  suggestion: string;
  score: number;
};

// ── 精筛状态 ──────────────────────────────────────────────────
type AnalysisState = 'idle' | 'loading' | 'done' | 'error';

type TabKey = 'info' | 'browser' | 'analysis';

/** 从 WebView 抽取正文 + 设施词 + 配图 URL，postMessage 给 RN */
const INJECT_EXTRACT_PAGE_TEXT = `
  (function() {
    try {
      var text = ((document.body && document.body.innerText) || '').trim().slice(0, 5000);
      var facilities = [];
      var facilityWords = ['空调','冰箱','洗衣机','热水器','燃气','天然气','暖气','地暖','电梯','宽带','WiFi','wifi','衣柜','床','沙发','电视','书桌','电磁炉','微波炉','独卫','阳台','油烟机','洗碗机'];
      var i, w, u;
      for (i = 0; i < facilityWords.length; i++) {
        w = facilityWords[i];
        if (text.indexOf(w) >= 0 && facilities.indexOf(w) < 0) facilities.push(w);
      }
      var imgs = [];
      var nodes = document.querySelectorAll('img[src]');
      for (i = 0; i < nodes.length && imgs.length < 16; i++) {
        u = nodes[i].getAttribute('src');
        if (!u) continue;
        if (u.indexOf('//') === 0) u = 'https:' + u;
        if (u.indexOf('http') !== 0) continue;
        if (/\\.svg($|\\?)/i.test(u)) continue;
        if (imgs.indexOf(u) < 0) imgs.push(u);
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pageExtract',
        text: text,
        facilities: facilities,
        imageUrls: imgs.slice(0, 10)
      }));
    } catch(e) {}
  })();
  true;
`;

async function waitForWebPageText(
  getText: () => string,
  options: { minLen: number; timeoutMs: number; intervalMs: number },
): Promise<string> {
  const { minLen, timeoutMs, intervalMs } = options;
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const v = getText();
      if (v && v.trim().length >= minLen) {
        resolve(v);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(typeof v === 'string' ? v : '');
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function parseDeepAnalysis(raw: string, fallbackScore: number): DeepAnalysis {
  const cleaned = raw
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();

  const candidates = [cleaned];
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) candidates.push(jsonMatch[0]);

  for (const item of candidates) {
    try {
      const parsed = JSON.parse(item);
      return {
        summary: parsed.summary || '',
        pros: Array.isArray(parsed.pros) ? parsed.pros : [],
        cons: Array.isArray(parsed.cons) ? parsed.cons : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        suggestion: parsed.suggestion || '',
        score: Number(parsed.score) || fallbackScore || 0,
      };
    } catch {
      // continue
    }
  }

  return {
    summary: cleaned,
    pros: [],
    cons: [],
    risks: [],
    suggestion: '',
    score: fallbackScore || 0,
  };
}

export default function ListingDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadFinished, setLoadFinished] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [isInCompare, setIsInCompare] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [analysis, setAnalysis] = useState<DeepAnalysis | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webPageContent, setWebPageContent] = useState<string>('');
  const webPageContentRef = useRef<string>('');
  const pageExtractExtrasRef = useRef<{ facilities: string[]; imageUrls: string[] }>({
    facilities: [],
    imageUrls: [],
  });
  const [commute, setCommute] = useState<CommuteResult | null>(null);
  const [workAddressConfigured, setWorkAddressConfigured] = useState(false);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const loadListing = useCallback(async () => {
    setLoadFinished(false);
    webPageContentRef.current = '';
    pageExtractExtrasRef.current = { facilities: [], imageUrls: [] };
    setWebPageContent('');
    // 先从历史里找，再从收藏里找
    const history = await getHistory();
    const favs = await getFavorites();
    const compares = await getCompareList();
    const found = [...history, ...favs, ...compares].find(l => l.id === id);
    if (found) {
      setListing(found);
      const isFavNow = favs.some(f => f.id === id);
      setIsFav(isFavNow);
      
      // 检查是否在对比列表中
      const compareList = await getCompareList();
      setIsInCompare(compareList.some(c => c.id === id));
      
      // 加载通勤信息
      loadCommute(found);
    }
    setLoadFinished(true);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadListing();
    }, [loadListing])
  );

  async function loadCommute(target: Listing) {
    try {
      const prefs = await getPrefs();
      const workAddress = (prefs.workAddress || '').trim();
      setWorkAddressConfigured(Boolean(workAddress));
      if (!workAddress) {
        setCommute(null);
        return;
      }
      setCommuteLoading(true);

      const cityCode = target.cityCode || prefs.city || 'bj';
      const candidates = buildListingDestinationCandidates(target);
      if (!candidates.length) {
        setCommute({
          distance: '',
          duration: '',
          success: false,
          errorReason: '房源缺少可用于估算的地址信息',
        });
        setCommuteLoading(false);
        return;
      }

      const [primary, ...fallbacks] = candidates;
      const result = await calculateCommute(workAddress, primary, cityCode, fallbacks);
      setCommute(result);
    } catch (error) {
      console.error('通勤计算异常:', error);
      setCommute({ distance: '', duration: '', success: false });
    } finally {
      setCommuteLoading(false);
    }
  }

  async function toggleFav() {
    if (!listing) return;
    if (isFav) {
      await removeFavorite(listing.id);
      setIsFav(false);
    } else {
      await addFavorite(listing);
      setIsFav(true);
    }
  }

  async function toggleCompare() {
    if (!listing) return;
    if (isInCompare) {
      await removeFromCompare(listing.id);
      setIsInCompare(false);
      Alert.alert('提示', '已从对比列表中移除');
    } else {
      const currentList = await getCompareList();
      if (currentList.length >= 5) {
        Alert.alert('提示', '最多只能对比 5 套房源\n请先移除其他房源', [
          { text: '知道了', style: 'cancel' },
          { text: '去对比', onPress: () => router.push('/compare') },
        ]);
        return;
      }
      await addToCompare(listing);
      setIsInCompare(true);
      const newCount = currentList.length + 1;
      Alert.alert('已加入对比', `当前对比 ${newCount}/5 套房源`, [
        { text: '继续查看', style: 'cancel' },
        { text: '去对比', onPress: () => router.push('/compare') },
      ]);
    }
  }

  async function runDeepAnalysis(incomingPageContent?: string) {
    if (!listing) return;

    setAnalysisState('loading');
    setActiveTab('analysis');

    try {
      const prefs = await getPrefs();
      let content =
        typeof incomingPageContent === 'string' && incomingPageContent.trim().length > 0
          ? incomingPageContent
          : webPageContentRef.current || webPageContent;
      if (typeof content !== 'string') content = '';

      if ((!content || content.trim().length < 30) && listing.url?.trim()) {
        webViewRef.current?.injectJavaScript(INJECT_EXTRACT_PAGE_TEXT);
        content = await waitForWebPageText(() => webPageContentRef.current, {
          minLen: 30,
          timeoutMs: 22000,
          intervalMs: 350,
        });
        if (content.trim().length >= 30) {
          webPageContentRef.current = content;
          setWebPageContent(content);
        }
      }

      const pageForModel = content.trim().length >= 30 ? content : undefined;
      const raw = await deepAnalyzeListing(
        listing,
        prefs,
        undefined,
        pageForModel,
        pageExtractExtrasRef.current,
      );
      const parsed = parseDeepAnalysis(raw, listing.aiScore);
      setAnalysis(parsed);
      await saveDeepAnalysisRecord({
        listingId: listing.id,
        title: listing.title,
        score: parsed.score,
        summary: parsed.summary,
        raw,
        createdAt: new Date().toISOString(),
      });
      setAnalysisState('done');
    } catch (error: any) {
      console.error('[详情页] 精筛失败:', error);
      setAnalysisState('error');
      Alert.alert('精筛失败', error?.message || '请检查 API Key 配置或网络连接');
    }
  }

  if (!listing && !loadFinished) {
    return (
      <SafeAreaView style={s.safe} edges={Platform.OS === 'android' ? [] : ['top']}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#00ae66" />
          <Text style={s.loadingText}>加载中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing && loadFinished) {
    return (
      <SafeAreaView style={s.safe} edges={Platform.OS === 'android' ? [] : ['top']}>
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyTitle}>未找到该房源</Text>
          <Text style={s.emptyDesc}>该房源可能已被清理，请返回列表重新选择</Text>
          <TouchableOpacity style={s.deepBtn} onPress={() => router.replace('/search')}>
            <Text style={s.deepBtnText}>返回找房</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return null;
  }

  return (
    <SafeAreaView style={s.safe} edges={Platform.OS === 'android' ? [] : ['top']}>
      {/* 顶部导航栏 */}
      <View style={s.navbar}>
        <TouchableOpacity style={s.navBack} onPress={() => router.back()}>
          <Text style={s.navBackText}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{listing.community || '房源详情'}</Text>
        <View style={s.navActions}>
          <TouchableOpacity style={s.navCompare} onPress={toggleCompare}>
            <Text style={s.navCompareText}>{isInCompare ? '📊' : '📋'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.navFav} onPress={toggleFav}>
            <Text style={s.navFavText}>{isFav ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab 切换 */}
      <View style={s.tabBar}>
        {([
          { key: 'info', label: '📋 基本信息' },
          { key: 'browser', label: '🌐 原始页面' },
          { key: 'analysis', label: '🔬 精筛报告' },
        ] as { key: TabKey; label: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tabItem, activeTab === tab.key && s.tabItemActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabLabel, activeTab === tab.key && s.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 内容区域：原始页 WebView 有链接时始终在后台挂载，便于未切 Tab 也能抓取正文做精筛 */}
      <View style={{ flex: 1, position: 'relative' }}>
        {activeTab === 'info' && (
          <View style={{ flex: 1, zIndex: 1, backgroundColor: Colors.bgSecondary }}>
            <InfoTab
              listing={listing}
              commute={commute}
              workAddressConfigured={workAddressConfigured}
              commuteLoading={commuteLoading}
              onStartAnalysis={runDeepAnalysis}
            />
          </View>
        )}
        {activeTab === 'analysis' && (
          <View style={{ flex: 1, zIndex: 1, backgroundColor: Colors.bgSecondary }}>
            <AnalysisTab
              state={analysisState}
              analysis={analysis}
              listing={listing}
              onRetry={runDeepAnalysis}
              onClearDeepRecords={async () => {
                await clearDeepAnalysisRecords();
                Alert.alert('完成', '已精筛记录缓存已清空');
              }}
            />
          </View>
        )}
        {listing.url?.trim() ? (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { opacity: activeTab === 'browser' ? 1 : 0 },
              activeTab === 'browser' ? { zIndex: 2 } : { zIndex: 0 },
            ]}
            pointerEvents={activeTab === 'browser' ? 'auto' : 'none'}
          >
            <BrowserTab
              url={listing.url}
              webViewRef={webViewRef}
              loading={webLoading}
              setLoading={setWebLoading}
              onStartAnalysis={runDeepAnalysis}
              onPageExtract={(payload) => {
                webPageContentRef.current = payload.text;
                pageExtractExtrasRef.current = {
                  facilities: payload.facilities,
                  imageUrls: payload.imageUrls,
                };
                setWebPageContent(payload.text);
              }}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// ── 基本信息 Tab ──────────────────────────────────────────────
function InfoTab({
  listing,
  commute,
  workAddressConfigured,
  commuteLoading,
  onStartAnalysis,
}: {
  listing: Listing;
  commute: CommuteResult | null;
  workAddressConfigured: boolean;
  commuteLoading: boolean;
  onStartAnalysis: () => void;
}) {
  const urlStr = String(listing.url || '').trim();
  const hasHttpUrl = urlStr.startsWith('http');
  const searchSnippet = buildListingSearchSnippet({
    title: listing.title,
    community: listing.community,
    district: listing.district,
    roomType: listing.roomType,
    price: listing.price,
  });
  const hintSource = hasHttpUrl
    ? detectListingSourceFromUrl(urlStr)
    : listing.platform === 'beike'
      ? 'beike'
      : listing.platform === 'anjuke'
        ? 'anjuke'
        : 'generic';
  const hintLine = getListingWechatHintLines(hintSource);

  return (
    <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
      {/* 价格 + 评分 */}
      <View style={s.priceRow}>
        <View>
          <Text style={s.price}>
            {listing.price}
            <Text style={s.priceUnit}> 元/月</Text>
          </Text>
          {listing.scrapedAt && (
            <Text style={s.scrapedAt}>
              📡 {listing.platform === 'anjuke' ? '安居客' : listing.platform === 'beike' ? '贝壳' : '未知来源'}
              · {new Date(listing.scrapedAt).toLocaleDateString()}
            </Text>
          )}
          {commuteLoading && (
            <Text style={s.commuteText}>计算通勤中...</Text>
          )}
          {!commuteLoading && workAddressConfigured && commute?.success && (
            <Text style={s.commuteText}>
              📍 通勤：{commute.distance}｜预计 {commute.duration.replace('分钟', ' 分钟')}
              {commute.routeModeLabel ? `（${commute.routeModeLabel}）` : '（公共交通）'}
            </Text>
          )}
          {!commuteLoading && !workAddressConfigured && (
            <Text style={s.commuteError}>📍 通勤时间：未设置常去地址，前往设置页配置</Text>
          )}
          {!commuteLoading && workAddressConfigured && commute && !commute.success && (
            <View style={s.commuteFailWrap}>
              <Text style={s.commuteMuted}>
                通勤：暂无法估算出行时间（地图对部分小区名称无法精确匹配，属正常情况）。
              </Text>
              {commute.errorReason ? (
                <Text style={s.commuteFailDetail} numberOfLines={2}>
                  {commute.errorReason}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        {listing.aiScore > 0 && (
          <View style={[s.scoreBadge, listing.aiScore >= 8 ? s.scoreHigh : listing.aiScore >= 6 ? s.scoreMid : s.scoreLow]}>
            <Text style={s.scoreVal}>AI {listing.aiScore.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* 标题 */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>房源信息</Text>
        <Text style={s.infoTitle}>{listing.title}</Text>

        <View style={s.infoGrid}>
          <InfoItem icon="🏠" label="户型" value={listing.roomType} />
          <InfoItem icon="📐" label="面积" value={listing.area} />
          <InfoItem icon="🏢" label="楼层" value={listing.floor} />
          <InfoItem icon="📍" label="小区" value={listing.community} />
          <InfoItem icon="🗺" label="区域" value={listing.district} />
          <InfoItem icon="💰" label="价格" value={`${listing.price} 元/月`} />
        </View>
      </View>

      {/* 标签 */}
      {listing.tags.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>房源标签</Text>
          <View style={s.tagWrap}>
            {listing.tags.map((tag, index) => (
              <View key={`${listing.id}-tag-${index}-${tag}`} style={s.tag}>
                <Text style={s.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* AI 初筛点评 */}
      {listing.aiComment && listing.aiComment !== '待分析' && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>🤖 AI 初筛点评</Text>
          <View style={s.aiComment}>
            <Text style={s.aiCommentText}>{listing.aiComment}</Text>
          </View>
        </View>
      )}

      {/* 操作按钮 */}
      <View style={s.actionArea}>
        <TouchableOpacity style={s.deepBtn} onPress={onStartAnalysis}>
          <Text style={s.deepBtnText}>开始精筛分析</Text>
        </TouchableOpacity>
        {listing.url ? (
          <>
            {isLikelyInvalidBeikePosterUrl(listing.url) ? (
              <Text style={s.linkStubHint}>
                链接可能不完整。建议在贝壳 App 内重新复制分享链接。
              </Text>
            ) : null}
            <Text style={s.externalDisclaimerText}>{getListingExternalOpenDisclaimer()}</Text>
            <View style={s.externalLinkRow}>
              <TouchableOpacity
                style={[s.copyLinkBtn, s.externalLinkHalf]}
                onPress={() => {
                  Clipboard.setString(listing.url!);
                  Alert.alert('已复制', '链接已复制，请在微信中粘贴打开查看真实房源详情');
                }}
              >
                <Text style={s.copyLinkBtnText} numberOfLines={2}>复制链接 · 微信</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.srcBtn, s.externalLinkHalf]}
                onPress={() => Linking.openURL(listing.url!)}
              >
                <Text style={s.srcBtnText} numberOfLines={2}>系统浏览器打开</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.listingLinkHint}>{hintLine}</Text>
            {searchSnippet ? (
              <TouchableOpacity
                style={s.copySnippetBtn}
                onPress={() => {
                  Clipboard.setString(searchSnippet);
                  Alert.alert('已复制', '房源标题已复制，请在官方 App 搜索栏长按粘贴');
                }}
              >
                <Text style={s.copySnippetBtnText}>复制标题 · App 搜索</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}
        {!listing.url && searchSnippet ? (
          <>
            <Text style={s.listingLinkHint}>{hintLine}</Text>
            <TouchableOpacity
              style={s.copySnippetBtn}
              onPress={() => {
                Clipboard.setString(searchSnippet);
                Alert.alert('已复制', '房源标题已复制，请在官方 App 搜索栏长按粘贴');
              }}
            >
              <Text style={s.copySnippetBtnText}>复制标题 · App 搜索</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.infoItem}>
      <Text style={s.infoIcon}>{icon}</Text>
      <View>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value || '未知'}</Text>
      </View>
    </View>
  );
}

// ── 原始页面 Tab ──────────────────────────────────────────────
function BrowserTab({
  url,
  webViewRef,
  loading,
  setLoading,
  onStartAnalysis,
  onPageExtract,
}: {
  url?: string;
  webViewRef: React.RefObject<WebView | null>;
  loading: boolean;
  setLoading: (v: boolean) => void;
  onStartAnalysis: (pageContent?: string) => void;
  onPageExtract: (payload: { text: string; facilities: string[]; imageUrls: string[] }) => void;
}) {
  // Hooks 必须在组件顶部调用，不能在条件分支后
  const [extractBundle, setExtractBundle] = useState<{
    text: string;
    facilities: string[];
    imageUrls: string[];
  } | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);

  if (!url || !url.trim()) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyIcon}>🔗</Text>
        <Text style={s.emptyTitle}>没有原始链接</Text>
        <Text style={s.emptyDesc}>
          海报中未识别到有效房源链接。{'\n'}
          可确保海报二维码清晰后重新上传，或手动在贝壳 App 内复制链接。
        </Text>
      </View>
    );
  }

  // 微信浏览器 User-Agent，用于绕过贝壳等平台的 WebView 检测
  const wechatUA = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.40.2420(0x28002851) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64';
  const stubUrl = isLikelyInvalidBeikePosterUrl(url);

  function handleMessage(e: any) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'pageExtract') {
        const text = String(msg.text || '').trim();
        const facilities = Array.isArray(msg.facilities)
          ? msg.facilities.filter((x: unknown) => typeof x === 'string')
          : [];
        const imageUrls = Array.isArray(msg.imageUrls)
          ? msg.imageUrls.filter((x: unknown) => typeof x === 'string')
          : [];
        if (text.length > 30 || facilities.length > 0 || imageUrls.length > 0) {
          setExtractBundle({ text, facilities, imageUrls });
          onPageExtract({ text, facilities, imageUrls });
        }
        return;
      }
      if (msg.type === 'pageContent' && msg.content && String(msg.content).trim().length > 30) {
        const t = String(msg.content).trim();
        setExtractBundle({ text: t, facilities: [], imageUrls: [] });
        onPageExtract({ text: t, facilities: [], imageUrls: [] });
      }
    } catch {}
  }

  function hasUsefulExtract(b: typeof extractBundle): b is NonNullable<typeof extractBundle> {
    return Boolean(
      b && (b.text.trim().length > 30 || b.facilities.length > 0 || b.imageUrls.length > 0),
    );
  }

  function handleAnalysis() {
    if (hasUsefulExtract(extractBundle)) {
      onStartAnalysis(extractBundle.text.trim().length >= 30 ? extractBundle.text : undefined);
    } else if (pageLoaded) {
      // 页面已加载，手动触发提取后再分析
      webViewRef.current?.injectJavaScript(INJECT_EXTRACT_PAGE_TEXT);
      setTimeout(() => onStartAnalysis(), 800);
    } else {
      // 页面未加载成功，直接分析（基于结构化数据）
      onStartAnalysis();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {stubUrl ? (
        <View style={s.browserStubBanner}>
          <Text style={s.browserStubBannerText}>
            若网页空白或提示「页面不见了」，可能是海报二维码未被识别到完整链接，或房源已下架。可在浏览器中手动搜索查找。
          </Text>
        </View>
      ) : null}
      {extractBundle && hasUsefulExtract(extractBundle) ? (
        <View style={s.pageContentBanner}>
          <Text style={s.pageContentBannerText}>✅ 已获取页面内容，精筛将基于真实页面分析</Text>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        source={{ 
          uri: url,
          headers: { 'Referer': 'https://m.ke.com/' }
        }}
        userAgent={wechatUA}
        onLoadStart={() => { setLoading(true); setPageLoaded(false); }}
        onLoad={() => {
          // 只在真正成功加载时提取内容
          setLoading(false);
          setPageLoaded(true);
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(INJECT_EXTRACT_PAGE_TEXT);
          }, 500);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setPageLoaded(false); }}
        onMessage={handleMessage}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        renderLoading={() => (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color="#00ae66" />
            <Text style={s.loadingText}>加载原始页面...</Text>
          </View>
        )}
      />
      <View style={s.browserFooter}>
        <TouchableOpacity 
          style={[s.deepBtn, { flex: 1, marginRight: 8, backgroundColor: '#555' }]} 
          onPress={() => Linking.openURL(url)}
        >
          <Text style={s.deepBtnText}>🌐 浏览器打开</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[s.deepBtn, { flex: 1 }]} 
          onPress={handleAnalysis}
        >
          <Text style={s.deepBtnText}>🔬 精筛分析</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── 精筛报告 Tab ──────────────────────────────────────────────
function AnalysisTab({
  state,
  analysis,
  listing,
  onRetry,
  onClearDeepRecords,
}: {
  state: AnalysisState;
  analysis: DeepAnalysis | null;
  listing: Listing;
  onRetry: () => void;
  onClearDeepRecords: () => void;
}) {
  if (state === 'idle') {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyIcon}>🔬</Text>
        <Text style={s.emptyTitle}>尚未进行精筛</Text>
        <Text style={s.emptyDesc}>点击下方按钮，AI 将深度分析这套房源的优缺点、隐藏风险与话术陷阱</Text>
        <TouchableOpacity style={s.deepBtn} onPress={onRetry}>
          <Text style={s.deepBtnText}>开始精筛分析</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'loading') {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color="#00ae66" />
        <Text style={s.loadingText}>AI 正在深度分析中...</Text>
        <Text style={s.loadingSubText}>正在从原始链接拉取页面正文（后台加载），随后结合详情做分析</Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyIcon}>⚠️</Text>
        <Text style={s.emptyTitle}>分析失败</Text>
        <Text style={s.emptyDesc}>请检查「我的」页面中的 API Key 配置</Text>
        <TouchableOpacity style={s.deepBtn} onPress={onRetry}>
          <Text style={s.deepBtnText}>重新分析</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!analysis) return null;

  return (
    <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
      {/* 综合评分 */}
      <View style={[s.card, s.analysisScoreCard]}>
        <View style={s.analysisScoreLeft}>
          <Text style={s.analysisScoreLabel}>精筛评分</Text>
          <Text style={s.analysisScoreNum}>{analysis.score.toFixed(1)}</Text>
          <Text style={s.analysisScoreSub}>/ 10</Text>
        </View>
        <View style={s.analysisScoreRight}>
          <MarkdownView content={analysis.summary} />
        </View>
      </View>

      {/* 优点 */}
      {analysis.pros.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>✅ 优点</Text>
          {analysis.pros.map((pro, i) => (
            <View key={i} style={s.listItem}>
              <Text style={s.listDot}>·</Text>
              <Text style={s.listText}>{pro}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 缺点 */}
      {analysis.cons.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>⚠️ 缺点</Text>
          {analysis.cons.map((con, i) => (
            <View key={i} style={s.listItem}>
              <Text style={s.listDot}>·</Text>
              <Text style={s.listText}>{con}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 风险/话术 */}
      {analysis.risks.length > 0 && (
        <View style={[s.card, s.riskCard]}>
          <Text style={[s.sectionTitle, { color: '#e74c3c' }]}>🚨 风险与话术识别</Text>
          {analysis.risks.map((risk, i) => (
            <View key={i} style={s.listItem}>
              <Text style={[s.listDot, { color: '#e74c3c' }]}>!</Text>
              <Text style={[s.listText, { color: '#c0392b' }]}>{risk}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 建议 */}
      {analysis.suggestion ? (
        <View style={[s.card, s.suggestionCard]}>
          <Text style={s.sectionTitle}>💡 AI 建议</Text>
          <Text style={s.suggestionText}>{analysis.suggestion}</Text>
        </View>
      ) : null}

      {/* 重新分析 */}
      <View style={s.actionArea}>
        <TouchableOpacity style={s.retryAnalysisBtn} onPress={onRetry}>
          <Text style={s.retryAnalysisBtnText}>🔄 重新分析</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.clearDeepBtn}
          onPress={() =>
            Alert.alert('确认清空', '确认清空全部已精筛记录缓存吗？', [
              { text: '取消', style: 'cancel' },
              { text: '清空', style: 'destructive', onPress: onClearDeepRecords },
            ])
          }
        >
          <Text style={s.clearDeepBtnText}>🗑 清空已精筛记录</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── 样式 ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgSecondary },

  navbar: {
    backgroundColor: Colors.bgPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  navBack: { padding: Spacing.xs, marginRight: Spacing.md },
  navBackText: { fontSize: 22, color: Colors.primary, fontWeight: '600' },
  navTitle: { flex: 1, ...Typography.h3, color: Colors.textPrimary },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  navCompare: { padding: Spacing.xs },
  navCompareText: { fontSize: 20 },
  navFav: { padding: Spacing.xs },
  navFavText: { fontSize: 22 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tabItem: {
    flex: 1,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: Colors.primary },
  tabLabel: { ...Typography.label, color: Colors.textSecondary, fontWeight: '500' },
  tabLabelActive: { color: Colors.primary, fontWeight: '700' },

  content: { flex: 1 },

  card: {
    backgroundColor: Colors.bgPrimary,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.xs,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },

  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  price: { fontSize: 26, fontWeight: '800', color: '#fe5500' },
  priceUnit: { fontSize: 14, fontWeight: '400', color: Colors.textSecondary },
  scrapedAt: { ...Typography.labelSmall, color: Colors.textTertiary, marginTop: Spacing.xs },
  commuteText: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.xs },
  commuteError: { ...Typography.labelSmall, color: Colors.warning, marginTop: Spacing.xs },
  commuteFailWrap: { marginTop: Spacing.xs },
  commuteMuted: { ...Typography.labelSmall, color: Colors.textSecondary, lineHeight: 18 },
  commuteFailDetail: { ...Typography.labelSmall, color: Colors.textTertiary, marginTop: 4, lineHeight: 16 },
  scoreBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
  },
  scoreHigh: { backgroundColor: Colors.primaryLight },
  scoreMid: { backgroundColor: '#fff8e6' },
  scoreLow: { backgroundColor: '#fff0f0' },
  scoreVal: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  infoTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  infoItem: { flexDirection: 'row', alignItems: 'flex-start', width: '46%', gap: Spacing.md },
  infoIcon: { fontSize: 16, marginTop: 1 },
  infoLabel: { ...Typography.label, color: Colors.textSecondary },
  infoValue: { ...Typography.body2, color: Colors.textPrimary, marginTop: Spacing.xs, fontWeight: '600' },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: '#c8eddc',
  },
  tagText: { fontSize: 12, color: Colors.primary },

  aiComment: { backgroundColor: Colors.bgSecondary, borderRadius: Radius.md, padding: Spacing.md },
  aiCommentText: { ...Typography.body2, color: Colors.textSecondary, lineHeight: 20 },

  actionArea: { margin: Spacing.md, gap: Spacing.md },
  externalDisclaimerText: {
    ...Typography.labelSmall,
    lineHeight: 15,
    color: Colors.textSecondary,
  },
  externalLinkRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'stretch' },
  externalLinkHalf: { flex: 1, minWidth: 0 },
  deepBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  deepBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textInverse },
  copyLinkBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: '#b8e0cc',
  },
  copyLinkBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  listingLinkHint: {
    marginTop: Spacing.md,
    ...Typography.labelSmall,
    lineHeight: 16,
    color: Colors.textSecondary,
  },
  copySnippetBtn: {
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  copySnippetBtnText: { ...Typography.h4, color: Colors.textSecondary, fontWeight: '600' },
  srcBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  srcBtnText: { ...Typography.h4, color: Colors.textSecondary },

  // 精筛报告
  analysisScoreCard: { flexDirection: 'row', alignItems: 'center' },
  analysisScoreLeft: { alignItems: 'center', marginRight: Spacing.lg },
  analysisScoreLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.xs },
  analysisScoreNum: { fontSize: 40, fontWeight: '800', color: Colors.primary },
  analysisScoreSub: { ...Typography.label, color: Colors.textTertiary },
  analysisScoreRight: { flex: 1 },
  analysisSummary: { ...Typography.body1, color: Colors.textPrimary, lineHeight: 22 },

  listItem: { flexDirection: 'row', marginBottom: Spacing.md, alignItems: 'flex-start' },
  listDot: { fontSize: 16, color: Colors.primary, marginRight: Spacing.md, marginTop: -1 },
  listText: { ...Typography.body2, color: Colors.textSecondary, lineHeight: 20, flex: 1 },

  riskCard: { borderWidth: 1, borderColor: '#ffd5d5' },
  suggestionCard: { backgroundColor: Colors.primaryLight },
  suggestionText: { fontSize: 14, color: Colors.primary, lineHeight: 22 },

  retryAnalysisBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  retryAnalysisBtnText: { ...Typography.h4, color: Colors.textSecondary },
  clearDeepBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd9d9',
    backgroundColor: '#fff5f5',
  },
  clearDeepBtnText: { fontSize: 14, color: Colors.error, fontWeight: '600' },

  linkStubHint: {
    ...Typography.body2,
    color: Colors.warning,
    lineHeight: 18,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  pageContentBanner: {
    backgroundColor: Colors.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: '#b8e0cc',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pageContentBannerText: {
    ...Typography.body2,
    color: Colors.primary,
    fontWeight: '600',
  },
  browserStubBanner: {
    backgroundColor: '#fff8e6',
    borderBottomWidth: 1,
    borderBottomColor: '#ffe0a3',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  browserStubBannerText: {
    ...Typography.body2,
    color: '#8a5a00',
    lineHeight: 18,
  },

  // 浏览器
  browserFooter: {
    backgroundColor: Colors.bgPrimary,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    flexDirection: 'row',
    gap: Spacing.md,
  },

  // 空态
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingBottom: 60,
  },
  emptyIcon: { fontSize: 52, marginBottom: Spacing.lg },
  emptyTitle: { ...Typography.h2, color: Colors.textPrimary, marginBottom: Spacing.md },
  emptyDesc: { ...Typography.body2, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },

  // 加载态
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgPrimary,
  },
  loadingText: { ...Typography.h3, color: Colors.textSecondary, marginTop: Spacing.lg, fontWeight: '600' },
  loadingSubText: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.md, textAlign: 'center' },
});
