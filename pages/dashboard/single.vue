<script setup lang="ts">
import {
  type ColDef,
  type FilterChangedEvent,
  type GetRowIdParams,
  type GridApi,
  type GridOptions,
  type GridReadyEvent,
  type ICellRendererParams,
  type SelectionChangedEvent,
  type ValueFormatterParams,
  type ValueGetterParams,
} from 'ag-grid-community';
import { AgGridVue } from 'ag-grid-vue3';
import dayjs from 'dayjs';
import { defu } from 'defu';
import { onMounted } from 'vue';
import { formatTimeStamp } from '#shared/utils/helpers';
import { getAccountList } from '~/apis';
import GridArticleActions from '~/components/grid/ArticleActions.vue';
import GridLoading from '~/components/grid/Loading.vue';
import GridNoRows from '~/components/grid/NoRows.vue';
import PreviewArticle from '~/components/preview/Article.vue';
import toastFactory from '~/composables/toast';
import { websiteName } from '~/config';
import { sharedGridOptions } from '~/config/shared-grid-options';
import { articleDeleted, updateArticleFakeid, updateArticleStatus } from '~/store/v2/article';
import { db } from '~/store/v2/db';
import { getHtmlCache } from '~/store/v2/html';
import type { Metadata } from '~/store/v2/metadata';
import type { Preferences } from '~/types/preferences';
import type { AppMsgExWithFakeID } from '~/types/types';
import type { ArticleMetadata } from '~/utils/download/types';
import { createBooleanColumnFilterParams, createDateColumnFilterParams } from '~/utils/grid';

useHead({
  title: `单篇文章下载 | ${websiteName}`,
});

interface SingleArticleRow extends Partial<ArticleMetadata> {
  id: string;
  fakeid: string;
  link: string;
  title: string;
  author_name: string;
  digest: string;
  cover?: string;
  create_time: number;
  update_time: number;
  appmsgid: number;
  itemidx: number;
  aid: string;
  contentDownload: boolean;
  commentDownload: boolean;
  accountName?: string | null;
  _status: string;
  is_deleted: boolean;
  is_hot?: boolean;
}

const preferences = usePreferences();

const toast = toastFactory();
const inputUrl = ref('');
const addBtnLoading = ref(false);

// 分页状态
const currentPage = ref(1);
const pageSize = ref(20);
const totalItems = ref(0);
const totalPages = ref(0);
const loadingHotArticles = ref(false);

// 全局行数据：来自后端的热门文章 + 本地新增的文章
const globalRowData = ref<SingleArticleRow[]>([]);

async function fetchHotArticles() {
  loadingHotArticles.value = true;
  try {
    const resp = await $fetch<{
      success: boolean;
      data: any[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>('/api/query/articles/hot', {
      query: {
        page: currentPage.value,
        limit: pageSize.value,
      },
    });

    if (resp.success) {
      totalItems.value = resp.pagination.total;
      totalPages.value = resp.pagination.totalPages;

      // 将后端数据映射为前端行数据
      const serverRows: SingleArticleRow[] = resp.data.map(article => ({
        id: `${article.fakeid}:${article.aid}`,
        fakeid: article.fakeid,
        link: article.link,
        title: article.title || '未命名文章',
        author_name: article.author_name || '--',
        digest: article.digest || '',
        cover: article.cover,
        create_time: article.create_time || article.datetime || 0,
        update_time: article.update_time || article.datetime || 0,
        appmsgid: 0,
        itemidx: article.itemidx || 1,
        aid: article.aid,
        contentDownload: article.contentDownload || article.content_download || false,
        commentDownload: article.commentDownload || article.comment_download || false,
        accountName: null,
        _status: article._status || '',
        is_deleted: article.is_deleted || false,
        is_hot: true,
        readNum: article.readNum || 0,
        oldLikeNum: article.oldLikeNum || 0,
        likeNum: article.likeNum || 0,
        shareNum: article.shareNum || 0,
        commentNum: article.commentNum || 0,
      }));

      globalRowData.value = serverRows;
    }
  } catch (error) {
    console.error('Failed to fetch hot articles:', error);
  } finally {
    loadingHotArticles.value = false;
  }
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  fetchHotArticles();
}

const columnDefs = ref<ColDef[]>([
  {
    headerName: 'fakeid',
    field: 'fakeid',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    minWidth: 220,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '标题',
    field: 'title',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    flex: 2,
    minWidth: 220,
    tooltipField: 'title',
  },
  {
    headerName: '链接',
    field: 'link',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    flex: 3,
    minWidth: 240,
    cellClass: 'font-mono',
  },
  {
    headerName: '文章状态',
    field: '_status',
    valueFormatter: p => p.value,
    filter: 'agSetColumnFilter',
    filterParams: {
      valueFormatter: (p: ValueFormatterParams) => p.value,
    },
    minWidth: 150,
    initialHide: true,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '作者',
    field: 'author_name',
    cellDataType: 'text',
    filter: 'agSetColumnFilter',
    flex: 1,
    minWidth: 140,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '发布时间',
    field: 'update_time',
    valueFormatter: (params: ValueFormatterParams) => (params.value ? formatTimeStamp(params.value) : '--'),
    filter: 'agDateColumnFilter',
    filterParams: createDateColumnFilterParams(),
    filterValueGetter: (params: ValueGetterParams) => {
      return new Date(params.getValue('update_time') * 1000);
    },
    flex: 1,
    minWidth: 180,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '内容已下载',
    field: 'contentDownload',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('已下载', '未下载'),
    minWidth: 140,
    cellClass: 'flex justify-center items-center',
  },
  {
    field: 'commentDownload',
    headerName: '留言已下载',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('已下载', '未下载'),
    minWidth: 150,
    cellClass: 'flex justify-center items-center',
  },
  {
    headerName: '阅读',
    field: 'readNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '点赞',
    field: 'oldLikeNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '分享',
    field: 'shareNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '喜欢',
    field: 'likeNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '留言',
    field: 'commentNum',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    minWidth: 100,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    headerName: '操作',
    colId: 'single-action',
    field: 'link',
    sortable: false,
    filter: false,
    cellRenderer: GridArticleActions,
    cellRendererParams: {
      onPreview: (params: ICellRendererParams) => {
        previewRow(params.data as SingleArticleRow);
      },
      onGotoLink: (params: ICellRendererParams) => {
        window.open(params.value as string, '_blank', 'noopener');
      },
    },
    width: 110,
    pinned: 'right',
    cellClass: 'flex justify-center items-center',
  },
]);

// 注意，`defu`函数最左边的参数优先级最高
const gridOptions: GridOptions = defu(
  {
    animateRows: true,
    columnDefs: columnDefs.value,
    getRowId: (params: GetRowIdParams) => params.data.id,
    components: {
      agLoadingOverlay: GridLoading,
      agNoRowsOverlay: GridNoRows,
    },
    overlayLoadingTemplate: '<grid-loading />',
    overlayNoRowsTemplate: '<grid-no-rows />',
  },
  sharedGridOptions
);

const gridApi = shallowRef<GridApi | null>(null);
const previewArticleRef = ref<typeof PreviewArticle | null>(null);

function refreshGrid() {
  gridApi.value?.setGridOption('rowData', globalRowData.value);
}

function onGridReady(event: GridReadyEvent) {
  gridApi.value = event.api;
}

function onFilterChanged(event: FilterChangedEvent) {
  event.api.deselectAll();
}

watch(
  globalRowData,
  () => {
    refreshGrid();
  },
  { deep: true }
);

onMounted(async () => {
  // 从后端加载 is_hot 文章
  await fetchHotArticles();
});

async function addArticle() {
  if (addBtnLoading.value) return;
  const url = inputUrl.value.trim();
  if (!url) {
    toast.error('添加失败', '链接不能为空');
    return;
  }
  addBtnLoading.value = true;
  try {
    // 调用后端统一接口：解析URL、长链接转短链接、保存到数据库
    const resp = await $fetch<{
      success: boolean;
      data?: {
        id: string;
        fakeid: string;
        aid: string;
        link: string;
        title: string;
        author_name: string;
        digest: string;
        cover: string;
        create_time: number;
        update_time: number;
        itemidx: number;
        is_long_url: boolean;
      };
      error?: string;
    }>('/api/query/article/prepare', {
      method: 'POST',
      body: { url },
    });

    if (!resp.success || !resp.data) {
      toast.error('添加失败', resp.error || '无法处理此链接');
      return;
    }

    const d = resp.data;

    // 检查是否已存在
    if (globalRowData.value.some(row => row.link === d.link)) {
      toast.info('提示', '该链接已存在列表中');
      return;
    }

    const row: SingleArticleRow = {
      id: d.id,
      fakeid: d.fakeid,
      link: d.link,
      title: d.title,
      author_name: d.author_name,
      digest: d.digest,
      cover: d.cover || undefined,
      create_time: d.create_time,
      update_time: d.update_time,
      appmsgid: 0,
      itemidx: d.itemidx,
      aid: d.aid,
      contentDownload: false,
      commentDownload: false,
      accountName: null,
      _status: '',
      is_deleted: false,
      is_hot: true,
    };

    // 保存到前端 IndexedDB
    await db.article.put(buildVirtualArticle(row), row.id);
    globalRowData.value = [row, ...globalRowData.value];
    refreshGrid();
    inputUrl.value = '';
    await downloadRows([row], { silent: true });
  } catch (error: any) {
    toast.error('添加失败', error?.message || '链接格式不正确');
  } finally {
    addBtnLoading.value = false;
  }
}

function buildVirtualArticle(row: SingleArticleRow): AppMsgExWithFakeID {
  return {
    fakeid: row.fakeid,
    _status: '',
    aid: row.aid,
    album_id: '',
    appmsg_album_infos: [],
    appmsgid: row.appmsgid,
    author_name: row.author_name || '',
    ban_flag: 0,
    checking: 0,
    copyright_stat: 0,
    copyright_type: 0,
    cover: row.cover || '',
    cover_img: row.cover || '',
    cover_img_theme_color: undefined,
    create_time: row.create_time,
    digest: row.digest,
    has_red_packet_cover: 0,
    is_deleted: false,
    is_pay_subscribe: 0,
    item_show_type: 0,
    itemidx: row.itemidx,
    link: row.link,
    media_duration: '0:00',
    mediaapi_publish_status: 0,
    pic_cdn_url_1_1: row.cover || '',
    pic_cdn_url_3_4: row.cover || '',
    pic_cdn_url_16_9: row.cover || '',
    pic_cdn_url_235_1: row.cover || '',
    title: row.title,
    update_time: row.update_time,
    _single: true,
  };
}

/**
 * 将文章的最新字段同步到后端 SQLite（标题、作者、摘要、封面、发布时间等）
 */
async function syncArticleToBackend(row: SingleArticleRow) {
  try {
    await $fetch('/api/query/article/save', {
      method: 'POST',
      body: {
        fakeid: row.fakeid,
        aid: row.aid,
        title: row.title,
        link: row.link,
        author_name: row.author_name,
        digest: row.digest,
        cover: row.cover,
        create_time: row.create_time,
        update_time: row.update_time,
        itemidx: row.itemidx,
        _status: row._status,
        content_download: row.contentDownload,
        comment_download: row.commentDownload,
      },
    });
  } catch (error) {
    console.error('Failed to sync article to backend:', error);
  }
}

function getSelectedRows(): SingleArticleRow[] {
  if (!gridApi.value) return [];
  return gridApi.value.getSelectedRows() as SingleArticleRow[];
}

function updateRow(article: SingleArticleRow) {
  const rowNode = gridApi.value?.getRowNode(article.id);
  if (rowNode) {
    rowNode.updateData(article);
  }
}

const selectedArticles = shallowRef<SingleArticleRow[]>([]);
function onSelectionChanged(event: SelectionChangedEvent) {
  selectedArticles.value = (event.selectedNodes || []).map(node => node.data);
}
const selectedArticleUrls = computed(() => {
  return selectedArticles.value.map(article => article.link);
});
const contentNotDownloadedCount = computed(() => {
  return selectedArticles.value.filter(article => !article.contentDownload).length;
});

const {
  loading: downloadBtnLoading,
  completed_count: downloadCompletedCount,
  total_count: downloadTotalCount,
  download,
} = useDownloader({
  onFakeID(url: string, fakeid: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.fakeid = fakeid;
      updateRow(article);

      updateArticleFakeid(url, fakeid);
    }
  },
  async onContent(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.contentDownload = true;
      article._status = '正常';
      await updateRowFromHtml(article);

      await updateArticleStatus(url, '正常');

      // 修复之前代码逻辑错误导致的数据库状态被误设置为【已删除】
      article.is_deleted = false;
      await articleDeleted(url, false);

      updateRow(article);

      // 自动添加公众号：用公众号名称精准匹配
      await tryAddAccountFromHtml(article);
    } else {
      console.warn(`${url} not found in table data when update contentDownload`);
    }
  },
  onStatusChange(url: string, status: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article._status = status;
      updateRow(article);

      updateArticleStatus(url, status);
    }
  },
  onDelete(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.is_deleted = true;
      article._status = '已删除';
      updateRow(article);

      updateArticleStatus(url, '已删除');
      articleDeleted(url);
    }
  },
  onMetadata(url: string, metadata: Metadata) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.readNum = metadata.readNum;
      article.oldLikeNum = metadata.oldLikeNum;
      article.shareNum = metadata.shareNum;
      article.likeNum = metadata.likeNum;
      article.commentNum = metadata.commentNum;

      if ((preferences.value as unknown as Preferences).downloadConfig.metadataOverrideContent) {
        // 如果同步下载文章内容，则更新相关字段
        article.contentDownload = true;
        article._status = '正常';
        updateArticleStatus(url, '正常');

        // 修复之前代码逻辑错误导致的数据库状态被误设置为【已删除】
        article.is_deleted = false;
        articleDeleted(url, false);
      }

      updateRow(article);
    } else {
      console.warn(`${url} not found in table data when update metadata`);
    }
  },
  onComment(url: string) {
    const article = globalRowData.value.find(article => article.link === url);
    if (article) {
      article.commentDownload = true;
      updateRow(article);
    } else {
      console.warn(`${url} not found in table data when update commentDownload`);
    }
  },
});

async function downloadRows(targetRows: SingleArticleRow[], options: { silent?: boolean } = {}) {
  const { silent = false } = options;
  if (targetRows.length === 0) {
    if (!silent) {
      toast.info('提示', '请先选择至少一篇文章');
    }
    return;
  }

  const urls = targetRows.map(row => row.link);
  await download('html', urls);
}

async function updateRowFromHtml(row: SingleArticleRow) {
  const cache = await getHtmlCache(row.link);
  if (!cache) return;
  const html = await cache.file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const title = doc.querySelector('#activity-name')?.textContent?.trim();
  const author =
    doc.querySelector('#js_author_name')?.textContent?.trim() || doc.querySelector('#js_name')?.textContent?.trim();
  const digest = doc.querySelector('#js_content')?.textContent?.trim()?.slice(0, 160) || row.digest;
  const cover =
    doc.querySelector<HTMLImageElement>('#js_cover')?.getAttribute('data-src') ||
    doc.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.getAttribute('content') ||
    row.cover ||
    '';
  const publishText = doc.querySelector('#publish_time')?.textContent?.trim();
  const ctMatch = html.match(/var ct = "(?<ts>\d+)";/);

  if (title) row.title = title;
  if (author) row.author_name = author;
  row.accountName = doc.querySelector('#js_name')?.textContent?.trim() || row.accountName || null;
  row.digest = digest || '';
  row.cover = cover;

  if (ctMatch?.groups?.ts) {
    row.update_time = Number(ctMatch.groups.ts);
  } else if (publishText) {
    const parsed = dayjs(publishText);
    if (parsed.isValid()) {
      row.update_time = parsed.unix();
    }
  }

  await db.article.put(
    {
      ...buildVirtualArticle(row),
      digest: row.digest,
      cover: cover,
      cover_img: cover,
      pic_cdn_url_1_1: cover,
      pic_cdn_url_3_4: cover,
      pic_cdn_url_16_9: cover,
      pic_cdn_url_235_1: cover,
    },
    `${row.fakeid}:${row.aid}`
  );

  // 同步更新到后端 SQLite 数据库，确保刷新后数据不丢失
  await syncArticleToBackend(row);
}

/**
 * 单篇文章下载成功后，尝试自动添加公众号到数据库
 * 用公众号名称精准匹配：数据库中不存在同名公众号时，调搜索API获取完整信息并保存
 * 同时清理占位符 fakeid（SINGLE_ARTICLE_FAKEID），将文章关联到真实公众号
 */
const SINGLE_FAKEID = 'SINGLE_ARTICLE_FAKEID';

async function tryAddAccountFromHtml(row: SingleArticleRow) {
  const accountName = row.accountName;
  if (!accountName) return;

  try {
    // 1. 用公众号名称精准查询数据库
    const checkResp = await $fetch<{ success: boolean; data: any[] }>(`/api/query/accounts`, {
      query: { nickname: accountName },
    });

    // 如果已存在同名公众号，只需要更新文章的占位符 fakeid
    if (checkResp?.success && checkResp.data && checkResp.data.length > 0) {
      const existingAccount = checkResp.data[0];
      await fixPlaceholderFakeid(row, existingAccount.fakeid);
      return;
    }

    // 2. 数据库中不存在，调用搜索API
    const [accounts, _completed] = await getAccountList(0, accountName);
    if (!accounts || accounts.length === 0) {
      console.warn(`[auto-add-account] 搜索公众号"${accountName}"无结果`);
      return;
    }

    // 3. 精准匹配名称
    const matched = accounts.find(acc => acc.nickname === accountName);
    const target = matched || accounts[0];

    // 4. 保存真实公众号到数据库
    await $fetch('/api/query/account/save', {
      method: 'POST',
      body: {
        fakeid: target.fakeid,
        nickname: target.nickname,
        round_head_img: target.round_head_img,
        signature: target.signature,
        service_type: target.service_type,
      },
    });

    // 5. 将文章的占位符 fakeid 更新为真实 fakeid，并清理空占位符记录
    await fixPlaceholderFakeid(row, target.fakeid);

    console.log(`[auto-add-account] 已自动添加公众号: ${target.nickname} (${target.fakeid})`);
  } catch (error) {
    // 不影响主流程，静默失败
    console.warn('[auto-add-account] 自动添加公众号失败:', error);
  }
}

/**
 * 如果文章使用的是占位符 fakeid，更新为真实 fakeid，并清理空的占位符公众号记录
 */
async function fixPlaceholderFakeid(row: SingleArticleRow, realFakeid: string) {
  if (row.fakeid !== SINGLE_FAKEID) return;

  try {
    // 更新文章的 fakeid 为真实值
    await $fetch('/api/query/article/update-fakeid', {
      method: 'POST',
      body: {
        link: row.link,
        old_fakeid: SINGLE_FAKEID,
        new_fakeid: realFakeid,
      },
    });

    // 更新本地数据
    row.fakeid = realFakeid;
    updateRow(row);
  } catch (error) {
    console.warn('[auto-add-account] 更新文章 fakeid 失败:', error);
  }
}

function previewRow(row: SingleArticleRow) {
  if (!row.contentDownload) {
    toast.warning('提示', '请先抓取该文章内容');
    return;
  }
  const article = buildVirtualArticle(row) as AppMsgExWithFakeID;
  previewArticleRef.value?.open(article);
}

const {
  loading: exportBtnLoading,
  phase: exportPhase,
  completed_count: exportCompletedCount,
  total_count: exportTotalCount,
  exportFile,
} = useExporter();

async function deleteRowData(row: SingleArticleRow) {
  // 先删除后端 SQLite 数据库记录（CASCADE 会删除关联的 html、metadata、comments 等）
  await $fetch('/api/query/article/delete', {
    method: 'POST',
    body: { articles: [{ fakeid: row.fakeid, aid: row.aid }] },
  });
  // 后端成功后，清理前端 IndexedDB 缓存
  const key = `${row.fakeid}:${row.aid}`;
  await db.transaction('rw', ['article', 'html'], async () => {
    await db.article.delete(key);
    await db.html.delete(row.link);
  });
}

async function removeRows() {
  const selectedRows = getSelectedRows();
  if (selectedRows.length === 0) {
    toast.info('提示', '请选择要移除的文章');
    return;
  }
  try {
    await Promise.all(selectedRows.map(row => deleteRowData(row)));
    gridApi.value?.deselectAll();
    // 重新加载当前页数据
    await fetchHotArticles();
    toast.success('移除成功', `已移除 ${selectedRows.length} 篇文章`);
  } catch (error: any) {
    toast.error('移除失败', error?.message || '删除本地缓存时出错');
  }
}
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">单篇文章下载</h1>
    </Teleport>

    <div class="flex flex-col h-full divide-y divide-gray-200">
      <!-- 顶部操作区 -->
      <header class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between px-3 py-3">
        <div class="flex flex-1 gap-3">
          <UInput v-model="inputUrl" placeholder="请输入公众号文章链接" class="flex-1" @keyup.enter="addArticle" />
          <UButton color="blue" :loading="addBtnLoading" :disabled="addBtnLoading" @click="addArticle">
            {{ addBtnLoading ? '解析中...' : '添加' }}
          </UButton>
        </div>
        <div class="flex items-center gap-3">
          <!-- 分页控件 -->
          <div v-if="totalPages > 0" class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UButton
              icon="i-heroicons-chevron-left"
              variant="ghost"
              color="gray"
              size="xs"
              :disabled="currentPage <= 1 || loadingHotArticles"
              @click="goToPage(currentPage - 1)"
            />
            <span class="whitespace-nowrap">第 {{ currentPage }} / {{ totalPages }} 页 (共 {{ totalItems }} 篇)</span>
            <UButton
              icon="i-heroicons-chevron-right"
              variant="ghost"
              color="gray"
              size="xs"
              :disabled="currentPage >= totalPages || loadingHotArticles"
              @click="goToPage(currentPage + 1)"
            />
          </div>
          <ButtonGroup
            :items="[
              { label: '修复fakeid', event: 'fix-fakeid' },
              { label: '文章内容', event: 'download-article-html' },
              { label: '阅读量 (需要Credential)', event: 'download-article-metadata' },
              { label: '留言内容 (需要Credential)', event: 'download-article-comment' },
            ]"
            @fix-fakeid="download('fakeid', selectedArticleUrls)"
            @download-article-html="download('html', selectedArticleUrls)"
            @download-article-metadata="download('metadata', selectedArticleUrls)"
            @download-article-comment="download('comment', selectedArticleUrls)"
          >
            <UButton
              :loading="downloadBtnLoading"
              :disabled="selectedArticleUrls.length === 0"
              color="white"
              class="font-mono"
              :label="downloadBtnLoading ? `抓取中 ${downloadCompletedCount}/${downloadTotalCount}` : '抓取'"
              trailing-icon="i-heroicons-chevron-down-20-solid"
            />
          </ButtonGroup>

          <ButtonGroup
            :items="[
              { label: 'Excel', event: 'export-article-excel' },
              { label: 'JSON', event: 'export-article-json' },
              { label: 'HTML', event: 'export-article-html' },
              { label: 'Txt', event: 'export-article-text' },
              { label: 'Markdown', event: 'export-article-markdown' },
            ]"
            @export-article-excel="exportFile('excel', selectedArticleUrls)"
            @export-article-json="exportFile('json', selectedArticleUrls)"
            @export-article-html="exportFile('html', selectedArticleUrls, contentNotDownloadedCount)"
            @export-article-text="exportFile('text', selectedArticleUrls, contentNotDownloadedCount)"
            @export-article-markdown="exportFile('markdown', selectedArticleUrls, contentNotDownloadedCount)"
          >
            <UButton
              :loading="exportBtnLoading"
              :disabled="selectedArticleUrls.length === 0"
              color="white"
              class="font-mono"
              :label="exportBtnLoading ? `${exportPhase} ${exportCompletedCount}/${exportTotalCount}` : '导出'"
              trailing-icon="i-heroicons-chevron-down-20-solid"
            />
          </ButtonGroup>

          <UButton color="rose" variant="soft" :disabled="selectedArticleUrls.length === 0" @click="removeRows">
            移除
          </UButton>
        </div>
      </header>

      <ag-grid-vue
        style="width: 100%; height: 100%"
        :rowData="globalRowData"
        :columnDefs="columnDefs"
        :gridOptions="gridOptions"
        @grid-ready="onGridReady"
        @filter-changed="onFilterChanged"
        @selection-changed="onSelectionChanged"
      />
    </div>

    <PreviewArticle ref="previewArticleRef" />
  </div>
</template>
