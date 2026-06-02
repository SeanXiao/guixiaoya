# 桂韵创想家

**桂韵创想家** 是一个面向小学生的广西非遗文旅 AI 绘本创编平台。它让孩子从一句灵感出发，和 AI 一起完成故事构思、广西文化选择、4 页绘本生成、插图创作、朗读展示和作品保存。

项目核心表达是：**小朋友提出想法，AI 引导和辅助创作，最后形成一本可以阅读、朗读和展示的广西文化绘本。**

## 项目定位

- 面向对象：参加小学 AI 项目比赛、喜欢故事和绘画的小学生。
- 创作主题：广西非遗、文旅、美食、山水、民族节庆和家乡文化。
- 作品形式：中文或 English 版本的 4 页 AI 绘本。
- 创作方式：语音或文字输入灵感，AI 生成故事、插图、小百科和朗读音频。
- 价值重点：提升创作能力、表达能力、文化理解能力，而不是让 AI 替孩子完成作品。

## 核心功能

- **灵感输入**：支持键盘输入和浏览器语音输入，把一句想法变成绘本创作起点。
- **广西文化创编**：围绕壮锦、绣球、铜鼓、三月三、桂林山水、北海银滩、德天瀑布等元素生成故事。
- **4 页绘本生成**：AI 生成标题、故事大纲、4 页正文、每页插图 Prompt 和文化小百科。
- **绘本插图**：调用阿里云百炼图片模型，为每一页生成儿童绘本风格插图。
- **中英文绘本**：支持中文绘本和 English 绘本，适合展示家乡文化和英语阅读练习。
- **绘本朗读**：使用百炼 CosyVoice 生成每页朗读音频，支持绘本剧场式展示。
- **我的绘本书架**：保存历史作品，可以打开、继续展示或删除绘本。
- **创作记录**：保存故事生成、插图生成和 Prompt 记录，方便比赛讲解“我是怎样和 AI 共创的”。
- **兜底演示**：当模型接口不可用时，可以生成本地示例绘本，避免比赛现场页面空白。

## 技术架构

- 前端：React 19 + TypeScript + Vite
- 后端：Express + TypeScript
- 文本模型：阿里云百炼 DashScope OpenAI 兼容接口
- 图片模型：阿里云百炼 `wan2.7-image-pro`
- 朗读模型：阿里云百炼 CosyVoice
- 本地数据：JSON 文件保存绘本、生成资源、创作记录和历史作品

当前版本聚焦“广西文化 AI 绘本创编”这一条主线：灵感输入、故事生成、插图生成、朗读展示、创作记录和作品书架。比赛演示和项目说明都围绕绘本创编展开，避免出现与作品生成无关的支线内容。

## 快速运行

1. 安装依赖：

```bash
npm install
```

2. 新建 `.env`，可以从 `.env.example` 复制：

```bash
cp .env.example .env
```

3. 在 `.env` 中填写阿里云百炼 Key：

```bash
DASHSCOPE_API_KEY=你的_阿里云百炼_key
BAILIAN_TEXT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
BAILIAN_TEXT_MODEL=qwen3.7-max
BAILIAN_STORY_TEXT_MODEL=deepseek-v4-pro
BAILIAN_IMAGE_MODEL=wan2.7-image-pro
BAILIAN_IMAGE_SIZE=1K
BAILIAN_TTS_MODEL=cosyvoice-v3-flash
PORT=8787
HOST=127.0.0.1
```

4. 启动单端口服务。普通开发可以前台运行：

```bash
npm run dev
```

打开 `http://127.0.0.1:8787`。

当前项目默认是**单端口模式**：前端会先构建到 `dist/`，然后由 Express 在 `PORT=8787` 同时提供页面、`/api` 接口和 `/generated` 资源。浏览器只需要访问 `http://127.0.0.1:8787`，不再需要单独打开 Vite 的 `5173` 端口。

## WorkBuddy 启动

在 WorkBuddy 里推荐运行：

```bash
./start.sh
```

这个脚本会：

- 自动安装缺失依赖、构建前端并启动单端口服务。
- 在后台守护服务，进程异常退出后自动重启。
- 把运行日志写到 `logs/guixiaoya.log`。
- 把进程状态写到 `.run/`，不会提交到 Git。

常用命令：

```bash
./start.sh status
./start.sh restart
./start.sh stop
./start.sh logs
```

如需临时使用旧的前后端分离调试方式，可以运行：

```bash
npm run dev:split
```

这种方式会同时启动 Vite `5173` 和后端 `8787`，仅作为开发调试备用。

## 比赛演示流程

可以用下面这条灵感开始：

> 我想做一本我在桂林漓江边遇见壮锦和山歌的绘本。

推荐演示顺序：

1. 选择中文或 English 绘本。
2. 输入或说出一句广西文化灵感。
3. 点击“开始做绘本”。
4. 展示 AI 生成的 4 页故事、小百科和插图。
5. 打开“我的绘本书架”，说明作品会被保存。
6. 进入绘本剧场，逐页朗读和展示。
7. 打开创作记录，说明 Prompt、故事输出和插图生成过程。

## 项目结构

```text
src/
  product/               桂韵创想家产品页面和展示逻辑
  App.tsx                经典绘本工坊页面
  styles.css             主样式
server/
  index.ts               Express API 入口
  bailian.ts             文本、图片、灵感生成
  bailianTts.ts          绘本朗读音频生成
  bookStore.ts           绘本保存和读取
  guangxiFallback.ts     广西文化本地兜底绘本
docs/
  guiyun-creative-requirements.md    需求文档
  software-architecture.md           软件架构说明
outputs/                 海报、易拉宝等展示物料
```

## 相关文档

- `docs/guiyun-creative-requirements.md`：项目需求文档
- `docs/software-architecture.md`：软件架构与技术模型

## 安全提醒

- `.env` 不要提交到 GitHub。
- API Key 只放在后端环境变量中，前端不会直接暴露。
- `data/` 目录中的生成数据和本地作品默认不提交，适合本机演示保存。
