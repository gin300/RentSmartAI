import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Modal,
} from 'react-native';

// ── 筛选条件类型 ──────────────────────────────────────────────
type RentMode = '整租' | '合租' | '短租' | '公寓';

const SUB_FILTERS: Record<RentMode, string[]> = {
  '整租': ['不限', '一居', '两居', '三居以上'],
  '合租': ['不限', '主卧独卫', '向阳', '独卫', '全女'],
  '短租': ['不限', '7天内', '1个月', '3个月'],
  '公寓': ['不限', '品牌公寓', '酒店式公寓'],
};

// ── 模拟房源数据 ──────────────────────────────────────────────
const MOCK_LISTINGS = [
  {
    id: '1',
    title: '整租·阳光上东·精装两居·南北通透',
    community: '阳光上东家园',
    district: '朝阳·望京',
    roomType: '2室1厅',
    area: '78㎡',
    floor: '中楼层/18层',
    price: 5800,
    tags: ['近地铁', '精装修', '南北通透'],
    hasSubway: true,
    hasPets: false,
    isWhole: true,
    aiScore: 8.5,
    aiComment: '性价比高，望京核心位置，地铁15号线步行5分钟',
  },
  {
    id: '2',
    title: '整租·望京花园·温馨一居·拎包入住',
    community: '望京花园',
    district: '朝阳·望京',
    roomType: '1室1厅',
    area: '45㎡',
    floor: '高楼层/22层',
    price: 4200,
    tags: ['近地铁', '押一付一', '随时看房'],
    hasSubway: true,
    hasPets: true,
    isWhole: true,
    aiScore: 7.8,
    aiComment: '价格友好，允许养宠，但面积偏小',
  },
  {
    id: '3',
    title: '合租·自如寓·主卧带独卫·朝南',
    community: '利泽中园',
    district: '朝阳·望京',
    roomType: '4居合租·主卧',
    area: '18㎡（主卧）',
    floor: '低楼层/6层',
    price: 2800,
    tags: ['独卫', '品牌公寓', '全女'],
    hasSubway: true,
    hasPets: false,
    isWhole: false,
    aiScore: 7.2,
    aiComment: '自如管理规范，全女合租安全，但不可养宠',
  },
  {
    id: '4',
    title: '整租·东湖湾·豪装三居·可养宠物',
    community: '东湖湾',
    district: '朝阳·望京',
    roomType: '3室2厅',
    area: '120㎡',
    floor: '中楼层/25层',
    price: 9500,
    tags: ['可养宠', '豪装', '车位'],
    hasSubway: false,
    hasPets: true,
    isWhole: true,
    aiScore: 8.0,
    aiComment: '空间大可养宠，装修好，但离地铁较远约1.2km',
  },
  {
    id: '5',
    title: '整租·融科橄榄城·安静两居·近公园',
    community: '融科橄榄城',
    district: '朝阳·望京',
    roomType: '2室1厅',
    area: '85㎡',
    floor: '高楼层/16层',
    price: 6300,
    tags: ['近地铁', '近公园', '安静'],
    hasSubway: true,
    hasPets: false,
    isWhole: true,
    aiScore: 8.2,
    aiComment: '环境好紧邻望和公园，14号线望京站步行8分钟',
  },
];

export default function SearchPage() {
  const [rentMode, setRentMode] = useState<RentMode>('整租');
  const [subFilter, setSubFilter] = useState('不限');
  const [needSubway, setNeedSubway] = useState(false);
  const [needPets, setNeedPets] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [city] = useState('北京');
  const [searchText, setSearchText] = useState('');

  // 简单本地过滤（后续替换为API请求+AI评分）
  const filtered = MOCK_LISTINGS.filter(l => {
    if (needSubway && !l.hasSubway) return false;
    if (needPets && !l.hasPets) return false;
    if (budgetMin && l.price < parseInt(budgetMin)) return false;
    if (budgetMax && l.price > parseInt(budgetMax)) return false;
    if (rentMode === '整租' && !l.isWhole) return false;
    if (rentMode === '合租' && l.isWhole) return false;
    return true;
  }).sort((a, b) => b.aiScore - a.aiScore);

  return (
    <SafeAreaView style={s.safe}>
      {/* 顶部搜索栏 */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.cityBtn}>
          <Text style={s.cityText}>{city}</Text>
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
        </View>
      </View>

      {/* 一级筛选：租房方式 */}
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
        <TouchableOpacity
          style={s.moreFilterBtn}
          onPress={() => setShowFilterPanel(true)}
        >
          <Text style={s.moreFilterText}>筛选</Text>
          <Text style={s.moreFilterIcon}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* 二级筛选：子条件 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.subFilterBar}>
        {SUB_FILTERS[rentMode].map(sub => (
          <TouchableOpacity
            key={sub}
            style={[s.subChip, subFilter === sub && s.subChipActive]}
            onPress={() => setSubFilter(sub)}
          >
            <Text style={[s.subChipText, subFilter === sub && s.subChipTextActive]}>
              {sub}
            </Text>
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
          {filtered.length < MOCK_LISTINGS.length ? '（已过滤）' : ''}
        </Text>
        <Text style={s.resultSort}>AI评分排序 ▾</Text>
      </View>

      {/* 房源列表 */}
      <ScrollView style={s.listWrap} showsVerticalScrollIndicator={false}>
        {filtered.map(item => (
          <TouchableOpacity key={item.id} style={s.card} activeOpacity={0.7}>
            {/* 图片占位 */}
            <View style={s.cardImg}>
              <Text style={s.cardImgText}>🏠</Text>
            </View>
            <View style={s.cardBody}>
              {/* 标题 */}
              <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>

              {/* 信息行 */}
              <Text style={s.cardInfo}>
                {item.roomType}　{item.area}　{item.floor}
              </Text>

              {/* 小区 + 商圈 */}
              <Text style={s.cardLocation}>
                📍 {item.community}　{item.district}
              </Text>

              {/* 标签 */}
              <View style={s.tagRow}>
                {item.tags.slice(0, 3).map(tag => (
                  <View key={tag} style={[
                    s.tag,
                    tag === '近地铁' && s.tagGreen,
                    tag === '可养宠' && s.tagOrange,
                  ]}>
                    <Text style={[
                      s.tagText,
                      tag === '近地铁' && s.tagTextGreen,
                      tag === '可养宠' && s.tagTextOrange,
                    ]}>{tag}</Text>
                  </View>
                ))}
              </View>

              {/* 底部：价格 + AI评分 */}
              <View style={s.cardBottom}>
                <View>
                  <Text style={s.cardPrice}>
                    {item.price}<Text style={s.cardPriceUnit}> 元/月</Text>
                  </Text>
                </View>
                <View style={[
                  s.scoreBadge,
                  item.aiScore >= 8 ? s.scoreHigh : item.aiScore >= 7 ? s.scoreMid : s.scoreLow,
                ]}>
                  <Text style={s.scoreText}>AI {item.aiScore}</Text>
                </View>
              </View>

              {/* AI 简评 */}
              <View style={s.aiRow}>
                <Text style={s.aiLabel}>🤖</Text>
                <Text style={s.aiComment} numberOfLines={1}>{item.aiComment}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {filtered.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>没有找到符合条件的房源</Text>
            <Text style={s.emptyDesc}>试试放宽筛选条件</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 详细筛选面板（Modal） ── */}
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
                  <TextInput
                    style={s.budgetInput}
                    placeholder="最低"
                    placeholderTextColor="#bbb"
                    keyboardType="numeric"
                    value={budgetMin}
                    onChangeText={setBudgetMin}
                  />
                  <Text style={s.budgetSep}>—</Text>
                  <TextInput
                    style={s.budgetInput}
                    placeholder="最高"
                    placeholderTextColor="#bbb"
                    keyboardType="numeric"
                    value={budgetMax}
                    onChangeText={setBudgetMax}
                  />
                </View>
              </View>

              {/* 租房方式 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>🏠 租房方式</Text>
                <View style={s.chipRow}>
                  {(['整租', '合租', '短租', '公寓'] as RentMode[]).map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[s.modalChip, rentMode === mode && s.modalChipActive]}
                      onPress={() => { setRentMode(mode); setSubFilter('不限'); }}
                    >
                      <Text style={[s.modalChipText, rentMode === mode && s.modalChipTextActive]}>
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 子条件 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>
                  {rentMode === '整租' ? '🛏 户型' :
                   rentMode === '合租' ? '🏘 合租要求' :
                   rentMode === '短租' ? '📅 租期' : '🏢 公寓类型'}
                </Text>
                <View style={s.chipRow}>
                  {SUB_FILTERS[rentMode].map(sub => (
                    <TouchableOpacity
                      key={sub}
                      style={[s.modalChip, subFilter === sub && s.modalChipActive]}
                      onPress={() => setSubFilter(sub)}
                    >
                      <Text style={[s.modalChipText, subFilter === sub && s.modalChipTextActive]}>
                        {sub}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 硬性条件 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>⚡ 硬性条件</Text>
                <View style={s.chipRow}>
                  <TouchableOpacity
                    style={[s.modalChip, needSubway && s.modalChipActive]}
                    onPress={() => setNeedSubway(!needSubway)}
                  >
                    <Text style={[s.modalChipText, needSubway && s.modalChipTextActive]}>
                      🚇 近地铁
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalChip, needPets && s.modalChipActive]}
                    onPress={() => setNeedPets(!needPets)}
                  >
                    <Text style={[s.modalChipText, needPets && s.modalChipTextActive]}>
                      🐾 可养宠
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 位置偏好 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>📍 位置偏好</Text>
                <TextInput
                  style={s.modalInput}
                  placeholder="商圈 / 行政区 / 地铁线"
                  placeholderTextColor="#bbb"
                />
                <TextInput
                  style={[s.modalInput, { marginTop: 8 }]}
                  placeholder="公司地址（用于计算通勤）"
                  placeholderTextColor="#bbb"
                />
              </View>

              {/* 补充说明 */}
              <View style={s.modalSection}>
                <Text style={s.modalLabel}>📝 补充说明</Text>
                <TextInput
                  style={[s.modalInput, { height: 72, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="例：需要电梯、南向、押一付一..."
                  placeholderTextColor="#bbb"
                />
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* 底部按钮 */}
            <View style={s.modalFooter}>
              <TouchableOpacity
                style={s.resetBtn}
                onPress={() => {
                  setRentMode('整租'); setSubFilter('不限');
                  setNeedSubway(false); setNeedPets(false);
                  setBudgetMin(''); setBudgetMax('');
                }}
              >
                <Text style={s.resetBtnText}>重置</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.applyBtn}
                onPress={() => setShowFilterPanel(false)}
              >
                <Text style={s.applyBtnText}>确认筛选（{filtered.length} 套）</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── 样式（仿链家风格）────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f8' },

  // 顶部搜索
  topBar: {
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  cityBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  cityText: { fontSize: 15, fontWeight: '600', color: '#333' },
  cityArrow: { fontSize: 10, color: '#999', marginLeft: 4 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f5f5f8', borderRadius: 8, paddingHorizontal: 12, height: 36,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, color: '#333', padding: 0 },

  // 一级筛选
  filterBar: {
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f5f5f8',
  },
  filterChipActive: { backgroundColor: '#e8f7f0' },
  filterChipText: { fontSize: 13, color: '#666' },
  filterChipTextActive: { color: '#00ae66', fontWeight: '600' },
  moreFilterBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6,
  },
  moreFilterText: { fontSize: 13, color: '#666' },
  moreFilterIcon: { fontSize: 10, color: '#999', marginLeft: 4 },

  // 二级筛选
  subFilterBar: {
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexGrow: 0,
  },
  subChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
    backgroundColor: '#f5f5f8', marginRight: 8,
  },
  subChipActive: { backgroundColor: '#00ae66' },
  subChipText: { fontSize: 12, color: '#666' },
  subChipTextActive: { color: '#fff', fontWeight: '500' },

  // 结果栏
  resultBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  resultCount: { fontSize: 13, color: '#999' },
  resultNum: { color: '#00ae66', fontWeight: '600' },
  resultSort: { fontSize: 12, color: '#666' },

  // 房源卡片
  listWrap: { flex: 1 },
  card: {
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardImg: {
    width: 110, backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center',
  },
  cardImgText: { fontSize: 36 },
  cardBody: { flex: 1, padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  cardInfo: { fontSize: 12, color: '#666', marginBottom: 3 },
  cardLocation: { fontSize: 12, color: '#999', marginBottom: 6 },

  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tag: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
    backgroundColor: '#f5f5f8',
  },
  tagGreen: { backgroundColor: '#e8f7f0' },
  tagOrange: { backgroundColor: '#fff3e6' },
  tagText: { fontSize: 10, color: '#888' },
  tagTextGreen: { color: '#00ae66' },
  tagTextOrange: { color: '#f5a623' },

  cardBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  cardPrice: { fontSize: 18, fontWeight: '700', color: '#fe5500' },
  cardPriceUnit: { fontSize: 12, fontWeight: '400', color: '#999' },

  scoreBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  scoreHigh: { backgroundColor: '#e8f7f0' },
  scoreMid: { backgroundColor: '#fff8e6' },
  scoreLow: { backgroundColor: '#fff0f0' },
  scoreText: { fontSize: 11, fontWeight: '600', color: '#00ae66' },

  aiRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fafafa', borderRadius: 6, padding: 6,
  },
  aiLabel: { fontSize: 12, marginRight: 4 },
  aiComment: { fontSize: 11, color: '#888', flex: 1 },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  emptyDesc: { fontSize: 13, color: '#999', marginTop: 6 },

  // ── Modal 筛选面板 ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalPanel: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 16,
  },
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
  applyBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 8,
    backgroundColor: '#00ae66', alignItems: 'center',
  },
  applyBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
