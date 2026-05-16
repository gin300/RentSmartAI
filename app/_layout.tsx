import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { runAgentModuleSelfCheck } from './lib/agent-selfcheck';
import { initRAG, runRAGSelfCheck } from './lib/rag';

export default function RootLayout() {
  const androidTopInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0;

  useEffect(() => {
    // 启动后自动执行一次 Agent 模块自检，避免手动验证。
    runAgentModuleSelfCheck();
    // #region agent log
    fetch('http://127.0.0.1:7750/ingest/c7852349-c1c4-418e-b862-f082a33bb43e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'50dec4'},body:JSON.stringify({sessionId:'50dec4',runId:'initial',hypothesisId:'H2',location:'app/_layout.tsx:15',message:'RootLayout initRAG start',data:{platform:Platform.OS},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // 启动时初始化法律知识库 RAG 索引。
    initRAG().catch((error) => {
      // #region agent log
      fetch('http://127.0.0.1:7750/ingest/c7852349-c1c4-418e-b862-f082a33bb43e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'50dec4'},body:JSON.stringify({sessionId:'50dec4',runId:'initial',hypothesisId:'H4',location:'app/_layout.tsx:19',message:'initRAG catch triggered',data:{errorMessage:String(error?.message||error)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.warn('[RAG] init failed:', error);
    });
    // 启动时执行 RAG 自检，验证检索链路可运行。
    runRAGSelfCheck();
  }, []);

  return (
    <>
      <StatusBar style="dark" translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { paddingTop: androidTopInset },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="listing/[id]" />
        <Stack.Screen name="compare" />
        <Stack.Screen name="history" />
        <Stack.Screen name="favorites" />
        <Stack.Screen name="deep-analyses" />
      </Stack>
    </>
  );
}
