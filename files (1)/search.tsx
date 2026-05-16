import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Modal, FlatList, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CITIES, HOT_CITIES, searchCities, type City } from '../lib/cities';
import {
  type Listing, type UserPrefs, DEFAULT_PREFS,
  getPrefs, savePrefs, getFavorites, addFavorite, removeFavorite, addToHistory,
} from '../lib/storage';

// ── 筛选条件类型 ──────────────────────────────────────────────
type RentMode = '整租' | '合租' | '短租' | '公寓';

const SUB_FILTERS: Record<RentMode, string[]> = {
  '整租': ['不限', '一居', '两居', '三居以上'],
  '合租': ['不限', '主卧独卫', '向阳', '独卫', '全女'],
  '短租': ['不限', '7天内', '1个月', '3个月'],
  '公寓': ['不限', '品牌公寓', '酒店式公寓'],
};

// ── 模拟房源数据（后续替换为真实抓取）─────────────────────────
const MOCK_DATA: Record<string, Listing[]> = {
  bj: [
    { id: 'bj-1', title: '整租·阳光上东·精装两居·南北通透', community: '阳光上东家园', district: '朝阳·望京', roomType: '2室1厅', area: '78㎡', floor: '中楼层/18层', price: 5800, tags: ['近地铁', '精装修', '南北通透'], hasSubway: true, hasPets: false, isWhole: true, aiScore: 8.5, aiComment: '性价比高，望京核心位置，地铁15号线步行5分钟' },
    { id: 'bj-2', title: '整租·望京花园·温馨一居·拎包入住', community: '望京花园', district: '朝阳·望京', roomType: '1室1厅', area: '45㎡', floor: '高楼层/22层', price: 4200, tags: ['近地铁', '押一付一', '随时看房'], hasSubway: true, hasPets: true, isWhole: true, aiScore: 7.8, aiComment: '价格友好，允许养宠，但面积偏小' },
    { id: 'bj-3', title: '合租·自如寓·主卧带独卫·朝南', community: '利泽中园', district: '朝阳·望京', roomType: '4居合租·主卧', area: '18㎡（主卧）', floor: '低楼层/6层', price: 2800, tags: ['独卫', '品牌公寓', '全女'], hasSubway: true, hasPets: false, isWhole: false, aiScore: 7.2, aiComment: '自如管理规范，全女合租安全，但不可养宠' },
    { id: 'bj-4', title: '整租·东湖湾·豪装三居·可养宠物', community: '东湖湾', district: '朝阳·望京', roomType: '3室2厅', area: '120㎡', floor: '中楼层/25层', price: 9500, tags: ['可养宠', '豪装', '车位'], hasSubway: false, hasPets: true, isWhole: true, aiScore: 8.0, aiComment: '空间大可养宠，装修好，但离地铁较远约1.2km' },
    { id: 'bj-5', title: '整租·融科橄榄城·安静两居·近公园', community: '融科橄榄城', district: '朝阳·望京', roomType: '2室1厅', area: '85㎡', floor: '高楼层/16层', price: 6300, tags: ['近地铁', '近公园', '安静'], hasSubway: true, hasPets: false, isWhole: true, aiScore: 8.2, aiComment: '环境好紧邻望和公园，14号线望京站步行8分钟' },
  ],
  sh: [
    { id: 'sh-1', title: '整租·陆家嘴·精装一居·江景房', community: '仁恒滨江', district: '浦东·陆家嘴', roomType: '1室1厅', area: '55㎡', floor: '高楼层/38层', price: 8500, tags: ['近地铁', '江景', '精装'], hasSubway: true, hasPets: false, isWhole: true, aiScore: 8.8, aiComment: '陆家嘴核心江景，2号线步行3分钟，价格偏高但位置无敌' },
    { id: 'sh-2', title: '合租·静安寺·次卧·交通便利', community: '静安新城', district: '静安·静安寺', roomType: '3居合租·次卧', area: '12㎡', floor: '中楼层/12层', price: 3200, tags: ['近地铁', '交通便利'], hasSubway: true, hasPets: false, isWhole: false, aiScore: 7.0, aiComment: '位置好价格合理，但房间较小' },
    { id: 'sh-3', title: '整租·张江·科技园旁·两居室', community: '汤臣豪园', district: '浦东·张江', roomType: '2室1厅', area: '70㎡', floor: '中楼层/11层', price: 5500, tags: ['近地铁', '近园区', '押一付一'], hasSubway: true, hasPets: true, isWhole: true, aiScore: 8.3, aiComment: '张江高科站步行10分钟，适合在张江上班的租客' },
  ],
  gz: [
    { id: 'gz-1', title: '整租·珠江新城·豪华两居·CBD核心', community: '富力盈泰', district: '天河·珠江新城', roomType: '2室1厅', area: '80㎡', floor: '高楼层/30层', price: 7200, tags: ['近地铁', 'CBD', '精装'], hasSubway: true, hasPets: false, isWhole: true, aiScore: 8.6, aiComment: '珠江新城核心，5号线猎德站步行5分钟' },
    { id: 'gz-2', title: '整租·天河公园·温馨一居·安静', community: '天朗明居', district: '天河·天河公园', roomType: '1室1厅', area: '40㎡', floor: '低楼层/8层', price: 3000, tags: ['近公园', '安静', '押一付一'], hasSubway: true, hasPets: true, isWhole: true, aiScore: 7.5, aiComment: '紧邻天河公园，环境安静，可养宠' },
  ],
  sz: [
    { id: 'sz-1', title: '整租·南山科技园·精装两居', community: '科技园花园', district: '南山·科技园', roomType: '2室1厅', area: '65㎡', floor: '中楼层/20层', price: 6800, tags: ['近地铁', '近园区', '精装'], hasSubway: true, hasPets: false, isWhole: true, aiScore: 8.4, aiComment: '科技园核心，适合互联网人，1号线步行8分钟' },
    { id: 'sz-2', title: '合租·福田中心·主卧独卫', community: '金地名轩', district: '福田·福田中心', roomType: '3居合租·主卧', area: '20㎡', floor: '高楼层/25层', price: 3500, tags: ['独卫', '近地铁', '交通便利'], hasSubway: true, hasPets: false, isWhole: false, aiScore: 7.6, aiComment: '福田CBD，通勤方便，主卧独卫性价比不错' },
  ],
};

// 没有数据的城市返回空
function getMockListings(cityCode: string): Listing[] {
  return MOCK_DATA[cityCode] || [];
}

export default function SearchPage() {
  // ── 状态 ────────────────────────────────────────────────────
  const [prefs, setPrefsState] = useState<UserPrefs>(DEFAULT_PREFS);
  const [rentMode, setRentMode] = useState<RentMode>('整租');
  const [subFilter, setSubFilter] = useState('不限');
  const [needSubway, setNeedSubway] = useState(false);
  const [needPets, setNeedPets] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [searchText, setSearchText] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [listings, setListings] = useState<Listing[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [commuteInput, setCommuteInput] = useState('');
  const [otherReqs, setOtherReqs] = useState('');

  // 加载存储的偏好和收藏
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const p = await getPrefs();
    setPrefsState(p);
    setBudgetMin(p.budgetMin);
    setBudgetMax(p.budgetMax);
    setNeedSubway(p.needSubway);
    setNeedPets(p.needPets);
    setRentMode(p.rentMode as RentMode || '整租');
    setLocationInput(p.district);
    setCommuteInput(p.commuteAddr);
    setOtherReqs(p.otherReqs);
    setListings(getMockListings(p.city));

    const favs = await getFavorites();
    setFavoriteIds(new Set(favs.map(f => f.id)));
  }

  // 切换城市
  async function selectCity(city: City) {
    const updated = await savePrefs({ city: city.code, cityLabel: city.name });
    setPrefsState(updated);
    setListings(getMockListings(city.code));
    setShowCityPicker(false);
    setCitySearch('');

    // 记入历史
    const cityListings = getMockListings(city.code);
    if (cityListings.length) await addToHistory(cityListings);
  }

  // 收藏/取消收藏
  async function toggleFavorite(listing: Listing) {
    if (favoriteIds.has(listing.id)) {
      await removeFavorite(listing.id);
      setFavoriteIds(prev => { const n = new Set(prev); n.delete(listing.id); return n; });
    } else {
      await addFavorite(listing);
      setFavoriteIds(prev => new Set(prev).add(listing.id));
    }
  }

  // 保存筛选条件
  async function applyFilters() {
    await savePrefs({
      budgetMin, budgetMax, needSubway, needPets,
      rentMode, subFilter, district: locationInput,
      commuteAddr: commuteInput, otherReqs,
    });
    setShowFilterPanel(false);
  }

  // 本地过滤
  const filtered = listings.filter(l => {
    if (needSubway && !l.hasSubway) return false;
    if (needPets && !l.hasPets) return false;
    if (budgetMin && l.price < parseInt(budgetMin)) return false;
    if (budgetMax && l.price > parseInt(budgetMax)) return false;
    if (rentMode === '整租' && !l.isWhole) return false;
    if (rentMode === '合租' && l.isWhole) return false;
    if (searchText) {
      const kw = searchText.toLowerCase();
      const text = `${l.title}${l.community}${l.district}`.toLowerCase();
      if (!text.includes(kw)) return false;
    }
    return true;
  }).sort((a, b) => b.aiScore - a.aiScore);

  // 城市搜索结果
  const cityResults = citySearch ? searchCities(citySearch) : [];

  return (
    <SafeAreaView style={s.safe}>
      {/* 顶部搜索栏 */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.cityBtn} onPress={() => setShowCityPicker(true)}>
          <Text style={s.cityText}>{prefs.cityLabel || '北京'}</Text>
          <Text style={s.cityArrow}>▾</Text>
        </TouchableOpacity>
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="搜索商圈、小区名"
            placeholderTextColor="#bbb"
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={s.clearBtn}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* 一级筛选 */}
      <View style={s.filterBar}>
        {(['整租', '合租', '短租', '公寓'] as RentMode[]).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[s.filterChip, rentMode === mode && s.filterChipActive]}
            onPress={() => { setRentMode(mode); setSubFilter('不限'); }}
          >
            <Text style={[s.filterChipText, rentMode === mode && s.filterChipTextActive]}>
              {mode}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.moreFilterBtn} onPress={() => setShowFilterPanel(true)}>
          <Text style={s.moreFilterText}>筛选</Text>
          <Text style={s.moreFilterIcon}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* 二级筛选 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.subFilterBar}>
        {SUB_FILTERS[rentMode].map(sub => (
          <TouchableOpacity
            key={sub}
            style={[s.subChip, subFilter === sub && s.subChipActive]}
            onPress={() => setSubFilter(sub)}
          >
            <Text style={[s.subChipText, subFilter === sub && s.subChipTextActive]}>{sub}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[s.subChip, needSubway && s.subChipActive]}
          onPress={() => setNeedSubway(!needSubway)}
        >
          <Text style={[s.subChipText, needSubway && s.subChipTextActive]}>🚇 近地铁</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.subChip, needPets && s.subChipActive]}
          onPress={() => setNeedPets(!needPets)}
        >
          <Text style={[s.subChipText, needPets && s.subChipTextActive]}>🐾 可养宠</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 结果计数 */}
      <View style={s.resultBar}>
        <Text style={s.resultCount}>
          共 <Text style={s.resultNum}>{filtered.length}</Text> 套
          {filtered.length < listings.length ? '（已过滤）' : ''}
        </Text>
        <Text style={s.resultSort}>AI评分排序 ▾</Text>
      </View>

      {/* 房源列表 */}
      <ScrollView style={s.listWrap} showsVerticalScrollIndicator={false}>
        {filtered.map(item => (
          <TouchableOpacity key={item.id} style={s.card} activeOpacity={0.7}>
            <View style={s.cardImg}>
              <Text style={s.cardImgText}>🏠</Text>
            </View>
            <View style={s.cardBody}>
              <View style={s.cardTitleRow}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                <TouchableOpacity
                  style={s.favBtn}
                  onPress={() => toggleFavorite(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={s.favIcon}>{favoriteIds.has(item.id) ? '❤️' : '🤍'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.cardInfo}>{item.roomType}　{item.area}　{item.floor}</Text>
              <Text style={s.cardLocation}>📍 {item.community}　{item.district}</Text>

              <View style={s.tagRow}>
                {item.tags.slice(0, 3).map(tag => (
                  <View key={tag} style={[s.tag, tag === '近地铁' && s.tagGreen, tag === '可养宠' && s.tagOrange]}>
                    <Text style={[s.tagText, tag === '近地铁' && s.tagTextGreen, tag === '可养宠' && s.tagTextOrange]}>{tag}</Text>
                  </View>
                ))}
              </View>

              <View style={s.cardBottom}>
                <Text style={s.cardPrice}>{item.price}<Text style={s.cardPriceUnit}> 元/月</Text></Text>
                <View style={[s.scoreBadge, item.aiScore >= 8 ? s.scoreHigh : item.aiScore >= 7 ? s.scoreMid : s.scoreLow]}>
                  <Text style={[s.scoreText, item.aiScore >= 8 ? s.scoreTextHigh : item.aiScore >= 7 ? s.scoreTextMid : s.scoreTextLow]}>AI {item.aiScore}</Text>
                </View>
              </View>

              <View style={s.aiRow}>
                <Text style={s.aiLabel}>🤖</Text>
                <Text style={s.aiComment} numberOfLines={1}>{item.aiComment}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {filtered.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>{listings.length === 0 ? '🏙' : '🔍'}</Text>
            <Text style={s.emptyTitle}>
              {listings.length === 0 ? `${prefs.cityLabel}暂无模拟数据` : '没有符合条件的房源'}
            </Text>
            <Text style={s.emptyDesc}>
              {listings.length === 0 ? '真实数据功能开发中，敬请期待' : '试试放宽筛选条件'}
            </Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 城市选择器 ── */}
      <Modal visible={showCityPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalPanel, { maxHeight: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>选择城市</Text>
              <TouchableOpacity onPress={() => { setShowCityPicker(false); setCitySearch(''); }}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 搜索框 */}
            <View style={s.citySearchBox}>
              <Text style={s.searchIcon}>🔍</Text>
              <TextInput
                style={s.citySearchInput}
                placeholder="输入城市名或拼音"
                placeholderTextColor="#bbb"
                value={citySearch}
                onChangeText={setCitySearch}
                autoFocus
              />
              {citySearch ? (
                <TouchableOpacity onPress={() => setCitySearch('')}>
                  <Text style={s.clearBtn}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 搜索结果 */}
              {citySearch ? (
                <View style={s.citySection}>
                  {cityResults.length ? cityResults.map(c => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.cityItem, prefs.city === c.code && s.cityItemActive]}
                      onPress={() => selectCity(c)}
                    >
                      <Text style={[s.cityItemText, prefs.city === c.code && s.cityItemTextActive]}>
                        {c.name}
                      </Text>
                      {prefs.city === c.code && <Text style={s.cityCheck}>✓</Text>}
                    </TouchableOpacity>
                  )) : (
                    <Text style={s.cityEmpty}>没有找到「{citySearch}」</Text>
                  )}
                </View>
              ) : (
                <>
                  {/* 当前城市 */}
                  <View style={s.citySection}>
                    <Text style={s.citySectionLabel}>当前城市</Text>
                    <View style={s.cityGrid}>
                      <View style={[s.cityItem, s.cityItemActive]}>
                        <Text style={[s.cityItemText, s.cityItemTextActive]}>{prefs.cityLabel}</Text>
                      </View>
                    </View>
                  </View>

                  {/* 热门城市 */}
                  <View style={s.citySection}>
                    <Text style={s.citySectionLabel}>热门城市</Text>
                    <View style={s.cityGrid}>
                      {HOT_CITIES.map(c => (
                        <TouchableOpacity
                          key={c.code}
                          style={[s.cityItem, prefs.city === c.code && s.cityItemActive]}
                          onPress={() => selectCity(c)}
                        >
                          <Text style={[s.cityItemText, prefs.city === c.code && s.cityItemTextActive]}>
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* 全部城市 */}
                  <View style={s.citySection}>
                    <Text style={s.citySectionLabel}>全部城市</Text>
                    <View style={s.cityGrid}>
                      {CITIES.filter(c => !c.hot).map(c => (
                        <TouchableOpacity
                          key={c.code}
                          style={[s.cityItem, prefs.city === c.code && s.cityItemActive]}
                          onPress={() => selectCity(c)}
                        >
                          <Text style={[s.cityItemText, prefs.city === c.code && s.cityItemTextActive]}>
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 筛选面板 ── */}
      <Modal visible={showFilterPanel} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalPanel}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>筛选条件</Text>
              <TouchableOpacity onPress={() => setShowFilterPanel(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 预算 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>💰 预算（元/月）</Text>
                <View style={s.budgetRow}>
                  <TextInput style={s.budgetInput} placeholder="最低" placeholderTextColor="#bbb" keyboardType="numeric" value={budgetMin} onChangeText={setBudgetMin} />
                  <Text style={s.budgetSep}>—</Text>
                  <TextInput style={s.budgetInput} placeholder="最高" placeholderTextColor="#bbb" keyboardType="numeric" value={budgetMax} onChangeText={setBudgetMax} />
                </View>
              </View>

              {/* 租房方式 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>🏠 租房方式</Text>
                <View style={s.chipRow}>
                  {(['整租', '合租', '短租', '公寓'] as RentMode[]).map(mode => (
                    <TouchableOpacity key={mode} style={[s.modalChip, rentMode === mode && s.modalChipActive]}
                      onPress={() => { setRentMode(mode); setSubFilter('不限'); }}>
                      <Text style={[s.modalChipText, rentMode === mode && s.modalChipTextActive]}>{mode}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 子条件 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>
                  {rentMode === '整租' ? '🛏 户型' : rentMode === '合租' ? '🏘 合租要求' : rentMode === '短租' ? '📅 租期' : '🏢 公寓类型'}
                </Text>
                <View style={s.chipRow}>
                  {SUB_FILTERS[rentMode].map(sub => (
                    <TouchableOpacity key={sub} style={[s.modalChip, subFilter === sub && s.modalChipActive]}
                      onPress={() => setSubFilter(sub)}>
                      <Text style={[s.modalChipText, subFilter === sub && s.modalChipTextActive]}>{sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 硬性条件 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>⚡ 硬性条件</Text>
                <View style={s.chipRow}>
                  <TouchableOpacity style={[s.modalChip, needSubway && s.modalChipActive]}
                    onPress={() => setNeedSubway(!needSubway)}>
                    <Text style={[s.modalChipText, needSubway && s.modalChipTextActive]}>🚇 近地铁</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modalChip, needPets && s.modalChipActive]}
                    onPress={() => setNeedPets(!needPets)}>
                    <Text style={[s.modalChipText, needPets && s.modalChipTextActive]}>🐾 可养宠</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 位置偏好 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>📍 位置偏好</Text>
                <TextInput style={s.modalInput} placeholder="商圈 / 行政区 / 地铁线"
                  placeholderTextColor="#bbb" value={locationInput} onChangeText={setLocationInput} />
                <TextInput style={[s.modalInput, { marginTop: 8 }]} placeholder="公司地址（用于计算通勤）"
                  placeholderTextColor="#bbb" value={commuteInput} onChangeText={setCommuteInput} />
              </View>

              {/* 补充说明 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>📝 补充说明</Text>
                <TextInput style={[s.modalInput, { height: 72, textAlignVertical: 'top' }]}
                  multiline placeholder="例：需要电梯、南向、押一付一..." placeholderTextColor="#bbb"
                  value={otherReqs} onChangeText={setOtherReqs} />
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.resetBtn} onPress={() => {
                setRentMode('整租'); setSubFilter('不限');
                setNeedSubway(false); setNeedPets(false);
                setBudgetMin(''); setBudgetMax('');
                setLocationInput(''); setCommuteInput(''); setOtherReqs('');
              }}>
                <Text style={s.resetBtnText}>重置</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.applyBtn} onPress={applyFilters}>
                <Text style={s.applyBtnText}>确认筛选（{filtered.length} 套）</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── 样式 ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f8' },

  topBar: {
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  cityBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 12, paddingVertical: 4 },
  cityText: { fontSize: 15, fontWeight: '600', color: '#333' },
  cityArrow: { fontSize: 10, color: '#999', marginLeft: 4 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f5f5f8', borderRadius: 8, paddingHorizontal: 12, height: 36,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, color: '#333', padding: 0 },
  clearBtn: { fontSize: 14, color: '#999', padding: 4 },

  filterBar: {
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f5f5f8' },
  filterChipActive: { backgroundColor: '#e8f7f0' },
  filterChipText: { fontSize: 13, color: '#666' },
  filterChipTextActive: { color: '#00ae66', fontWeight: '600' },
  moreFilterBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6 },
  moreFilterText: { fontSize: 13, color: '#666' },
  moreFilterIcon: { fontSize: 10, color: '#999', marginLeft: 4 },

  subFilterBar: {
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexGrow: 0,
  },
  subChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f5f5f8', marginRight: 8 },
  subChipActive: { backgroundColor: '#00ae66' },
  subChipText: { fontSize: 12, color: '#666' },
  subChipTextActive: { color: '#fff', fontWeight: '500' },

  resultBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  resultCount: { fontSize: 13, color: '#999' },
  resultNum: { color: '#00ae66', fontWeight: '600' },
  resultSort: { fontSize: 12, color: '#666' },

  listWrap: { flex: 1 },
  card: {
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardImg: { width: 110, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  cardImgText: { fontSize: 36 },
  cardBody: { flex: 1, padding: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4, flex: 1 },
  favBtn: { paddingLeft: 4, paddingTop: 2 },
  favIcon: { fontSize: 16 },
  cardInfo: { fontSize: 12, color: '#666', marginBottom: 3 },
  cardLocation: { fontSize: 12, color: '#999', marginBottom: 6 },

  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: '#f5f5f8' },
  tagGreen: { backgroundColor: '#e8f7f0' },
  tagOrange: { backgroundColor: '#fff3e6' },
  tagText: { fontSize: 10, color: '#888' },
  tagTextGreen: { color: '#00ae66' },
  tagTextOrange: { color: '#f5a623' },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardPrice: { fontSize: 18, fontWeight: '700', color: '#fe5500' },
  cardPriceUnit: { fontSize: 12, fontWeight: '400', color: '#999' },

  scoreBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  scoreHigh: { backgroundColor: '#e8f7f0' },
  scoreMid: { backgroundColor: '#fff8e6' },
  scoreLow: { backgroundColor: '#fff0f0' },
  scoreText: { fontSize: 11, fontWeight: '600' },
  scoreTextHigh: { color: '#00ae66' },
  scoreTextMid: { color: '#f5a623' },
  scoreTextLow: { color: '#e74c3c' },

  aiRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 6, padding: 6 },
  aiLabel: { fontSize: 12, marginRight: 4 },
  aiComment: { fontSize: 11, color: '#888', flex: 1 },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  emptyDesc: { fontSize: 13, color: '#999', marginTop: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalPanel: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingTop: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  modalClose: { fontSize: 20, color: '#999', padding: 4 },

  modalSection: { paddingHorizontal: 20, marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f5f5f8', borderWidth: 1, borderColor: '#f0f0f0',
  },
  modalChipActive: { backgroundColor: '#e8f7f0', borderColor: '#00ae66' },
  modalChipText: { fontSize: 13, color: '#666' },
  modalChipTextActive: { color: '#00ae66', fontWeight: '600' },

  budgetRow: { flexDirection: 'row', alignItems: 'center' },
  budgetInput: {
    flex: 1, backgroundColor: '#f5f5f8', borderRadius: 8, padding: 10,
    fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#f0f0f0',
  },
  budgetSep: { color: '#ccc', marginHorizontal: 10 },

  modalInput: {
    backgroundColor: '#f5f5f8', borderRadius: 8, padding: 10,
    fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#f0f0f0',
  },

  modalFooter: {
    flexDirection: 'row', padding: 16, gap: 12,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  resetBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#ddd', alignItems: 'center',
  },
  resetBtnText: { fontSize: 14, color: '#666' },
  applyBtn: { flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: '#00ae66', alignItems: 'center' },
  applyBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // City picker
  citySearchBox: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 16,
    backgroundColor: '#f5f5f8', borderRadius: 8, paddingHorizontal: 12, height: 40,
  },
  citySearchInput: { flex: 1, fontSize: 14, color: '#333', padding: 0 },

  citySection: { paddingHorizontal: 20, marginBottom: 20 },
  citySectionLabel: { fontSize: 13, fontWeight: '600', color: '#999', marginBottom: 10 },
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cityItem: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#f5f5f8', borderWidth: 1, borderColor: '#f0f0f0',
  },
  cityItemActive: { backgroundColor: '#e8f7f0', borderColor: '#00ae66' },
  cityItemText: { fontSize: 14, color: '#555' },
  cityItemTextActive: { color: '#00ae66', fontWeight: '600' },
  cityCheck: { color: '#00ae66', fontSize: 12, marginLeft: 4 },
  cityEmpty: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 20 },
});
