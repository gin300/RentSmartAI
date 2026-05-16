import { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';

type Message = { role: 'user' | 'assistant'; content: string };

const QUICK_QUESTIONS = [
  { label: '租房避坑', prompt: '租房时最容易踩的坑有哪些？怎么避免？' },
  { label: '看房清单', prompt: '帮我列一个看房现场要核实的checklist' },
  { label: '合同注意', prompt: '签租房合同要重点注意哪些条款？' },
  { label: '押金维权', prompt: '退租时房东不退押金怎么办？' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！我是你的 AI 租房顾问 🏠\n\n你可以：\n• 问我任何租房问题\n• 发送房源链接让我分析\n• 描述需求让我帮你出主意\n\n有什么可以帮你的？',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    // 模拟 AI 回复（后续替换为真实 API）
    setTimeout(() => {
      const reply: Message = {
        role: 'assistant',
        content: '感谢你的提问！这个功能将在连接 AI 模型后启用。\n\n目前你可以先去「设置」页面配置 API Key，配置完成后就可以正常对话了。',
      };
      setMessages(prev => [...prev, reply]);
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 1000);
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>💬 AI 租房助手</Text>
        <Text style={s.headerSub}>有问必答，有坑必防</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={s.msgList}
          contentContainerStyle={{ paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m, i) => (
            <View key={i} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
              {m.role === 'assistant' && <Text style={s.bubbleAvatar}>🤖</Text>}
              <View style={[s.bubbleContent, m.role === 'user' ? s.bubbleContentUser : s.bubbleContentAI]}>
                <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>
                  {m.content}
                </Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={[s.bubble, s.bubbleAI]}>
              <Text style={s.bubbleAvatar}>🤖</Text>
              <View style={[s.bubbleContent, s.bubbleContentAI]}>
                <ActivityIndicator color="#00ae66" size="small" />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Quick questions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.quickBar}
          contentContainerStyle={{ paddingHorizontal: 12 }}
        >
          {QUICK_QUESTIONS.map(q => (
            <TouchableOpacity
              key={q.label}
              style={s.quickBtn}
              onPress={() => sendMessage(q.prompt)}
            >
              <Text style={s.quickBtnText}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            placeholder="输入问题，或粘贴房源链接..."
            placeholderTextColor="#bbb"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDis]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Text style={s.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f8' },

  header: {
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#222' },
  headerSub: { fontSize: 12, color: '#999', marginTop: 2 },

  msgList: { flex: 1, paddingHorizontal: 12 },

  bubble: { flexDirection: 'row', marginBottom: 16, maxWidth: '90%' },
  bubbleAI: { alignSelf: 'flex-start' },
  bubbleUser: { alignSelf: 'flex-end' },
  bubbleAvatar: { fontSize: 20, marginRight: 8, marginTop: 4 },
  bubbleContent: { borderRadius: 16, padding: 12, maxWidth: '85%' },
  bubbleContentAI: { backgroundColor: '#fff' },
  bubbleContentUser: { backgroundColor: '#00ae66' },
  bubbleText: { fontSize: 14, lineHeight: 20, color: '#333' },
  bubbleTextUser: { color: '#fff' },

  quickBar: {
    flexGrow: 0, borderTopWidth: 1, borderTopColor: '#f0f0f0',
    backgroundColor: '#fff', paddingVertical: 8,
  },
  quickBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f5f5f8', marginRight: 8, borderWidth: 1, borderColor: '#eee',
  },
  quickBtnText: { fontSize: 13, color: '#666' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  input: {
    flex: 1, backgroundColor: '#f5f5f8', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#333',
    maxHeight: 100, borderWidth: 1, borderColor: '#eee',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#00ae66', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDis: { backgroundColor: '#ccc' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },
});
