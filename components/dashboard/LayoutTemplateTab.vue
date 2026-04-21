<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface Template {
  id: number;
  name: string;
  description: string;
  style_json: string;
  is_default: boolean;
}

const templates = ref<Template[]>([]);
const loading = ref(false);
const showEditModal = ref(false);
const editingId = ref<number | null>(null);
const editName = ref('');
const editDesc = ref('');
const editStyleJson = ref('');

// 分组编辑：解析后的各字段
const editStyles = ref<Record<string, string>>({});
const showRawJson = ref(false);
const previewHtml = ref('');
const previewLoading = ref(false);

const SAMPLE_MD = `# 排版样式预览文章

这是一段**加粗文字**和*斜体文字*的示例段落，包含\`行内代码\`以及[外部链接](https://example.com)。微信公众号排版需要精细化处理每一个细节。

## 二级标题：核心观点

段落之间的间距、字体大小、行高都会影响阅读体验。好的排版让读者**沉浸其中**，差的排版让人*一目十行*就划走了。

### 三级标题：数据支撑

根据最新统计，优质排版能提升阅读完成率约 35%，以下是关键数据：

1. 标题醒目度提升阅读率 28%
2. 段落间距优化减少跳出率 15%
3. 配图合理增加分享率 22%

#### 四级标题：补充说明

> 引用文字可以用来强调关键观点或展示名人名言，样式应当与正文有明显区分。

## 二级标题：技术实现

以下是排版引擎的核心代码示例：

\`\`\`javascript
function formatArticle(md, styles) {
  let html = markdownToHtml(md);
  html = applyStyles(html, styles);
  return html;
}
\`\`\`

无序列表同样常见：

- 支持多种标题级别装饰
- 自定义列表项样式
- 分隔线可替换为装饰符号

---

| 功能 | 状态 | 说明 |
|------|------|------|
| 标题装饰 | 已完成 | 支持 H1-H3 自定义装饰 |
| 固定内容 | 已完成 | 文首文末可插入固定 HTML |
| 分隔线 | 已完成 | 支持自定义样式和 HTML 替换 |

![示例图片](https://picsum.photos/600/200)

---

## 二级标题：总结

排版不仅是美化，更是**信息传递效率**的优化。每个公众号都应有独特的视觉识别，让读者一眼就能认出你的文章。

*感谢阅读，期待你的关注。*
`;

const GROUPS = [
  {
    key: 'basic',
    label: '基础样式',
    icon: 'i-lucide:type',
    fields: [
      { key: 'container', label: '容器', rows: 2 },
      { key: 'p', label: '段落', rows: 2 },
      { key: 'strong', label: '加粗', rows: 2 },
      { key: 'em', label: '斜体', rows: 2 },
      { key: 'blockquote', label: '引用', rows: 2 },
      { key: 'image', label: '图片', rows: 2 },
      { key: 'a', label: '链接', rows: 2 },
    ],
  },
  {
    key: 'headings',
    label: '标题样式',
    icon: 'i-lucide:heading',
    fields: [
      { key: 'h1', label: 'H1 基础样式', rows: 2 },
      { key: 'h1_decoration', label: 'H1 装饰（如边框/背景）', rows: 2 },
      { key: 'h2', label: 'H2 基础样式', rows: 2 },
      { key: 'h2_decoration', label: 'H2 装饰（如左侧竖线）', rows: 2 },
      { key: 'h3', label: 'H3 基础样式', rows: 2 },
      { key: 'h3_decoration', label: 'H3 装饰', rows: 2 },
      { key: 'h4', label: 'H4 样式', rows: 2 },
    ],
  },
  {
    key: 'lists',
    label: '列表样式',
    icon: 'i-lucide:list',
    fields: [
      { key: 'list', label: '列表容器', rows: 2 },
      { key: 'ol_style', label: '有序列表项', rows: 2 },
      { key: 'ul_style', label: '无序列表项', rows: 2 },
    ],
  },
  {
    key: 'separator',
    label: '分隔线',
    icon: 'i-lucide:minus',
    fields: [
      { key: 'hr', label: '分隔线基础样式', rows: 2 },
      { key: 'hr_style', label: '分隔线覆盖样式', rows: 2 },
      { key: 'separator', label: '自定义分隔符 HTML', rows: 3 },
    ],
  },
  {
    key: 'fixed',
    label: '固定内容',
    icon: 'i-lucide:pin',
    fields: [
      { key: 'header_content', label: '文首固定内容 HTML', rows: 3 },
      { key: 'footer_content', label: '文末固定内容 HTML', rows: 3 },
      { key: 'section_prefix', label: '章节前内容（H2 前）', rows: 3 },
      { key: 'section_suffix', label: '章节后内容（H2 后）', rows: 3 },
    ],
  },
  {
    key: 'code',
    label: '代码/表格',
    icon: 'i-lucide:code',
    fields: [
      { key: 'code', label: '行内代码', rows: 2 },
      { key: 'pre', label: '代码块', rows: 2 },
      { key: 'table', label: '表格', rows: 2 },
      { key: 'th', label: '表头', rows: 2 },
      { key: 'td', label: '单元格', rows: 2 },
    ],
  },
];

const expandedGroups = ref<Set<string>>(new Set(['basic', 'headings']));

function toggleGroup(key: string) {
  const s = new Set(expandedGroups.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  expandedGroups.value = s;
}

function parseStyleJson(json: string) {
  try {
    const obj = JSON.parse(json);
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') flat[k] = v;
      else if (typeof v === 'object' && v !== null) flat[k] = JSON.stringify(v);
    }
    return flat;
  } catch {
    return {};
  }
}

function buildStyleJson(): string {
  const obj: Record<string, any> = {};
  for (const [k, v] of Object.entries(editStyles.value)) {
    if (!v) continue;
    if (k === 'colors' || k === 'darkmode') {
      try { obj[k] = JSON.parse(v); } catch { obj[k] = v; }
    } else {
      obj[k] = v;
    }
  }
  return JSON.stringify(obj, null, 2);
}

async function refreshPreview() {
  const json = showRawJson.value ? editStyleJson.value : buildStyleJson();
  try { JSON.parse(json); } catch { return; }

  previewLoading.value = true;
  try {
    const resp = await $fetch<{ success: boolean; data?: { html: string } }>('/api/query/content/format-article', {
      method: 'POST',
      body: { preview: true, styleJson: json, content: SAMPLE_MD },
    });
    if (resp.success && resp.data) {
      previewHtml.value = resp.data.html;
    }
  } catch { /* 静默 */ }
  finally { previewLoading.value = false; }
}

// 防抖预览
let previewTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedPreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 600);
}

watch(editStyles, debouncedPreview, { deep: true });
watch(editStyleJson, () => { if (showRawJson.value) debouncedPreview(); });

async function loadTemplates() {
  loading.value = true;
  try {
    const resp = await $fetch<{ success: boolean; data: Template[] }>('/api/query/content/templates');
    if (resp.success) templates.value = resp.data;
  } catch { /* 静默 */ }
  finally { loading.value = false; }
}

function startEdit(tpl: Template) {
  editingId.value = tpl.id;
  editName.value = tpl.name;
  editDesc.value = tpl.description || '';
  editStyleJson.value = tpl.style_json;
  editStyles.value = parseStyleJson(tpl.style_json);
  expandedGroups.value = new Set(['basic', 'headings']);
  showRawJson.value = false;
  showEditModal.value = true;
  nextTick(refreshPreview);
}

function startCreate() {
  editingId.value = null;
  editName.value = '';
  editDesc.value = '';
  editStyleJson.value = '{}';
  editStyles.value = {};
  expandedGroups.value = new Set(['basic', 'headings']);
  showRawJson.value = false;
  showEditModal.value = true;
  nextTick(refreshPreview);
}

function switchToRawMode() {
  editStyleJson.value = buildStyleJson();
  showRawJson.value = true;
}

function switchToGroupMode() {
  editStyles.value = parseStyleJson(editStyleJson.value);
  showRawJson.value = false;
}

async function saveTemplate() {
  if (!editName.value.trim()) return;
  const json = showRawJson.value ? editStyleJson.value : buildStyleJson();
  try { JSON.parse(json); } catch {
    toast.error('格式错误', 'JSON 格式不正确，请检查');
    return;
  }
  try {
    if (editingId.value) {
      await $fetch(`/api/query/content/templates/${editingId.value}`, {
        method: 'PUT',
        body: { name: editName.value.trim(), description: editDesc.value.trim(), styleJson: json },
      });
      toast.success('保存成功', '排版模板已更新');
    } else {
      await $fetch('/api/query/content/templates', {
        method: 'POST',
        body: { name: editName.value.trim(), description: editDesc.value.trim(), styleJson: json },
      });
      toast.success('创建成功', '新排版模板已添加');
    }
    showEditModal.value = false;
    await loadTemplates();
  } catch (err: any) {
    toast.error('保存失败', err?.message || '请求失败');
  }
}

async function deleteTemplate(tpl: Template) {
  if (tpl.is_default) {
    toast.error('无法删除', '默认模板不能删除');
    return;
  }
  try {
    await $fetch(`/api/query/content/templates/${tpl.id}`, { method: 'DELETE' });
    toast.success('已删除', `模板"${tpl.name}"已删除`);
    await loadTemplates();
  } catch (err: any) {
    toast.error('删除失败', err?.message || '请求失败');
  }
}

onMounted(loadTemplates);
</script>

<template>
  <div class="flex flex-col h-full gap-3">
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-500">共 {{ templates.length }} 个模板</span>
      <UButton icon="i-lucide:plus" size="sm" @click="startCreate">新建模板</UButton>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-8 text-gray-400">
      <UIcon name="i-lucide:loader-2" class="size-5 animate-spin mr-2" />加载中...
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-2">
      <div v-for="tpl in templates" :key="tpl.id" class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
        <UIcon name="i-lucide:palette" class="size-4 text-blue-500 shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-sm">{{ tpl.name }}</span>
            <UBadge v-if="tpl.is_default" color="blue" variant="subtle" size="xs">默认</UBadge>
          </div>
          <p v-if="tpl.description" class="text-xs text-gray-400 truncate">{{ tpl.description }}</p>
        </div>
        <UButton icon="i-lucide:pencil" variant="ghost" size="2xs" @click="startEdit(tpl)" />
        <UButton icon="i-lucide:trash-2" variant="ghost" size="2xs" color="red" :disabled="tpl.is_default" @click="deleteTemplate(tpl)" />
      </div>
    </div>

    <!-- 编辑/新建弹窗（全屏宽，左右分栏） -->
    <UModal v-model="showEditModal" :ui="{ width: 'sm:max-w-6xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-semibold">{{ editingId ? '编辑模板' : '新建模板' }}</span>
            <div class="flex gap-1">
              <UButton size="2xs" :variant="!showRawJson ? 'solid' : 'outline'" color="blue" @click="showRawJson ? switchToGroupMode() : undefined">分组编辑</UButton>
              <UButton size="2xs" :variant="showRawJson ? 'solid' : 'outline'" color="blue" @click="!showRawJson ? switchToRawMode() : undefined">JSON 源码</UButton>
            </div>
          </div>
        </template>
        <div>
          <!-- 顶部：名称+描述 -->
          <div class="flex gap-3 mb-3">
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">模板名称</label>
              <UInput v-model="editName" placeholder="输入模板名称" />
            </div>
            <div class="flex-1">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">描述</label>
              <UInput v-model="editDesc" placeholder="模板描述（可选）" />
            </div>
          </div>

          <!-- 左右分栏：编辑 + 预览 -->
          <div class="flex gap-3" style="height: 55vh;">
            <!-- 左侧：编辑区 -->
            <div class="w-1/2 flex flex-col min-h-0">
              <!-- JSON 源码模式 -->
              <div v-if="showRawJson" class="flex-1 min-h-0">
                <textarea
                  v-model="editStyleJson"
                  class="w-full h-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  placeholder='{ "h1": "...", "p": "..." }'
                />
              </div>

              <!-- 分组编辑模式 -->
              <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
                <div v-for="group in GROUPS" :key="group.key" class="rounded-lg border border-gray-200 dark:border-gray-700">
                  <button
                    class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                    @click="toggleGroup(group.key)"
                  >
                    <UIcon :name="group.icon" class="size-4 text-gray-400" />
                    <span class="text-sm font-medium flex-1">{{ group.label }}</span>
                    <UIcon :name="expandedGroups.has(group.key) ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'" class="size-4 text-gray-400" />
                  </button>
                  <div v-if="expandedGroups.has(group.key)" class="px-3 pb-3 space-y-2">
                    <div v-for="field in group.fields" :key="field.key">
                      <label class="block text-xs text-gray-500 mb-0.5">{{ field.label }}</label>
                      <textarea
                        v-model="editStyles[field.key]"
                        :rows="field.rows || 2"
                        class="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                        :placeholder="field.key.includes('decoration') ? '如: border-left: 4px solid #2563eb; padding-left: 12px;' : field.key.includes('content') || field.key.includes('separator') ? 'HTML 片段' : 'CSS 样式'"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右侧：实时预览 -->
            <div class="w-1/2 flex flex-col min-h-0 rounded-lg border border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                <UIcon name="i-lucide:eye" class="size-4 text-gray-400" />
                <span class="text-xs font-medium text-gray-500">实时预览</span>
                <UIcon v-if="previewLoading" name="i-lucide:loader-2" class="size-3 animate-spin text-gray-400 ml-auto" />
              </div>
              <div class="flex-1 min-h-0 overflow-y-auto bg-white p-4">
                <div v-if="previewHtml" class="preview-content" v-html="previewHtml" />
                <div v-else class="flex items-center justify-center h-full text-gray-300 text-sm">编辑样式后自动预览</div>
              </div>
            </div>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="white" @click="showEditModal = false">取消</UButton>
            <UButton color="blue" :disabled="!editName.trim()" @click="saveTemplate">保存</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
