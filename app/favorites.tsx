import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { getFavorites, removeFavorite, type Listing } from './lib/storage';

export default function FavoritesPage() {
  const router = useRouter();
  const [records, setRecords] = useState<Listing[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const favorites = await getFavorites();
        setRecords(favorites);
      })();
    }, [])
  );

  async function handleRemove(id: string) {
    const updated = await removeFavorite(id);
    setRecords(updated);
  }

  return (
    <SafeAreaView style={s.safe} edges={Platform.OS === 'android' ? [] : ['top']}>
      <View style={s.navbar}>
        <TouchableOpacity style={s.navBack} onPress={() => router.back()}>
          <Text style={s.navBackText}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>收藏夹</Text>
        <View style={{ width: 28 }} />
      </View>

      {records.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>🤍</Text>
          <Text style={s.emptyTitle}>还没有收藏房源</Text>
          <Text style={s.emptyDesc}>在找房页点心形即可加入收藏</Text>
          <TouchableOpacity style={s.goBtn} onPress={() => router.replace('/search')}>
            <Text style={s.goBtnText}>去找房</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
          {records.map(item => (
            <TouchableOpacity
              key={item.id}
              style={s.row}
              activeOpacity={0.8}
              onPress={() => router.push(`/listing/${item.id}`)}
            >
              <Text style={s.title} numberOfLines={2}>{item.title || '未知标题'}</Text>
              <Text style={s.meta}>
                {item.price ? `${item.price} 元/月` : '价格未知'} · {item.roomType || '户型未知'} · {item.area || '面积未知'}
              </Text>
              <Text style={s.comment} numberOfLines={2}>{item.aiComment || '暂无AI点评'}</Text>
              <View style={s.actions}>
                <TouchableOpacity
                  style={s.detailBtn}
                  onPress={() => router.push(`/listing/${item.id}`)}
                >
                  <Text style={s.detailBtnText}>查看详情</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.removeBtn}
                  onPress={() =>
                    Alert.alert('确认移除', '将该房源从收藏夹中移除？', [
                      { text: '取消', style: 'cancel' },
                      { text: '移除', style: 'destructive', onPress: () => handleRemove(item.id) },
                    ])
                  }
                >
                  <Text style={s.removeBtnText}>移除收藏</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f8' },
  navbar: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navBack: { paddingHorizontal: 6 },
  navBackText: { fontSize: 22, color: '#00ae66', fontWeight: '600' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  body: { flex: 1, paddingTop: 10 },
  row: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    padding: 12,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#222', lineHeight: 20 },
  meta: { fontSize: 12, color: '#666', marginTop: 6 },
  comment: { fontSize: 12, color: '#999', marginTop: 6, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  detailBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00ae66',
    backgroundColor: '#f0faf5',
  },
  detailBtnText: { fontSize: 13, color: '#00ae66', fontWeight: '600' },
  removeBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd9d9',
    backgroundColor: '#fff5f5',
  },
  removeBtnText: { fontSize: 13, color: '#e74c3c', fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  emptyDesc: { fontSize: 13, color: '#999', marginTop: 6 },
  goBtn: {
    marginTop: 14,
    backgroundColor: '#00ae66',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  goBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
