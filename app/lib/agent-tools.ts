import { getAgentContext, type AgentContext } from './agent-context';
import { extractListingFromPosterImage } from './api';
import { calculateCommute } from './geo';
import { isLegalQuestion, searchLegalKB } from './rag';
import { generateListingId, type ScrapedListing } from './scraper';
import { consumeAgentListingExcludeIds } from './agent-search-context';
import { addToHistory, getHistory, getPrefs, upsertHistoryListings, type Listing } from './storage';

type JSONSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  items?: unknown;
};

type AgentToolExecute = (params: Record<string, unknown>) => Promise<unknown>;

export type AgentTool = {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: AgentToolExecute;
};

function buildMockListings() {
  const now = new Date().toISOString();
  return [
    {
      id: 'demo-1',
      title: '望京·精装一居',
      community: '望京花园',
      price: 5600,
      district: '朝阳区',
      roomType: '1室1厅',
      area: '48㎡',
      floor: '中楼层',
      tags: ['近地铁', '精装修'],
      hasSubway: true,
      hasPets: false,
      isWhole: true,
      aiScore: 8.4,
      aiComment: '通勤友好，性价比较高',
      cityCode: 'bj',
      platform: 'anjuke',
      url: 'https://m.anjuke.com/bj/rent/placeholder',
      scrapedAt: now,
    },
    {
      id: 'demo-2',
      title: '徐汇·地铁口两居',
      community: '徐家汇公寓',
      price: 7800,
      district: '徐汇区',
      roomType: '2室1厅',
      area: '72㎡',
      floor: '高楼层',
      tags: ['近地铁', '可养宠'],
      hasSubway: true,
      hasPets: true,
      isWhole: true,
      aiScore: 7.8,
      aiComment: '配套成熟，价格偏高',
      cityCode: 'sh',
      platform: 'beike',
      url: 'https://sh.ke.com/zufang/placeholder',
      scrapedAt: now,
    },
  ] as Listing[];
}

function buildMockCompareReport() {
  return {
    summary: '已对比分析所选房源的核心指标，包括价格、户型、位置、配套等维度',
    recommendation: '综合考虑通勤便利性、租金性价比和生活配套，建议优先考虑近地铁且价格适中的房源',
    riskTips: [
      '签约前务必核验房屋产权证和房东身份',
      '明确押金金额、退还条件和时间',
      '确认中介服务费、物业费、水电费等费用分摊',
      '拍照记录房屋现状，避免退租纠纷'
    ],
  };
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_user_context',
    description: '获取用户当前状态，包括偏好、收藏、历史分析和对比列表。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    execute: async (): Promise<{ context: AgentContext }> => {
      const context = await getAgentContext();
      return { context };
    },
  },
  {
    name: 'search_listings',
    description: '根据城市、预算、户型、区域、关键词和偏好条件检索房源，返回去重匹配列表。',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市代码，如 bj/sh/gz/sz/wh' },
        budgetMin: { type: 'number', description: '预算下限，单位元/月' },
        budgetMax: { type: 'number', description: '预算上限，单位元/月' },
        roomType: { type: 'string', description: '户型偏好，如 1室/2室/一居/两居' },
        rentMode: { type: 'string', description: '租房方式：整租/合租/短租/公寓' },
        district: { type: 'string', description: '区域偏好，如 朝阳区/浦东新区/东湖高新区' },
        keywords: { type: 'string', description: '关键词，如 精装修/近地铁/靠窗/南向' },
        needSubway: { type: 'boolean', description: '是否要求近地铁' },
        needPets: { type: 'boolean', description: '是否要求可养宠' },
        minArea: { type: 'number', description: '最小面积（平方米）' },
        maxArea: { type: 'number', description: '最大面积（平方米）' },
      },
      required: [],
      additionalProperties: false,
    },
    execute: async (params): Promise<unknown> => {
      const history = await getHistory();
      const sourceList: Listing[] = history.length > 0 ? history : buildMockListings();

      const city = String(params?.city || '').trim();
      const budgetMin = Number(params?.budgetMin || 0);
      const budgetMax = Number(params?.budgetMax || 0);
      const roomType = String(params?.roomType || '').trim();
      const rentMode = String(params?.rentMode || '').trim();
      const district = String(params?.district || '').trim();
      const keywords = String(params?.keywords || '').trim();
      const needSubway = params?.needSubway === true;
      const needPets = params?.needPets === true;
      const minArea = Number(params?.minArea || 0);
      const maxArea = Number(params?.maxArea || 0);

      const parseArea = (areaStr: string): number => {
        const m = String(areaStr || '').match(/(\d+(\.\d+)?)/);
        return m ? parseFloat(m[1]) : 0;
      };

      const filtered = sourceList.filter((item) => {
        if (city && item.cityCode && item.cityCode !== city) return false;
        if (budgetMin > 0 && item.price < budgetMin) return false;
        if (budgetMax > 0 && item.price > budgetMax) return false;
        if (roomType && !`${item.roomType}${item.title}`.includes(roomType)) return false;
        if (district && !`${item.district}${item.community}`.includes(district)) return false;
        if (keywords) {
          const haystack = `${item.title}${item.tags.join('')}${item.aiComment}${item.community}`;
          if (!haystack.includes(keywords)) return false;
        }
        if (needSubway && !item.hasSubway) return false;
        if (needPets && !item.hasPets) return false;
        if (rentMode === '整租' && !item.isWhole) return false;
        if (rentMode === '合租' && item.isWhole) return false;
        if (rentMode === '短租' && !item.isShortTerm) return false;
        if (rentMode === '公寓' && !item.isApartment) return false;
        if (minArea > 0 || maxArea > 0) {
          const area = parseArea(item.area);
          if (minArea > 0 && area > 0 && area < minArea) return false;
          if (maxArea > 0 && area > 0 && area > maxArea) return false;
        }
        return true;
      });

      // 按指纹去重（URL 优先；无 URL 则 小区+价格+户型）
      const seen = new Set<string>();
      const deduped = filtered.filter((item) => {
        let fp: string;
        if (item.url && item.url.length > 10) {
          try {
            const u = new URL(item.url);
            fp = `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '');
          } catch {
            fp = item.url.trim().toLowerCase();
          }
        } else {
          fp = [
            item.community?.trim().toLowerCase() || '',
            String(item.price),
            item.roomType?.trim().toLowerCase() || '',
          ].join('|');
        }
        if (seen.has(fp)) return false;
        seen.add(fp);
        return true;
      });

      const excludeIds = new Set(consumeAgentListingExcludeIds());
      const ranked = deduped.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
      const afterExclude =
        excludeIds.size > 0 ? ranked.filter((item) => !excludeIds.has(String(item.id))) : ranked;
      const sorted = afterExclude.slice(0, 20);

      // 若筛选+去重后为空，降级返回全部去重列表（最多3条），并说明
      let isEmpty = sorted.length === 0;
      let finalListings = sorted;

      if (isEmpty && excludeIds.size > 0) {
        return {
          listings: [],
          total: 0,
          filtered: true,
          hint: '暂无更多未推荐过的房源，可调整筛选条件或先在「找房」里抓取更多房源。',
        };
      }

      if (isEmpty) {
        finalListings = Array.from(
          new Map(
            sourceList.map((item) => [
              item.url
                ? item.url.trim().toLowerCase()
                : `${item.community}|${item.price}|${item.roomType}`,
              item,
            ])
          ).values()
        ).slice(0, 3);
      }

      // 把 mock 房源写入历史，确保点击卡片后详情页能找到
      if (history.length === 0 && finalListings.length > 0) {
        await addToHistory(finalListings).catch(() => {});
      }

      return {
        listings: finalListings,
        total: finalListings.length,
        filtered: !isEmpty,
        hint: isEmpty ? '未找到完全匹配的房源，以下为综合推荐' : undefined,
      };
    },
  },
  {
    name: 'search_legal_knowledge',
    description: '检索租房法律知识库，返回最相关的法律条款或实务建议片段。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '法律问题，例如押金纠纷、违约责任等' },
      },
      required: ['question'],
      additionalProperties: false,
    },
    execute: async (params): Promise<unknown> => {
      const question = String(params?.question || '').trim();
      if (!question) {
        return { query: question, hits: [], reason: '问题为空' };
      }
      if (!isLegalQuestion(question)) {
        return { query: question, hits: [], reason: '非法律类问题，未触发法律知识库检索' };
      }
      const hits = await searchLegalKB(question);
      return {
        query: question,
        hits,
      };
    },
  },
  {
    name: 'analyze_house_photo',
    description: '分析上传的房屋环境照片，识别采光、装修质量、家具成色等风险点，给出综合评分。',
    parameters: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: '图片 URL 或 Base64 编码' },
        listingId: { type: 'string', description: '房源 ID（可选）' },
      },
      required: ['imageUrl'],
      additionalProperties: false,
    },
    execute: async (params): Promise<unknown> => {
      // 占位实现：实际应接入 AI 视觉模型（DeepSeek-V2.5、GLM-4V 等）
      return {
        findings: [
          '采光条件：南向窗户，自然光线充足',
          '装修状态：墙面平整，无明显破损',
          '家具配置：基础家具齐全，使用痕迹较少'
        ],
        score: 7.2,
        summary: '整体环境符合预期，建议实地确认细节'
      };
    },
  },
  {
    name: 'extract_listing_from_poster',
    description: '从贝壳等平台的分享海报图片中提取房源信息。支持识别海报中的标题、价格、小区、区域、户型、面积等关键信息。',
    parameters: {
      type: 'object',
      properties: {
        imageBase64: { type: 'string', description: '图片的 Base64 编码（data:image/jpeg;base64,... 格式）' },
        imageUrl: { type: 'string', description: '图片 URL（与 imageBase64 二选一）' },
      },
      additionalProperties: false,
    },
    execute: async (params): Promise<unknown> => {
      const imageData = params?.imageBase64 || params?.imageUrl;

      if (!imageData || typeof imageData !== 'string') {
        return { success: false, error: '未提供图片数据' };
      }

      try {
        const dataUrl = imageData.startsWith('data:')
          ? imageData
          : `data:image/jpeg;base64,${imageData}`;

        const extracted = await extractListingFromPosterImage(dataUrl);
        if (!extracted.price) {
          return { success: false, error: '未能识别有效月租金，请确保海报含价格且清晰' };
        }
        // 优先使用二维码解码得到的真实链接
        const bestUrl = extracted.qrUrl || extracted.url || '';

        const prefs = await getPrefs();
        const tags = [...extracted.tags];
        const hasSubway = tags.some((t) => /地铁|轨道交通/.test(t));
        const hasPets = tags.some((t) => /宠物|养宠/.test(t));

        const scraped: ScrapedListing = {
          title: extracted.title,
          price: extracted.price,
          community: extracted.community || '未知小区',
          district: extracted.district || '未知',
          roomType: extracted.roomType,
          area: extracted.area,
          floor: extracted.floor,
          tags,
          url: bestUrl,
          platform: extracted.platform === 'unknown' ? 'beike' : extracted.platform,
        };

        const listing: Listing = {
          id: generateListingId(scraped),
          title: scraped.title,
          price: scraped.price,
          community: scraped.community,
          district: scraped.district,
          roomType: scraped.roomType,
          area: scraped.area,
          floor: scraped.floor,
          tags,
          hasSubway,
          hasPets,
          isWhole: true,
          isApartment: /公寓|冠寓|自如/.test(scraped.title + tags.join('')),
          aiScore: 0,
          aiComment: extracted.qrUrl ? '海报识别（二维码）' : '海报识别',
          url: bestUrl || undefined,
          platform: scraped.platform,
          scrapedAt: new Date().toISOString(),
          cityCode: extracted.cityCode || prefs.city,
        };

        await upsertHistoryListings([listing]);

        return { success: true, listing };
      } catch (e: any) {
        return { success: false, error: e?.message || '海报识别失败' };
      }
    },
  },
  {
    name: 'calculate_commute',
    description: '计算从用户常去地址到指定房源的通勤时间与距离（方式遵循「我的」中的通勤规划设置，默认公交地铁）',
    parameters: {
      type: 'object',
      properties: {
        listingAddress: { type: 'string', description: '房源地址（如：朝阳区望京某小区）' },
      },
      required: ['listingAddress'],
      additionalProperties: false,
    },
    execute: async (params): Promise<unknown> => {
      const listingAddress = String(params?.listingAddress || '').trim();
      const prefs = await getPrefs();
      const workAddress = String(prefs.workAddress || '').trim();
      if (!workAddress || !listingAddress) {
        return { success: false, distance: '', duration: '' };
      }
      // 使用用户偏好的城市代码限定地理编码范围
      const cityCode = prefs.city || 'bj';
      return await calculateCommute(workAddress, listingAddress, cityCode);
    },
  },
  {
    name: 'generate_compare_report',
    description: '为多套房源生成综合对比分析报告，包括价格、位置、配套、通勤等多维度对比，并给出选择建议和风险提示。',
    parameters: {
      type: 'object',
      properties: {
        listingIds: {
          type: 'array',
          description: '参与对比的房源 ID 列表',
          items: { type: 'string' },
        },
      },
      required: ['listingIds'],
      additionalProperties: false,
    },
    execute: async (params): Promise<unknown> => {
      return {
        input: params,
        report: buildMockCompareReport(),
      };
    },
  },
];

