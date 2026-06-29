# Chrome Extension Design: Paper PDF Renamer

## 1. 背景与目标

下载论文 PDF 时，浏览器经常拿到的是站点或服务器提供的文件名，例如 `2601.02732v1.pdf`、`main.pdf`、`download.pdf`、`paper.pdf`。这些文件名不利于检索、归档和阅读管理。

本插件的目标是在用户下载论文 PDF 时，自动将文件名改为论文标题，例如：

```text
2601.02732v1.pdf
=> Attention Is All You Need.pdf
```

优先目标是“下载时自动重命名”，而不是下载后再扫描本地文件夹。

## 2. 用户场景

### 2.1 核心场景

用户在论文页面点击 PDF 下载按钮，插件自动识别当前论文标题，并把下载文件名改为安全、可读的标题文件名。

示例：

- arXiv 页面：`https://arxiv.org/abs/2601.02732`
- PDF 链接：`https://arxiv.org/pdf/2601.02732v1`
- 原始下载名：`2601.02732v1.pdf`
- 新下载名：`Paper Title From arXiv.pdf`

### 2.2 辅助场景

用户直接打开 PDF 链接，例如 `https://arxiv.org/pdf/2601.02732v1`，插件仍应尽量反查论文标题。

用户从搜索结果页、论文列表页或第三方页面点击 PDF 下载，插件可以使用来源页面、PDF URL、站点 API 或 PDF 元数据推断标题。

### 2.3 失败场景

插件无法可靠识别标题时，不应生成错误标题。默认保持原文件名，并可在扩展图标或通知中提示“未识别论文标题”。

## 3. 范围

### 3.1 MVP 范围

第一版确认支持：

- arXiv
- OpenReview
- 直接 PDF 下载的标题推断
- 手动重命名弹窗：识别结果可编辑
- 基础文件名清洗：去掉非法字符、限制长度、处理重复文件名
- 已下载旧 PDF 的批量处理入口

### 3.2 后续范围

后续可以支持：

- DOI / Crossref 查询
- Semantic Scholar / DBLP / ACM / IEEE / Springer / ScienceDirect 等更多站点
- 从 PDF metadata 中读取 `Title`
- 自定义命名模板，例如 `{year} - {title}.pdf`、`{first_author} - {title}.pdf`
- 与 Zotero / Obsidian / Notion / 本地论文库集成

## 4. 非目标

第一版不做：

- 不修改用户历史下载记录
- 不强制联网查询所有 PDF
- 不保证所有出版社 PDF 都能识别
- 不做完整文献管理系统
- 不上传 PDF 内容到第三方服务

## 5. 产品体验

### 5.1 默认自动模式

用户点击下载后：

1. 插件监听 Chrome 下载事件。
2. 判断下载对象是否为 PDF。
3. 根据下载 URL、来源页面 URL、当前 Tab 内容提取论文标题。
4. 弹出确认窗口，显示原文件名和识别出的标题文件名。
5. 用户确认、编辑文件名或选择保持原名。
6. 通过 Chrome Downloads API 修改保存文件名。

用户感知上是“下载前先确认，下载出来的文件名就是论文标题”。

### 5.2 手动确认模式

第一版默认启用：

- 每次下载 PDF 前弹出一个小窗口。
- 显示识别出的标题。
- 用户可修改文件名。
- 点击确认后继续下载。

适合对归档命名要求较高的用户。

### 5.3 旧 PDF 批量处理

用户可以在插件页面选择一个本地文件夹，插件扫描其中的 PDF 文件，并尝试将旧文件名改成论文标题。

由于 Chrome 扩展不能任意访问本地文件系统，旧文件批量处理需要用户主动选择目录并授权。对同名文件的覆盖必须二次确认，避免把已有文件意外覆盖。

### 5.4 插件图标状态

插件图标可显示最近一次结果：

- 成功：显示新文件名
- 失败：显示失败原因
- 等待确认：打开确认弹窗

## 6. 命名规则

### 6.1 默认命名

```text
{title}.pdf
```

第一版只使用论文标题，不包含年份、作者、会议、arXiv ID 或 OpenReview ID。

### 6.2 文件名清洗

需要处理：

- 替换文件系统非法字符：`/ \ : * ? " < > |`
- 合并连续空格
- 去掉换行、制表符
- 去掉首尾空格和句点
- 最大长度建议限制为 180 个字符
- 保留 `.pdf` 后缀

示例：

```text
Large Language Models: A Survey / Overview?
=> Large Language Models - A Survey - Overview.pdf
```

### 6.3 重名处理

下载新 PDF 时，默认使用 Chrome 的冲突处理：

```text
Paper Title.pdf
Paper Title (1).pdf
```

如果用户明确启用“覆盖同名文件”，则使用 `conflictAction: "overwrite"`。这个选项应只在确认弹窗或设置页中明确展示。

处理旧 PDF 时，如果目标文件名已存在，必须弹出确认：

- 覆盖已有文件
- 保留两个文件
- 跳过当前文件

## 7. 技术架构

### 7.1 Chrome Extension Manifest V3

核心组件：

- `background service worker`
- `content scripts`
- `options page`
- `popup page`

所需权限：

```json
{
  "permissions": [
    "downloads",
    "tabs",
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

MVP 收窄 `host_permissions`，只支持 arXiv 和 OpenReview：

```json
{
  "host_permissions": [
    "https://arxiv.org/*",
    "https://openreview.net/*"
  ]
}
```

如果后续加入 Crossref 或 DOI 查询，再补充对应 API 域名。

### 7.2 下载拦截

使用 `chrome.downloads.onDeterminingFilename`。

处理逻辑：

1. 判断 `downloadItem.mime === "application/pdf"` 或 URL 以 `.pdf` 结尾。
2. 根据 `downloadItem.url` 匹配站点规则。
3. 获取候选标题。
4. 调用 `suggest({ filename, conflictAction: "uniquify" })`。

伪代码：

```ts
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  if (!isPdf(downloadItem)) {
    suggest();
    return;
  }

  resolvePaperTitle(downloadItem)
    .then((title) => {
      if (!title) {
        suggest();
        return;
      }

      const filename = await askUserToConfirmFilename({
        originalFilename: downloadItem.filename,
        suggestedFilename: sanitizeFilename(`${title}.pdf`)
      });

      suggest({
        filename,
        conflictAction: "uniquify"
      });
    })
    .catch(() => suggest());

  return true;
});
```

## 8. 标题识别策略

### 8.1 识别优先级

建议按可靠程度排序：

1. 站点专用规则
2. 来源页面 DOM 提取
3. 公开 API 查询
4. PDF metadata
5. PDF 文件名启发式
6. 放弃重命名

### 8.2 arXiv 规则

对于：

```text
https://arxiv.org/pdf/2601.02732v1
```

可转换为：

```text
https://arxiv.org/abs/2601.02732
```

然后从 abs 页面提取：

```css
h1.title
```

需要清理前缀：

```text
Title: Paper Title
=> Paper Title
```

也可以使用 arXiv export API：

```text
https://export.arxiv.org/api/query?id_list=2601.02732
```

### 8.3 OpenReview 规则

对于 OpenReview 论文页：

- URL 通常包含 `id=...`
- 页面中可从标题 DOM 或 OpenReview API 获取 `title`

优先使用当前页面 DOM；如果是直接 PDF 下载，再使用 URL 里的 paper id 反查。

OpenReview API 查询允许联网，第一版可以把它作为 OpenReview 的主要兜底策略。

### 8.4 通用 DOM 规则

在论文详情页中，候选标题来源包括：

- `meta[name="citation_title"]`
- `meta[property="og:title"]`
- `document.title`
- 页面中的 `h1`

其中 `citation_title` 通常最可靠。

### 8.5 PDF metadata

可选方案：

- 下载流开始时并不容易直接读取 PDF 内容。
- 如果要读取 PDF metadata，可能需要先 fetch PDF 的前几个字节或完整文件。
- 这会引入性能、跨域和隐私问题。

建议 MVP 不依赖 PDF metadata，只作为后续增强。

## 9. 数据流

```text
用户点击 PDF 下载
        |
Chrome 创建 downloadItem
        |
background 监听 onDeterminingFilename
        |
判断是否 PDF
        |
解析 URL / 来源页面 / 当前 Tab
        |
提取论文标题
        |
清洗为合法文件名
        |
suggest 新文件名
        |
Chrome 保存 PDF
```

## 10. 存储设计

使用 `chrome.storage.sync` 保存用户设置：

```ts
type Settings = {
  enabled: boolean;
  confirmBeforeRename: boolean;
  filenameTemplate: "{title}.pdf" | "{year} - {title}.pdf" | string;
  maxFilenameLength: number;
  enabledSites: {
    arxiv: boolean;
    openreview: boolean;
    generic: boolean;
  };
};
```

使用 `chrome.storage.local` 保存最近结果：

```ts
type RenameHistoryItem = {
  originalUrl: string;
  originalFilename: string;
  suggestedFilename: string;
  titleSource: "arxiv" | "openreview" | "dom" | "api" | "manual";
  status: "renamed" | "skipped" | "failed";
  createdAt: number;
};
```

## 11. UI 设计

### 11.1 Popup

显示：

- 插件开关
- 最近一次下载状态
- 当前页面识别到的论文标题
- 手动重命名按钮
- 设置入口

### 11.2 Options

设置项：

- 是否启用插件
- 是否下载前确认
- 命名模板
- 最大文件名长度
- 启用站点列表
- 是否允许联网 API 查询
- 清空历史记录

### 11.3 手动确认弹窗

字段：

- 原文件名
- 识别标题
- 最终文件名输入框
- 覆盖同名文件开关
- 确认下载
- 保持原名

### 11.4 旧 PDF 批量处理页

功能：

- 选择本地文件夹
- 扫描 PDF 文件
- 展示原文件名、识别标题、目标文件名、置信度
- 支持单个确认和批量确认
- 同名冲突时明确提示是否覆盖

第一版可以先做“扫描 + 逐个确认重命名”，避免批量误操作。

## 12. 隐私与安全

原则：

- 默认不上传 PDF 文件。
- 默认不上传用户浏览历史。
- 允许使用 arXiv / OpenReview API 查询标题。
- 若后续使用 Crossref API，只发送 DOI 或 PDF URL 中可公开识别的信息。
- 在设置中明确展示“联网查询”选项，默认开启。
- 历史记录只保存在本地。

## 13. 错误处理

常见失败原因：

- 不是论文 PDF
- 站点不支持
- 页面没有标题元数据
- API 请求失败
- 标题为空或过短
- 文件名清洗后为空

处理策略：

- 不阻塞下载
- 保持原文件名
- 在 popup 中记录失败原因

## 14. 测试计划

### 14.1 单元测试

覆盖：

- PDF URL 判断
- arXiv ID 提取
- 标题清洗
- 文件名模板渲染
- DOM meta 提取

### 14.2 集成测试

覆盖：

- arXiv abs 页面点击 PDF
- arXiv PDF 链接直接下载
- OpenReview 页面下载 PDF
- 普通 PDF 下载不误改名
- 标题识别失败时保持原文件名

### 14.3 手动测试样例

```text
https://arxiv.org/abs/1706.03762
https://arxiv.org/pdf/1706.03762
https://openreview.net/forum?id=...
```

## 15. 推荐迭代计划

### Phase 1: arXiv MVP

- Manifest V3 扩展骨架
- `downloads.onDeterminingFilename`
- arXiv PDF URL 转 abs URL
- arXiv 标题提取
- 文件名清洗
- 下载前确认弹窗
- 简单 popup 开关

### Phase 2: OpenReview MVP

- OpenReview 页面 DOM 标题提取
- OpenReview API 兜底查询
- OpenReview 直接 PDF 下载识别
- 下载前确认弹窗复用

### Phase 3: 旧 PDF 批量处理

- 用户选择本地目录
- 扫描 PDF 文件
- 标题识别
- 逐个确认或批量确认
- 同名冲突覆盖确认

### Phase 4: 通用论文页

- `citation_title` / `og:title` / `h1` 提取
- 最近重命名历史
- Options 页面

### Phase 5: 高级命名

- 自定义模板
- 年份、作者、会议字段
- DOI / Crossref 查询
- 下载前确认模式

### Phase 6: 本地论文库增强

- 导出历史记录
- Zotero / Obsidian 集成

## 16. 关键技术风险

### 16.1 `onDeterminingFilename` 的异步时间限制

Chrome 允许异步 `suggest`，但 service worker 生命周期可能带来不稳定性。实现时需要保证：

- 快速返回结果
- API 请求设置超时
- 失败时及时 `suggest()`

### 16.2 直接 PDF 链接缺少来源页面

如果用户直接打开 PDF URL，插件可能不知道标题。arXiv 这类可由 ID 反查的网站问题不大；其他站点需要 DOI 或 API 支持。

### 16.3 误命名

错误标题比不改名更糟。策略上应保守：

- 低置信度不重命名
- 标题过短不重命名
- 标题像站点名时不重命名
- 可选确认模式

## 17. 待确认问题

已确认：

1. 第一版同时支持 arXiv 和 OpenReview。
2. 文件名只使用论文标题。
3. 下载前弹窗确认，用户可以编辑文件名。
4. 允许插件联网调用 arXiv / OpenReview API；Crossref 可作为后续扩展。
5. 需要覆盖旧 PDF 的处理场景。由于浏览器权限限制，旧文件处理需要用户主动选择文件夹；覆盖同名文件必须二次确认。

## 18. 建议默认方案

第一版采用：

```text
支持站点：arXiv + OpenReview
命名格式：{title}.pdf
交互模式：下载前弹窗确认
联网查询：允许 arXiv / OpenReview API
旧文件处理：支持用户选择目录后批量识别，覆盖前二次确认
隐私策略：不上传 PDF，不记录云端数据，只查询公开论文 ID
```

这样能在保证可控性的前提下覆盖你的核心使用方式：新下载的论文即时命名，旧论文库也可以逐步整理。
