// ── 房源数据抓取脚本 ────────────────────────────────────────
// 用于在 WebView 中注入并提取房源信息

export type ScrapedListing = {
  title: string;
  price: number;
  community: string;
  district: string;
  roomType: string;
  area: string;
  floor: string;
  tags: string[];
  url: string;
  imageUrl?: string;
  platform: string;
};

// 数据质量评分和验证
type QualityScore = {
  valid: boolean;
  score: number;
  reasons: string[];
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assessListingQuality(listing: ScrapedListing): QualityScore {
  const reasons: string[] = [];
  let score = 0;

  // 必要字段检查
  if (!listing.url || listing.url.length < 10) {
    reasons.push('缺少有效链接');
    return { valid: false, score: 0, reasons };
  }

  if (!listing.price || listing.price < 300 || listing.price > 50000) {
    reasons.push('价格异常或缺失');
    return { valid: false, score: 0, reasons };
  }

  // 标题质量评估
  const title = (listing.title || '').trim();
  if (title.length < 4) {
    reasons.push('标题过短');
    return { valid: false, score: 0, reasons };
  }

  if (/^[\d\s元月]+$/.test(title)) {
    reasons.push('标题只含数字和单位');
    return { valid: false, score: 0, reasons };
  }

  if (/^(未知|unknown|null|undefined)/i.test(title)) {
    reasons.push('标题为占位符');
    return { valid: false, score: 0, reasons };
  }

  // 位置信息评估
  const hasCommunity = listing.community && listing.community.length >= 2 && listing.community !== '未知小区';
  const hasDistrict = listing.district && listing.district.length >= 2 && listing.district !== '未知';

  if (!hasCommunity && !hasDistrict) {
    reasons.push('缺少位置信息');
    return { valid: false, score: 0, reasons };
  }

  // 开始计分（通过基础验证后）
  score = 50; // 基础分

  if (hasCommunity) score += 15;
  if (hasDistrict) score += 15;
  if (listing.roomType && listing.roomType !== '未知') score += 10;
  if (listing.area && listing.area !== '未知') score += 5;
  if (listing.floor && listing.floor.length > 0) score += 5;

  return { valid: true, score, reasons };
}

function normalizeUrlForId(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.hostname}${pathname}`.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function hashText(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ── 生成唯一 ID ───────────────────────────────────────────────
export function generateListingId(listing: ScrapedListing): string {
  // 使用稳定字段生成稳定 ID，避免重复扫描时因为时间戳导致去重失效。
  if (listing.url) {
    const normalizedUrl = normalizeUrlForId(listing.url);
    const urlHash = hashText(normalizedUrl);
    return `${listing.platform}-${urlHash}`;
  }

  // URL 缺失时使用稳定的业务字段组合。
  const fallback = [
    listing.platform || 'unknown',
    (listing.community || '').trim().toLowerCase(),
    (listing.district || '').trim().toLowerCase(),
    (listing.roomType || '').trim().toLowerCase(),
    String(listing.price || 0),
  ].join('|');
  return `${listing.platform || 'unknown'}-${hashText(fallback)}`;
}

// ── 安居客抓取脚本 ────────────────────────────────────────────
export const ANJUKE_SCRAPER = `
(function() {
  try {
    const listings = [];
    const seen = new Set();
    
    // 质量检查函数
    function isValidListing(listing) {
      if (!listing.url || listing.url.length < 10) return false;
      if (!listing.price || listing.price < 300 || listing.price > 50000) return false;
      const title = (listing.title || '').trim();
      if (title.length < 4) return false;
      if (/^[\\d\\s元月]+$/.test(title)) return false;
      if (/^(未知|unknown)/i.test(title)) return false;
      const hasCommunity = listing.community && listing.community.length >= 2;
      const hasDistrict = listing.district && listing.district.length >= 2;
      if (!hasCommunity && !hasDistrict) return false;
      return true;
    }

    // ★ 精准定位安居客房源卡片（优先级从高到低）
    let houseCards = [];
    
    // 策略1：直接找 li.list-item（安居客标准结构）
    houseCards = Array.from(document.querySelectorAll('li.list-item, li[data-id], li[data-key]'));
    
    // 策略2：找包含房源链接的 li
    if (houseCards.length === 0) {
      houseCards = Array.from(document.querySelectorAll('li')).filter(li => {
        const anchor = li.querySelector('a[href*="zufang"], a[href*="/props/"], a[href*="/x"]');
        return anchor && li.textContent && li.textContent.length > 50;
      });
    }
    
    // 策略3：找包含价格和户型的容器
    if (houseCards.length === 0) {
      houseCards = Array.from(document.querySelectorAll('div, section, article')).filter(el => {
        const text = el.textContent || '';
        const hasPrice = /\\d{3,6}\\s*元/.test(text);
        const hasRoom = /\\d室\\d厅|整租|合租/.test(text);
        const hasLink = el.querySelector('a[href*="zufang"], a[href*="/props/"]');
        return hasPrice && hasRoom && hasLink && text.length > 50 && text.length < 500;
      });
    }

    if (houseCards.length === 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'scrape_result',
        success: false,
        reason: '未找到房源卡片（请确保在列表页，并下拉加载数据）',
        count: 0,
        debug: {
          title: document.title,
          url: location.href,
          domSample: document.body.innerHTML.substring(0, 500),
        },
      }));
      return;
    }

    houseCards.forEach((container) => {
      try {
        const anchor = container.querySelector('a[href*="zufang"], a[href*="/props/"], a[href*="/x"]');
        if (!anchor) return;
        const text = (container.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!text || text.length < 30) return;

        // ★ 标题提取（多重策略）
        let title = '';
        
        // 优先级1：明确的标题元素
        const titleSelectors = [
          '.house-title', '.title', 'h3', 'h2',
          '[class*="title"]', '[class*="Title"]',
          'div[data-title]', 'span[data-title]'
        ];
        for (const sel of titleSelectors) {
          const el = container.querySelector(sel);
          if (el && el.textContent.trim().length > 6) {
            title = el.textContent.trim();
            break;
          }
        }
        
        // 优先级2：从链接文本提取
        if (!title && anchor) {
          const anchorText = anchor.textContent.trim();
          // 排除纯数字或过短的链接文本
          if (anchorText.length > 10 && !/^[\\d元\\s]+$/.test(anchorText)) {
            title = anchorText;
          }
        }
        
        // 优先级3：从容器的第一个有效文本节点提取
        if (!title) {
          const textNodes = [];
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            const t = node.textContent.trim();
            if (t.length > 10) textNodes.push(t);
          }
          for (const t of textNodes) {
            if (!/^[\\d元\\s]+$/.test(t) && !/^[·｜,，\\s]+$/.test(t)) {
              title = t;
              break;
            }
          }
        }
        
        // 清理标题噪音
        title = title
          .replace(/^[·｜\\-\\s]+|[·｜\\-\\s]+$/g, '')
          .replace(/（广告）|【广告】|\\[广告\\]|推广|置顶|精选|立即咨询|点击查看|查看详情/g, '')
          .replace(/\\s{2,}/g, ' ')
          .trim();
        
        // 标题有效性判定
        if (!title || 
            title.length < 4 || 
            /^[\\d\\s元月]+$/.test(title) ||
            /风控|验证|人机|滑块|登录|注册|跳转|刷新/i.test(title)) {
          return; // 跳过无效标题
        }

        // ★ 价格提取（精准优先）
        let price = 0;
        
        // 策略1：找独立的价格元素
        const priceSelectors = [
          '.price-num', '.price', '.price-txt', 
          '.strongbox', 'em.price', 'span.price',
          '[class*="price"]', '[class*="Price"]'
        ];
        for (const sel of priceSelectors) {
          const el = container.querySelector(sel);
          if (el) {
            const pm = el.textContent.match(/(\\d{3,6})/);
            if (pm) {
              price = parseInt(pm[1], 10);
              break;
            }
          }
        }
        
        // 策略2：从全文提取
        if (!price) {
          const pm = text.match(/(\\d{3,6})\\s*元\\/月|月租\\s*(\\d{3,6})/);
          if (pm) price = parseInt(pm[1] || pm[2], 10);
        }
        
        if (!price || price < 300 || price > 50000) return;

        // ★ 房型、面积、楼层提取
        const infoEl = container.querySelector('.info, .house-info, .details, [class*="info"], [class*="desc"]');
        const infoText = infoEl ? infoEl.textContent : text;
        const roomMatch = infoText.match(/(\\d室\\d厅|\\d室|合租|整租|主卧|次卧|一居|两居|三居|四居)/);
        const areaMatch = infoText.match(/(\\d+(?:\\.\\d+)?\\s*(?:㎡|平米?|平方米))/);
        const floorMatch = infoText.match(/([高低中]楼层(?:[/共]\\d+层)?)/) || infoText.match(/(\\d+\\/\\d+层|\\d+层)/);

        // ★ 小区和区域提取（核心优化）
        let community = '';
        let district = '';
        
        // 策略1：找专门的地址/小区元素
        const addressSelectors = [
          '.address', '.community', '.comm', '.location',
          '[class*="address"]', '[class*="community"]', '[class*="location"]'
        ];
        for (const sel of addressSelectors) {
          const el = container.querySelector(sel);
          if (!el) continue;
          const addrText = el.textContent.trim();
          
          // 提取小区名
          const commMatch = addrText.match(/([\\u4e00-\\u9fa5]{2,20}(?:小区|花园|公寓|里|苑|家园|新村|大厦|中心|广场|城|庭|园|邸|府|轩|居|坊|阁|湾|庄))/);
          if (commMatch && !community) community = commMatch[1];
          
          // 提取区域
          const distMatch = addrText.match(/([\\u4e00-\\u9fa5]{2,10}(?:区|县|镇|街道))/);
          if (distMatch && !district) district = distMatch[1];
        }
        
        // 策略2：从标题中解析（安居客标题格式：朝阳区·东三环·某某小区）
        if (!community || !district) {
          const parts = title.split(/[·｜\\-]/);
          for (const part of parts) {
            const p = part.trim();
            // 识别区域
            if (!district && /[\\u4e00-\\u9fa5]{2,10}(?:区|县)$/.test(p)) {
              district = p;
            }
            // 识别小区
            if (!community && /(?:小区|花园|公寓|里|苑|家园|新村|大厦|中心|广场|城|庭|园|邸|府|轩|居|坊|阁|湾|庄)$/.test(p) && p.length >= 3) {
              community = p;
            }
          }
        }
        
        // 策略3：从完整文本中提取
        if (!community) {
          const commMatch = text.match(/([\\u4e00-\\u9fa5]{2,20}(?:小区|花园|公寓|里|苑|家园|新村|大厦|中心|广场|城))/);
          if (commMatch) community = commMatch[1];
        }
        if (!district) {
          const distMatch = text.match(/([\\u4e00-\\u9fa5]{2,10}(?:区|县))/);
          if (distMatch) district = distMatch[1];
        }
        
        // 必须有位置信息
        if (!community && !district) return;

        // ★ 标签提取（精准化）
        const tagEls = container.querySelectorAll('.tag, .tags, .label, i.tag, span.tag, [class*="tag-"]');
        let rawTags = [];
        if (tagEls.length > 0) {
          rawTags = Array.from(tagEls).map(el => {
            const t = el.textContent.trim();
            // 排除无意义的标签
            if (t.length < 2 || t.length > 8) return '';
            if (/^[\\d\\.]+$/.test(t)) return '';
            if (/^[·｜,，\\s]+$/.test(t)) return '';
            return t;
          }).filter(Boolean);
        }
        // 去重
        rawTags = [...new Set(rawTags)];

        // ★ URL 提取和验证
        const hrefRaw = anchor.getAttribute('href') || '';
        if (!hrefRaw) return;
        const url = hrefRaw.startsWith('http') ? hrefRaw : new URL(hrefRaw, location.href).toString();
        
        // 确保是真实房源链接
        if (!url.includes('/zufang/') && 
            !url.includes('/rent/') && 
            !url.includes('/props/') &&
            !url.includes('/x')) {
          return;
        }
        
        // 去重
        const uniqueKey = url.split('?')[0]; // 去掉query参数
        if (seen.has(uniqueKey)) return;
        seen.add(uniqueKey);

        // ★ 构造房源对象
        const listing = {
          title: title,
          price,
          community: community || '未知小区',
          district: district || '未知区域',
          roomType: roomMatch ? roomMatch[1] : '未知',
          area: areaMatch ? areaMatch[1] : '未知',
          floor: floorMatch ? floorMatch[1] : '',
          tags: rawTags.slice(0, 6),
          url,
          imageUrl: container.querySelector('img')?.getAttribute('src') || '',
          platform: 'anjuke',
        };

        // 最终质量检查
        if (isValidListing(listing)) {
          listings.push(listing);
        }
      } catch (e) {
        // ignore
      }
    });

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'scrape_result',
      success: true,
      listings,
      count: listings.length,
      debug: {
        title: document.title,
        url: location.href,
        foundCards: houseCards.length,
        validListings: listings.length,
      },
    }));

  } catch (error) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'scrape_result',
      success: false,
      reason: error.message || '脚本执行失败',
      count: 0,
    }));
  }
})();
`;

// ── 贝壳抓取脚本 ──────────────────────────────────────────────
export const BEIKE_SCRAPER = `
(function() {
  try {
    const listings = [];
    const seen = new Set();
    
    // 质量检查函数
    function isValidListing(listing) {
      if (!listing.url || listing.url.length < 10) return false;
      if (!listing.price || listing.price < 300 || listing.price > 50000) return false;
      const title = (listing.title || '').trim();
      if (title.length < 4) return false;
      if (/^[\\d\\s元月]+$/.test(title)) return false;
      if (/^(未知|unknown)/i.test(title)) return false;
      const hasCommunity = listing.community && listing.community.length >= 2;
      const hasDistrict = listing.district && listing.district.length >= 2;
      if (!hasCommunity && !hasDistrict) return false;
      return true;
    }

    // ★ 精准定位贝壳房源卡片
    let houseCards = [];
    
    // 策略1：贝壳标准结构（content__list--item）
    houseCards = Array.from(document.querySelectorAll(
      '.content__list--item, ' +
      'div[data-house_code], ' +
      'div[data-id]'
    ));
    
    // 策略2：找包含贝壳房源链接的 li/div
    if (houseCards.length === 0) {
      houseCards = Array.from(document.querySelectorAll('li, div')).filter(el => {
        const anchor = el.querySelector('a[href*="ke.com"], a[href*="zufang"]');
        const text = el.textContent || '';
        return anchor && text.length > 50 && /\\d{3,6}\\s*元/.test(text);
      });
    }
    
    // 策略3：通用容器 + 房源特征
    if (houseCards.length === 0) {
      houseCards = Array.from(document.querySelectorAll('div, section, article')).filter(el => {
        const text = el.textContent || '';
        const hasPrice = /\\d{3,6}\\s*元/.test(text);
        const hasRoom = /\\d室\\d厅|整租|合租/.test(text);
        const hasLink = el.querySelector('a[href*="ke.com"], a[href*="zufang"]');
        return hasPrice && hasRoom && hasLink && text.length > 50 && text.length < 500;
      });
    }

    if (houseCards.length === 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'scrape_result',
        success: false,
        reason: '未找到房源卡片（请确保在贝壳租房列表页）',
        count: 0,
        debug: {
          title: document.title,
          url: location.href,
          domSample: document.body.innerHTML.substring(0, 500),
        },
      }));
      return;
    }

    houseCards.forEach((container) => {
      try {
        const anchor = container.querySelector('a[href*="ke.com"], a[href*="zufang"], a[href]');
        if (!anchor) return;
        const text = (container.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!text || text.length < 30) return;

        // ★ 标题提取（贝壳适配）
        let title = '';
        
        // 贝壳专属选择器
        const titleSelectors = [
          '.content__list--item--title',  // 贝壳标准
          '.house-title', '.title', 'h3', 'h2',
          'p.title', 'div.title',
          '[class*="title"]', '[class*="Title"]'
        ];
        for (const sel of titleSelectors) {
          const el = container.querySelector(sel);
          if (el && el.textContent.trim().length > 6) {
            title = el.textContent.trim();
            break;
          }
        }
        
        // 从链接文本提取
        if (!title && anchor) {
          const anchorText = anchor.textContent.trim();
          if (anchorText.length > 10 && !/^[\\d元\\s]+$/.test(anchorText)) {
            title = anchorText;
          }
        }
        
        // 从文本节点提取
        if (!title) {
          const textNodes = [];
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            const t = node.textContent.trim();
            if (t.length > 10) textNodes.push(t);
          }
          for (const t of textNodes) {
            if (!/^[\\d元\\s]+$/.test(t) && !/^[·｜,，\\s]+$/.test(t)) {
              title = t;
              break;
            }
          }
        }
        
        // 清理标题
        title = title
          .replace(/^[·｜\\-\\s]+|[·｜\\-\\s]+$/g, '')
          .replace(/（广告）|【广告】|\\[广告\\]|推广|置顶|精选|立即咨询|点击查看|查看详情/g, '')
          .replace(/\\s{2,}/g, ' ')
          .trim();
        
        // 有效性判定
        if (!title || 
            title.length < 4 || 
            /^[\\d\\s元月]+$/.test(title) ||
            /风控|验证|人机|滑块|登录|注册|跳转|刷新/i.test(title)) {
          return;
        }

        // ★ 价格提取（贝壳适配）
        let price = 0;
        
        // 贝壳专属选择器
        const priceSelectors = [
          '.content__list--item-price',  // 贝壳标准
          '.price-num', '.price', '.price-txt', 
          'em.price', 'span.price',
          '[class*="price"]'
        ];
        for (const sel of priceSelectors) {
          const el = container.querySelector(sel);
          if (el) {
            const pm = el.textContent.match(/(\\d{3,6})/);
            if (pm) {
              price = parseInt(pm[1], 10);
              break;
            }
          }
        }
        
        if (!price) {
          const pm = text.match(/(\\d{3,6})\\s*元\\/月|月租\\s*(\\d{3,6})/);
          if (pm) price = parseInt(pm[1] || pm[2], 10);
        }
        
        if (!price || price < 300 || price > 50000) return;

        // ★ 房型、面积、楼层提取
        const infoEl = container.querySelector('.info, .house-info, .details, .content__list--item--des, [class*="info"], [class*="desc"]');
        const infoText = infoEl ? infoEl.textContent : text;
        const roomMatch = infoText.match(/(\\d室\\d厅|\\d室|合租|整租|主卧|次卧|一居|两居|三居|四居)/);
        const areaMatch = infoText.match(/(\\d+(?:\\.\\d+)?\\s*(?:㎡|平米?|平方米))/);
        const floorMatch = infoText.match(/([高低中]楼层(?:[/共]\\d+层)?)/) || infoText.match(/(\\d+\\/\\d+层|\\d+层)/);

        // ★ 小区和区域提取（贝壳优化）
        let community = '';
        let district = '';
        
        // 策略1：专属选择器
        const addressSelectors = [
          '.content__list--item--des',
          '.address', '.community', '.comm', '.location',
          '[class*="address"]', '[class*="community"]'
        ];
        for (const sel of addressSelectors) {
          const el = container.querySelector(sel);
          if (!el) continue;
          const addrText = el.textContent.trim();
          
          const commMatch = addrText.match(/([\\u4e00-\\u9fa5]{2,20}(?:小区|花园|公寓|里|苑|家园|新村|大厦|中心|广场|城|庭|园|邸|府|轩|居|坊|阁|湾|庄))/);
          if (commMatch && !community) community = commMatch[1];
          
          const distMatch = addrText.match(/([\\u4e00-\\u9fa5]{2,10}(?:区|县|镇|街道))/);
          if (distMatch && !district) district = distMatch[1];
        }
        
        // 策略2：标题解析
        if (!community || !district) {
          const parts = title.split(/[·｜\\-]/);
          for (const part of parts) {
            const p = part.trim();
            if (!district && /[\\u4e00-\\u9fa5]{2,10}(?:区|县)$/.test(p)) district = p;
            if (!community && /(?:小区|花园|公寓|里|苑|家园|新村|大厦|中心|广场|城)$/.test(p) && p.length >= 3) community = p;
          }
        }
        
        // 策略3：全文提取
        if (!community) {
          const commMatch = text.match(/([\\u4e00-\\u9fa5]{2,20}(?:小区|花园|公寓|里|苑|家园|新村|大厦|中心|广场|城))/);
          if (commMatch) community = commMatch[1];
        }
        if (!district) {
          const distMatch = text.match(/([\\u4e00-\\u9fa5]{2,10}(?:区|县))/);
          if (distMatch) district = distMatch[1];
        }
        
        // 必须有位置信息
        if (!community && !district) return;

        // ★ 标签提取（精准化）
        const tagEls = container.querySelectorAll('.tag, .tags, .label, i.tag, span.tag, .content__list--item--bottom i, [class*="tag-"]');
        let rawTags = [];
        if (tagEls.length > 0) {
          rawTags = Array.from(tagEls).map(el => {
            const t = el.textContent.trim();
            if (t.length < 2 || t.length > 8) return '';
            if (/^[\\d\\.]+$/.test(t)) return '';
            if (/^[·｜,，\\s]+$/.test(t)) return '';
            return t;
          }).filter(Boolean);
        }
        rawTags = [...new Set(rawTags)];

        // ★ URL 提取和验证
        const hrefRaw = anchor.getAttribute('href') || '';
        if (!hrefRaw) return;
        const url = hrefRaw.startsWith('http') ? hrefRaw : new URL(hrefRaw, location.href).toString();
        
        // 确保是真实房源链接
        if (!url.includes('/zufang/') && 
            !url.includes('/chuzu/') &&
            !url.includes('ke.com')) {
          return;
        }
        
        // 去重
        const uniqueKey = url.split('?')[0];
        if (seen.has(uniqueKey)) return;
        seen.add(uniqueKey);

        // ★ 构造房源对象
        const listing = {
          title: title,
          price,
          community: community || '未知小区',
          district: district || '未知区域',
          roomType: roomMatch ? roomMatch[1] : '未知',
          area: areaMatch ? areaMatch[1] : '未知',
          floor: floorMatch ? floorMatch[1] : '',
          tags: rawTags.slice(0, 6),
          url,
          imageUrl: container.querySelector('img')?.getAttribute('src') || '',
          platform: 'beike',
        };

        // 最终质量检查
        if (isValidListing(listing)) {
          listings.push(listing);
        }
      } catch (e) {
        // ignore
      }
    });

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'scrape_result',
      success: true,
      listings,
      count: listings.length,
      debug: {
        title: document.title,
        url: location.href,
        foundCards: houseCards.length,
        validListings: listings.length,
      },
    }));

  } catch (error) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'scrape_result',
      success: false,
      reason: error.message || '脚本执行失败',
      count: 0,
    }));
  }
})();
`;

// ── 获取对应平台的抓取脚本 ────────────────────────────────────
export function getScraperScript(platform: 'anjuke' | 'beike'): string {
  return platform === 'anjuke' ? ANJUKE_SCRAPER : BEIKE_SCRAPER;
}
