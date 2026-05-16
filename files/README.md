# RentSmart AI - Step 1 安装说明

## 文件说明

```
app/
├── _layout.tsx           ← 根布局（控制页面导航）
└── (tabs)/
    ├── _layout.tsx       ← 底部导航栏配置
    ├── index.tsx         ← 🏠 首页
    ├── search.tsx        ← 🔍 找房（核心页面）
    ├── chat.tsx          ← 💬 AI助手
    └── profile.tsx       ← ⚙ 我的/设置
```

## 操作步骤

### 1. 先停掉正在运行的服务
在 CMD 里按 `Ctrl+C`

### 2. 删除旧的 app 文件夹
打开你的项目文件夹 `C:\Users\你的用户名\RentSmartAI`
把里面的 `app` 文件夹整个删掉

### 3. 把新文件放进去
把下载的 `app` 文件夹（包含上面的所有文件）复制到项目根目录下
确保路径是：
```
RentSmartAI/
├── app/
│   ├── _layout.tsx
│   └── (tabs)/
│       ├── _layout.tsx
│       ├── index.tsx
│       ├── search.tsx
│       ├── chat.tsx
│       └── profile.tsx
├── package.json
├── ...其他文件
```

### 4. 重新启动
在 CMD 里输入：
```
cd RentSmartAI
npx expo start -c
```
（-c 表示清除缓存）

### 5. 手机扫码查看
打开 Expo Go 扫描二维码
