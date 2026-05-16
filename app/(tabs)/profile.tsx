import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Linking, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  getApiConfig, saveApiConfig,
  clearHistory, clearFavorites, getPrefs, savePrefs,
  type CommuteRouteMode,
} from '../lib/storage';
import { Colors, Typography, Spacing, Radius } from '../lib/design';

const BUILT_IN_MODELS = [
  { id: 'deepseek', name: 'DeepSeek', desc: '文本分析（初筛默认）', type: 'text', free: true },
  { id: 'glm4v', name: 'GLM-4V-Flash', desc: '智谱识图（精筛默认）', type: 'vision', free: true },
];

const CUSTOM_MODELS = [
  { id: 'openai', name: 'OpenAI (GPT-4o)' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'claude', name: 'Claude' },
  { id: 'qwen', name: '通义千问 (Qwen-VL)' },
  { id: 'custom', name: '自定义 OpenAI 兼容' },
];

const COMMUTE_ROUTE_OPTIONS: { id: CommuteRouteMode; label: string; hint: string }[] = [
  { id: 'transit', label: '公交地铁', hint: '高德公交路径规划（默认）' },
  { id: 'driving', label: '驾车', hint: '驾车时间与距离' },
  { id: 'walking', label: '步行', hint: '步行路径' },
  { id: 'bicycling', label: '骑行', hint: '骑行路径' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [textModel, setTextModel] = useState('deepseek');
  const [visionModel, setVisionModel] = useState('glm4v');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [glmApiKey, setGlmApiKey] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [customApiBase, setCustomApiBase] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [commuteRouteMode, setCommuteRouteMode] = useState<CommuteRouteMode>('transit');
  const [showCustom, setShowCustom] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  // 页面加载时读取配置
  useFocusEffect(
    useCallback(() => {
      loadConfig();
    }, [])
  );

  async function loadConfig() {
    const config = await getApiConfig();
    setTextModel(config.textModel);
    setVisionModel(config.visionModel);
    setDeepseekApiKey(config.deepseekApiKey || config.apiKey || '');
    setGlmApiKey(config.glmApiKey || config.apiKey || '');
    setApiKey(config.apiKey || '');
    setCustomApiBase(config.apiBase);
    setCommuteRouteMode(config.commuteRouteMode || 'transit');
    const prefs = await getPrefs();
    setWorkAddress(prefs.workAddress || '');
  }

  async function getCurrentLocation() {
    try {
      setLocationLoading(true);
      
      // 请求定位权限
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限被拒绝', '需要定位权限才能获取当前位置');
        return;
      }

      // 获取当前位置
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // 使用高德地图逆地理编码获取地址
      const config = await getApiConfig();
      const { latitude, longitude } = location.coords;
      const amapKey = config.amapKey || '1beebb29ec2b17017ec1603083aef3c4';
      
      const params = new URLSearchParams({
        key: amapKey,
        location: `${longitude},${latitude}`,
      });

      const response = await fetch(`https://restapi.amap.com/v3/geocode/regeo?${params.toString()}`);
      if (!response.ok) {
        throw new Error('逆地理编码请求失败');
      }

      const data: any = await response.json();
      if (data.status === '1' && data.regeocode) {
        const formatted = data.regeocode.formatted_address || '';
        const poi = data.regeocode.addressComponent;
        const address = poi ? `${poi.district}${poi.township}${poi.streetNumber?.street || ''}` : formatted;
        
        setWorkAddress(address);
        await savePrefs({ workAddress: address });
        Alert.alert('定位成功', `当前位置：${address}`);
      } else {
        Alert.alert('定位失败', '无法解析当前位置地址');
      }
    } catch (error: any) {
      Alert.alert('定位失败', error?.message || '获取位置信息时出错');
    } finally {
      setLocationLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={Platform.OS === 'android' ? [] : ['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>我的设置</Text>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {/* 初筛模型 */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Ionicons name="hardware-chip-outline" size={18} color={Colors.primary} />
            <Text style={s.sectionTitle}>初筛模型（文本分析）</Text>
          </View>
          <Text style={s.sectionDesc}>用于分析房源列表、评分排序</Text>
          {BUILT_IN_MODELS.filter(m => m.type === 'text').map(model => (
            <TouchableOpacity
              key={model.id}
              style={[s.modelCard, textModel === model.id && s.modelCardActive]}
              onPress={() => setTextModel(model.id)}
            >
              <View style={s.modelInfo}>
                <Text style={s.modelName}>{model.name}</Text>
                <Text style={s.modelDesc}>{model.desc}</Text>
              </View>
              {model.free && <View style={s.freeBadge}><Text style={s.freeText}>免费</Text></View>}
              <View style={[s.radio, textModel === model.id && s.radioActive]}>
                {textModel === model.id && <View style={s.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 精筛模型 */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Ionicons name="eye-outline" size={18} color={Colors.primary} />
            <Text style={s.sectionTitle}>精筛模型（识图分析）</Text>
          </View>
          <Text style={s.sectionDesc}>用于分析房源照片、识别话术陷阱</Text>
          {BUILT_IN_MODELS.filter(m => m.type === 'vision').map(model => (
            <TouchableOpacity
              key={model.id}
              style={[s.modelCard, visionModel === model.id && s.modelCardActive]}
              onPress={() => setVisionModel(model.id)}
            >
              <View style={s.modelInfo}>
                <Text style={s.modelName}>{model.name}</Text>
                <Text style={s.modelDesc}>{model.desc}</Text>
              </View>
              {model.free && <View style={s.freeBadge}><Text style={s.freeText}>免费</Text></View>}
              <View style={[s.radio, visionModel === model.id && s.radioActive]}>
                {visionModel === model.id && <View style={s.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={s.expandBtn}
            onPress={() => setShowCustom(!showCustom)}
          >
            <View style={s.expandBtnRow}>
              <Text style={s.expandText}>
                {showCustom ? '收起自定义模型' : '使用其他模型'}
              </Text>
              <Ionicons
                name={showCustom ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.primary}
              />
            </View>
          </TouchableOpacity>

          {showCustom && (
            <View style={s.customWrap}>
              {CUSTOM_MODELS.map(model => (
                <TouchableOpacity
                  key={model.id}
                  style={[s.customChip, visionModel === model.id && s.customChipActive]}
                  onPress={() => setVisionModel(model.id)}
                >
                  <Text style={[s.customChipText, visionModel === model.id && s.customChipTextActive]}>
                    {model.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* API Key */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Ionicons name="key-outline" size={18} color={Colors.primary} />
            <Text style={s.sectionTitle}>API Key</Text>
          </View>
          <Text style={s.sectionDesc}>已预置默认 Key，可按需替换</Text>
          <TextInput
            style={s.input}
            placeholder="DeepSeek API Key"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={deepseekApiKey}
            onChangeText={setDeepseekApiKey}
          />
          <TextInput
            style={[s.input, { marginTop: 8 }]}
            placeholder="GLM API Key"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={glmApiKey}
            onChangeText={setGlmApiKey}
          />
          <TextInput
            style={[s.input, { marginTop: 8 }]}
            placeholder="通用 API Key（OpenAI/Claude/Gemini/千问/自定义）"
            placeholderTextColor="#bbb"
            secureTextEntry
            value={apiKey}
            onChangeText={setApiKey}
          />
          {(visionModel === 'custom') && (
            <TextInput
              style={[s.input, { marginTop: 8 }]}
              placeholder="API Base URL（OpenAI 兼容接口）"
              placeholderTextColor="#bbb"
              value={customApiBase}
              onChangeText={setCustomApiBase}
            />
          )}
          <View style={s.linkRow}>
            <TouchableOpacity onPress={() => Linking.openURL('https://platform.deepseek.com')}>
              <Text style={s.linkText}>DeepSeek →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL('https://open.bigmodel.cn')}>
              <Text style={s.linkText}>智谱GLM →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 通勤规划方式 */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Ionicons name="bus-outline" size={18} color={Colors.primary} />
            <Text style={s.sectionTitle}>通勤规划方式</Text>
          </View>
          <Text style={s.sectionDesc}>与高德 Web 路径规划一致，用于详情页与对比页的通勤估算</Text>
          {COMMUTE_ROUTE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[s.modelCard, commuteRouteMode === opt.id && s.modelCardActive]}
              onPress={() => setCommuteRouteMode(opt.id)}
            >
              <View style={s.modelInfo}>
                <Text style={s.modelName}>{opt.label}</Text>
                <Text style={s.modelDesc}>{opt.hint}</Text>
              </View>
              <View style={[s.radio, commuteRouteMode === opt.id && s.radioActive]}>
                {commuteRouteMode === opt.id && <View style={s.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 常去地址 */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Ionicons name="location-outline" size={18} color={Colors.primary} />
            <Text style={s.sectionTitle}>常去地址</Text>
          </View>
          <Text style={s.sectionDesc}>用于计算通勤时间，仅本机存储</Text>
          <TextInput
            style={s.input}
            placeholder="例：光谷软件园 / 中南路地铁站"
            placeholderTextColor="#bbb"
            value={workAddress}
            onChangeText={setWorkAddress}
            onBlur={async () => {
              await savePrefs({ workAddress: workAddress.trim() });
            }}
          />
          <View style={s.locationBtnRow}>
            <TouchableOpacity
              style={[s.locationBtn, s.locationBtnHalf]}
              onPress={getCurrentLocation}
              disabled={locationLoading}
            >
              {locationLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <View style={s.locBtnInner}>
                  <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
                  <Text style={s.locationBtnText}>当前位置</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.locationBtn, s.locationBtnHalf, s.mapBtn]}
              onPress={() => router.push({
                pathname: '/map-picker',
                params: { initialAddress: workAddress },
              })}
            >
              <View style={s.locBtnInner}>
                <Ionicons name="map-outline" size={18} color={Colors.primary} />
                <Text style={s.locationBtnText}>地图选点</Text>
              </View>
            </TouchableOpacity>
          </View>
          <Text style={s.locationHint}>
            提示：可以获取当前位置，或在地图上搜索、选点
          </Text>
        </View>

        {/* 保存 */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.saveBtn}
            onPress={async () => {
              await saveApiConfig({
                textModel,
                visionModel,
                apiKey,
                deepseekApiKey,
                glmApiKey,
                apiBase: customApiBase,
                commuteRouteMode,
              });
              await savePrefs({ workAddress: workAddress.trim() });
              Alert.alert('已保存', '设置已保存到本地');
            }}
          >
            <View style={s.saveBtnRow}>
              <Ionicons name="save-outline" size={20} color={Colors.textInverse} />
              <Text style={s.saveBtnText}>保存设置</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 数据管理 */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Ionicons name="folder-open-outline" size={18} color={Colors.primary} />
            <Text style={s.sectionTitle}>数据管理</Text>
          </View>
          <TouchableOpacity
            style={s.dangerBtn}
            onPress={() =>
              Alert.alert('确认', '清空所有分析历史？', [
                { text: '取消' },
                {
                  text: '确认',
                  style: 'destructive',
                  onPress: async () => {
                    await clearHistory();
                    Alert.alert('完成', '历史记录已清空');
                  },
                },
              ])
            }
          >
            <View style={s.dangerBtnRow}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={s.dangerBtnText}>清空历史记录</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.dangerBtn, { marginTop: 8 }]}
            onPress={() =>
              Alert.alert('确认', '清空所有收藏？', [
                { text: '取消' },
                {
                  text: '确认',
                  style: 'destructive',
                  onPress: async () => {
                    await clearFavorites();
                    Alert.alert('完成', '收藏已清空');
                  },
                },
              ])
            }
          >
            <View style={s.dangerBtnRow}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={s.dangerBtnText}>清空收藏</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 关于 */}
        <View style={s.section}>
          <View style={s.aboutCard}>
            <Text style={s.aboutTitle}>RentSmart AI v0.1.0</Text>
            <Text style={s.aboutDesc}>
              AI 智能租房助手{'\n'}
              所有数据仅存储在本地设备{'\n'}
              API 请求直接从设备发送，不经中转
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgSecondary },
  header: {
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerTitle: { ...Typography.h2, color: Colors.textPrimary },

  body: { flex: 1 },

  section: {
    backgroundColor: Colors.bgPrimary,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1 },
  sectionDesc: { ...Typography.label, color: Colors.textTertiary, marginBottom: Spacing.md },

  expandBtnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  locBtnInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, justifyContent: 'center' },
  saveBtnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dangerBtnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  input: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Typography.body1,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.divider,
  },

  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgTertiary,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  modelCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  modelInfo: { flex: 1 },
  modelName: { ...Typography.h4, color: Colors.textPrimary },
  modelDesc: { ...Typography.label, color: Colors.textSecondary, marginTop: 2 },
  freeBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    marginRight: Spacing.md,
  },
  freeText: { ...Typography.label, color: Colors.primary, fontWeight: '600' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  expandBtn: { paddingVertical: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  expandText: { ...Typography.body2, color: Colors.primary },

  customWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.xs },
  customChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 20,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  customChipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  customChipText: { ...Typography.body2, color: Colors.textSecondary },
  customChipTextActive: { color: Colors.primary, fontWeight: '600' },

  linkRow: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md },
  linkText: { ...Typography.body2, color: Colors.primary },

  locationBtnRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  locationBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    minHeight: 48,
    justifyContent: 'center',
  },
  locationBtnHalf: {
    flex: 1,
  },
  mapBtn: {
    backgroundColor: Colors.bgPrimary,
  },
  locationBtnText: { ...Typography.h4, color: Colors.primary, fontWeight: '600' },
  locationHint: {
    ...Typography.labelSmall,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    lineHeight: 16,
  },

  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textInverse },

  dangerBtn: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffe0e0',
    backgroundColor: '#fff5f5',
  },
  dangerBtnText: { fontSize: 14, color: Colors.error },

  aboutCard: {
    backgroundColor: '#fafafa', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  aboutTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  aboutDesc: { fontSize: 12, color: '#999', marginTop: 6, textAlign: 'center', lineHeight: 18 },
});
