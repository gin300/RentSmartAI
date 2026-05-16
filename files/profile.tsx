import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Alert, Linking,
} from 'react-native';

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

export default function ProfilePage() {
  const [textModel, setTextModel] = useState('deepseek');
  const [visionModel, setVisionModel] = useState('glm4v');
  const [apiKey, setApiKey] = useState('');
  const [customApiBase, setCustomApiBase] = useState('');
  const [commuteAddr, setCommuteAddr] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>我的设置</Text>
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {/* 通勤地址 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🏢 通勤地址</Text>
          <Text style={s.sectionDesc}>设置后，AI 会自动计算每套房源的通勤距离</Text>
          <TextInput
            style={s.input}
            placeholder="例：望京SOHO / 国贸CBD"
            placeholderTextColor="#bbb"
            value={commuteAddr}
            onChangeText={setCommuteAddr}
          />
        </View>

        {/* 初筛模型 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🤖 初筛模型（文本分析）</Text>
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
          <Text style={s.sectionTitle}>👁 精筛模型（识图分析）</Text>
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
            <Text style={s.expandText}>
              {showCustom ? '收起自定义模型 ▲' : '使用其他模型 ▼'}
            </Text>
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
          <Text style={s.sectionTitle}>🔑 API Key</Text>
          <Text style={s.sectionDesc}>内置免费模型无需填写，切换到其他模型时需要</Text>
          <TextInput
            style={s.input}
            placeholder="sk-..."
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

        {/* 保存 */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.saveBtn}
            onPress={() => Alert.alert('已保存', '设置已保存到本地')}
          >
            <Text style={s.saveBtnText}>💾 保存设置</Text>
          </TouchableOpacity>
        </View>

        {/* 数据管理 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📂 数据管理</Text>
          <TouchableOpacity style={s.dangerBtn} onPress={() => Alert.alert('确认', '清空所有分析历史？', [{ text: '取消' }, { text: '确认', style: 'destructive' }])}>
            <Text style={s.dangerBtnText}>🗑 清空历史记录</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.dangerBtn, { marginTop: 8 }]} onPress={() => Alert.alert('确认', '清空所有收藏？', [{ text: '取消' }, { text: '确认', style: 'destructive' }])}>
            <Text style={s.dangerBtnText}>🗑 清空收藏</Text>
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
  safe: { flex: 1, backgroundColor: '#f5f5f8' },
  header: {
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#222' },

  body: { flex: 1 },

  section: {
    backgroundColor: '#fff', marginTop: 10, paddingHorizontal: 20, paddingVertical: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 4 },
  sectionDesc: { fontSize: 12, color: '#999', marginBottom: 12 },

  input: {
    backgroundColor: '#f5f5f8', borderRadius: 8, padding: 12,
    fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#f0f0f0',
  },

  modelCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 10, backgroundColor: '#fafafa',
    marginBottom: 8, borderWidth: 1, borderColor: '#f0f0f0',
  },
  modelCardActive: { borderColor: '#00ae66', backgroundColor: '#f0faf5' },
  modelInfo: { flex: 1 },
  modelName: { fontSize: 14, fontWeight: '600', color: '#333' },
  modelDesc: { fontSize: 12, color: '#999', marginTop: 2 },
  freeBadge: {
    backgroundColor: '#e8f7f0', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, marginRight: 10,
  },
  freeText: { fontSize: 11, color: '#00ae66', fontWeight: '600' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: '#00ae66' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00ae66' },

  expandBtn: { paddingVertical: 12, alignItems: 'center' },
  expandText: { fontSize: 13, color: '#00ae66' },

  customWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  customChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f5f5f8', borderWidth: 1, borderColor: '#f0f0f0',
  },
  customChipActive: { backgroundColor: '#e8f7f0', borderColor: '#00ae66' },
  customChipText: { fontSize: 13, color: '#666' },
  customChipTextActive: { color: '#00ae66', fontWeight: '600' },

  linkRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  linkText: { fontSize: 13, color: '#00ae66' },

  saveBtn: {
    backgroundColor: '#00ae66', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  dangerBtn: {
    borderRadius: 8, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#ffe0e0', backgroundColor: '#fff5f5',
  },
  dangerBtnText: { fontSize: 14, color: '#e74c3c' },

  aboutCard: {
    backgroundColor: '#fafafa', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  aboutTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  aboutDesc: { fontSize: 12, color: '#999', marginTop: 6, textAlign: 'center', lineHeight: 18 },
});
