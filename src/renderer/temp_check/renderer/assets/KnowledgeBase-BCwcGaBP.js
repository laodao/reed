import { g as defineStore, r as ref, h as computed, ab as toRaw, ac as storeToRefs, O as onMounted, d as defineComponent, C as createElementBlock, D as createBaseVNode, b as createVNode, a as withCtx, M as unref, P as plus_default, e as createTextVNode, ad as loading_default, S as folder_opened_default, G as Fragment, H as renderList, L as toDisplayString, Y as createCommentVNode, ae as search_default, af as link_default, ag as upload_default, ah as withDirectives, c as createBlock, y as document_default, ai as isRef, aj as withKeys, T as withModifiers, E as ElMessage, V as ElMessageBox, f as resolveComponent, ak as resolveDirective, o as openBlock, J as normalizeClass, al as folder_default, am as more_filled_default, _ as _export_sfc } from "./index-CEiunyEa.js";
const useKnowledgeBaseStore = defineStore("knowledgeBase", () => {
  const knowledgeBases = ref([]);
  const currentKnowledgeBase = ref(null);
  const documents = ref([]);
  const searchResults = ref([]);
  const embeddingModels = ref([]);
  const isLoading = ref(false);
  const isSearching = ref(false);
  const error = ref(null);
  const documentEstimatedTimes = ref(/* @__PURE__ */ new Map());
  const unsubscribers = [];
  const knowledgeBaseCount = computed(() => knowledgeBases.value.length);
  const hasCurrentKnowledgeBase = computed(() => currentKnowledgeBase.value !== null);
  const documentCount = computed(() => documents.value.length);
  function setupEventListeners() {
    const unsubProgress = window.electronAPI.knowledgeBase.onDocumentProgress(
      (data) => {
        const doc = documents.value.find((d) => d.id === data.documentId);
        if (doc) {
          doc.progress = data.progress;
          if (doc.status === "pending") {
            doc.status = "processing";
          }
          if (data.estimatedSeconds !== void 0) {
            documentEstimatedTimes.value.set(data.documentId, data.estimatedSeconds);
          }
        }
      }
    );
    unsubscribers.push(unsubProgress);
    const unsubStatus = window.electronAPI.knowledgeBase.onDocumentStatus(
      (data) => {
        const doc = documents.value.find((d) => d.id === data.documentId);
        if (doc) {
          doc.status = data.status;
          if (data.chunkCount !== void 0) {
            doc.chunkCount = data.chunkCount;
          }
          if (data.errorMessage) {
            doc.errorMessage = data.errorMessage;
          }
          if (data.status === "completed" || data.status === "failed") {
            documentEstimatedTimes.value.delete(data.documentId);
          }
        }
      }
    );
    unsubscribers.push(unsubStatus);
    const unsubStats = window.electronAPI.knowledgeBase.onStatsUpdate(
      (data) => {
        const kb = knowledgeBases.value.find((k) => k.id === data.id);
        if (kb) {
          kb.documentCount = data.documentCount;
          kb.vectorCount = data.vectorCount;
          kb.totalSize = data.totalSize;
        }
        if (currentKnowledgeBase.value?.id === data.id) {
          currentKnowledgeBase.value = {
            ...currentKnowledgeBase.value,
            documentCount: data.documentCount,
            vectorCount: data.vectorCount,
            totalSize: data.totalSize
          };
        }
      }
    );
    unsubscribers.push(unsubStats);
  }
  function cleanupEventListeners() {
    for (const unsub of unsubscribers) {
      unsub();
    }
    unsubscribers.length = 0;
  }
  async function loadKnowledgeBases() {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.list();
      if (response.success && response.data) {
        knowledgeBases.value = response.data;
      } else {
        error.value = response.error || "加载知识库列表失败";
      }
    } catch (err) {
      error.value = err.message || "加载知识库列表失败";
    } finally {
      isLoading.value = false;
    }
  }
  async function selectKnowledgeBase(id) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.get(id);
      if (response.success && response.data) {
        currentKnowledgeBase.value = response.data;
        await loadDocuments(id);
      } else {
        error.value = response.error || "获取知识库详情失败";
      }
    } catch (err) {
      error.value = err.message || "获取知识库详情失败";
    } finally {
      isLoading.value = false;
    }
  }
  async function createKnowledgeBase(request) {
    isLoading.value = true;
    error.value = null;
    try {
      const rawRequest = toRaw(request);
      const response = await window.electronAPI.knowledgeBase.create(rawRequest);
      if (response.success && response.data) {
        knowledgeBases.value.push(response.data);
        return response.data;
      } else {
        error.value = response.error || "创建知识库失败";
        return null;
      }
    } catch (err) {
      error.value = err.message || "创建知识库失败";
      return null;
    } finally {
      isLoading.value = false;
    }
  }
  async function updateKnowledgeBase(id, request) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.update(id, request);
      if (response.success) {
        const index = knowledgeBases.value.findIndex((kb) => kb.id === id);
        if (index !== -1) {
          const kb = knowledgeBases.value[index];
          knowledgeBases.value[index] = {
            ...kb,
            ...request,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        if (currentKnowledgeBase.value?.id === id) {
          currentKnowledgeBase.value = {
            ...currentKnowledgeBase.value,
            ...request,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        return true;
      } else {
        error.value = response.error || "更新知识库失败";
        return false;
      }
    } catch (err) {
      error.value = err.message || "更新知识库失败";
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function deleteKnowledgeBase(id) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.delete(id);
      if (response.success) {
        knowledgeBases.value = knowledgeBases.value.filter((kb) => kb.id !== id);
        if (currentKnowledgeBase.value?.id === id) {
          currentKnowledgeBase.value = null;
          documents.value = [];
        }
        return true;
      } else {
        error.value = response.error || "删除知识库失败";
        return false;
      }
    } catch (err) {
      error.value = err.message || "删除知识库失败";
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  function clearCurrentKnowledgeBase() {
    currentKnowledgeBase.value = null;
    documents.value = [];
    searchResults.value = [];
  }
  async function loadDocuments(knowledgeBaseId) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.getDocuments(knowledgeBaseId);
      if (response.success && response.data) {
        documents.value = response.data;
      } else {
        error.value = response.error || "加载文档列表失败";
      }
    } catch (err) {
      error.value = err.message || "加载文档列表失败";
    } finally {
      isLoading.value = false;
    }
  }
  async function uploadDocuments(files) {
    if (!currentKnowledgeBase.value) {
      error.value = "请先选择知识库";
      return null;
    }
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.uploadDocuments(
        currentKnowledgeBase.value.id,
        files
      );
      if (response.success && response.data) {
        documents.value.push(...response.data);
        await selectKnowledgeBase(currentKnowledgeBase.value.id);
        return response.data;
      } else {
        error.value = response.error || "上传文档失败";
        return null;
      }
    } catch (err) {
      error.value = err.message || "上传文档失败";
      return null;
    } finally {
      isLoading.value = false;
    }
  }
  async function deleteDocument(documentId) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.deleteDocument(documentId);
      if (response.success) {
        documents.value = documents.value.filter((doc) => doc.id !== documentId);
        if (currentKnowledgeBase.value) {
          await selectKnowledgeBase(currentKnowledgeBase.value.id);
        }
        return true;
      } else {
        error.value = response.error || "删除文档失败";
        return false;
      }
    } catch (err) {
      error.value = err.message || "删除文档失败";
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function reprocessDocument(documentId) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.reprocessDocument(documentId);
      if (response.success) {
        if (currentKnowledgeBase.value) {
          await loadDocuments(currentKnowledgeBase.value.id);
        }
        return true;
      } else {
        error.value = response.error || "重新处理文档失败";
        return false;
      }
    } catch (err) {
      error.value = err.message || "重新处理文档失败";
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function getDocumentChunks(documentId) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.getDocumentChunks(documentId);
      if (response.success && response.data) {
        return response.data;
      } else {
        error.value = response.error || "获取文档分片失败";
        return [];
      }
    } catch (err) {
      error.value = err.message || "获取文档分片失败";
      return [];
    } finally {
      isLoading.value = false;
    }
  }
  async function search(request) {
    isSearching.value = true;
    error.value = null;
    try {
      const response = await window.electronAPI.knowledgeBase.search(request);
      if (response.success && response.data) {
        searchResults.value = response.data;
        return response.data;
      } else {
        error.value = response.error || "检索失败";
        searchResults.value = [];
        return [];
      }
    } catch (err) {
      error.value = err.message || "检索失败";
      searchResults.value = [];
      return [];
    } finally {
      isSearching.value = false;
    }
  }
  function clearSearchResults() {
    searchResults.value = [];
  }
  async function loadEmbeddingModels() {
    try {
      const response = await window.electronAPI.knowledgeBase.getEmbeddingModels();
      if (response.success && response.data) {
        embeddingModels.value = response.data;
      }
    } catch (err) {
      console.error("加载 Embedding 模型失败:", err);
    }
  }
  async function selectFiles() {
    try {
      const response = await window.electronAPI.knowledgeBase.selectFiles();
      if (response.success && response.data) {
        return response.data;
      } else {
        return null;
      }
    } catch (err) {
      error.value = err.message || "选择文件失败";
      return null;
    }
  }
  function clearError() {
    error.value = null;
  }
  function reset() {
    knowledgeBases.value = [];
    currentKnowledgeBase.value = null;
    documents.value = [];
    searchResults.value = [];
    embeddingModels.value = [];
    isLoading.value = false;
    isSearching.value = false;
    error.value = null;
  }
  function dispose() {
    cleanupEventListeners();
    reset();
  }
  setupEventListeners();
  function getEstimatedTime(documentId) {
    return documentEstimatedTimes.value.get(documentId);
  }
  return {
    // 状态
    knowledgeBases,
    currentKnowledgeBase,
    documents,
    searchResults,
    embeddingModels,
    isLoading,
    isSearching,
    error,
    documentEstimatedTimes,
    // 计算属性
    knowledgeBaseCount,
    hasCurrentKnowledgeBase,
    documentCount,
    // 知识库管理
    loadKnowledgeBases,
    selectKnowledgeBase,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    clearCurrentKnowledgeBase,
    // 文档管理
    loadDocuments,
    uploadDocuments,
    deleteDocument,
    reprocessDocument,
    getDocumentChunks,
    // 检索服务
    search,
    clearSearchResults,
    // Embedding 模型
    loadEmbeddingModels,
    // 文件选择
    selectFiles,
    // 工具函数
    clearError,
    reset,
    dispose,
    getEstimatedTime
  };
});
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}
function formatDate(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function getFileTypeIcon(fileType) {
  const icons = {
    pdf: "document",
    docx: "document",
    doc: "document",
    txt: "document-text",
    md: "document-text",
    epub: "book",
    xlsx: "grid",
    xls: "grid"
  };
  return icons[fileType] || "document";
}
function getStatusType(status) {
  const types = {
    pending: "info",
    processing: "primary",
    completed: "success",
    failed: "danger"
  };
  return types[status] || "info";
}
function getStatusText(status) {
  const texts = {
    pending: "待处理",
    processing: "处理中",
    completed: "已完成",
    failed: "失败"
  };
  return texts[status] || status;
}
function formatEstimatedTime(seconds) {
  if (seconds <= 0) return "即将完成";
  if (seconds < 60) return `约 ${seconds} 秒`;
  if (seconds < 3600) {
    const minutes2 = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `约 ${minutes2} 分 ${secs} 秒` : `约 ${minutes2} 分钟`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return minutes > 0 ? `约 ${hours} 小时 ${minutes} 分` : `约 ${hours} 小时`;
}
function useKnowledgeBase() {
  const store = useKnowledgeBaseStore();
  const {
    knowledgeBases,
    currentKnowledgeBase,
    documents,
    searchResults,
    embeddingModels,
    isLoading,
    isSearching,
    error,
    knowledgeBaseCount,
    hasCurrentKnowledgeBase,
    documentCount,
    documentEstimatedTimes
  } = storeToRefs(store);
  const searchQuery = ref("");
  const searchTopK = ref(5);
  const searchVectorWeight = ref(0.7);
  const searchThreshold = ref(0);
  const selectedEmbeddingModel = ref(null);
  const showCreateDialog = ref(false);
  const createForm = ref({
    name: "",
    description: "",
    embeddingModel: "",
    embeddingDimension: 1536
  });
  const showEditDialog = ref(false);
  const editForm = ref({});
  const hasEmbeddingModels = computed(
    () => embeddingModels.value.length > 0
  );
  async function loadKnowledgeBases() {
    await store.loadKnowledgeBases();
  }
  async function selectKnowledgeBase(id) {
    await store.selectKnowledgeBase(id);
  }
  async function createKnowledgeBase() {
    const request = toRaw(createForm.value);
    const result = await store.createKnowledgeBase(request);
    if (result) {
      showCreateDialog.value = false;
      resetCreateForm();
    }
    return result;
  }
  async function updateKnowledgeBase() {
    if (!currentKnowledgeBase.value) return false;
    const result = await store.updateKnowledgeBase(currentKnowledgeBase.value.id, editForm.value);
    if (result) {
      showEditDialog.value = false;
      resetEditForm();
    }
    return result;
  }
  async function deleteKnowledgeBase(id) {
    return await store.deleteKnowledgeBase(id);
  }
  function openCreateDialog() {
    resetCreateForm();
    showCreateDialog.value = true;
  }
  function openEditDialog() {
    if (currentKnowledgeBase.value) {
      editForm.value = {
        name: currentKnowledgeBase.value.name,
        description: currentKnowledgeBase.value.description
      };
      showEditDialog.value = true;
    }
  }
  function resetCreateForm() {
    createForm.value.name = "";
    createForm.value.description = "";
    createForm.value.embeddingModel = "";
    createForm.value.embeddingDimension = 1536;
    delete createForm.value.embeddingConfig;
    selectedEmbeddingModel.value = null;
  }
  function resetEditForm() {
    editForm.value = {};
  }
  async function uploadDocuments(files) {
    return await store.uploadDocuments(files);
  }
  async function selectAndUploadFiles() {
    const files = await store.selectFiles();
    if (files && files.length > 0) {
      return await uploadDocuments(files);
    }
    return null;
  }
  async function deleteDocument(documentId) {
    return await store.deleteDocument(documentId);
  }
  async function reprocessDocument(documentId) {
    return await store.reprocessDocument(documentId);
  }
  async function getDocumentChunks(documentId) {
    return await store.getDocumentChunks(documentId);
  }
  async function searchKnowledgeBase(query) {
    if (!currentKnowledgeBase.value) return [];
    const request = {
      knowledgeBaseId: currentKnowledgeBase.value.id,
      query: query || searchQuery.value,
      topK: searchTopK.value,
      vectorWeight: searchVectorWeight.value,
      threshold: searchThreshold.value
    };
    return await store.search(request);
  }
  function clearSearchResults() {
    searchQuery.value = "";
    store.clearSearchResults();
  }
  async function loadEmbeddingModels() {
    await store.loadEmbeddingModels();
  }
  function selectEmbeddingModel(model) {
    const rawModel = toRaw(model);
    selectedEmbeddingModel.value = rawModel;
    createForm.value.embeddingModel = rawModel.id;
    createForm.value.embeddingDimension = rawModel.dimension;
    createForm.value.embeddingConfig = {
      provider: rawModel.provider,
      modelId: rawModel.id,
      providerConfigId: rawModel.providerConfigId,
      providerTemplateId: rawModel.providerTemplateId,
      ollamaBaseUrl: rawModel.ollamaBaseUrl
    };
  }
  function clearError() {
    store.clearError();
  }
  function reset() {
    store.reset();
    searchQuery.value = "";
    searchTopK.value = 5;
    searchVectorWeight.value = 0.7;
    searchThreshold.value = 0;
    selectedEmbeddingModel.value = null;
    showCreateDialog.value = false;
    showEditDialog.value = false;
    resetCreateForm();
    resetEditForm();
  }
  onMounted(async () => {
    await Promise.all([
      loadKnowledgeBases(),
      loadEmbeddingModels()
    ]);
  });
  return {
    // Store 状态
    knowledgeBases,
    currentKnowledgeBase,
    documents,
    searchResults,
    embeddingModels,
    isLoading,
    isSearching,
    error,
    knowledgeBaseCount,
    hasCurrentKnowledgeBase,
    documentCount,
    documentEstimatedTimes,
    // 本地状态
    searchQuery,
    searchTopK,
    searchVectorWeight,
    searchThreshold,
    selectedEmbeddingModel,
    showCreateDialog,
    createForm,
    showEditDialog,
    editForm,
    // 计算属性
    hasEmbeddingModels,
    // 知识库管理
    loadKnowledgeBases,
    selectKnowledgeBase,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    openCreateDialog,
    openEditDialog,
    // 文档管理
    uploadDocuments,
    selectAndUploadFiles,
    deleteDocument,
    reprocessDocument,
    getDocumentChunks,
    // 检索服务
    searchKnowledgeBase,
    clearSearchResults,
    // Embedding 模型
    loadEmbeddingModels,
    selectEmbeddingModel,
    // 工具函数
    clearError,
    reset,
    formatFileSize,
    formatDate,
    getFileTypeIcon,
    getStatusType,
    getStatusText,
    formatEstimatedTime,
    getEstimatedTime: store.getEstimatedTime
  };
}
const _hoisted_1 = { class: "knowledge-base-page" };
const _hoisted_2 = { class: "page-sidebar" };
const _hoisted_3 = { class: "sidebar-header" };
const _hoisted_4 = { class: "sidebar-content" };
const _hoisted_5 = {
  key: 0,
  class: "loading-state"
};
const _hoisted_6 = {
  key: 1,
  class: "empty-state"
};
const _hoisted_7 = {
  key: 2,
  class: "kb-list"
};
const _hoisted_8 = ["onClick"];
const _hoisted_9 = { class: "kb-icon" };
const _hoisted_10 = { class: "kb-info" };
const _hoisted_11 = { class: "kb-name" };
const _hoisted_12 = { class: "kb-stats" };
const _hoisted_13 = { class: "page-main" };
const _hoisted_14 = {
  key: 0,
  class: "empty-main"
};
const _hoisted_15 = { class: "main-header" };
const _hoisted_16 = { class: "header-left" };
const _hoisted_17 = {
  key: 0,
  class: "description"
};
const _hoisted_18 = { class: "header-right" };
const _hoisted_19 = { class: "stats-bar" };
const _hoisted_20 = { class: "stat-item" };
const _hoisted_21 = { class: "stat-value" };
const _hoisted_22 = { class: "stat-item" };
const _hoisted_23 = { class: "stat-value" };
const _hoisted_24 = { class: "stat-item" };
const _hoisted_25 = { class: "stat-value" };
const _hoisted_26 = { class: "document-section" };
const _hoisted_27 = { class: "section-header" };
const _hoisted_28 = { class: "doc-count" };
const _hoisted_29 = { class: "doc-name" };
const _hoisted_30 = { class: "status-cell" };
const _hoisted_31 = {
  key: 0,
  class: "estimated-time"
};
const _hoisted_32 = { class: "action-buttons" };
const _hoisted_33 = { class: "model-option" };
const _hoisted_34 = { class: "model-dimension" };
const _hoisted_35 = {
  key: 0,
  class: "form-tip"
};
const _hoisted_36 = { class: "search-panel" };
const _hoisted_37 = { class: "search-input-section" };
const _hoisted_38 = { class: "search-options" };
const _hoisted_39 = { class: "search-actions" };
const _hoisted_40 = { class: "search-results" };
const _hoisted_41 = { key: 0 };
const _hoisted_42 = { class: "result-header" };
const _hoisted_43 = { class: "result-index" };
const _hoisted_44 = { class: "result-score" };
const _hoisted_45 = { class: "result-doc" };
const _hoisted_46 = { class: "result-content" };
const _hoisted_47 = {
  key: 0,
  class: "no-results"
};
const _hoisted_48 = { class: "chunks-container" };
const _hoisted_49 = {
  key: 0,
  class: "empty-chunks"
};
const _hoisted_50 = {
  key: 1,
  class: "chunks-list"
};
const _hoisted_51 = { class: "chunks-header" };
const _hoisted_52 = { key: 0 };
const _hoisted_53 = { key: 1 };
const _hoisted_54 = { key: 2 };
const _hoisted_55 = {
  key: 0,
  class: "chunks-pagination"
};
const _hoisted_56 = { class: "chunk-content-container" };
const _hoisted_57 = {
  key: 0,
  class: "chunk-content-text"
};
const _hoisted_58 = {
  key: 1,
  class: "empty-chunk-content"
};
const chunksPageSize = 20;
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "KnowledgeBase",
  setup(__props) {
    const {
      // 状态
      knowledgeBases,
      currentKnowledgeBase,
      documents,
      searchResults,
      isLoading,
      isSearching,
      hasCurrentKnowledgeBase,
      documentCount,
      embeddingModels,
      error,
      // 对话框
      showCreateDialog,
      createForm,
      showEditDialog,
      editForm,
      // 检索
      searchQuery,
      searchTopK,
      searchVectorWeight,
      // 方法
      selectKnowledgeBase,
      createKnowledgeBase,
      updateKnowledgeBase,
      deleteKnowledgeBase,
      openCreateDialog,
      selectAndUploadFiles,
      deleteDocument,
      reprocessDocument,
      searchKnowledgeBase,
      clearSearchResults,
      selectEmbeddingModel,
      // 工具函数
      formatFileSize: formatFileSize2,
      formatDate: formatDate2,
      getStatusType: getStatusType2,
      getStatusText: getStatusText2,
      formatEstimatedTime: formatEstimatedTime2,
      getEstimatedTime
    } = useKnowledgeBase();
    const createFormRef = ref();
    const editFormRef = ref();
    const openSearchPanel = ref(false);
    const showChunksDialog = ref(false);
    const chunksLoading = ref(false);
    const paginatedChunks = ref([]);
    const currentChunkDocument = ref(null);
    const chunksCurrentPage = ref(1);
    const chunksTotal = ref(0);
    const showChunkContentDialog = ref(false);
    const chunkContentLoading = ref(false);
    const chunkContent = ref("");
    const currentViewingChunk = ref(null);
    const showAddWebpageDialog = ref(false);
    const webpageUrl = ref("");
    const addingWebpage = ref(false);
    const editingKb = ref(null);
    const createRules = {
      name: [
        { required: true, message: "请输入知识库名称", trigger: "blur" },
        { min: 2, max: 50, message: "名称长度在 2 到 50 个字符", trigger: "blur" }
      ],
      embeddingModel: [
        { required: true, message: "请选择 Embedding 模型", trigger: "change" }
      ]
    };
    const editRules = {
      name: [
        { required: true, message: "请输入知识库名称", trigger: "blur" },
        { min: 2, max: 50, message: "名称长度在 2 到 50 个字符", trigger: "blur" }
      ]
    };
    function handleKbAction(action, kb) {
      if (action === "edit") {
        editingKb.value = kb;
        editForm.value = {
          name: kb.name,
          description: kb.description || ""
        };
        showEditDialog.value = true;
      } else if (action === "delete") {
        ElMessageBox.confirm(
          `确定要删除知识库 "${kb.name}" 吗？删除后将无法恢复，所有文档和向量数据都将被删除。`,
          "删除确认",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        ).then(async () => {
          const success = await deleteKnowledgeBase(kb.id);
          if (success) {
            ElMessage.success("删除成功");
          }
        }).catch(() => {
        });
      }
    }
    function handleEmbeddingModelChange(modelId) {
      const model = toRaw(embeddingModels.value.find((m) => m.id === modelId));
      if (model) {
        selectEmbeddingModel(model);
      }
    }
    async function handleCreateKnowledgeBase() {
      if (!createFormRef.value) return;
      try {
        await createFormRef.value.validate();
        const result = await createKnowledgeBase();
        if (result) {
          ElMessage.success("创建成功");
          selectKnowledgeBase(result.id);
        } else if (error.value) {
          ElMessage.error(error.value);
        }
      } catch (err) {
        console.error("表单验证失败:", err);
      }
    }
    async function handleUpdateKnowledgeBase() {
      if (!editFormRef.value || !editingKb.value) return;
      await editFormRef.value.validate(async (valid) => {
        if (valid) {
          const success = await updateKnowledgeBase();
          if (success) {
            ElMessage.success("保存成功");
          }
        }
      });
    }
    async function handleDeleteDocument(doc) {
      try {
        await ElMessageBox.confirm(
          `确定要删除文档 "${doc.name}" 吗？`,
          "删除确认",
          {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning"
          }
        );
        const success = await deleteDocument(doc.id);
        if (success) {
          ElMessage.success("删除成功");
        }
      } catch {
      }
    }
    async function handleSearch() {
      if (!searchQuery.value.trim()) {
        ElMessage.warning("请输入检索内容");
        return;
      }
      await searchKnowledgeBase();
    }
    async function handleViewChunks(doc) {
      if (doc.status !== "completed") {
        ElMessage.warning("文档尚未处理完成，无法查看分片");
        return;
      }
      currentChunkDocument.value = doc;
      showChunksDialog.value = true;
      chunksCurrentPage.value = 1;
      await loadChunksPage();
    }
    async function loadChunksPage() {
      if (!currentChunkDocument.value) return;
      chunksLoading.value = true;
      paginatedChunks.value = [];
      try {
        const response = await window.electronAPI.knowledgeBase.getDocumentChunksPaginated(
          currentChunkDocument.value.id,
          chunksCurrentPage.value,
          chunksPageSize
        );
        if (response.success && response.data) {
          paginatedChunks.value = response.data.chunks;
          chunksTotal.value = response.data.total;
        } else {
          ElMessage.error(response.error || "获取文档分片失败");
        }
      } catch (err) {
        ElMessage.error(err.message || "获取文档分片失败");
      } finally {
        chunksLoading.value = false;
      }
    }
    function handleChunksPageChange(page) {
      chunksCurrentPage.value = page;
      loadChunksPage();
    }
    function handleRowClick(row) {
      viewChunkContent(row);
    }
    async function viewChunkContent(chunk) {
      currentViewingChunk.value = chunk;
      showChunkContentDialog.value = true;
      chunkContentLoading.value = true;
      chunkContent.value = "";
      try {
        const response = await window.electronAPI.knowledgeBase.getChunk(chunk.id);
        if (response.success && response.data) {
          chunkContent.value = response.data.content || "";
        } else {
          ElMessage.error(response.error || "获取切片内容失败");
        }
      } catch (err) {
        ElMessage.error(err.message || "获取切片内容失败");
      } finally {
        chunkContentLoading.value = false;
      }
    }
    async function handleAddWebpage() {
      const url = webpageUrl.value.trim();
      if (!url) {
        ElMessage.warning("请输入网页地址");
        return;
      }
      try {
        const parsedUrl = new URL(url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          ElMessage.warning("仅支持 HTTP/HTTPS 协议");
          return;
        }
      } catch {
        ElMessage.warning("请输入有效的网页地址");
        return;
      }
      addingWebpage.value = true;
      try {
        const response = await window.electronAPI.knowledgeBase.addWebpage(
          currentKnowledgeBase.value.id,
          url
        );
        if (response.success && response.data) {
          ElMessage.success("网页添加成功，正在处理中...");
          showAddWebpageDialog.value = false;
          webpageUrl.value = "";
          documents.value = [...documents.value, response.data];
        } else {
          ElMessage.error(response.error || "添加网页失败");
        }
      } catch (err) {
        ElMessage.error(err.message || "添加网页失败");
      } finally {
        addingWebpage.value = false;
      }
    }
    return (_ctx, _cache) => {
      const _component_el_icon = resolveComponent("el-icon");
      const _component_el_button = resolveComponent("el-button");
      const _component_el_dropdown_item = resolveComponent("el-dropdown-item");
      const _component_el_dropdown_menu = resolveComponent("el-dropdown-menu");
      const _component_el_dropdown = resolveComponent("el-dropdown");
      const _component_el_scrollbar = resolveComponent("el-scrollbar");
      const _component_el_table_column = resolveComponent("el-table-column");
      const _component_el_tag = resolveComponent("el-tag");
      const _component_el_progress = resolveComponent("el-progress");
      const _component_el_table = resolveComponent("el-table");
      const _component_el_input = resolveComponent("el-input");
      const _component_el_form_item = resolveComponent("el-form-item");
      const _component_el_option = resolveComponent("el-option");
      const _component_el_select = resolveComponent("el-select");
      const _component_el_form = resolveComponent("el-form");
      const _component_el_dialog = resolveComponent("el-dialog");
      const _component_el_input_number = resolveComponent("el-input-number");
      const _component_el_slider = resolveComponent("el-slider");
      const _component_el_drawer = resolveComponent("el-drawer");
      const _component_el_pagination = resolveComponent("el-pagination");
      const _directive_loading = resolveDirective("loading");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            _cache[26] || (_cache[26] = createBaseVNode("h3", null, "知识库", -1)),
            createVNode(_component_el_button, {
              type: "primary",
              size: "small",
              onClick: unref(openCreateDialog)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[25] || (_cache[25] = createTextVNode(" 新建 ", -1))
              ]),
              _: 1
            }, 8, ["onClick"])
          ]),
          createBaseVNode("div", _hoisted_4, [
            createVNode(_component_el_scrollbar, null, {
              default: withCtx(() => [
                unref(isLoading) ? (openBlock(), createElementBlock("div", _hoisted_5, [
                  createVNode(_component_el_icon, { class: "is-loading" }, {
                    default: withCtx(() => [
                      createVNode(unref(loading_default))
                    ]),
                    _: 1
                  }),
                  _cache[27] || (_cache[27] = createBaseVNode("span", null, "加载中...", -1))
                ])) : unref(knowledgeBases).length === 0 ? (openBlock(), createElementBlock("div", _hoisted_6, [
                  createVNode(_component_el_icon, null, {
                    default: withCtx(() => [
                      createVNode(unref(folder_opened_default))
                    ]),
                    _: 1
                  }),
                  _cache[29] || (_cache[29] = createBaseVNode("span", null, "暂无知识库", -1)),
                  createVNode(_component_el_button, {
                    type: "primary",
                    text: "",
                    onClick: unref(openCreateDialog)
                  }, {
                    default: withCtx(() => [..._cache[28] || (_cache[28] = [
                      createTextVNode(" 创建第一个知识库 ", -1)
                    ])]),
                    _: 1
                  }, 8, ["onClick"])
                ])) : (openBlock(), createElementBlock("div", _hoisted_7, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(knowledgeBases), (kb) => {
                    return openBlock(), createElementBlock("div", {
                      key: kb.id,
                      class: normalizeClass(["kb-item", { active: unref(currentKnowledgeBase)?.id === kb.id }]),
                      onClick: ($event) => unref(selectKnowledgeBase)(kb.id)
                    }, [
                      createBaseVNode("div", _hoisted_9, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(folder_default))
                          ]),
                          _: 1
                        })
                      ]),
                      createBaseVNode("div", _hoisted_10, [
                        createBaseVNode("div", _hoisted_11, toDisplayString(kb.name), 1),
                        createBaseVNode("div", _hoisted_12, [
                          createBaseVNode("span", null, toDisplayString(kb.documentCount) + " 文档", 1),
                          createBaseVNode("span", null, toDisplayString(kb.vectorCount) + " 向量", 1)
                        ])
                      ]),
                      createBaseVNode("div", {
                        class: "kb-actions",
                        onClick: _cache[1] || (_cache[1] = withModifiers(() => {
                        }, ["stop"]))
                      }, [
                        createVNode(_component_el_dropdown, {
                          trigger: "click",
                          onCommand: ($event) => handleKbAction($event, kb)
                        }, {
                          dropdown: withCtx(() => [
                            createVNode(_component_el_dropdown_menu, null, {
                              default: withCtx(() => [
                                createVNode(_component_el_dropdown_item, { command: "edit" }, {
                                  default: withCtx(() => [..._cache[30] || (_cache[30] = [
                                    createTextVNode("编辑", -1)
                                  ])]),
                                  _: 1
                                }),
                                createVNode(_component_el_dropdown_item, {
                                  command: "delete",
                                  divided: ""
                                }, {
                                  default: withCtx(() => [..._cache[31] || (_cache[31] = [
                                    createTextVNode("删除", -1)
                                  ])]),
                                  _: 1
                                })
                              ]),
                              _: 1
                            })
                          ]),
                          default: withCtx(() => [
                            createVNode(_component_el_button, {
                              text: "",
                              size: "small",
                              onClick: _cache[0] || (_cache[0] = withModifiers(() => {
                              }, ["stop"]))
                            }, {
                              default: withCtx(() => [
                                createVNode(_component_el_icon, null, {
                                  default: withCtx(() => [
                                    createVNode(unref(more_filled_default))
                                  ]),
                                  _: 1
                                })
                              ]),
                              _: 1
                            })
                          ]),
                          _: 1
                        }, 8, ["onCommand"])
                      ])
                    ], 10, _hoisted_8);
                  }), 128))
                ]))
              ]),
              _: 1
            })
          ])
        ]),
        createBaseVNode("div", _hoisted_13, [
          !unref(hasCurrentKnowledgeBase) ? (openBlock(), createElementBlock("div", _hoisted_14, [
            createVNode(_component_el_icon, {
              size: 64,
              color: "#c0c4cc"
            }, {
              default: withCtx(() => [
                createVNode(unref(folder_opened_default))
              ]),
              _: 1
            }),
            _cache[33] || (_cache[33] = createBaseVNode("h3", null, "选择或创建知识库", -1)),
            _cache[34] || (_cache[34] = createBaseVNode("p", null, "从左侧选择一个知识库，或创建新的知识库", -1)),
            createVNode(_component_el_button, {
              type: "primary",
              onClick: unref(openCreateDialog)
            }, {
              default: withCtx(() => [
                createVNode(_component_el_icon, null, {
                  default: withCtx(() => [
                    createVNode(unref(plus_default))
                  ]),
                  _: 1
                }),
                _cache[32] || (_cache[32] = createTextVNode(" 新建知识库 ", -1))
              ]),
              _: 1
            }, 8, ["onClick"])
          ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_15, [
              createBaseVNode("div", _hoisted_16, [
                createBaseVNode("h2", null, toDisplayString(unref(currentKnowledgeBase)?.name), 1),
                unref(currentKnowledgeBase)?.description ? (openBlock(), createElementBlock("span", _hoisted_17, toDisplayString(unref(currentKnowledgeBase).description), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_18, [
                createVNode(_component_el_button, {
                  onClick: _cache[2] || (_cache[2] = ($event) => openSearchPanel.value = true)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(search_default))
                      ]),
                      _: 1
                    }),
                    _cache[35] || (_cache[35] = createTextVNode(" 检索知识库 ", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_button, {
                  onClick: _cache[3] || (_cache[3] = ($event) => showAddWebpageDialog.value = true)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(link_default))
                      ]),
                      _: 1
                    }),
                    _cache[36] || (_cache[36] = createTextVNode(" 添加网页 ", -1))
                  ]),
                  _: 1
                }),
                createVNode(_component_el_button, {
                  type: "primary",
                  onClick: unref(selectAndUploadFiles)
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_icon, null, {
                      default: withCtx(() => [
                        createVNode(unref(upload_default))
                      ]),
                      _: 1
                    }),
                    _cache[37] || (_cache[37] = createTextVNode(" 上传文档 ", -1))
                  ]),
                  _: 1
                }, 8, ["onClick"])
              ])
            ]),
            createBaseVNode("div", _hoisted_19, [
              createBaseVNode("div", _hoisted_20, [
                createBaseVNode("span", _hoisted_21, toDisplayString(unref(currentKnowledgeBase)?.documentCount || 0), 1),
                _cache[38] || (_cache[38] = createBaseVNode("span", { class: "stat-label" }, "文档", -1))
              ]),
              createBaseVNode("div", _hoisted_22, [
                createBaseVNode("span", _hoisted_23, toDisplayString(unref(currentKnowledgeBase)?.vectorCount || 0), 1),
                _cache[39] || (_cache[39] = createBaseVNode("span", { class: "stat-label" }, "向量", -1))
              ]),
              createBaseVNode("div", _hoisted_24, [
                createBaseVNode("span", _hoisted_25, toDisplayString(unref(formatFileSize2)(unref(currentKnowledgeBase)?.totalSize || 0)), 1),
                _cache[40] || (_cache[40] = createBaseVNode("span", { class: "stat-label" }, "总大小", -1))
              ])
            ]),
            createBaseVNode("div", _hoisted_26, [
              createBaseVNode("div", _hoisted_27, [
                _cache[41] || (_cache[41] = createBaseVNode("h3", null, "文档列表", -1)),
                createBaseVNode("span", _hoisted_28, "共 " + toDisplayString(unref(documentCount)) + " 个文档", 1)
              ]),
              withDirectives((openBlock(), createBlock(_component_el_table, {
                data: unref(documents),
                style: { "width": "100%" }
              }, {
                default: withCtx(() => [
                  createVNode(_component_el_table_column, {
                    prop: "name",
                    label: "文件名",
                    "min-width": "200"
                  }, {
                    default: withCtx(({ row }) => [
                      createBaseVNode("div", _hoisted_29, [
                        createVNode(_component_el_icon, null, {
                          default: withCtx(() => [
                            createVNode(unref(document_default))
                          ]),
                          _: 1
                        }),
                        createBaseVNode("span", null, toDisplayString(row.name), 1)
                      ])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_table_column, {
                    prop: "fileType",
                    label: "类型",
                    width: "100"
                  }, {
                    default: withCtx(({ row }) => [
                      createVNode(_component_el_tag, { size: "small" }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(row.fileType.toUpperCase()), 1)
                        ]),
                        _: 2
                      }, 1024)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_table_column, {
                    prop: "fileSize",
                    label: "大小",
                    width: "100"
                  }, {
                    default: withCtx(({ row }) => [
                      createTextVNode(toDisplayString(unref(formatFileSize2)(row.fileSize)), 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_table_column, {
                    prop: "status",
                    label: "状态",
                    width: "160"
                  }, {
                    default: withCtx(({ row }) => [
                      createBaseVNode("div", _hoisted_30, [
                        createVNode(_component_el_tag, {
                          type: unref(getStatusType2)(row.status),
                          size: "small"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(unref(getStatusText2)(row.status)), 1)
                          ]),
                          _: 2
                        }, 1032, ["type"]),
                        row.status === "processing" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                          createVNode(_component_el_progress, {
                            percentage: row.progress,
                            "stroke-width": 4,
                            "show-text": false
                          }, null, 8, ["percentage"]),
                          unref(getEstimatedTime)(row.id) ? (openBlock(), createElementBlock("span", _hoisted_31, toDisplayString(unref(formatEstimatedTime2)(unref(getEstimatedTime)(row.id))), 1)) : createCommentVNode("", true)
                        ], 64)) : createCommentVNode("", true)
                      ])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_table_column, {
                    prop: "chunkCount",
                    label: "切片数",
                    width: "100"
                  }, {
                    default: withCtx(({ row }) => [
                      createTextVNode(toDisplayString(row.chunkCount || "-"), 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_table_column, {
                    prop: "createdAt",
                    label: "上传时间",
                    width: "180"
                  }, {
                    default: withCtx(({ row }) => [
                      createTextVNode(toDisplayString(unref(formatDate2)(row.createdAt)), 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_el_table_column, {
                    label: "操作",
                    width: "200",
                    fixed: "right",
                    "class-name": "action-column"
                  }, {
                    default: withCtx(({ row }) => [
                      createBaseVNode("div", _hoisted_32, [
                        row.status === "completed" ? (openBlock(), createBlock(_component_el_button, {
                          key: 0,
                          text: "",
                          type: "primary",
                          size: "small",
                          onClick: ($event) => handleViewChunks(row)
                        }, {
                          default: withCtx(() => [..._cache[42] || (_cache[42] = [
                            createTextVNode(" 查看 ", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"])) : createCommentVNode("", true),
                        row.status === "failed" ? (openBlock(), createBlock(_component_el_button, {
                          key: 1,
                          text: "",
                          type: "primary",
                          size: "small",
                          onClick: ($event) => unref(reprocessDocument)(row.id)
                        }, {
                          default: withCtx(() => [..._cache[43] || (_cache[43] = [
                            createTextVNode(" 重试 ", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"])) : createCommentVNode("", true),
                        createVNode(_component_el_button, {
                          text: "",
                          type: "danger",
                          size: "small",
                          onClick: ($event) => handleDeleteDocument(row)
                        }, {
                          default: withCtx(() => [..._cache[44] || (_cache[44] = [
                            createTextVNode(" 删除 ", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"])
                      ])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["data"])), [
                [_directive_loading, unref(isLoading)]
              ])
            ])
          ], 64))
        ]),
        createVNode(_component_el_dialog, {
          modelValue: unref(showCreateDialog),
          "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => isRef(showCreateDialog) ? showCreateDialog.value = $event : null),
          title: "创建知识库",
          width: "500px",
          "close-on-click-modal": false,
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[7] || (_cache[7] = ($event) => showCreateDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[45] || (_cache[45] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(isLoading),
              onClick: handleCreateKnowledgeBase
            }, {
              default: withCtx(() => [..._cache[46] || (_cache[46] = [
                createTextVNode(" 创建 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              ref_key: "createFormRef",
              ref: createFormRef,
              model: unref(createForm),
              rules: createRules,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "名称",
                  prop: "name"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: unref(createForm).name,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => unref(createForm).name = $event),
                      placeholder: "请输入知识库名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "描述",
                  prop: "description"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: unref(createForm).description,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => unref(createForm).description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "请输入知识库描述（可选）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "Embedding",
                  prop: "embeddingModel"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_select, {
                      modelValue: unref(createForm).embeddingModel,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => unref(createForm).embeddingModel = $event),
                      placeholder: "选择 Embedding 模型",
                      style: { "width": "100%" },
                      onChange: handleEmbeddingModelChange
                    }, {
                      default: withCtx(() => [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(embeddingModels), (model) => {
                          return openBlock(), createBlock(_component_el_option, {
                            key: model.id,
                            label: model.name,
                            value: model.id
                          }, {
                            default: withCtx(() => [
                              createBaseVNode("div", _hoisted_33, [
                                createBaseVNode("span", null, toDisplayString(model.name), 1),
                                createBaseVNode("span", _hoisted_34, toDisplayString(model.dimension) + "维", 1)
                              ])
                            ]),
                            _: 2
                          }, 1032, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    unref(embeddingModels).length === 0 ? (openBlock(), createElementBlock("div", _hoisted_35, " 请先在设置中添加提供商并启用 Embedding 模型 ")) : createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: unref(showEditDialog),
          "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => isRef(showEditDialog) ? showEditDialog.value = $event : null),
          title: "编辑知识库",
          width: "500px",
          "close-on-click-modal": false,
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[11] || (_cache[11] = ($event) => showEditDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[47] || (_cache[47] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: unref(isLoading),
              onClick: handleUpdateKnowledgeBase
            }, {
              default: withCtx(() => [..._cache[48] || (_cache[48] = [
                createTextVNode(" 保存 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, {
              ref_key: "editFormRef",
              ref: editFormRef,
              model: unref(editForm),
              rules: editRules,
              "label-width": "100px"
            }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, {
                  label: "名称",
                  prop: "name"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: unref(editForm).name,
                      "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => unref(editForm).name = $event),
                      placeholder: "请输入知识库名称"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, {
                  label: "描述",
                  prop: "description"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: unref(editForm).description,
                      "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => unref(editForm).description = $event),
                      type: "textarea",
                      rows: 3,
                      placeholder: "请输入知识库描述（可选）"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_drawer, {
          modelValue: openSearchPanel.value,
          "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => openSearchPanel.value = $event),
          title: "检索知识库",
          direction: "rtl",
          size: "500px"
        }, {
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_36, [
              createBaseVNode("div", _hoisted_37, [
                createVNode(_component_el_input, {
                  modelValue: unref(searchQuery),
                  "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => isRef(searchQuery) ? searchQuery.value = $event : null),
                  type: "textarea",
                  rows: 3,
                  placeholder: "输入检索内容...",
                  onKeyup: withKeys(handleSearch, ["enter"])
                }, null, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_38, [
                createVNode(_component_el_form, {
                  "label-width": "80px",
                  size: "small"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_form_item, { label: "返回数量" }, {
                      default: withCtx(() => [
                        createVNode(_component_el_input_number, {
                          modelValue: unref(searchTopK),
                          "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => isRef(searchTopK) ? searchTopK.value = $event : null),
                          min: 1,
                          max: 20
                        }, null, 8, ["modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_form_item, { label: "向量权重" }, {
                      default: withCtx(() => [
                        createVNode(_component_el_slider, {
                          modelValue: unref(searchVectorWeight),
                          "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => isRef(searchVectorWeight) ? searchVectorWeight.value = $event : null),
                          min: 0,
                          max: 1,
                          step: 0.1
                        }, null, 8, ["modelValue"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                })
              ]),
              createBaseVNode("div", _hoisted_39, [
                createVNode(_component_el_button, { onClick: unref(clearSearchResults) }, {
                  default: withCtx(() => [..._cache[49] || (_cache[49] = [
                    createTextVNode("清除", -1)
                  ])]),
                  _: 1
                }, 8, ["onClick"]),
                createVNode(_component_el_button, {
                  type: "primary",
                  loading: unref(isSearching),
                  onClick: handleSearch
                }, {
                  default: withCtx(() => [..._cache[50] || (_cache[50] = [
                    createTextVNode(" 检索 ", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"])
              ]),
              createBaseVNode("div", _hoisted_40, [
                unref(searchResults).length > 0 ? (openBlock(), createElementBlock("h4", _hoisted_41, "检索结果 (" + toDisplayString(unref(searchResults).length) + ")", 1)) : createCommentVNode("", true),
                createVNode(_component_el_scrollbar, { "max-height": "calc(100vh - 350px)" }, {
                  default: withCtx(() => [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(unref(searchResults), (result, index) => {
                      return openBlock(), createElementBlock("div", {
                        key: result.chunkId,
                        class: "result-item"
                      }, [
                        createBaseVNode("div", _hoisted_42, [
                          createBaseVNode("span", _hoisted_43, "#" + toDisplayString(index + 1), 1),
                          createBaseVNode("span", _hoisted_44, "相似度: " + toDisplayString(result.score.toFixed(4)), 1),
                          createBaseVNode("span", _hoisted_45, toDisplayString(result.documentName), 1)
                        ]),
                        createBaseVNode("div", _hoisted_46, toDisplayString(result.content), 1)
                      ]);
                    }), 128)),
                    unref(searchResults).length === 0 && !unref(isSearching) ? (openBlock(), createElementBlock("div", _hoisted_47, [
                      createVNode(_component_el_icon, null, {
                        default: withCtx(() => [
                          createVNode(unref(search_default))
                        ]),
                        _: 1
                      }),
                      _cache[51] || (_cache[51] = createBaseVNode("span", null, "输入关键词开始检索", -1))
                    ])) : createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ])
            ])
          ]),
          _: 1
        }, 8, ["modelValue"]),
        createVNode(_component_el_dialog, {
          modelValue: showChunksDialog.value,
          "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => showChunksDialog.value = $event),
          title: `文档分片 - ${currentChunkDocument.value?.name || ""}`,
          width: "900px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[18] || (_cache[18] = ($event) => showChunksDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[54] || (_cache[54] = [
                createTextVNode("关闭", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            withDirectives((openBlock(), createElementBlock("div", _hoisted_48, [
              paginatedChunks.value.length === 0 && !chunksLoading.value ? (openBlock(), createElementBlock("div", _hoisted_49, [
                createVNode(_component_el_icon, { size: 48 }, {
                  default: withCtx(() => [
                    createVNode(unref(document_default))
                  ]),
                  _: 1
                }),
                _cache[52] || (_cache[52] = createBaseVNode("span", null, "暂无分片数据", -1))
              ])) : (openBlock(), createElementBlock("div", _hoisted_50, [
                createBaseVNode("div", _hoisted_51, [
                  createBaseVNode("span", null, "共 " + toDisplayString(chunksTotal.value) + " 个切片", 1)
                ]),
                createVNode(_component_el_table, {
                  data: paginatedChunks.value,
                  style: { "width": "100%" },
                  onRowClick: handleRowClick
                }, {
                  default: withCtx(() => [
                    createVNode(_component_el_table_column, {
                      prop: "chunkIndex",
                      label: "序号",
                      width: "80"
                    }, {
                      default: withCtx(({ row }) => [
                        createTextVNode(" #" + toDisplayString(row.chunkIndex + 1), 1)
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_table_column, {
                      label: "位置信息",
                      width: "150"
                    }, {
                      default: withCtx(({ row }) => [
                        row.metadata?.page ? (openBlock(), createElementBlock("span", _hoisted_52, "第 " + toDisplayString(row.metadata.page) + " 页", 1)) : row.startOffset && row.endOffset ? (openBlock(), createElementBlock("span", _hoisted_53, toDisplayString(row.startOffset) + " - " + toDisplayString(row.endOffset), 1)) : (openBlock(), createElementBlock("span", _hoisted_54, "-"))
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_table_column, {
                      label: "创建时间",
                      width: "180"
                    }, {
                      default: withCtx(({ row }) => [
                        createTextVNode(toDisplayString(unref(formatDate2)(row.createdAt)), 1)
                      ]),
                      _: 1
                    }),
                    createVNode(_component_el_table_column, {
                      label: "操作",
                      width: "100"
                    }, {
                      default: withCtx(({ row }) => [
                        createVNode(_component_el_button, {
                          text: "",
                          type: "primary",
                          size: "small",
                          onClick: withModifiers(($event) => viewChunkContent(row), ["stop"])
                        }, {
                          default: withCtx(() => [..._cache[53] || (_cache[53] = [
                            createTextVNode(" 查看内容 ", -1)
                          ])]),
                          _: 1
                        }, 8, ["onClick"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                chunksTotal.value > chunksPageSize ? (openBlock(), createElementBlock("div", _hoisted_55, [
                  createVNode(_component_el_pagination, {
                    "current-page": chunksCurrentPage.value,
                    "onUpdate:currentPage": _cache[17] || (_cache[17] = ($event) => chunksCurrentPage.value = $event),
                    "page-size": chunksPageSize,
                    total: chunksTotal.value,
                    layout: "prev, pager, next",
                    onCurrentChange: handleChunksPageChange
                  }, null, 8, ["current-page", "total"])
                ])) : createCommentVNode("", true)
              ]))
            ])), [
              [_directive_loading, chunksLoading.value]
            ])
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showChunkContentDialog.value,
          "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => showChunkContentDialog.value = $event),
          title: `切片内容 #${currentViewingChunk.value?.chunkIndex !== void 0 ? currentViewingChunk.value.chunkIndex + 1 : ""}`,
          width: "700px",
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[20] || (_cache[20] = ($event) => showChunkContentDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[56] || (_cache[56] = [
                createTextVNode("关闭", -1)
              ])]),
              _: 1
            })
          ]),
          default: withCtx(() => [
            withDirectives((openBlock(), createElementBlock("div", _hoisted_56, [
              chunkContent.value ? (openBlock(), createElementBlock("div", _hoisted_57, toDisplayString(chunkContent.value), 1)) : !chunkContentLoading.value ? (openBlock(), createElementBlock("div", _hoisted_58, [..._cache[55] || (_cache[55] = [
                createBaseVNode("span", null, "无法加载切片内容", -1)
              ])])) : createCommentVNode("", true)
            ])), [
              [_directive_loading, chunkContentLoading.value]
            ])
          ]),
          _: 1
        }, 8, ["modelValue", "title"]),
        createVNode(_component_el_dialog, {
          modelValue: showAddWebpageDialog.value,
          "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => showAddWebpageDialog.value = $event),
          title: "添加网页",
          width: "500px",
          "close-on-click-modal": false,
          "destroy-on-close": ""
        }, {
          footer: withCtx(() => [
            createVNode(_component_el_button, {
              onClick: _cache[23] || (_cache[23] = ($event) => showAddWebpageDialog.value = false)
            }, {
              default: withCtx(() => [..._cache[58] || (_cache[58] = [
                createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            createVNode(_component_el_button, {
              type: "primary",
              loading: addingWebpage.value,
              onClick: handleAddWebpage
            }, {
              default: withCtx(() => [..._cache[59] || (_cache[59] = [
                createTextVNode(" 添加 ", -1)
              ])]),
              _: 1
            }, 8, ["loading"])
          ]),
          default: withCtx(() => [
            createVNode(_component_el_form, { "label-width": "80px" }, {
              default: withCtx(() => [
                createVNode(_component_el_form_item, { label: "网页地址" }, {
                  default: withCtx(() => [
                    createVNode(_component_el_input, {
                      modelValue: webpageUrl.value,
                      "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => webpageUrl.value = $event),
                      placeholder: "请输入网页 URL，如 https://example.com/article",
                      clearable: "",
                      onKeyup: withKeys(handleAddWebpage, ["enter"])
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                createVNode(_component_el_form_item, null, {
                  default: withCtx(() => [..._cache[57] || (_cache[57] = [
                    createBaseVNode("div", { class: "webpage-tips" }, [
                      createBaseVNode("p", null, "支持 HTTP/HTTPS 协议的网页链接"),
                      createBaseVNode("p", null, "系统将自动提取网页正文内容并添加到知识库")
                    ], -1)
                  ])]),
                  _: 1
                })
              ]),
              _: 1
            })
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const KnowledgeBase = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-fc84cd4c"]]);
export {
  KnowledgeBase as default
};
