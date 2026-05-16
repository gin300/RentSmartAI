# RentSmart AI · 智能租房助手

用一句话概括：**把「刷平台、记条件、算通勤、怕踩坑」这些事，交给手机里的 AI 助手和你一起完成。**

本说明面向**产品展示与功能介绍**，便于快速了解这款应用能为你做什么；文末会简要说明背后采用的技术，便于理解能力边界。

---

## 技术亮点速览

| 亮点 | 说明 |
|------|------|
| 🤖 Agent 架构 | DeepSeek Function Calling，Agent 自主决策调用工具链 |
| 📚 RAG 检索增强 | `@xenova/transformers` 端侧向量化，语义检索法律知识库 |
| 👁️ 多模态 AI | 文本模型（DeepSeek）初筛 + 视觉模型（GLM-4V）精筛 |
| 📍 通勤计算 | 高德地图路线规划 API，支持公交 / 驾车 / 步行 / 骑行 |
| ⚡ 事件驱动 | 收藏行为触发 Agent 主动服务，跨界面全局状态感知 |

---

## 为什么需要它

租房时常见困扰包括：信息太多筛不过来、价格和通勤难以一起权衡、中介话术和合同条款让人不放心、看房时不知道重点看哪里。

RentSmart AI 把 **AI 初筛、对话找房、通勤测算、法律知识辅助、房源对比与深度报告** 放在同一款 App 里，让你少在几个 App 之间来回切换，把精力留给真正想住的那几套房。

---

## 产品界面一览

<table>
  <tr>
    <td align="center"><img src="https://raw.githubusercontent.com/gin300/RentSmartAI/main/screenshots/home.jpg" width="200"/><br/>首页</td>
    <td align="center"><img src="https://raw.githubusercontent.com/gin300/RentSmartAI/main/screenshots/search.jpg" width="200"/><br/>找房</td>
    <td align="center"><img src="https://raw.githubusercontent.com/gin300/RentSmartAI/main/screenshots/detail.jpg" width="200"/><br/>房源详情</td>
  </tr>
  <tr>
    <td align="center"><img src="https://raw.githubusercontent.com/gin300/RentSmartAI/main/screenshots/chat.jpg" width="200"/><br/>AI 助手</td>
    <td align="center"><img src="https://raw.githubusercontent.com/gin300/RentSmartAI/main/screenshots/compare.jpg" width="200"/><br/>房源对比</td>
    <td align="center"><img src="https://raw.githubusercontent.com/gin300/RentSmartAI/main/screenshots/profile.jpg" width="200"/><br/>我的与设置</td>
  </tr>
</table>

---

## 你能用它做什么

### 智能找房与偏好记忆

在 App 内打开常见租房平台页面，按引导扫描当前列表，系统会提取房源信息并给出 **AI 初筛评分与简短点评**。整租、合租、公寓等模式与常用筛选可与个人偏好联动，从详情返回列表时尽量保持你的筛选状态，减少重复操作。

### AI 对话助手（会先对齐再找房）

用自然语言说出预算、区域、户型等需求，助手会先 **和你确认理解是否一致**，得到你的明确确认后再去检索并展示房源卡片，降低「理解偏差」带来的无效结果。也支持上传分享海报识别房源、上传看房照片做场景分析；收藏达到一定条件时，可触发更综合的对比与建议。

### 通勤与时间

可设置常去地点（如公司），在对比或详情相关流程中查看 **预估通勤距离与耗时**。默认按 **公交地铁等公共交通** 规划；若你更习惯驾车、步行或骑行，可在「我的」里切换规划方式，数据由 **高德地图 Web 服务** 的路线与地理编码能力支撑。

### 房源对比

将多套候选房放在一起横向对比，涵盖价格、户型、标签、通勤、AI 评分等维度，方便快速做决定。

### 深度筛查报告

对特别感兴趣的房源可生成 **深度分析报告**：除结构化信息外，还可结合页面内可提取的设施与图片线索做更细的风险与居住体验提示；精筛环节可使用 **视觉类大模型** 辅助阅读图片信息。

### 租房法律与注意事项

内置 **本地法律知识库**（租赁相关常识、押金与合同类材料等），在对话中涉及租房权益、合同、押金等问题时，会先 **从知识库检索相关内容**，再结合大模型整理成 **条理清晰、带 Markdown 排版** 的说明，并强调以库内材料为依据，减少空口编造。助手界面也提供「租房避坑」「看房清单」「合同注意」「押金维权」等快捷入口。

### 数据都在你手机里

浏览记录、收藏、对话与偏好等默认保存在本机（**AsyncStorage**），方便离线回顾与连续使用。

---

## 功能背后的技术

| 能力方向 | 技术说明 |
|---------|---------|
| 跨端应用 | **React Native** 与 **Expo**，界面路由采用 **expo-router** |
| 对话与工具调用 | **DeepSeek** 通过 **Function Calling** 驱动「查房源、算通勤、读用户上下文」等动作，形成可自主决策的 Agent 流程 |
| 法律知识 | **RAG 检索增强生成**：使用 **@xenova/transformers** 在端侧做向量化与语义检索，再由模型基于检索结果生成回答 |
| 初筛与精筛 | 文本侧 **DeepSeek** 做房源初筛与对话；深度看图分析可选用 **智谱 GLM-4V** 等多模态接口 |
| 地图与通勤 | **高德地图** REST 接口：地理编码、逆地理编码、公交 / 驾车 / 步行 / 骑行等路线规划 |
| 内嵌浏览 | **react-native-webview** 内嵌平台页面，配合脚本做可控范围内的信息提取 |
| 富文本展示 | **react-native-markdown-display** 用于助手与报告中的 Markdown 排版渲染 |

---

## 使用上需要知道的事

- 房源列表依赖你在 App 内对平台页面的扫描与抓取，**无法绕过各平台自身的展示规则**；信息以当时页面为准
- 通勤与地图类功能依赖 **高德 Key**；AI 与视觉功能依赖「我的」中配置的 **API Key**，应用内提供默认测试额度
- **AI 与知识库内容仅供学习与决策参考**，不构成法律意见；签约、付款、看房请以平台规则及律师意见为准

---

## 免责声明

RentSmart AI 不隶属于安居客、贝壳找房或其他房产平台，为独立工具。请遵守各平台用户协议与当地法律法规。因使用本工具产生的任何纠纷与损失，需由用户自行判断与承担。
