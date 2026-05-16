import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { getStats, getFavorites, getHistory, type Listing, type AppStats } from '../lib/storage';

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState<AppStats>({ analyzed: 0, favorited: 0, deepAnalyzed: 0 });
  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [history, setHistory] = useState<Listing[]>([]);

  // 每次页面获得焦点时刷新数据
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const [s, f, h] = await Promise.all([getStats(), getFavorites(), getHistory()]);
    setStats(s);
    setFavorites(f);
    setHistory(h);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>RentSmart AI</Text>
          <Text style={s.headerSub}>智能租房助手</Text>
        </View>
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>🏠</Text>
        </View>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>快捷操作</Text>
          <View style={s.quickRow}>
            <TouchableOpacity style={s.quickCard} onPress={() => router.push('/search')}>
              <Text style={s.quickIcon}>🔍</Text>
              <Text style={s.quickLabel}>找房</Text>
              <Text style={s.quickDesc}>AI智能筛选</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.quickCard} onPress={() => router.push('/chat')}>
              <Text style={s.quickIcon}>💬</Text>
              <Text style={s.quickLabel}>问AI</Text>
              <Text style={s.quickDesc}>租房咨询</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.quickCard}>
              <Text style={s.quickIcon}>📊</Text>
              <Text style={s.quickLabel}>对比</Text>
              <Text style={s.quickDesc}>房源PK</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={s.section}>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statNum}>{stats.analyzed}</Text>
              <Text style={s.statLabel}>已分析</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCard}>
              <Text style={s.statNum}>{stats.favorited}</Text>
              <Text style={s.statLabel}>已收藏</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCard}>
              <Text style={s.statNum}>{stats.deepAnalyzed}</Text>
              <Text style={s.statLabel}>已精筛</Text>
            </View>
          </View>
        </View>

        {/* Favorites */}
        {favorites.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitleInline}>❤️ 我的收藏</Text>
              <TouchableOpacity><Text style={s.sectionLink}>查看全部</Text></TouchableOpacity>
            </View>
            {favorites.slice(0, 3).map(item => (
              <View key={item.id} style={s.miniCard}>
                <View style={s.miniCardBody}>
                  <Text style={s.miniTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.miniInfo}>
                    {item.roomType}　{item.area}　{item.district}
                  </Text>
                </View>
                <View style={s.miniRight}>
                  <Text style={s.miniPrice}>{item.price}</Text>
                  <Text style={s.miniUnit}>元/月</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent History */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitleInline}>🕐 最近分析</Text>
            {history.length > 0 && (
              <TouchableOpacity><Text style={s.sectionLink}>查看全部</Text></TouchableOpacity>
            )}
          </View>

          {history.length > 0 ? (
            history.slice(0, 5).map(item => (
              <View key={item.id} style={s.miniCard}>
                <View style={s.miniCardBody}>
                  <Text style={s.miniTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.miniInfo}>
                    {item.roomType}　{item.area}　{item.district}
                  </Text>
                </View>
                <View style={s.miniRight}>
                  <Text style={s.miniPrice}>{item.price}</Text>
                  <Text style={s.miniUnit}>元/月</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>还没有分析记录</Text>
              <Text style={s.emptyDesc}>去「找房」页面开始你的第一次AI筛选</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/search')}>
                <Text style={s.emptyBtnText}>开始找房</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f8' },
  header: {
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20,
    paddingTop: 12, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#222' },
  headerSub: { fontSize: 12, color: '#999', marginTop: 2 },
  headerBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#e8f7f0', alignItems: 'center', justifyContent: 'center',
  },
  headerBadgeText: { fontSize: 22 },

  body: { flex: 1 },

  section: { marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#222', paddingHorizontal: 20, marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitleInline: { fontSize: 16, fontWeight: '700', color: '#222' },
  sectionLink: { fontSize: 13, color: '#00ae66' },

  quickRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  quickCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  quickIcon: { fontSize: 28, marginBottom: 8 },
  quickLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  quickDesc: { fontSize: 11, color: '#999', marginTop: 2 },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginHorizontal: 16, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  statCard: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '700', color: '#00ae66' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: '#f0f0f0', marginVertical: 4 },

  // Mini card (favorites & history)
  miniCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  miniCardBody: { flex: 1 },
  miniTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  miniInfo: { fontSize: 12, color: '#999' },
  miniRight: { alignItems: 'flex-end', marginLeft: 12 },
  miniPrice: { fontSize: 18, fontWeight: '700', color: '#fe5500' },
  miniUnit: { fontSize: 10, color: '#999', marginTop: 2 },

  emptyState: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 12,
    padding: 32, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  emptyDesc: { fontSize: 13, color: '#999', marginTop: 6, textAlign: 'center' },
  emptyBtn: { marginTop: 16, backgroundColor: '#00ae66', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
