# weibo-memos-lite

轻量本地版“那年今日”微博回忆，导入 `weibo-archiver` 的 JSON 存档后，在浏览器本地生成回忆流，无需后端。

Live demo: https://today.closeai.moe

## 心路历程

最近半个月，我有个新的习惯：在「那年今日」里考古。能看到自己和其他人在往年的今天发了什么微博、在做什么有趣的事情。

我的做法是把自己和想关注的人的微博都保存下来，然后按日期去筛选并展示。我还想把任何带时间戳的文本、图片、视频都纳入这个系统。这样一来，不需要追赶实时热点，只要认真过完 2026 年的每一天，我就能和过去无数个年份里的“今天”重逢。只需要一年时间就能「遍历」过去，这是很划算的事情。

看着往年的自己和朋友在同一天做的事，感觉很奇妙。以前随口一说的愿望和想法，现在是不是有能力实现了？看着别人曾走过的路，是不是也能给现在迷茫的自己一点灵感或方向？

## 功能概览

- 本地导入微博 JSON 存档，自动去重（以微博 id 为键）
- “那年今日”回忆流：只展示历年同月同日的微博
- 多用户混合流或单用户筛选
- 收藏功能（保存到 IndexedDB）
- 图片 CDN 代理（避免防盗链）
- 无图模式开关（状态缓存）
- 支持微博表情与链接解析

## 技术栈

- Vue 3 + Vite
- Dexie.js (IndexedDB)
- Day.js
- Lucide Vue Next
- Mitt (组件通信)

## 快速开始

```bash
bun install
bun run dev
```

构建产物：

```bash
bun run build
```

## 使用说明

1. 打开页面后点击“导入 JSON”，选择 `weibo-archiver` 导出的存档文件。
2. 导入完成后，顶部会显示用户数与微博数。
3. 页面默认展示“今日回忆”，可切换“已收藏”查看收藏内容。
4. 打开“无图模式”可隐藏图片和图像按钮，状态会缓存。
5. 选择“单用户”模式可只查看某一位用户的“那年今日”。

## 数据格式说明

建议使用 `weibo-archiver` 导出的 JSON。结构示例可参考：

- `docs/sample_data.json`

导入逻辑会尝试兼容以下字段：

- 用户：`user.idstr` / `user.uid` / `user.id`
- 用户头像：`user.avatar_hd` / `user.avatar`
- 微博时间：`created_at` / `createdAt`
- 微博内容：`text_raw` / `text`
- 图片：`pics` 或 `imgs`

## 本地存储

数据全部保存在浏览器 `IndexedDB`（数据库名：`WeiboMemosLite`），不会上传到服务器。
目前仅兼容 [weibo-archiver](https://github.com/Chilfish/weibo-archiver) 的导出格式。

## 资源与路径

- 表情配置：`public/emoji.json`
- 表情组件：`src/components/weibo/WeiboEmoji.vue`
- 文本解析：`src/components/weibo/WeiboText.tsx`

## 常见问题

### 为什么图片显示不出来？

图片默认使用百度 CDN 代理处理，若原图链接失效或防盗链升级，可能会无法加载。

### 为什么时间排序不是按年份？

“那年今日”只在当日内按时间排序（从 00:00 开始），如遇时间完全相同，再按年份排序。

## 鸣谢

感谢 [weibo-archiver](https://github.com/Chilfish/weibo-archiver) 的完整导出能力与“那年今日”功能。正是它让我看见这些记忆原本就可以被好好整理；而这个项目只是把那份能力，悄悄调整成更适合我的形状。

## 开源协议说明

本项目采用 MIT 协议。其中解析组件（WeiboText 等）参考或引用了
[weibo-archiver](https://github.com/Chilfish/weibo-archiver) 的部分实现，
该部分代码遵循 Apache License 2.0 协议。
