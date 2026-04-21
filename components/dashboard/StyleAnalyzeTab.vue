<script setup lang="ts">
import toastFactory from '~/composables/toast';

const toast = toastFactory();

interface MpAccount {
  fakeid: string;
  nickname: string;
  category: string;
  articles: number;
}

interface ArticleItem {
  id: number;
  title: string;
  datetime: string;
  digest: string;
  hasContent: boolean;
}

interface StyleRecord {
  id: number;
  fakeid: string;
  account_name: string;
  persona_positioning: string;
  surface_language: string;
  oral_phrase_library: string;
  deep_writing_traits: string;
  taboos: string;
  sample_excerpts: string;
  article_count: number;
  source_article_ids: string;
  updated_at: string;
}

// 公众号列表
const accounts = ref<MpAccount[]>([]);
const selectedFakeid = ref('');

// 文章列表（分页+勾选）
const articles = ref<ArticleItem[]>([]);
const selectedArticleIds = ref<number[]>([]);
const articlePage = ref(1);
const articlePageSize = 20;
const articleTotal = ref(0);
const loadingArticles = ref(false);

// 分析状态
const analyzing = ref(false);

// 已有风格记录
const existingStyle = ref<StyleRecord | null>(null);
const historyList = ref<StyleRecord[]>([]);
const showHistory = ref(false);

// 提示词面板
const promptVisible = ref(false);
const promptEditing = ref(false);
const promptText = ref('');
const promptDraft = ref('');
const promptSaving = ref(false);

// 编辑模式
const editingField = ref('');
const editDraft = ref('');
const fieldSaving = ref(false);

// 结果展示：解析 JSON 用于前端渲染
interface ParsedStyle {
  personaPositioning: string;
  surfaceLanguage: { sentenceRhythm: string; wordFingerprint: string; punctuationHabits: string; emotionalExpression: string };
  oralPhraseLibrary: { transitions: string[]; judgments: string[]; selfDeprecation: string[]; emotionalExpression: string[]; readerEngagement: string[] };
  deepWritingTraits: { openingMethod: string; argumentProgression: string; knowledgeInsertion: string; rhythmBreaking: string; closingMethod: string };
  taboos: string[];
  sampleExcerpts: string[];
}

const parsedStyle = ref<ParsedStyle | null>(null);

const articleTotalPages = computed(() => Math.ceil(articleTotal.value / articlePageSize));

const selectedCount = computed(() => selectedArticleIds.value.length);

const ORAL_CATEGORIES: Record<string, string> = {
  transitions: '转场过渡',
  judgments: '表达判断',
  selfDeprecation: '承认自嘲',
  emotionalExpression: '情绪表达',
  readerEngagement: '拉近读者',
};

const TRAIT_LABELS: Record<string, string> = {
  openingMethod: '开篇方式',
  argumentProgression: '论述推进',
  knowledgeInsertion: '知识引入',
  rhythmBreaking: '论述打破',
  closingMethod: '收束方式',
};

async function loadAccounts() {
  try {
    const resp = await $fetch<{ success: boolean; data?: any[] }>('/api/query/accounts-with-articles');
    if (resp.success && resp.data) {
      accounts.value = resp.data;
    }
  } catch { /* 静默 */ }
}

async function loadHistory() {
  try {
    const resp = await $fetch<{ success: boolean; data?: StyleRecord[] }>('/api/query/content/style-analysis');
    if (resp.success && resp.data) {
      historyList.value = Array.isArray(resp.data) ? resp.data : [];
    }
  } catch { /* 静默 */ }
}

async function loadArticles() {
  if (!selectedFakeid.value) return;
  loadingArticles.value = true;
  try {
    const resp = await $fetch<{
      success: boolean;
      data?: any[];
      pagination?: { total: number; page: number; totalPages: number };
    }>('/api/query/article/list-by-account', {
      params: {
        fakeid: selectedFakeid.value,
        page: articlePage.value,
        limit: articlePageSize,
      },
    });
    if (resp.success && resp.data) {
      articles.value = resp.data.map(a => ({
        id: a.id,
        title: a.title || '',
        datetime: a.datetime || '',
        digest: a.digest || '',
        hasContent: !!a.hasContent,
      }));
      articleTotal.value = resp.pagination?.total || 0;
    }
  } catch { /* 静默 */ }
  finally { loadingArticles.value = false; }
}

async function loadExistingStyle() {
  if (!selectedFakeid.value) return;
  try {
    const resp = await $fetch<{ success: boolean; data?: StyleRecord }>('/api/query/content/style-analysis', {
      params: { fakeid: selectedFakeid.value },
    });
    if (resp.success && resp.data) {
      existingStyle.value = resp.data;
      parseStyleData(resp.data);
    } else {
      existingStyle.value = null;
      parsedStyle.value = null;
    }
  } catch {
    existingStyle.value = null;
    parsedStyle.value = null;
  }
}

async function loadPrompt() {
  try {
    const resp = await $fetch<{ success: boolean; data?: string }>('/api/query/settings?key=style_analysis_prompt');
    if (resp.success && resp.data) {
      promptText.value = resp.data;
    } else {
      promptText.value = getDefaultPrompt();
    }
  } catch {
    promptText.value = getDefaultPrompt();
  }
}

function getDefaultPrompt(): string {
  return `# 角色

你是一位风格逆向工程师。我会给你1-5篇我写过的文章，你要像语言学侦探一样，从文字中还原我的写作DNA，不是分析"写了什么"，而是拆解"这个人是怎么写东西的"。

# 任务

分析我的文章样本，输出一份结构化的「风格提示词」。让另一个AI拿到这份提示词后，写出来的东西一眼就像我写的。

# 分析维度

逐层拆解以下维度，每一层的结论都要落入最终输出。

## 维度一，表层语言特征
- 句式节奏，短句和长句的比例，标志性句式
- 用词指纹，口语/书面/网络用语的混合比例，个人高频词
- 标点习惯，省略号、感叹号、问号的使用频率和非常规用法
- 段落节奏，平均段长，是否有一句话独立成段的习惯

## 维度二，口语词组库提取
从原文中逐字提取20-30个口语表达，按5类分组，
- 转场过渡（话题切换时的口头语）
- 表达判断（下结论时的个人化说法）
- 承认自嘲（示弱、不确定的表达）
- 情绪表达（传递情绪态度的用语）
- 拉近读者（与读者对话的表达）

铁律，必须从原文逐字提取，禁止AI编造或归纳改写。每类至少4个。

## 维度三，深层写法特征
- 开篇方式，怎么起
- 论述推进，怎么展开，是否有升番逻辑（一轮比一轮更强）
- 知识引入，随手嵌入叙事 vs 停下来专门讲解
- 论述打破，中间是否突然跑题、自嘲、吐槽来打破节奏
- 收束方式，怎么结尾，是升华还是戛然而止

## 维度四，禁忌推断
从文章中反推这个人绝对不会怎么写，列出5-8条具体禁忌。

# 输出格式

严格按以下结构输出，

---
## 人格定位
[2-3句话，这是什么样的人，用什么姿态写文章，和读者什么关系]

## 语言特征
- 句式节奏，[结论]
- 用词倾向，[结论]
- 标点习惯，[结论]
- 情绪表达，[结论]

## 口语词组库
**转场过渡**，[逗号分隔]
**表达判断**，[逗号分隔]
**承认自嘲**，[逗号分隔]
**情绪表达**，[逗号分隔]
**拉近读者**，[逗号分隔]

## 写法特征
- 开篇方式，[结论]
- 论述推进，[结论]
- 知识引入，[结论]
- 收束方式，[结论]

## 禁忌清单
- [具体禁忌1]
- [具体禁忌2]
...

## 范文摘录
> [从原文中摘录1-2段最能代表风格的段落，逐字摘录，不可改写]

---

# 我的文章样本
[选择的文章将自动附加在下方]`;
}

function parseStyleData(style: StyleRecord) {
  try {
    parsedStyle.value = {
      personaPositioning: style.persona_positioning || '',
      surfaceLanguage: typeof style.surface_language === 'string' ? JSON.parse(style.surface_language) : style.surface_language || {},
      oralPhraseLibrary: typeof style.oral_phrase_library === 'string' ? JSON.parse(style.oral_phrase_library) : style.oral_phrase_library || {},
      deepWritingTraits: typeof style.deep_writing_traits === 'string' ? JSON.parse(style.deep_writing_traits) : style.deep_writing_traits || {},
      taboos: typeof style.taboos === 'string' ? JSON.parse(style.taboos) : style.taboos || [],
      sampleExcerpts: typeof style.sample_excerpts === 'string' ? JSON.parse(style.sample_excerpts) : style.sample_excerpts || [],
    };
  } catch {
    parsedStyle.value = null;
  }
}

function toggleArticle(id: number) {
  const idx = selectedArticleIds.value.indexOf(id);
  if (idx >= 0) {
    selectedArticleIds.value.splice(idx, 1);
  } else {
    if (selectedArticleIds.value.length >= 6) {
      toast.error('最多选择6篇', '请取消已选文章后再选');
      return;
    }
    selectedArticleIds.value.push(id);
  }
}

function selectAll() {
  const available = articles.value.filter(a => a.hasContent);
  const unselected = available.filter(a => !selectedArticleIds.value.includes(a.id));
  const canAdd = Math.min(unselected.length, 6 - selectedArticleIds.value.length);
  for (let i = 0; i < canAdd; i++) {
    selectedArticleIds.value.push(unselected[i].id);
  }
}

function clearSelection() {
  selectedArticleIds.value = [];
}

function startEditPrompt() {
  promptDraft.value = promptText.value;
  promptEditing.value = true;
}

function cancelEditPrompt() {
  promptEditing.value = false;
}

async function savePrompt() {
  promptSaving.value = true;
  try {
    const resp = await $fetch<{ success: boolean }>('/api/query/settings', {
      method: 'POST',
      body: { key: 'style_analysis_prompt', value: promptDraft.value },
    });
    if (resp.success) {
      promptText.value = promptDraft.value;
      promptEditing.value = false;
      toast.success('保存成功', '风格解析提示词已更新');
    }
  } catch (err: any) {
    toast.error('保存失败', err?.message || '未知错误');
  } finally {
    promptSaving.value = false;
  }
}

async function startAnalysis() {
  if (selectedArticleIds.value.length < 1) {
    toast.error('请选择文章', '至少选择1篇已下载内容的文章');
    return;
  }

  analyzing.value = true;
  parsedStyle.value = null;

  try {
    const resp = await $fetch<{
      success: boolean;
      data?: { accountName: string; articleCount: number; markdown: string; style: ParsedStyle };
      error?: string;
    }>('/api/query/content/analyze-style', {
      method: 'POST',
      body: { articleIds: selectedArticleIds.value },
    });

    if (resp.success) {
      toast.success('分析完成', `已分析 ${resp.data?.articleCount} 篇文章`);
      parsedStyle.value = resp.data?.style || null;
      await loadExistingStyle();
      await loadHistory();
    } else {
      toast.error('分析失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('分析失败', err?.message || '请求失败');
  } finally {
    analyzing.value = false;
  }
}

function selectAccount(fakeid: string) {
  selectedFakeid.value = fakeid;
}

// ========== 编辑功能 ==========

function startFieldEdit(field: string) {
  if (!parsedStyle.value || !existingStyle.value) return;
  editingField.value = field;

  if (field === 'personaPositioning') {
    editDraft.value = parsedStyle.value.personaPositioning || '';
  } else if (field === 'surfaceLanguage') {
    editDraft.value = JSON.stringify(parsedStyle.value.surfaceLanguage, null, 2);
  } else if (field === 'oralPhraseLibrary') {
    editDraft.value = JSON.stringify(parsedStyle.value.oralPhraseLibrary, null, 2);
  } else if (field === 'deepWritingTraits') {
    editDraft.value = JSON.stringify(parsedStyle.value.deepWritingTraits, null, 2);
  } else if (field === 'taboos') {
    editDraft.value = (parsedStyle.value.taboos || []).join('\n');
  } else if (field === 'sampleExcerpts') {
    editDraft.value = (parsedStyle.value.sampleExcerpts || []).join('\n---\n');
  }
}

function cancelFieldEdit() {
  editingField.value = '';
  editDraft.value = '';
}

async function saveFieldEdit() {
  if (!existingStyle.value) return;
  fieldSaving.value = true;

  try {
    const field = editingField.value;
    let body: Record<string, any> = { id: existingStyle.value.id };

    if (field === 'personaPositioning') {
      body.persona_positioning = editDraft.value;
    } else if (field === 'surfaceLanguage') {
      body.surface_language = JSON.parse(editDraft.value);
    } else if (field === 'oralPhraseLibrary') {
      body.oral_phrase_library = JSON.parse(editDraft.value);
    } else if (field === 'deepWritingTraits') {
      body.deep_writing_traits = JSON.parse(editDraft.value);
    } else if (field === 'taboos') {
      body.taboos = editDraft.value.split('\n').map(s => s.trim()).filter(Boolean);
    } else if (field === 'sampleExcerpts') {
      body.sample_excerpts = editDraft.value.split('\n---\n').map(s => s.trim()).filter(Boolean);
    }

    const resp = await $fetch<{ success: boolean; error?: string }>('/api/query/content/style-analysis', {
      method: 'PUT',
      body,
    });

    if (resp.success) {
      toast.success('保存成功', '风格数据已更新');
      editingField.value = '';
      // 重新加载并解析
      await loadExistingStyle();
    } else {
      toast.error('保存失败', resp.error || '未知错误');
    }
  } catch (err: any) {
    toast.error('保存失败', err?.message || '格式错误，请检查 JSON 格式');
  } finally {
    fieldSaving.value = false;
  }
}

watch(selectedFakeid, () => {
  selectedArticleIds.value = [];
  articlePage.value = 1;
  loadArticles();
  loadExistingStyle();
});

onMounted(() => {
  loadAccounts();
  loadHistory();
  loadPrompt();
});
</script>

<template>
  <div class="flex h-full gap-4 overflow-hidden">
    <!-- 左侧：操作区 -->
    <div class="w-[360px] shrink-0 flex flex-col h-full overflow-hidden">
      <!-- 选择公众号 -->
      <select
        v-model="selectedFakeid"
        class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3"
      >
        <option value="" disabled>选择公众号</option>
        <option v-for="acc in accounts" :key="acc.fakeid" :value="acc.fakeid">{{ acc.nickname }}</option>
      </select>

      <template v-if="selectedFakeid">
        <!-- 文章列表 -->
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">选择示例文章</span>
            <UBadge color="blue" variant="subtle" size="xs">{{ selectedCount }}/6</UBadge>
          </div>
          <div class="flex items-center gap-2">
            <button class="text-[10px] text-blue-500 hover:text-blue-700" @click="selectAll">全选</button>
            <span class="text-gray-300">|</span>
            <button class="text-[10px] text-gray-500 hover:text-gray-700" @click="clearSelection">清除</button>
          </div>
        </div>

        <div v-if="loadingArticles" class="text-center py-4 text-gray-400 text-xs">
          <UIcon name="i-lucide:loader-2" class="size-4 animate-spin inline-block" /> 加载中...
        </div>

        <div v-else class="flex-1 min-h-0 overflow-auto border border-gray-200 dark:border-gray-700 rounded-md mb-2">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th class="w-8 px-2 py-1.5 text-center"></th>
                <th class="px-2 py-1.5 text-left text-gray-500 font-medium">标题</th>
                <th class="w-20 px-2 py-1.5 text-left text-gray-500 font-medium">日期</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="art in articles"
                :key="art.id"
                class="border-t border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                :class="selectedArticleIds.includes(art.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
                @click="toggleArticle(art.id)"
              >
                <td class="px-2 py-1.5 text-center">
                  <input type="checkbox" :checked="selectedArticleIds.includes(art.id)" class="accent-blue-500" @click.stop="toggleArticle(art.id)" />
                </td>
                <td class="px-2 py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{{ art.title }}</td>
                <td class="px-2 py-1.5 text-gray-400 whitespace-nowrap">{{ typeof art.datetime === 'string' ? art.datetime.substring(0, 10) : '' }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="articles.length === 0" class="text-center py-6 text-gray-400 text-xs">该公众号暂无文章</div>
        </div>

        <!-- 分页 -->
        <div v-if="articleTotalPages > 1" class="flex items-center justify-between mb-2 shrink-0">
          <span class="text-[10px] text-gray-400">共 {{ articleTotal }} 篇</span>
          <div class="flex items-center gap-1">
            <button class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 disabled:opacity-30" :disabled="articlePage <= 1" @click="articlePage--; loadArticles()">&lt;</button>
            <span class="text-xs text-gray-500">{{ articlePage }}/{{ articleTotalPages }}</span>
            <button class="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 disabled:opacity-30" :disabled="articlePage >= articleTotalPages" @click="articlePage++; loadArticles()">&gt;</button>
          </div>
        </div>

        <!-- 分析按钮 -->
        <div class="shrink-0 flex items-center gap-3 mb-3">
          <UButton icon="i-lucide:sparkles" color="blue" :loading="analyzing" :disabled="analyzing || selectedCount === 0" @click="startAnalysis">
            {{ analyzing ? '分析中...' : '开始解析' }}
          </UButton>
          <span class="text-xs text-gray-400">已选 {{ selectedCount }} 篇</span>
        </div>

        <!-- 提示词折叠 -->
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
          <div class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer select-none" @click="promptVisible = !promptVisible">
            <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <UIcon :name="promptVisible ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'" class="size-4" />
              <UIcon name="i-lucide:message-square-text" class="size-4" />
              <span class="font-medium text-xs">提示词配置</span>
            </div>
          </div>
          <div v-if="promptVisible" class="p-3">
            <div v-if="!promptEditing">
              <pre class="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-auto bg-white dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-700">{{ promptText }}</pre>
              <div class="flex justify-end mt-2">
                <UButton icon="i-lucide:pencil" size="xs" variant="outline" @click="startEditPrompt">编辑</UButton>
              </div>
            </div>
            <div v-else class="space-y-2">
              <textarea v-model="promptDraft" class="w-full h-[160px] text-xs p-2 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" placeholder="输入风格解析提示词..." />
              <div class="flex justify-end gap-2">
                <UButton size="xs" variant="ghost" color="gray" @click="cancelEditPrompt">取消</UButton>
                <UButton size="xs" color="blue" :loading="promptSaving" @click="savePrompt">保存</UButton>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 未选择公众号 -->
      <template v-else>
        <div class="flex-1 flex flex-col min-h-0 overflow-auto">
          <div v-if="historyList.length > 0" class="mb-4">
            <button class="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 mb-2" @click="showHistory = !showHistory">
              <UIcon :name="showHistory ? 'i-lucide:chevron-down' : 'i-lucide:chevron-right'" class="size-3" />
              已解析公众号 ({{ historyList.length }})
            </button>
            <div v-if="showHistory" class="space-y-2">
              <div
                v-for="h in historyList"
                :key="h.id"
                class="rounded-md border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                @click="selectAccount(h.fakeid)"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ h.account_name }}</span>
                  <span class="text-[10px] text-gray-400">{{ h.article_count }}篇 · {{ h.updated_at?.substring(0, 10) }}</span>
                </div>
                <p v-if="h.persona_positioning" class="text-xs text-gray-500 mt-1 line-clamp-2">{{ h.persona_positioning }}</p>
              </div>
            </div>
          </div>

          <div v-else class="flex items-center justify-center h-full">
            <div class="text-center text-gray-400">
              <UIcon name="i-lucide:feather" class="size-12 mb-3 opacity-40" />
              <p>选择公众号，挑选示例文章</p>
              <p class="text-sm mt-1">AI 将逆向提取写作DNA</p>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 右侧：风格展示/编辑区（占满剩余空间） -->
    <div class="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      <!-- 分析中 -->
      <div v-if="analyzing" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <UIcon name="i-lucide:brain" class="size-12 text-blue-500 animate-pulse mb-3" />
          <p class="text-gray-500">正在进行风格逆向工程...</p>
          <p class="text-xs text-gray-400 mt-1">预计需要30-60秒</p>
        </div>
      </div>

      <!-- 风格结果展示 -->
      <div v-else-if="parsedStyle" class="flex-1 min-h-0 overflow-auto pr-1 space-y-4">
        <!-- 标题栏 -->
        <div class="flex items-center gap-2 shrink-0">
          <UIcon name="i-lucide:user-circle" class="size-5 text-blue-500" />
          <span class="font-semibold">{{ existingStyle?.account_name || '' }}</span>
          <UBadge color="blue" variant="subtle" size="xs">{{ existingStyle?.article_count || 0 }}篇分析</UBadge>
          <UBadge color="green" variant="subtle" size="xs">可编辑</UBadge>
        </div>

        <!-- 人格定位 -->
        <div class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide:user-circle" class="size-4 text-blue-500" />
              <span class="text-sm font-medium">人格定位</span>
            </div>
            <UButton v-if="editingField !== 'personaPositioning'" icon="i-lucide:pencil" size="2xs" variant="ghost" @click="startFieldEdit('personaPositioning')" />
          </div>
          <div v-if="editingField === 'personaPositioning'">
            <textarea v-model="editDraft" rows="3" class="w-full text-sm p-2 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            <div class="flex justify-end gap-2 mt-2">
              <UButton size="2xs" variant="ghost" color="gray" @click="cancelFieldEdit">取消</UButton>
              <UButton size="2xs" color="blue" :loading="fieldSaving" @click="saveFieldEdit">保存</UButton>
            </div>
          </div>
          <p v-else class="text-sm text-gray-700 dark:text-gray-300">{{ parsedStyle.personaPositioning }}</p>
        </div>

        <!-- 语言特征 -->
        <div v-if="parsedStyle.surfaceLanguage" class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide:type" class="size-4 text-purple-500" />
              <span class="text-sm font-medium">语言特征</span>
            </div>
            <UButton v-if="editingField !== 'surfaceLanguage'" icon="i-lucide:pencil" size="2xs" variant="ghost" @click="startFieldEdit('surfaceLanguage')" />
          </div>
          <div v-if="editingField === 'surfaceLanguage'">
            <textarea v-model="editDraft" rows="8" class="w-full text-xs font-mono p-2 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
            <div class="flex justify-end gap-2 mt-2">
              <UButton size="2xs" variant="ghost" color="gray" @click="cancelFieldEdit">取消</UButton>
              <UButton size="2xs" color="blue" :loading="fieldSaving" @click="saveFieldEdit">保存</UButton>
            </div>
          </div>
          <div v-else class="grid grid-cols-2 gap-3">
            <div v-if="parsedStyle.surfaceLanguage.sentenceRhythm" class="text-sm">
              <span class="text-gray-400 text-xs">句式节奏：</span>
              <span class="text-gray-700 dark:text-gray-300">{{ parsedStyle.surfaceLanguage.sentenceRhythm }}</span>
            </div>
            <div v-if="parsedStyle.surfaceLanguage.wordFingerprint" class="text-sm">
              <span class="text-gray-400 text-xs">用词指纹：</span>
              <span class="text-gray-700 dark:text-gray-300">{{ parsedStyle.surfaceLanguage.wordFingerprint }}</span>
            </div>
            <div v-if="parsedStyle.surfaceLanguage.punctuationHabits" class="text-sm">
              <span class="text-gray-400 text-xs">标点习惯：</span>
              <span class="text-gray-700 dark:text-gray-300">{{ parsedStyle.surfaceLanguage.punctuationHabits }}</span>
            </div>
            <div v-if="parsedStyle.surfaceLanguage.emotionalExpression" class="text-sm">
              <span class="text-gray-400 text-xs">情绪表达：</span>
              <span class="text-gray-700 dark:text-gray-300">{{ parsedStyle.surfaceLanguage.emotionalExpression }}</span>
            </div>
          </div>
        </div>

        <!-- 口语词组库 -->
        <div v-if="parsedStyle.oralPhraseLibrary" class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide:message-circle" class="size-4 text-green-500" />
              <span class="text-sm font-medium">口语词组库</span>
            </div>
            <UButton v-if="editingField !== 'oralPhraseLibrary'" icon="i-lucide:pencil" size="2xs" variant="ghost" @click="startFieldEdit('oralPhraseLibrary')" />
          </div>
          <div v-if="editingField === 'oralPhraseLibrary'">
            <p class="text-[10px] text-gray-400 mb-1">JSON 格式，key 为 transitions/judgments/selfDeprecation/emotionalExpression/readerEngagement</p>
            <textarea v-model="editDraft" rows="10" class="w-full text-xs font-mono p-2 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
            <div class="flex justify-end gap-2 mt-2">
              <UButton size="2xs" variant="ghost" color="gray" @click="cancelFieldEdit">取消</UButton>
              <UButton size="2xs" color="blue" :loading="fieldSaving" @click="saveFieldEdit">保存</UButton>
            </div>
          </div>
          <div v-else class="space-y-3">
            <div v-for="(label, key) in ORAL_CATEGORIES" :key="key">
              <div class="flex items-start gap-2">
                <span class="text-xs text-gray-400 shrink-0 w-16 pt-0.5">{{ label }}</span>
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="(phrase, idx) in (parsedStyle.oralPhraseLibrary as any)[key]" :key="idx" color="green" variant="subtle" size="xs">{{ phrase }}</UBadge>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 写法特征 -->
        <div v-if="parsedStyle.deepWritingTraits" class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide:pen-tool" class="size-4 text-orange-500" />
              <span class="text-sm font-medium">写法特征</span>
            </div>
            <UButton v-if="editingField !== 'deepWritingTraits'" icon="i-lucide:pencil" size="2xs" variant="ghost" @click="startFieldEdit('deepWritingTraits')" />
          </div>
          <div v-if="editingField === 'deepWritingTraits'">
            <textarea v-model="editDraft" rows="10" class="w-full text-xs font-mono p-2 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
            <div class="flex justify-end gap-2 mt-2">
              <UButton size="2xs" variant="ghost" color="gray" @click="cancelFieldEdit">取消</UButton>
              <UButton size="2xs" color="blue" :loading="fieldSaving" @click="saveFieldEdit">保存</UButton>
            </div>
          </div>
          <div v-else class="space-y-2">
            <div v-for="(label, key) in TRAIT_LABELS" :key="key">
              <div v-if="(parsedStyle.deepWritingTraits as any)[key]" class="text-sm">
                <span class="text-gray-400 text-xs">{{ label }}：</span>
                <span class="text-gray-700 dark:text-gray-300">{{ (parsedStyle.deepWritingTraits as any)[key] }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 禁忌清单 -->
        <div v-if="parsedStyle.taboos?.length" class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide:shield-alert" class="size-4 text-red-500" />
              <span class="text-sm font-medium text-red-700 dark:text-red-400">禁忌清单</span>
            </div>
            <UButton v-if="editingField !== 'taboos'" icon="i-lucide:pencil" size="2xs" variant="ghost" @click="startFieldEdit('taboos')" />
          </div>
          <div v-if="editingField === 'taboos'">
            <p class="text-[10px] text-gray-400 mb-1">每行一条禁忌</p>
            <textarea v-model="editDraft" rows="6" class="w-full text-sm p-2 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
            <div class="flex justify-end gap-2 mt-2">
              <UButton size="2xs" variant="ghost" color="gray" @click="cancelFieldEdit">取消</UButton>
              <UButton size="2xs" color="blue" :loading="fieldSaving" @click="saveFieldEdit">保存</UButton>
            </div>
          </div>
          <ul v-else class="space-y-1">
            <li v-for="(taboo, idx) in parsedStyle.taboos" :key="idx" class="text-sm text-red-600 dark:text-red-300">
              - {{ taboo }}
            </li>
          </ul>
        </div>

        <!-- 范文摘录 -->
        <div v-if="parsedStyle.sampleExcerpts?.length" class="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide:quote" class="size-4 text-indigo-500" />
              <span class="text-sm font-medium">范文摘录</span>
            </div>
            <UButton v-if="editingField !== 'sampleExcerpts'" icon="i-lucide:pencil" size="2xs" variant="ghost" @click="startFieldEdit('sampleExcerpts')" />
          </div>
          <div v-if="editingField === 'sampleExcerpts'">
            <p class="text-[10px] text-gray-400 mb-1">用 --- 分隔不同段落</p>
            <textarea v-model="editDraft" rows="8" class="w-full text-sm p-2 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
            <div class="flex justify-end gap-2 mt-2">
              <UButton size="2xs" variant="ghost" color="gray" @click="cancelFieldEdit">取消</UButton>
              <UButton size="2xs" color="blue" :loading="fieldSaving" @click="saveFieldEdit">保存</UButton>
            </div>
          </div>
          <div v-else class="space-y-2">
            <blockquote v-for="(excerpt, idx) in parsedStyle.sampleExcerpts" :key="idx" class="border-l-3 border-indigo-300 dark:border-indigo-600 pl-3 text-sm text-gray-600 dark:text-gray-400 italic whitespace-pre-wrap">{{ excerpt }}</blockquote>
          </div>
        </div>

        <div class="h-4" />
      </div>

      <!-- 空状态 -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center text-gray-400">
          <UIcon name="i-lucide:scan-eye" class="size-16 mb-3 opacity-40" />
          <p>选择公众号并分析后</p>
          <p class="text-sm mt-1">风格解析结果将在此展示</p>
        </div>
      </div>
    </div>
  </div>
</template>
