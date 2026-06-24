# OfferTrack Cloud AI 求职追踪助手

这是一个可部署、支持跨设备同步的 AI 求职追踪网页项目。用户可以注册/登录账号，记录岗位投递、面试状态、跟进日期和备注；登录后数据会保存到 Supabase PostgreSQL 数据库，在不同设备上都能读取。

## 功能

- 邮箱注册和登录：使用 Supabase Auth
- 云端数据保存：使用 Supabase PostgreSQL
- 多用户数据隔离：使用 Row Level Security，用户只能读写自己的记录
- 岗位投递管理：新增、删除、状态更新、状态筛选、实习/工作类型
- 求职仪表盘：总投递、面试中、Offer、待跟进统计
- 本地备用模式：未配置 Supabase 或未登录时使用 `localStorage`
- 数据导入导出：支持 JSON 备份，也可将本地记录上传到云端
- AI 简历生成：部署到 Vercel 后配置 `OPENAI_API_KEY` 即可调用 OpenAI API

## 本地预览

```bash
cd offertrack-cloud
python -m http.server 8000
```

打开：

```text
http://127.0.0.1:8000
```

本地静态预览可以测试页面、表单和本地保存。AI API 需要通过 Vercel 本地开发或部署后测试。

## 配置 Supabase

1. 在 Supabase 创建新项目。
2. 打开 SQL Editor。
3. 复制 `database/schema.sql` 的全部内容并执行。
4. 打开 Project Settings -> API。
5. 复制 Project URL 和 anon public key。
6. 填入 `config.js`：

```js
export const SUPABASE_URL = "https://你的项目.supabase.co";
export const SUPABASE_ANON_KEY = "你的 anon public key";
```

完成后刷新网页，就可以注册账号、登录并跨设备同步数据。

如果你已经建过旧版 jobs 表，再运行一次 `database/add-job-type.sql`，给岗位记录增加实习/工作类型字段。

## 部署到 Vercel

1. 把 `offertrack-cloud` 目录上传到 GitHub。
2. 在 Vercel 导入仓库。
3. 如果仓库根目录不是 `offertrack-cloud`，在 Vercel 项目设置里把 Root Directory 设为 `offertrack-cloud`。
4. 在 Environment Variables 中添加：

```text
GEMINI_API_KEY=你的 Google AI Studio API Key
GEMINI_MODEL=gemini-2.5-flash-lite
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
```

5. 点击 Deploy。

## 数据保存在哪里

未登录时：

```text
浏览器 localStorage
```

登录后：

```text
Supabase PostgreSQL 的 public.jobs 表
```

每条记录都有 `user_id`，数据库 RLS 策略会限制用户只能访问自己的数据。

## 简历写法参考

> 开发并部署 OfferTrack Cloud AI 求职追踪助手，支持用户注册登录、岗位投递追踪、面试状态管理、跟进提醒、数据导入导出与 AI 简历项目描述生成；基于 Supabase Auth、PostgreSQL 和 Row Level Security 实现跨设备数据持久化与多用户数据隔离，使用 Vercel Serverless Function 封装 OpenAI API，并通过 Codex 辅助完成需求拆解、前端实现、云端同步逻辑和部署排错。

## 官方文档

- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase JavaScript: https://supabase.com/docs/reference/javascript
- Vercel: https://vercel.com/docs

## Excel 导入导出

页面右上角支持：

- `导出Excel`：导出当前账号/当前浏览器里的投递信息表
- `下载模板`：下载可填写的 Excel 模板
- `导入Excel`：读取模板中的投递记录并写入当前数据源

模板字段包括：类型、公司、岗位、状态、投递日期、跟进日期、链接、备注。模板的 `类型` 和 `状态` 列内置下拉框：类型可选实习/工作，状态可选收藏/已投递/面试中/Offer/已结束。模板还包含 `填写说明` 工作表。