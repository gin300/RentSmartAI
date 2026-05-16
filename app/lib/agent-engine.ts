import { AGENT_TOOLS, type AgentTool } from './agent-tools';
import { getApiConfig } from './storage';
import { isLegalQuestion, searchLegalKB } from './rag';

/**
 * 用 RAG 检索内容 + DeepSeek 结合生成法律类回答。
 * 严格要求模型以知识库片段为依据，不得无中生有法条。
 */
export async function callRagLegalAnswer(
  userQuery: string,
  ragQuery?: string,
): Promise<AgentResponse> {
  const config = await getApiConfig();
  const apiKey = resolveDeepSeekKey(config);

  const hits = await searchLegalKB(ragQuery || userQuery);
  const sources = hits.length ? [...new Set(hits.map((h) => h.source))] : [];

  if (!hits.length) {
    return {
      type: 'legal_answer',
      content:
        '在本地法律知识库中未检索到足够相关的内容，建议换用更具体的关键词（如"押金不退""合同违约"），或直接咨询专业律师。',
      data: [],
      sources: [],
    };
  }

  const ragContext = hits
    .map((h, i) => `【片段${i + 1} 来源:${h.source}】\n${h.snippet}`)
    .join('\n\n');

  const systemPrompt = `你是专业租房顾问，正在基于本机法律知识库片段回答用户问题。

要求：
1. 回答**必须以知识库片段为依据**，不得凭空引用法条编号或内容；
2. 若某条建议无法从片段中找到支撑，明确标注「知识库暂无相关记录，建议咨询律师」；
3. 用**通俗中文**整理成可执行建议，结构清晰，使用 Markdown 标题/列表；
4. 最后附一行：「> 📚 以上内容综合自本机租房法律知识库，仅供参考，不构成法律意见。」`;

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `用户问题：${userQuery}\n\n知识库片段：\n${ragContext}\n\n请结合以上片段，给出条理清晰的建议。`,
    },
  ];

  if (!apiKey) {
    const fallback = [
      `## ${userQuery}`,
      '',
      ...hits.map((h, i) => `### 参考片段 ${i + 1}（${h.source}）\n\n${h.snippet}`),
      '',
      '> 📚 以上内容来自本机租房法律知识库，仅供参考。（API Key 未配置，暂不能生成 AI 总结）',
    ].join('\n\n');
    return { type: 'legal_answer', content: fallback, data: hits, sources };
  }

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 1600,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek API 错误: ${res.status}`);
  const data = await res.json();
  const text = stripDsmlToolLeak(
    (data.choices?.[0]?.message?.content || '').trim() || '暂无回复',
  );
  return { type: 'legal_answer', content: text, data: hits, sources };
}

export type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AgentResponse = {
  type: 'text' | 'listing_cards' | 'compare_report' | 'legal_answer';
  content: string;
  data?: any;
  sources?: string[];
};

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
};

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = 'deepseek-chat';

function resolveDeepSeekKey(config: Awaited<ReturnType<typeof getApiConfig>>): string {
  return config.deepseekApiKey || config.apiKey || '';
}

function toToolDefinitions() {
  return AGENT_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function buildSystemPrompt(): string {
  return `你是 RentSmart AI 的租房助手 Agent，像真人顾问一样**先想清楚再行动**：先理解用户要什么、信息够不够，再决定是追问还是调用工具。

【找房 / 检索房源】
1. **首轮需求对齐（必须先做）**  
   当用户用一段话描述租房/找房需求（含预算、户型、地铁、区域等）时：  
   - **不要立刻调用** search_listings。  
   - 先**简要复述**你理解的城市、整租/合租、预算、户型、地铁/宠物等要点；若缺**城市**且无法从上下文或用户偏好推断，**只问这一句**，其它不要展开问卷。  
   - 用自然口吻询问：是否还有要补充或修改的？并请用户明确回复可以开始检索（例如「确认」「开始找房」「就按这个」）。  
   - 语气友好、有节奏，避免机械重复用户原话整段照抄。

2. **用户确认后再检索**  
   当用户在对话中明确表示「确认 / 没有补充 / 开始找 / 就按这个」等，或应用已代为注入「用户已确认以上找房需求无补充」的说明时：  
   - 再调用 search_listings；未提及的条件仍按下列**默认**补全：  
     · rentMode：未说明 → 整租  
     · 预算：未说明 → 不限（不传或 0）  
     · needSubway：仅当用户明确提到近地铁/轨交时为 true  
     · needPets：仅当用户明确提到养宠时为 true  

3. **继续搜房**  
   用户发送「继续搜索」「换一批」等短指令时：筛选条件与上一轮保持一致；应用会自动排除会话里已展示过的房源 id，避免重复推荐。

【精筛 / 多套决策（与「对比表」区分）】
当用户在上文已出现多套房源卡片后，使用「开始精筛」「精筛」「深度分析」「帮我挑一套」「该选哪套」等表达时：
- 精筛的目标是输出**一份决策型书面报告**，帮助用户**选定一套（并说明备选）**；**不是**做「综合对比」式的信息罗列。
- **禁止**：用 Markdown 表格（或逐套对齐列）重复卡片上已有的价格、面积、是否近地铁、初筛评分/初筛推荐理由等字段；不要用「📊 综合对比」类标题做简单复述。
- **必须**包含（可用二级标题组织）：
  · 结论先行：用一段话概括整体判断；
  · **首选推荐**：明确写出「建议优先考虑：〈小区或标题中的主称呼〉」及 **3–5 条决策理由**（写取舍、风险、适配场景，勿复述标签列表）；
  · **备选方案**：若另有 1 套可作为备选，说明适用条件（如预算更紧、更在意通勤等）；
  · **不确定性与假设**：若缺少通勤/预算等关键信息，需声明假设，并提示用户补充或去详情页做页面级精筛；
  · **可执行建议**：看房、核实产权/费用、谈判等 2–4 条短句。
- 文风为书面顾问意见，不要用聊天式「好的」开头，不要以「你对哪套感兴趣」代替明确推荐。

【其他对话】
- 法律问题优先走法律知识库相关能力
- 房源分析、对比等走对应工具；**助手内「精筛」**按上文【精筛】规则以报告形式回答，不要调用 generate_compare_report 除非用户明确要求生成「对比页/对比报告」类交付物。
- 简单咨询直接回答

【重要原则】
- **先对齐、再检索**：信息型找房需求不要抢跑搜索；用户确认后再动手。
- 输出简洁、口语化，不要暴露工具名称
- 输出中文
- 严禁在可见正文中书写任何形式的工具调用标记（包括但不限于 DSML、<|…|>、invoke、tool_calls 等）；检索房源必须通过接口提供的 function calling，不得把上述内容当作用户可见文案输出。
- 每次搜索房源在结果允许时尽量呈现 2–3 套及以上，禁止无故只挑 1 套展示。`;
}

async function callDeepSeek(
  apiKey: string,
  messages: DeepSeekMessage[],
  withTools: boolean,
  options?: { forcedTool?: string },
): Promise<any> {
  const payload: any = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 1800,
  };

  if (withTools) {
    payload.tools = toToolDefinitions();
    if (options?.forcedTool) {
      payload.tool_choice = { type: 'function', function: { name: options.forcedTool } };
    } else {
      payload.tool_choice = 'auto';
    }
  }

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek API 错误: ${res.status}`);
  }
  return await res.json();
}

function parseToolArguments(rawArgs: string | undefined): Record<string, unknown> {
  if (!rawArgs) return {};
  try {
    return JSON.parse(rawArgs);
  } catch {
    return {};
  }
}

function getToolByName(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name);
}

function normalizeResponseByTool(toolName: string, toolResult: any): AgentResponse {
  if (toolName === 'search_listings') {
    const count = Number(toolResult?.total ?? toolResult?.listings?.length ?? 0);
    const hint = typeof toolResult?.hint === 'string' ? toolResult.hint.trim() : '';
    const base = `为您找到 ${count} 套符合条件的房源，以下是推荐列表：`;
    return {
      type: 'listing_cards',
      content: hint && count === 0 ? `${hint}` : hint ? `${base}\n\n${hint}` : base,
      data: toolResult?.listings || [],
    };
  }
  if (toolName === 'generate_compare_report') {
    return {
      type: 'compare_report',
      content: typeof toolResult?.report?.summary === 'string' ? toolResult.report.summary : '已生成对比报告',
      data: toolResult?.report || toolResult,
    };
  }
  if (toolName === 'search_legal_knowledge') {
    const hits = Array.isArray(toolResult?.hits) ? toolResult.hits : [];
    return {
      type: 'legal_answer',
      content: hits.length ? '已检索相关法律依据，详见结果。' : '未检索到直接匹配的法律片段。',
      data: hits,
      sources: hits.map((h: any) => h.source).filter(Boolean),
    };
  }
  return {
    type: 'text',
    content: typeof toolResult === 'string' ? toolResult : '工具执行完成。',
    data: toolResult,
  };
}

/** 模型偶发把伪工具协议写进 content，而 tool_calls 为空 —— 用户会看到「源码」 */
function containsDsmlToolLeak(content: string): boolean {
  const s = content || '';
  if (!s.trim()) return false;
  if (/DSML/i.test(s) && /(tool_calls|invoke|search_listings)/i.test(s)) return true;
  if (/<\|[\s\S]{0,200}search_listings/i.test(s)) return true;
  return false;
}

function stripDsmlToolLeak(content: string): string {
  return (content || '')
    .split('\n')
    .filter((line) => {
      const u = line.trim();
      if (!u) return true;
      if (/DSML/i.test(u)) return false;
      if (/invoke\s+name\s*=/i.test(u)) return false;
      if (/tool_calls/i.test(u) && /[<>|]/.test(u)) return false;
      if (/^\s*<\|/.test(line)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isLikelyListingSearchIntent(userInput: string): boolean {
  return /找房|租房|房源|整租|合租|公寓|短租|预算|地铁|室|居|套|小区|商圈/.test(userInput);
}

export async function runAgent(
  userInput: string,
  conversationHistory: AgentMessage[]
): Promise<AgentResponse> {
  const config = await getApiConfig();
  const apiKey = resolveDeepSeekKey(config);
  if (!apiKey) {
    throw new Error('未找到可用 API Key，请在设置中检查 DeepSeek 配置');
  }

  const historyMessages: DeepSeekMessage[] = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Step A: 首次调用，携带工具定义
  const firstMessages: DeepSeekMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...historyMessages,
    { role: 'user', content: userInput },
  ];
  const firstRes = await callDeepSeek(apiKey, firstMessages, true);
  let firstMessage = firstRes?.choices?.[0]?.message;
  let toolCalls = Array.isArray(firstMessage?.tool_calls) ? firstMessage.tool_calls : [];

  if (
    toolCalls.length === 0 &&
    containsDsmlToolLeak(String(firstMessage?.content || '')) &&
    isLikelyListingSearchIntent(userInput)
  ) {
    // #region agent log
    fetch('http://127.0.0.1:7750/ingest/c7852349-c1c4-418e-b862-f082a33bb43e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cb84fa'},body:JSON.stringify({sessionId:'cb84fa',location:'agent-engine.ts:runAgent',message:'dsml_leak_retry_force_search_listings',data:{userLen:userInput.length},timestamp:Date.now(),hypothesisId:'H-leak'})}).catch(()=>{});
    // #endregion
    try {
      const retryRes = await callDeepSeek(apiKey, firstMessages, true, { forcedTool: 'search_listings' });
      firstMessage = retryRes?.choices?.[0]?.message;
      toolCalls = Array.isArray(firstMessage?.tool_calls) ? firstMessage.tool_calls : [];
    } catch {
      /* tool_choice 强制格式若不被服务端接受，则跳过重试 */
    }
  }

  // 强制重试后仍无 tool_calls，但正文仍像工具泄漏：直接执行 search_listings，避免用户只看到「源码」
  if (
    toolCalls.length === 0 &&
    isLikelyListingSearchIntent(userInput) &&
    containsDsmlToolLeak(String(firstMessage?.content || ''))
  ) {
    const tool = getToolByName('search_listings');
    if (tool) {
      // #region agent log
      fetch('http://127.0.0.1:7750/ingest/c7852349-c1c4-418e-b862-f082a33bb43e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cb84fa'},body:JSON.stringify({sessionId:'cb84fa',location:'agent-engine.ts:runAgent',message:'manual_search_listings_after_dsml',data:{},timestamp:Date.now(),hypothesisId:'H-leak'})}).catch(()=>{});
      // #endregion
      const result = await tool.execute({});
      return normalizeResponseByTool('search_listings', result);
    }
  }

  // Step B-1: 返回了 tool_calls
  if (toolCalls.length > 0) {
    const messagesWithTools: DeepSeekMessage[] = [
      ...firstMessages,
      {
        role: 'assistant',
        content: firstMessage?.content || '',
        tool_calls: toolCalls,
      },
    ];

    let lastToolName = '';
    let lastToolResult: any = null;

    for (const call of toolCalls) {
      const toolName = call?.function?.name;
      const tool = getToolByName(toolName);
      if (!tool) continue;

      const args = parseToolArguments(call?.function?.arguments);
      const result = await tool.execute(args);
      lastToolName = toolName;
      lastToolResult = result;

      messagesWithTools.push({
        role: 'tool',
        tool_call_id: call.id,
        name: toolName,
        content: JSON.stringify(result),
      });
    }

    // 二次调用，生成最终回复
    const secondRes = await callDeepSeek(apiKey, messagesWithTools, false);
    const finalText = stripDsmlToolLeak(
      secondRes?.choices?.[0]?.message?.content?.trim() || '已完成工具调用，但未生成文本回复。',
    );

    const normalized = normalizeResponseByTool(lastToolName, lastToolResult);
    if (lastToolName === 'search_listings') {
      return normalized;
    }
    return {
      ...normalized,
      content: finalText,
      sources: normalized.sources,
      data: normalized.data,
    };
  }

  // Step B-2: 直接返回文本
  const directText = (firstMessage?.content || '').trim();
  const legalHit = isLegalQuestion(userInput);
  if (legalHit) {
    return await callRagLegalAnswer(userInput);
  }

  // 未命中法律，直接返回模型文本（剥离偶发泄漏的工具标记）
  const cleaned = stripDsmlToolLeak(directText);
  return {
    type: 'text',
    content: cleaned || '暂无回复',
  };
}

// 自动验证入口（供启动自检或模块测试调用）
export async function runAgentEngineSelfCheck(): Promise<void> {
  try {
    const res = await runAgent('押金不退怎么维权？', []);
    if (!res || typeof res.content !== 'string') {
      throw new Error('AgentResponse 结构异常');
    }
    console.log(`[AgentEngineSelfCheck] PASS: type=${res.type}`);
  } catch (error: any) {
    console.error('[AgentEngineSelfCheck] FAIL:', error?.message || error);
  }
}

