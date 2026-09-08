<template>
  <div class="asset-center">
    <!-- 顶部：标题 + 分类管理 + 导入 + 搜索 -->
    <div class="toolbar">
      <div>
        <div class="page-title">资产管理</div>
        <div class="page-desc">工作流「保存资产」节点的成果统一沉淀在这里——按业务分类查看、预览、复用、删除；「模板」类资产供工作流报告渲染引用。分类可自定义（每类业务一个分类），预览方式由分类定义驱动</div>
      </div>
      <div class="toolbar-right">
        <el-button v-if="activeCategory === 'template'" type="primary" plain @click="openTemplateEditor()">✏️ 新建模板</el-button>
        <el-button v-if="activeCategory === 'template'" @click="handleUploadTemplate">📄 上传模板</el-button>
        <el-button @click="openCategoryManager">🗂️ 分类管理</el-button>
        <el-button type="primary" @click="handleImport">📥 导入文件</el-button>
        <el-input v-model="keyword" placeholder="搜索名称 / 描述 / 标签" clearable class="search" :prefix-icon="Search" @keyup.enter="handleSearch" @clear="handleSearch" />
      </div>
    </div>

    <!-- 分类筛选（带计数） -->
    <div class="cat-bar">
      <div
        v-for="cat in categoryTabs"
        :key="cat.value"
        class="cat-tab"
        :class="{ active: activeCategory === cat.value }"
        @click="switchCategory(cat.value)"
      >
        {{ cat.label }}<span class="cat-count">{{ cat.count }}</span>
      </div>
    </div>

    <!-- 二级业务分类（选择大类后展示；由分类定义 + 资产聚合驱动，未定义的标「未定义」） -->
    <div v-if="activeCategory && subCategoryTabs.length > 1" class="sub-cat-bar">
      <div
        v-for="sub in subCategoryTabs"
        :key="sub.value"
        class="sub-cat-tab"
        :class="{ active: activeSubCategory === sub.value, undefined: !sub.defined }"
        :title="sub.defined ? '' : '该子分类尚无定义（可在「分类管理」中定义预览行为）'"
        @click="switchSubCategory(sub.value)"
      >
        {{ sub.label }}<span v-if="sub.count != null" class="cat-count">{{ sub.count }}</span>
      </div>
    </div>

    <!-- 资产网格 -->
    <div class="grid-wrap" v-loading="loading">
      <div v-if="displayItems.length" class="asset-grid">
        <div v-for="item in displayItems" :key="item.key" class="asset-card">
          <!-- 组卡片：封面 + 组名 + 成员数，点击展开画廊 -->
          <template v-if="item.type === 'group'">
            <div class="preview group-preview" @click="openGroupGallery(item.groupId!)">
              <img v-if="item.coverUrl" :src="item.coverUrl" loading="lazy" alt="" />
              <div v-else class="group-placeholder"><span class="report-icon">🖼️</span></div>
              <div class="group-badge">{{ item.memberCount }} 张</div>
              <!-- 成员缩略图叠放（除封面外的成员，体现套图感） -->
              <div v-if="item.thumbUrls?.length" class="group-thumbs">
                <img v-for="(t, i) in item.thumbUrls" :key="i" :src="t" loading="lazy" alt="" />
              </div>
            </div>
            <div class="card-body">
              <div class="name-row">
                <span class="asset-name" :title="item.name">{{ item.name }}</span>
                <el-tag size="small" type="primary" effect="plain">组</el-tag>
              </div>
              <div class="meta">{{ formatDate(item.createdAt) }}</div>
              <div v-if="item.subCategory" class="meta sub-meta">📁 {{ item.subCategory }}</div>
              <div v-if="item.sourceLabel" class="meta source-meta" @click.stop="goSource(item.cover!)">🔗 {{ item.sourceLabel }}</div>
            </div>
            <div class="card-actions">
              <el-button size="small" type="primary" plain @click="openGroupGallery(item.groupId!)">查看套图</el-button>
              <div class="icon-actions">
                <el-tooltip content="打开所在目录" placement="top">
                  <el-button text size="small" @click="openGroupFolder(item.groupId!)"><el-icon><FolderOpened /></el-icon></el-button>
                </el-tooltip>
                <el-tooltip content="删除组" placement="top">
                  <el-button text type="danger" size="small" @click="handleDeleteGroup(item.groupId!)"><el-icon><Delete /></el-icon></el-button>
                </el-tooltip>
              </div>
            </div>
          </template>

          <!-- 普通资产卡片 -->
          <template v-else>
          <!-- 预览区 -->
          <div class="preview" @click="openPreview(item.asset)">
            <!-- 分类驱动：report 模式 → 渲染长图缩略图（异步） -->
            <img v-if="previewModeOf(item.asset) === 'report' && previewImageUrl(item.asset.id)" :src="previewImageUrl(item.asset.id)!" loading="lazy" alt="" />
            <div v-else-if="previewModeOf(item.asset) === 'report'" class="report-placeholder">
              <span class="report-icon">📋</span>
              <span class="report-hint">{{ previewCache[item.asset.id]?.mode === 'html' ? '渲染 HTML 预览' : '报告 · 点击预览渲染效果' }}</span>
            </div>
            <img v-else-if="item.asset.category === 'image' && previewUrl(item.asset)" :src="previewUrl(item.asset)" loading="lazy" alt="" />
            <audio v-else-if="item.asset.category === 'audio' && previewUrl(item.asset)" :src="previewUrl(item.asset)" controls preload="none" @click.stop />
            <video v-else-if="item.asset.category === 'video' && previewUrl(item.asset)" :src="previewUrl(item.asset)" controls preload="none" @click.stop />
            <div v-else-if="item.asset.category === 'template'" class="text-preview" v-html="renderMdPreview(item.asset.textContent ?? '')"></div>
            <div v-else-if="item.asset.category === 'text'" class="text-preview" v-html="renderMdPreview(item.asset.textContent ?? '')"></div>
            <div v-else-if="item.asset.category === 'json'" class="text-preview json">{{ item.asset.jsonContent ?? '' }}</div>
            <div v-else-if="item.asset.kind === 'url' && item.asset.url" class="url-preview">
              <span class="url-icon">🔗</span>
              <span class="url-text">{{ item.asset.url }}</span>
            </div>
            <div v-else class="doc-preview">
              <span class="doc-icon">{{ docIcon(item.asset) }}</span>
            </div>
          </div>

          <!-- 信息区 -->
          <div class="card-body">
            <div class="name-row">
              <span class="asset-name" :title="item.asset.name">{{ item.asset.name }}</span>
              <el-tag v-if="item.asset.isBuiltin" size="small" type="warning" effect="plain">内置</el-tag>
              <el-tag size="small" type="info">{{ categoryLabel(item.asset.category) }}</el-tag>
            </div>
            <div class="meta">{{ formatSize(item.asset.sizeBytes) }} · {{ formatDate(item.asset.createdAt) }}</div>
            <div v-if="item.asset.subCategory" class="meta sub-meta">📁 {{ item.asset.subCategory }}<el-tag v-if="previewModeOf(item.asset) !== 'auto'" size="small" type="success" effect="plain" class="mode-tag">{{ previewModeLabelOf(item.asset) }}</el-tag></div>
            <div v-if="item.asset.tags.length" class="tags">
              <span v-for="t in item.asset.tags" :key="t" class="tag">#{{ t }}</span>
            </div>
            <div v-if="item.sourceLabel" class="meta source-meta" @click.stop="goSource(item.asset)">🔗 {{ item.sourceLabel }}</div>
            <div v-if="item.asset.description" class="desc" :title="item.asset.description">{{ item.asset.description }}</div>
          </div>

          <!-- 操作区 -->
          <div class="card-actions">
            <el-button size="small" type="primary" plain :disabled="!canPreview(item.asset)" @click="openPreview(item.asset)">预览</el-button>
            <div class="icon-actions">
              <el-tooltip content="下载" placement="top">
                <el-button text size="small" @click="handleDownload(item.asset)"><el-icon><Download /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip v-if="item.asset.category === 'template'" content="编辑模板" placement="top">
                <el-button text size="small" @click="openTemplateEditor(item.asset)"><el-icon><EditPen /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip v-if="item.asset.kind === 'file'" content="打开所在目录" placement="top">
                <el-button text size="small" @click="openFolder(item.asset)"><el-icon><FolderOpened /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip :content="copyActionLabel(item.asset)" placement="top">
                <el-button text size="small" :disabled="!copyable(item.asset)" @click="copyAction(item.asset)"><el-icon><CopyDocument /></el-icon></el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button text type="danger" size="small" :disabled="item.asset.isBuiltin" @click="handleDelete(item.asset)"><el-icon><Delete /></el-icon></el-button>
              </el-tooltip>
            </div>
          </div>
          </template>
        </div>
      </div>
      <div v-else-if="!loading" class="empty">
        <p>暂无资产</p>
        <p class="hint">在工作流里加一个「保存资产」节点，生成的结果会自动出现在这里；也可点右上角「导入文件」</p>
      </div>
    </div>

    <!-- 套图画廊（组资产展开） -->
    <el-dialog v-model="groupDialogVisible" :title="groupDialogName" width="880px" append-to-body>
      <div class="group-gallery" v-loading="groupLoading">
        <template v-if="groupDetail">
          <div v-if="groupImageItems.length" class="ecom-viewer">
            <div class="ecom-main">
              <el-image
                :src="currentGroupUrl"
                :zoom-rate="1.25"
                :min-scale="0.2"
                :max-scale="4"
                fit="contain"
                class="ecom-main-img"
                :preview-src-list="groupImageList"
                :initial-index="groupActive"
                preview-teleported
                hide-on-click-modal
              />
              <div class="ecom-bar">
                <span class="ecom-count">{{ groupActive + 1 }} / {{ groupImageItems.length }}</span>
                <el-button class="ecom-dl" text circle size="small" :disabled="!currentGroupUrl" @click="groupImageItems[groupActive] && handleDownload(groupImageItems[groupActive])" title="下载">
                  <el-icon><Download /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="ecom-thumbs">
              <div
                v-for="(m, i) in groupImageItems"
                :key="m.id"
                class="ecom-thumb"
                :class="{ active: i === groupActive }"
                :title="m.name"
                @click="groupActive = i"
              >
                <img :src="previewUrl(m)" loading="lazy" alt="" />
                <span v-if="m.groupRole === 'cover'" class="ecom-thumb-badge">封面</span>
              </div>
            </div>
          </div>
          <div v-else class="empty"><p>组内暂无图片</p></div>
        </template>
        <div v-else-if="!groupLoading" class="empty"><p>组内暂无资产</p></div>
      </div>
    </el-dialog>

    <!-- 分页固定底部 -->
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[15, 30, 60]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="handlePageChange"
        @size-change="handlePageChange"
      />
    </div>

    <!-- 大图预览（分类驱动：report/markdown/html 显示渲染结果，其余按存储形态） -->
    <el-dialog v-model="previewVisible" :title="previewAsset?.name ?? '预览'" width="820px" append-to-body>
      <div class="preview-toolbar">
        <div class="pt-left">
          <el-radio-group v-if="hasSourceView(previewAsset)" v-model="previewMode" size="small">
            <el-radio-button value="preview">预览</el-radio-button>
            <el-radio-button value="source">源码</el-radio-button>
          </el-radio-group>
          <!-- 图片预览缩放（参考人像设计预览） -->
          <div v-else-if="previewImgList.length" class="zoom-ctrl">
            <el-button size="small" :icon="ZoomOut" :disabled="previewZoom <= MIN_ZOOM" title="缩小" @click="zoomOut" />
            <el-button size="small" text @click="zoomReset" title="还原比例">{{ Math.round(previewZoom * 100) }}%</el-button>
            <el-button size="small" :icon="ZoomIn" :disabled="previewZoom >= MAX_ZOOM" title="放大" @click="zoomIn" />
          </div>
        </div>
        <div class="pt-actions">
          <!-- 网页收藏专属操作：打开原文 / 复制 Markdown / 按需入知识库 -->
          <el-button v-if="originalUrlOf(previewAsset)" size="small" @click="openOriginalUrl">
            <el-icon><Link /></el-icon> 打开原文
          </el-button>
          <el-button
            v-if="isWebpageCollect(previewAsset) && previewAsset?.textContent"
            size="small"
            @click="copyWebpageMarkdown"
          >
            复制 Markdown
          </el-button>
          <el-button
            v-if="isWebpageCollect(previewAsset)"
            size="small"
            type="primary"
            plain
            @click="openKbImport"
          >
            入知识库
          </el-button>
          <el-button size="small" :disabled="!previewAsset" @click="handleDownload(previewAsset!, hasSourceView(previewAsset) ? previewMode : undefined)">
            <el-icon><Download /></el-icon> 下载
          </el-button>
        </div>
      </div>
      <div class="big-preview" v-loading="previewRendering">
        <!-- 源码模式：显示原文（report 长图/HTML 渲染类 或 markdown 文档的 textContent） -->
        <div v-if="previewMode === 'source' && hasSourceView(previewAsset)" class="big-md-preview" v-html="escapeHtmlMd(previewAsset!.textContent ?? '')"></div>
        <!-- 图片（原生 image / report 渲染长图）：浅灰画布 + 弹窗内缩放 + 点击进全屏查看器 -->
        <div v-else-if="previewImgList.length" class="big-img-wrap">
          <el-image
            :src="previewImgList[0]"
            fit="contain"
            class="big-img"
            :style="{ transform: `scale(${previewZoom})` }"
            :preview-src-list="previewImgList"
            preview-teleported
          />
        </div>
        <audio v-else-if="previewAsset && previewModeOf(previewAsset) === 'auto' && previewAsset.category === 'audio'" :src="previewUrl(previewAsset)" controls autoplay />
        <video v-else-if="previewAsset && previewModeOf(previewAsset) === 'auto' && previewAsset.category === 'video'" :src="previewUrl(previewAsset)" controls autoplay style="width:100%" />
        <iframe v-else-if="previewCache[previewAsset?.id ?? '']?.mode === 'html'" class="big-iframe" :srcdoc="previewCache[previewAsset!.id]!.html" sandbox="allow-same-origin"></iframe>
        <!-- 文本/模板文档（预览模式）：渲染 markdown -->
        <div v-else-if="isMarkdownAsset(previewAsset)" class="big-md-preview" v-html="renderMdPreview(previewAsset!.textContent ?? '')"></div>
        <pre v-else-if="previewAsset?.category === 'json'" class="big-text">{{ previewAsset?.jsonContent }}</pre>
        <div v-else-if="previewAsset?.url" class="big-url">
          <a :href="previewAsset.url" target="_blank" rel="noopener">{{ previewAsset.url }}</a>
        </div>
        <div v-else class="big-hint">该资产无可预览内容</div>
      </div>
      <!-- 元信息条（参考人像设计 preview-info） -->
      <div v-if="previewAsset" class="preview-meta">
        <div class="meta-row"><span class="k">类型</span><span class="v">{{ categoryLabel(previewAsset.category) }} · {{ KIND_LABELS[previewAsset.kind] ?? previewAsset.kind }}</span></div>
        <div class="meta-row"><span class="k">大小</span><span class="v">{{ formatSize(previewAsset.sizeBytes) }}</span></div>
        <div class="meta-row"><span class="k">创建</span><span class="v">{{ formatDate(previewAsset.createdAt) }}</span></div>
        <div class="meta-row" v-if="previewAsset.subCategory"><span class="k">分类</span><span class="v">{{ previewAsset.subCategory }}</span></div>
        <div class="meta-row" v-if="originalUrlOf(previewAsset)"><span class="k">原文</span><span class="v">{{ originalUrlOf(previewAsset) }}</span></div>
      </div>
    </el-dialog>

    <!-- 网页收藏 → 知识库：选目标 KB，用已存 markdown 正文直入（免二次抓取；重复导入按资产 id 覆盖） -->
    <el-dialog v-model="kbImportVisible" title="收藏入知识库" width="480px" append-to-body>
      <p class="kb-import-hint">
        「{{ kbImportTarget?.name }}」将以 markdown 正文加入所选知识库（向量化按需发生）；已入过库可重复导入（覆盖更新）。
      </p>
      <div v-loading="kbImportLoading" class="kb-import-list">
        <el-radio-group v-model="kbImportSelected" class="kb-import-radios">
          <el-radio v-for="kb in kbImportList" :key="kb.id" :value="kb.id">{{ kb.name }}</el-radio>
        </el-radio-group>
        <div v-if="kbImportList.length === 0 && !kbImportLoading" class="kb-import-empty">暂无知识库，请先在「知识库」页创建</div>
      </div>
      <template #footer>
        <el-button @click="kbImportVisible = false">取消</el-button>
        <el-button type="primary" :loading="kbImporting" :disabled="!kbImportSelected" @click="confirmKbImport">
          加入知识库
        </el-button>
      </template>
    </el-dialog>

    <!-- 模板编辑弹窗（新建/编辑：名称 + 子分类 + markdown 内容 + 实时预览） -->
    <el-dialog v-model="templateEditorVisible" :title="templateEditing?.id ? '编辑模板' : '新建模板'" width="760px" append-to-body>
      <div class="tpl-editor">
        <div class="tpl-fields">
          <el-input v-model="templateDraft.name" placeholder="模板名称" style="width: 300px" />
          <el-input v-model="templateDraft.subCategory" placeholder="子分类（如 报告模板/海报模板）" style="width: 240px" />
        </div>
        <div class="tpl-body">
          <div class="tpl-pane">
            <div class="tpl-pane-title">Markdown 内容（支持 <span v-pre>{{占位}}</span> 变量）</div>
            <el-input v-model="templateDraft.content" type="textarea" :rows="14" placeholder="# 报告标题\n\n{{llm1.content}}" />
          </div>
          <div class="tpl-pane">
            <div class="tpl-pane-title">预览</div>
            <div class="tpl-render" v-html="renderedTemplate"></div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="templateEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存模板</el-button>
      </template>
    </el-dialog>

    <!-- 分类管理弹窗（业务分类实体：每类业务一个分类，定义预览行为） -->
    <el-dialog v-model="categoryManagerVisible" title="🗂️ 资产分类管理" width="860px" append-to-body>
      <div class="cat-mgr">
        <div class="cat-mgr-desc">每增加一类业务就增加一个分类（如「每日早报」「行业周报」）；预览方式由分类定义驱动——报告类资产预览渲染后的长图效果而非原始 markdown。</div>
        <el-table :data="allCategories" size="small" max-height="360" border>
          <el-table-column prop="name" label="分类名" width="130" />
          <el-table-column prop="code" label="编码" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.code ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="允许形态" width="110">
            <template #default="{ row }">
              <el-tag v-if="!row.allowedKinds.length" size="small" type="info" effect="plain">不限</el-tag>
              <el-tag v-for="k in row.allowedKinds" :key="k" size="small" class="kind-tag">{{ KIND_LABELS[k] ?? k }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="可预览" width="80">
            <template #default="{ row }">
              <el-tag :type="row.previewable ? 'success' : 'info'" size="small" effect="plain">{{ row.previewable ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="预览模式" width="150">
            <template #default="{ row }">
              <el-tag size="small" type="warning" effect="plain">{{ PREVIEW_MODE_LABELS[row.previewMode as AssetPreviewMode] ?? row.previewMode }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="渲染模板" width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ templateNameOf(row.previewTemplateId) }}</template>
          </el-table-column>
          <el-table-column label="资产数" width="70" align="right">
            <template #default="{ row }">{{ row.count ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" :disabled="row.isBuiltin" @click="openCategoryEditor(row)">编辑</el-button>
              <el-button size="small" text type="danger" :disabled="row.isBuiltin" @click="handleDeleteCategory(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="cat-mgr-footer">
          <el-button type="primary" plain @click="openCategoryEditor()">＋ 新建分类</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 分类编辑弹窗 -->
    <el-dialog v-model="categoryEditorVisible" :title="categoryEditing?.id ? '编辑分类' : '新建分类'" width="480px" append-to-body>
      <div class="cat-form">
        <el-form label-width="96px" label-position="left">
          <el-form-item label="分类名" required>
            <el-input v-model="categoryDraft.name" placeholder="如：每日早报 / 行业周报 / 海报" />
          </el-form-item>
          <el-form-item label="业务编码">
            <el-input v-model="categoryDraft.code" placeholder="可选，如 morning_report" />
          </el-form-item>
          <el-form-item label="预览模式">
            <el-select v-model="categoryDraft.previewMode" style="width: 100%">
              <el-option v-for="(label, value) in PREVIEW_MODE_LABELS" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="categoryDraft.previewMode === 'report'" label="渲染模板" required>
            <el-select v-model="categoryDraft.previewTemplateId" style="width: 100%" placeholder="选择报告排版模板">
              <el-option v-for="t in previewTemplateOptions" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="允许形态">
            <el-select v-model="categoryDraft.allowedKinds" multiple clearable style="width: 100%" placeholder="留空 = 不限">
              <el-option v-for="(label, value) in KIND_LABELS" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item label="可预览">
            <el-switch v-model="categoryDraft.previewable" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="categoryEditorVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCategory">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 资产中心页（/assets）
 * 通用资产库的统一视图：大类筛选（带计数）+ 二级业务分类（分类定义驱动，带计数）
 * + 内嵌预览 / 搜索 / 打开目录 / 复制链接 / 删除 / 导入 + 分类管理
 *
 * 分类驱动预览：资产按 subCategory 命中分类定义后，按 previewMode 呈现——
 * report → 渲染长图（桌面端 PNG / Web 端 HTML）；markdown/html → 渲染排版 HTML；
 * auto/其他 → 按存储形态原生呈现。
 */
import { ref, onMounted, computed, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, EditPen, FolderOpened, CopyDocument, Delete, Download, ZoomIn, ZoomOut, Link } from '@element-plus/icons-vue'
import { toFileUrl, toImageUrl, toVideoUrl, isElectronRenderer } from '@/utils/asset-url'
import { saveBlobAs } from '@/utils/file-saver'
import { buildWebAssetDownload } from '@/utils/asset-download'
import { sanitizeHtml } from '@/utils/sanitize-html'
import {
  ASSET_CATEGORY_LABELS, ASSET_PREVIEW_MODES, ASSET_PREVIEW_MODE_LABELS,
  type AssetCategory, type AssetCategoryDef, type AssetPreviewMode, type AssetPreviewResult, type AssetPreviewTemplateOption, type AssetRecord,
} from '@shared/types/asset.types'
import { electronApi } from '@/types/electron-api'
import { marked } from 'marked'
import { buildCategoryTabs, type AssetStats } from './category-tabs'

const api = electronApi()

const items = ref<AssetRecord[]>([])
const loading = ref(false)
const activeCategory = ref<AssetCategory | ''>('')
const activeSubCategory = ref<string>('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(15)
const total = ref(0)
/** 资产中心统计（total + 各大类计数；「全部」标签取 total） */
const stats = ref<AssetStats>({ total: 0, byCategory: {} })
const subStats = ref<Array<{ subCategory: string | null; count: number }>>([])

/** 来源跳转缓存：assetId → 来源链接（需求 3） */
const sourceLinks = reactive<Record<string, { type: string; label: string; appId?: string; sessionId?: string; runId?: string } | null>>({})
/** 组画廊状态（需求 2） */
const groupDialogVisible = ref(false)
const groupDialogName = ref('')
const groupDetail = ref<{ group: any; members: AssetRecord[] } | null>(null)
const groupLoading = ref(false)

/** 电商式浏览：当前缩略图索引 + 图片图集（过滤 image 成员，供主图/缩略图切换） */
const groupActive = ref(0)
const groupImageItems = computed<AssetRecord[]>(() =>
  (groupDetail.value?.members ?? []).filter(m => m.category === 'image' && previewUrl(m))
)
const currentGroupUrl = computed<string>(() => {
  const it = groupImageItems.value[groupActive.value]
  return it ? previewUrl(it) : ''
})
const groupImageList = computed<string[]>(() =>
  groupImageItems.value.map(m => previewUrl(m)).filter((u): u is string => !!u)
)

/** 组内成员（按 groupId 聚合，用于组卡片） */
interface DisplayItem {
  key: string
  type: 'asset' | 'group'
  asset?: AssetRecord
  groupId?: string
  name?: string
  cover?: AssetRecord
  coverUrl?: string
  /** 组卡片封面区右下角叠放的成员缩略图（除封面外最多 2 张，体现套图感） */
  thumbUrls?: string[]
  memberCount?: number
  subCategory?: string
  createdAt?: string
  sourceLabel?: string
}

/** 列表项：同组资产聚合成一个组卡片（封面=cover 成员），其余单个展示 */
const displayItems = computed<DisplayItem[]>(() => {
  const groups = new Map<string, AssetRecord[]>()
  const singles: AssetRecord[] = []
  for (const a of items.value) {
    if (a.groupId) {
      const list = groups.get(a.groupId) ?? []
      list.push(a)
      groups.set(a.groupId, list)
    } else {
      singles.push(a)
    }
  }
  const out: DisplayItem[] = []
  for (const [gid, members] of groups) {
    const cover = members.find(m => m.groupRole === 'cover') ?? members[0]
    const sorted = [...members].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    // 组名：优先组真实名称（后端 list 填充），缺省回退「成员名 等」
    const groupName = members.find(m => m.groupName)?.groupName
    // 封面区右下角叠放：除封面外最多 2 张图成员缩略图
    const thumbs = members
      .filter(m => m.id !== cover?.id && m.category === 'image' && previewUrl(m))
      .slice(0, 2)
      .map(m => previewUrl(m))
    out.push({
      key: `group:${gid}`,
      type: 'group',
      groupId: gid,
      name: groupName || (members[0].name ? `${members[0].name} 等` : '套图'),
      cover,
      coverUrl: cover && cover.category === 'image' ? previewUrl(cover) : '',
      thumbUrls: thumbs,
      memberCount: members.length,
      subCategory: members[0].subCategory ?? undefined,
      createdAt: sorted[0]?.createdAt,
      sourceLabel: sourceLinks[cover?.id ?? '']?.label,
    })
  }
  for (const a of singles) {
    out.push({ key: `asset:${a.id}`, type: 'asset', asset: a, sourceLabel: sourceLinks[a.id]?.label })
  }
  // 保持与后端一致的顺序：新→旧（同组内取最新时间）
  return out.sort((a, b) => {
    const ta = a.type === 'group' ? a.createdAt : a.asset?.createdAt
    const tb = b.type === 'group' ? b.createdAt : b.asset?.createdAt
    return (tb ?? '') < (ta ?? '') ? -1 : 1
  })
})

/** 当前大类下的已定义分类（带资产计数；listCategories 返回） */
const definedCategories = ref<AssetCategoryDef[]>([])
/** 全量分类定义（分类管理弹窗 + 预览模式查询共用） */
const allCategories = ref<AssetCategoryDef[]>([])
/** 分类名 → 定义（预览模式查询缓存） */
const categoryMap = computed(() => new Map(allCategories.value.map(c => [c.name, c])))
/** 分类渲染预览结果缓存：assetId → 渲染结果 */
const previewCache = reactive<Record<string, AssetPreviewResult>>({})
/** 大图预览渲染中标记 */
const previewRendering = ref(false)

/** 渲染结果为图片时取 data URL（TS 窄化辅助） */
function previewImageUrl(assetId: string): string | null {
  const r = previewCache[assetId]
  return r?.mode === 'image' ? r.url : null
}

/** 大预览模式：preview=渲染 markdown | source=原始源码（text/template 文档资产） */
const previewMode = ref<'preview' | 'source'>('preview')

/** 是否为 markdown 文档资产（text/template 类，内容像文档而非纯数据） */
function isMarkdownAsset(asset: AssetRecord | null | undefined): boolean {
  if (!asset) return false
  if (asset.category !== 'text' && asset.category !== 'template') return false
  if (!asset.textContent) return false
  // 有 markdown 特征（标题/列表/引用/表格/代码块）或较长文本 → 渲染
  return /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\||```)/m.test(asset.textContent) || asset.textContent.length > 80
}

/**
 * 是否有可切换的「源码」（显示原文 textContent）：
 * report/markdown/html 渲染类（长图/HTML 预览 + 可切原文），或一般 markdown 文档。
 * 修复：report 报告资产预览出长图时，「源码」切换被图片分支短路，原文无法查看。
 */
function hasSourceView(asset: AssetRecord | null | undefined): boolean {
  if (!asset) return false
  if (asset.category !== 'text' && asset.category !== 'template') return false
  if (!asset.textContent) return false
  const mode = previewModeOf(asset)
  return mode === ASSET_PREVIEW_MODES.report
    || mode === ASSET_PREVIEW_MODES.markdown
    || mode === ASSET_PREVIEW_MODES.html
    || isMarkdownAsset(asset)
}

/** markdown 渲染为 HTML（卡片缩略/大预览共用）；marked 透传原始 HTML（可被提示注入污染），
 *  输出经 sanitizeHtml 消毒后再进 v-html（剥脚本/事件属性/javascript: URL） */
function renderMdPreview(md: string): string {
  try {
    return sanitizeHtml(marked.parse(md, { gfm: true, breaks: true }) as string)
  } catch {
    return `<pre>${escapeHtmlMd(md)}</pre>`
  }
}

/** HTML 转义（源码模式展示原始 markdown） */
function escapeHtmlMd(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const KIND_LABELS: Record<string, string> = { file: '文件', url: '链接', text: '文本', json: '数据' }
const PREVIEW_MODE_LABELS = ASSET_PREVIEW_MODE_LABELS

/** 分类标签（全部 + 各大类带计数；统一走 buildCategoryTabs，保证 total 生效） */
const categoryTabs = computed(() => buildCategoryTabs(stats.value, ASSET_CATEGORY_LABELS))

/** 二级业务分类标签：已定义分类（带计数）+ 未定义但有资产的子分类（标未定义） */
const subCategoryTabs = computed<Array<{ value: string; label: string; count: number | null; defined: boolean }>>(() => {
  const definedNames = new Set(definedCategories.value.map(c => c.name))
  const tabs: Array<{ value: string; label: string; count: number | null; defined: boolean }> = []
  for (const c of definedCategories.value) {
    if ((c.count ?? 0) > 0) tabs.push({ value: c.name, label: c.name, count: c.count ?? 0, defined: true })
  }
  for (const s of subStats.value) {
    const key = s.subCategory ?? '未分组'
    if (!definedNames.has(key)) {
      tabs.push({ value: key, label: `${key}（未定义）`, count: s.count, defined: false })
    }
  }
  const totalInCat = tabs.reduce((a, t) => a + (t.count ?? 0), 0)
  return [
    { value: '', label: '全部', count: totalInCat, defined: true },
    ...tabs,
  ]
})

function categoryLabel(c: AssetCategory): string {
  return ASSET_CATEGORY_LABELS[c] ?? c
}

/** 资产命中的分类定义（未命中 → null） */
function categoryDefOf(asset: AssetRecord): AssetCategoryDef | null {
  return asset.subCategory ? categoryMap.value.get(asset.subCategory) ?? null : null
}

/** 资产预览模式（未命中分类定义 → auto 沿用旧逻辑） */
function previewModeOf(asset: AssetRecord): string {
  return categoryDefOf(asset)?.previewMode ?? ASSET_PREVIEW_MODES.auto
}

/** 资产预览模式中文标签（信息区展示） */
function previewModeLabelOf(asset: AssetRecord): string {
  const mode = previewModeOf(asset) as AssetPreviewMode
  return PREVIEW_MODE_LABELS[mode] ?? mode
}

/** 资产是否可预览（分类定义 previewable=false 或 none → 不可） */
function canPreview(asset: AssetRecord): boolean {
  const def = categoryDefOf(asset)
  if (def && (!def.previewable || def.previewMode === ASSET_PREVIEW_MODES.none)) return false
  return !!previewUrl(asset) || ['text', 'template', 'json'].includes(asset.category)
}

/** 资产可预览 URL（文件型经渲染端协议转换；链接型原样） */
function previewUrl(asset: AssetRecord): string {
  if (asset.kind === 'file' && asset.storagePath) {
    if (asset.category === 'image') return toImageUrl(asset.storagePath)
    if (asset.category === 'video') return toVideoUrl(asset.storagePath)
    return toFileUrl(asset.storagePath)
  }
  if (asset.kind === 'url' && asset.url) return asset.url
  return ''
}

function docIcon(asset: AssetRecord): string {
  if (asset.category === 'template') return '📋'
  if (asset.category === 'document') return '📄'
  if (asset.category === 'other') return '📦'
  return '📎'
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const [listResp, statsResp, catsResp] = await Promise.all([
      api.assets.list({ category: activeCategory.value, subCategory: activeSubCategory.value, keyword: keyword.value, page: page.value, pageSize: pageSize.value }),
      api.assets.stats(),
      api.assets.listCategories({ category: activeCategory.value || undefined }),
    ])
    if (listResp.success) {
      items.value = listResp.data?.items ?? []
      total.value = listResp.data?.total ?? 0
    } else ElMessage.error(listResp.error ?? '加载失败')
    // 资产中心统计：保存完整 { total, byCategory }——只存 byCategory 会导致「全部」恒为 0
    if (statsResp.success) stats.value = statsResp.data ?? { total: 0, byCategory: {} }
    // 二级业务分类：当前大类下的已定义分类（带计数）+ 资产聚合补差
    if (catsResp.success) definedCategories.value = catsResp.data ?? []
    else definedCategories.value = []
    if (activeCategory.value) {
      const subResp = await api.assets.subCategoryStats(activeCategory.value)
      if (subResp.success) subStats.value = subResp.data ?? []
    } else {
      subStats.value = []
    }
    // 全量分类定义（预览模式查询 + 分类管理共用）
    const allResp = await api.assets.listCategories()
    if (allResp.success) allCategories.value = allResp.data ?? []
  } finally {
    loading.value = false
  }
  // 当前页 report 类资产：后台预渲染缩略图（渲染器全局串行，不阻塞列表）
  void warmPreviewThumbs()
  // 来源跳转信息（需求 3）
  void loadSourceLinks()
}

/** 当前页 report 类资产后台预渲染（串行渲染队列由主进程保证，前端并行发起） */
async function warmPreviewThumbs(): Promise<void> {
  const targets = items.value.filter(a => previewModeOf(a) === ASSET_PREVIEW_MODES.report && !previewCache[a.id])
  await Promise.all(targets.map(a => renderPreviewFor(a)))
}

/** 渲染分类预览（report/markdown/html 模式；结果缓存） */
async function renderPreviewFor(asset: AssetRecord): Promise<void> {
  if (previewCache[asset.id]) return
  const resp = await api.assets.previewRender(asset.id)
  if (resp.success && resp.data) {
    previewCache[asset.id] = resp.data
  }
}

/** 加载当前页资产的来源跳转信息（需求 3：资产 → 产出它的功能） */
async function loadSourceLinks(): Promise<void> {
  const targets = items.value.filter(a => a.sourceRef && a.sourceRef !== '')
  await Promise.all(targets.map(async (a) => {
    if (sourceLinks[a.id] !== undefined) return
    const resp = await api.assets.sourceLink(a.id)
    if (resp.success && resp.data) sourceLinks[a.id] = resp.data
    else sourceLinks[a.id] = null
  }))
}

/** 组画廊：拉组详情（组 + 成员） */
async function openGroupGallery(groupId: string): Promise<void> {
  groupDialogVisible.value = true
  groupActive.value = 0
  groupLoading.value = true
  groupDetail.value = null
  try {
    const resp = await api.assets.groupDetail(groupId)
    if (resp.success && resp.data) {
      groupDetail.value = resp.data
      groupDialogName.value = resp.data.group.name || '套图'
    } else {
      ElMessage.error(resp.error ?? '加载组失败')
      groupDialogVisible.value = false
    }
  } finally {
    groupLoading.value = false
  }
}

/** 来源跳转：app → 应用会话页；workflow → 运行详情（执行历史） */
async function goSource(asset: AssetRecord): Promise<void> {
  const link = sourceLinks[asset.id]
  if (!link) return
  if (link.type === 'app' && link.appId) {
    if (link.sessionId) {
      window.location.hash = `#/apps/${link.appId}/session/${link.sessionId}`
    } else {
      window.location.hash = `#/apps/${link.appId}`
    }
  } else if (link.type === 'workflow' && link.runId) {
    window.location.hash = `#/workflow/run/${link.runId}`
  }
}

/** 删除组（连带成员资产；内置跳过）。成员取自当前打开的 groupDetail，groupId 仅为语义占位 */
async function handleDeleteGroup(_groupId: string): Promise<void> {
  const detail = groupDetail.value
  const members = detail?.members ?? []
  if (members.some(m => m.isBuiltin)) {
    ElMessage.warning('内置资产不可删除')
    return
  }
  await ElMessageBox.confirm(`删除该组（${members.length} 个资产）？`, '删除套图', { type: 'warning' })
  try {
    for (const m of members) {
      const resp = await api.assets.delete(m.id)
      if (!resp.success) ElMessage.error(resp.error ?? `删除 ${m.name} 失败`)
    }
    groupDialogVisible.value = false
    ElMessage.success('组已删除')
    await load()
  } catch {
    /* 用户取消 */
  }
}

function switchCategory(cat: AssetCategory | ''): void {
  activeCategory.value = cat
  activeSubCategory.value = ''
  page.value = 1
  void load()
}

function switchSubCategory(sub: string): void {
  activeSubCategory.value = sub
  page.value = 1
  void load()
}

function handleSearch(): void {
  page.value = 1
  void load()
}

function handlePageChange(): void {
  void load()
}

/** 导入文件：系统对话框选文件 → 以 file 形态入库 */
async function handleImport(): Promise<void> {
  const pick = await api.file.openDialog({ filters: [{ name: '所有文件', extensions: ['*'] }] })
  if (!pick.success || !pick.files?.length) return
  const filePath = pick.files[0].filePath
  const name = pick.files[0].fileName
  const resp = await api.assets.create({ content: { kind: 'file', path: filePath }, name })
  if (resp.success) {
    ElMessage.success('已导入资产')
    await load()
  } else ElMessage.error(resp.error ?? '导入失败')
}

/** 上传模板：.md/.html/.txt 文件 → 以 text 形态 template 类入库 */
async function handleUploadTemplate(): Promise<void> {
  const pick = await api.file.openDialog({ filters: [{ name: '模板文件', extensions: ['md', 'html', 'txt'] }] })
  if (!pick.success || !pick.files?.length) return
  const filePath = pick.files[0].filePath
  const name = pick.files[0].fileName
  const read = await api.file.readTextFile?.({ path: filePath })
  const content = read?.success ? read.data : ''
  const resp = await api.assets.create({ content: { kind: 'text', text: content || '' }, category: 'template', subCategory: '报告模板', name: name.replace(/\.(md|html|txt)$/i, '') })
  if (resp.success) {
    ElMessage.success('模板已上传')
    await load()
  } else ElMessage.error(resp.error ?? '上传失败')
}

async function openFolder(asset: AssetRecord): Promise<void> {
  const resp = await api.assets.openFolder(asset.id)
  if (!resp.success) ElMessage.error(resp.error ?? '打开目录失败')
}

/** 打开套图/组图所在目录（组内首个文件成员定位） */
async function openGroupFolder(groupId: string): Promise<void> {
  const resp = await api.assets.groupOpenFolder(groupId)
  if (!resp.success) ElMessage.error(resp.error ?? '打开目录失败')
}

async function copyUrl(asset: AssetRecord): Promise<void> {
  const url = previewUrl(asset)
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('链接已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

/** 复制按钮是否可用：文件/链接型复制链接；文本/数据/模板型复制内容 */
function copyable(asset: AssetRecord): boolean {
  if (asset.kind === 'file' || asset.kind === 'url') return !!previewUrl(asset)
  if (asset.kind === 'text') return !!asset.textContent
  if (asset.kind === 'json') return !!asset.jsonContent
  return false
}

/** 复制按钮提示（按类型区分语义） */
function copyActionLabel(asset: AssetRecord): string {
  if (asset.kind === 'file' || asset.kind === 'url') return '复制链接'
  if (asset.kind === 'text' || asset.kind === 'json') return '复制内容'
  return '复制'
}

/** 复制：文件/链接型复制链接；文本/数据/模板型复制内容到剪贴板 */
async function copyAction(asset: AssetRecord): Promise<void> {
  if (asset.kind === 'file' || asset.kind === 'url') {
    return copyUrl(asset)
  }
  const content = asset.kind === 'json' ? (asset.jsonContent ?? '') : (asset.textContent ?? '')
  if (!content) return
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success(asset.kind === 'json' ? '数据已复制' : '内容已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function handleDelete(asset: AssetRecord): Promise<void> {
  if (asset.isBuiltin) {
    ElMessage.warning('内置资产不可删除（可复制为自有后修改）')
    return
  }
  try {
    await ElMessageBox.confirm(`删除资产「${asset.name}」？文件将一并删除，不可恢复。`, '删除资产', { type: 'warning' })
  } catch {
    return // 用户取消
  }
  const resp = await api.assets.delete(asset.id)
  if (resp.success) { ElMessage.success('已删除'); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

/**
 * 下载资产（"看啥下啥"）：
 * - view='preview'：预览态，report/图文类下载渲染长图 PNG（看图片下图片）
 * - view='source'/缺省：按存储形态下载（file 复制源文件，text/json/url 生成 .md/.json/.url）
 * - 桌面端：主进程弹保存对话框 + 复制文件 / 写文本 / 写渲染图
 * - Web 端：浏览器下载（file 型 fetch 资产 URL → Blob；text/json/url 组装文本 → Blob）
 */
async function handleDownload(asset: AssetRecord, view?: 'preview' | 'source'): Promise<void> {
  try {
    if (isElectronRenderer()) {
      const resp = await api.assets.download(asset.id, view)
      if (!resp.success) { ElMessage.error(resp.error ?? '下载失败'); return }
      if (resp.data?.canceled) return // 用户取消保存对话框
      ElMessage.success('已下载')
      return
    }
    // Web 端：浏览器下载
    const payload = buildWebAssetDownload(asset, previewUrl(asset), view, view === 'preview' ? previewImageUrl(asset.id) : null)
    if (!payload) { ElMessage.error('该资产暂不支持下载'); return }
    if (payload.fetchUrl) {
      const res = await fetch(payload.fetchUrl)
      if (!res.ok) { ElMessage.error('获取文件失败'); return }
      await saveBlobAs(await res.blob(), { defaultName: payload.fileName, mimeType: payload.mimeType })
    } else {
      await saveBlobAs(payload.content ?? '', { defaultName: payload.fileName, mimeType: payload.mimeType })
    }
    ElMessage.success('已开始下载')
  } catch (e: any) {
    ElMessage.error(e?.message || '下载失败')
  }
}

// ==================== 网页收藏专属操作（预览抽屉） ====================

/** 是否为「网页收藏」资产（document 大类 + 网页收藏 子分类） */
function isWebpageCollect(asset: AssetRecord | null): boolean {
  return !!asset && asset.category === 'document' && asset.subCategory === '网页收藏'
}

/** 收藏资产的原始网页 URL（metadata.sourceUrl） */
function originalUrlOf(asset: AssetRecord | null): string {
  const u = asset?.metadata?.sourceUrl
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : ''
}

/** 打开原文（外部浏览器；与 RunArtifactsPanel 打开 http 链接同一做法） */
function openOriginalUrl(): void {
  const u = originalUrlOf(previewAsset.value)
  if (u) window.open(u, '_blank', 'noopener')
}

/** 复制收藏资产的 markdown 正文 */
async function copyWebpageMarkdown(): Promise<void> {
  const a = previewAsset.value
  const content = a?.textContent
  if (!content) return
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('Markdown 正文已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

// ---- 入知识库：选择目标 KB → knowledgeBase.addDocument（用已存 markdown，免二次抓取） ----
const kbImportVisible = ref(false)
const kbImportLoading = ref(false)
const kbImporting = ref(false)
const kbImportTarget = ref<AssetRecord | null>(null)
const kbImportList = ref<Array<{ id: string; name: string }>>([])
const kbImportSelected = ref('')

async function openKbImport(): Promise<void> {
  const a = previewAsset.value
  if (!a?.textContent) {
    ElMessage.warning('该收藏没有 markdown 正文，无法入知识库')
    return
  }
  kbImportTarget.value = a
  kbImportVisible.value = true
  kbImportLoading.value = true
  kbImportSelected.value = ''
  try {
    const kbApi = (window as never as { electronAPI: any }).electronAPI.knowledgeBase
    const resp = await kbApi.list()
    kbImportList.value = (resp.success ? (resp.data ?? []) : []).map((kb: any) => ({ id: kb.id, name: kb.name }))
    if (!resp.success) ElMessage.error(resp.error ?? '加载知识库列表失败')
  } finally {
    kbImportLoading.value = false
  }
}

async function confirmKbImport(): Promise<void> {
  const a = kbImportTarget.value
  if (!a || !kbImportSelected.value) return
  kbImporting.value = true
  try {
    const kbApi = (window as never as { electronAPI: any }).electronAPI.knowledgeBase
    const resp = await kbApi.addDocument(kbImportSelected.value, {
      name: a.name.replace(/\.html$/i, ''),
      type: 'text',
      content: a.textContent,
      // 以收藏资产 id 为源键：重复导入覆盖更新，不产生重复文档
      source: { type: 'workflow', id: `webpage-collect:${a.id}` },
    })
    if (resp.success) {
      ElMessage.success('已加入知识库，正在后台处理（向量化按需发生）')
      kbImportVisible.value = false
    } else {
      ElMessage.error(resp.error ?? '导入失败')
    }
  } catch (e: any) {
    ElMessage.error(e?.message ?? '导入失败')
  } finally {
    kbImporting.value = false
  }
}

// ---- 模板编辑器（新建/编辑/保存） ----
const templateEditorVisible = ref(false)
const templateEditing = ref<AssetRecord | null>(null)
const templateDraft = ref<{ name: string; subCategory: string; content: string }>({ name: '', subCategory: '报告模板', content: '' })

const renderedTemplate = computed(() => {
  try {
    return sanitizeHtml(marked.parse(templateDraft.value.content || '*(空白模板)*') as string)
  } catch {
    return '<p>模板渲染失败</p>'
  }
})

function openTemplateEditor(asset?: AssetRecord): void {
  if (asset?.isBuiltin) {
    ElMessage.warning('内置模板不可编辑（可复制为自有后修改）')
    return
  }
  templateEditing.value = asset ?? null
  templateDraft.value = asset
    ? { name: asset.name, subCategory: asset.subCategory ?? '', content: asset.textContent ?? '' }
    : { name: '', subCategory: '报告模板', content: '' }
  templateEditorVisible.value = true
}

async function saveTemplate(): Promise<void> {
  const name = templateDraft.value.name.trim()
  if (!name) { ElMessage.warning('请输入模板名称'); return }
  const subCategory = templateDraft.value.subCategory.trim() || null
  if (templateEditing.value?.id) {
    const resp = await api.assets.update({ id: templateEditing.value.id, name, subCategory })
    if (!resp.success) { ElMessage.error(resp.error ?? '保存失败'); return }
    // 内容更新（assets.update 不更新 textContent → 编辑内容时另存为「编辑版」，避免破坏引用）
    if (templateDraft.value.content !== (templateEditing.value.textContent ?? '')) {
      const dup = await api.assets.create({ content: { kind: 'text', text: templateDraft.value.content }, category: 'template', subCategory, name: `${name}（编辑版）` })
      if (!dup.success) { ElMessage.error(dup.error ?? '内容保存失败'); return }
      ElMessage.success('已保存为「编辑版」新模板（原模板内容不变）')
    } else {
      ElMessage.success('模板已更新')
    }
  } else {
    const resp = await api.assets.create({ content: { kind: 'text', text: templateDraft.value.content }, category: 'template', subCategory, name })
    if (!resp.success) { ElMessage.error(resp.error ?? '创建失败'); return }
    ElMessage.success('模板已创建')
  }
  templateEditorVisible.value = false
  await load()
}

// ---- 大图预览（分类驱动渲染） ----
const previewVisible = ref(false)
const previewAsset = ref<AssetRecord | null>(null)

/** 预览弹窗中的图片 URL 列表（原生 image / report 渲染长图；供 el-image 查看器放大缩小） */
const previewImgList = computed<string[]>(() => {
  const a = previewAsset.value
  if (!a) return []
  if (previewUrl(a) && previewModeOf(a) === ASSET_PREVIEW_MODES.auto && a.category === 'image') return [previewUrl(a)]
  const rendered = previewImageUrl(a.id)
  return rendered ? [rendered] : []
})

/** 预览图缩放（弹窗内直接放大/缩小，参考人像设计预览；点击图片仍进全屏查看器） */
const previewZoom = ref(1)
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
function zoomIn(): void {
  previewZoom.value = Math.min(MAX_ZOOM, +(previewZoom.value + 0.25).toFixed(2))
}
function zoomOut(): void {
  previewZoom.value = Math.max(MIN_ZOOM, +(previewZoom.value - 0.25).toFixed(2))
}
function zoomReset(): void {
  previewZoom.value = 1
}
// 切换预览资产时还原缩放
watch(previewAsset, () => { previewZoom.value = 1 })
async function openPreview(asset: AssetRecord): Promise<void> {
  if (!canPreview(asset)) return
  previewAsset.value = asset
  previewVisible.value = true
  previewMode.value = 'preview' // 默认渲染预览（文档资产可切源码）
  // 分类驱动模式（report/markdown/html）→ 渲染后展示；其余按存储形态原生呈现
  const mode = previewModeOf(asset)
  if ((mode === ASSET_PREVIEW_MODES.report || mode === ASSET_PREVIEW_MODES.markdown || mode === ASSET_PREVIEW_MODES.html)
    && !previewCache[asset.id]) {
    previewRendering.value = true
    try {
      await renderPreviewFor(asset)
      if (!previewCache[asset.id]) {
        ElMessage.info('该资产暂无渲染内容，已按原始内容展示')
      }
    } finally {
      previewRendering.value = false
    }
  }
}

// ---- 分类管理（业务分类实体） ----
const categoryManagerVisible = ref(false)
const previewTemplateOptions = ref<AssetPreviewTemplateOption[]>([])

async function openCategoryManager(): Promise<void> {
  categoryManagerVisible.value = true
  const [catsResp, tplResp] = await Promise.all([api.assets.listCategories(), api.assets.previewTemplates()])
  if (catsResp.success) allCategories.value = catsResp.data ?? []
  if (tplResp.success) previewTemplateOptions.value = tplResp.data ?? []
}

function templateNameOf(templateId: string | null | undefined): string {
  if (!templateId) return '—'
  return previewTemplateOptions.value.find(t => t.value === templateId)?.label ?? templateId
}

// ---- 分类编辑 ----
const categoryEditorVisible = ref(false)
const categoryEditing = ref<AssetCategoryDef | null>(null)
const categoryDraft = ref<{
  name: string
  code: string
  previewMode: string
  previewTemplateId: string
  previewable: boolean
  allowedKinds: string[]
}>({ name: '', code: '', previewMode: 'auto', previewTemplateId: '', previewable: true, allowedKinds: [] })

function openCategoryEditor(cat?: AssetCategoryDef): void {
  categoryEditing.value = cat ?? null
  categoryDraft.value = cat
    ? {
        name: cat.name,
        code: cat.code ?? '',
        previewMode: cat.previewMode,
        previewTemplateId: cat.previewTemplateId ?? '',
        previewable: cat.previewable,
        allowedKinds: [...cat.allowedKinds],
      }
    : { name: '', code: '', previewMode: 'auto', previewTemplateId: '', previewable: true, allowedKinds: [] }
  categoryEditorVisible.value = true
}

async function saveCategory(): Promise<void> {
  const name = categoryDraft.value.name.trim()
  if (!name) { ElMessage.warning('请输入分类名'); return }
  const previewMode = categoryDraft.value.previewMode
  if (previewMode === ASSET_PREVIEW_MODES.report && !categoryDraft.value.previewTemplateId) {
    ElMessage.warning('报告预览模式必须选择渲染模板'); return
  }
  const payload = {
    name,
    code: categoryDraft.value.code.trim() || undefined,
    previewMode,
    previewTemplateId: previewMode === ASSET_PREVIEW_MODES.report ? categoryDraft.value.previewTemplateId : null,
    previewable: categoryDraft.value.previewable,
    // 拷贝为普通数组：v-model 值可能是 reactive proxy，Electron IPC 结构化克隆会抛
    // "An object could not be cloned"（静默失败）——展开为原生数组再传
    allowedKinds: [...categoryDraft.value.allowedKinds],
  }
  if (categoryEditing.value?.id) {
    const resp = await api.assets.updateCategory({ id: categoryEditing.value.id, ...payload })
    if (!resp.success) { ElMessage.error(resp.error ?? '保存失败'); return }
    ElMessage.success('分类已更新')
  } else {
    const resp = await api.assets.createCategory(payload)
    if (!resp.success) { ElMessage.error(resp.error ?? '创建失败'); return }
    ElMessage.success('分类已创建')
  }
  categoryEditorVisible.value = false
  await openCategoryManager()
  await load()
}

async function handleDeleteCategory(cat: AssetCategoryDef): Promise<void> {
  if (cat.isBuiltin) {
    ElMessage.warning('内置分类不可删除')
    return
  }
  try {
    await ElMessageBox.confirm(`删除分类「${cat.name}」？仅删除分类定义，分类下的资产保留（子分类文本不变）。`, '删除分类', { type: 'warning' })
  } catch {
    return
  }
  const resp = await api.assets.deleteCategory(cat.id)
  if (resp.success) { ElMessage.success('分类已删除'); await openCategoryManager(); await load() }
  else ElMessage.error(resp.error ?? '删除失败')
}

onMounted(load)
</script>

<style scoped>
.asset-center { padding: 20px 26px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-shrink: 0; gap: 12px; }
.page-title { font-size: 20px; font-weight: 600; }
.page-desc { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; max-width: 640px; }
.toolbar-right { display: flex; gap: 10px; align-items: center; }
.search { width: 220px; }

/* 分类条 */
.cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; flex-shrink: 0; }
.cat-tab { padding: 5px 12px; border-radius: 14px; font-size: 13px; cursor: pointer; color: var(--el-text-color-regular); background: var(--el-fill-color); transition: all .15s; }
.cat-tab:hover { color: var(--el-color-primary); }
.cat-tab.active { background: var(--el-color-primary); color: #fff; }
.cat-count { font-size: 11px; opacity: .75; margin-left: 4px; }

/* 二级业务分类条 */
.sub-cat-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; flex-shrink: 0; padding-left: 4px; }
.sub-cat-tab { padding: 3px 10px; border-radius: 12px; font-size: 12px; cursor: pointer; color: var(--el-text-color-regular); border: 1px dashed var(--el-border-color); transition: all .15s; }
.sub-cat-tab:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.sub-cat-tab.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); border-color: var(--el-color-primary); }
.sub-cat-tab.undefined { opacity: .55; }

/* 模板预览（文本摘录） */
.template-preview { width: 100%; height: 100%; padding: 10px 12px; font-size: 12px; color: var(--el-text-color-regular); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; cursor: zoom-in; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--el-fill-color-lighter); }

.sub-meta { margin-top: 2px; }
.mode-tag { margin-left: 6px; }

/* 报告类占位（渲染长图异步加载前） */
.report-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 100%; width: 100%; color: var(--el-text-color-secondary); cursor: zoom-in; }
/* 组封面缺失占位（无图成员组） */
.group-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; color: var(--el-text-color-secondary); cursor: zoom-in; }
.report-icon { font-size: 34px; opacity: .7; }
.report-hint { font-size: 11px; }

/* 模板编辑器 */
.tpl-editor { display: flex; flex-direction: column; gap: 12px; }
.tpl-fields { display: flex; gap: 10px; }
.tpl-body { display: flex; gap: 12px; }
.tpl-pane { flex: 1; min-width: 0; }
.tpl-pane-title { font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.tpl-render { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; height: 300px; overflow-y: auto; font-size: 13px; background: var(--el-bg-color); }
.tpl-render :deep(h1) { font-size: 18px; } .tpl-render :deep(h2) { font-size: 16px; } .tpl-render :deep(h3) { font-size: 14px; }
.tpl-render :deep(pre) { background: var(--el-fill-color-lighter); padding: 8px; border-radius: 4px; overflow-x: auto; }

/* 资产网格 */
.grid-wrap { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.asset-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; overflow: hidden; background: var(--el-bg-color); display: flex; flex-direction: column; transition: border-color .15s, box-shadow .15s; }
.asset-card:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 2px 10px rgba(0,0,0,.06); }

.preview { height: 150px; background: var(--el-fill-color-lighter); display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: zoom-in; position: relative; }
.preview img { width: 100%; height: 100%; object-fit: cover; }
.preview audio { width: 92%; }
.preview video { width: 100%; height: 100%; object-fit: contain; background: #000; }

/* 组卡片封面区：封面图 + 右上角张数徽标 + 右下角成员缩略图叠放 */
.group-preview img { display: block; }
.group-badge {
  position: absolute; top: 8px; right: 8px;
  background: rgba(0, 0, 0, .55); color: #fff;
  font-size: 11px; line-height: 1; padding: 4px 8px; border-radius: 10px;
  backdrop-filter: blur(2px); letter-spacing: .5px;
}
.group-thumbs { position: absolute; right: 8px; bottom: 8px; display: flex; }
.group-thumbs img {
  width: 44px; height: 44px; object-fit: cover; border-radius: 6px;
  border: 2px solid var(--el-bg-color); margin-left: -12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .3);
}
.group-thumbs img:first-child { margin-left: 0; }
.text-preview { width: 100%; height: 100%; padding: 10px 12px; font-size: 12px; color: var(--el-text-color-regular); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; cursor: zoom-in; }
.text-preview.json { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
.text-preview :deep(*) { max-width: 100%; }
.text-preview :deep(p) { margin: 2px 0; }
.text-preview :deep(h1), .text-preview :deep(h2), .text-preview :deep(h3) { margin: 4px 0 2px; font-size: 13px; font-weight: 600; }
.text-preview :deep(ul), .text-preview :deep(ol) { margin: 2px 0; padding-left: 16px; }
.text-preview :deep(code) { background: var(--el-fill-color-light); padding: 0 3px; border-radius: 3px; font-size: 11px; }
.text-preview :deep(pre) { background: var(--el-fill-color-light); padding: 6px; border-radius: 4px; overflow-x: auto; }
.text-preview :deep(table) { border-collapse: collapse; font-size: 11px; }
.text-preview :deep(th), .text-preview :deep(td) { border: 1px solid var(--el-border-color-lighter); padding: 2px 6px; }
.text-preview :deep(blockquote) { border-left: 3px solid var(--el-border-color); margin: 2px 0; padding-left: 8px; color: var(--el-text-color-secondary); }
.preview-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; min-height: 28px; gap: 10px; }
.pt-left { display: flex; align-items: center; gap: 8px; }
.pt-actions { display: flex; align-items: center; gap: 8px; }
.kb-import-hint { color: var(--el-text-color-secondary); font-size: 13px; margin: 0 0 12px; }
.kb-import-list { max-height: 320px; overflow: auto; min-height: 60px; }
.kb-import-radios { display: flex; flex-direction: column; gap: 6px; }
.kb-import-empty { color: var(--el-text-color-secondary); padding: 24px; text-align: center; }
.zoom-ctrl { display: flex; align-items: center; gap: 2px; }
.big-md-preview {
  width: 100%; max-height: 70vh; overflow: auto; padding: 20px 24px;
  font-size: 14px; line-height: 1.8; color: var(--el-text-color-primary);
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter); border-radius: 8px;
}
.big-md-preview :deep(h1) { font-size: 24px; border-bottom: 1px solid var(--el-border-color-lighter); padding-bottom: 8px; }
.big-md-preview :deep(h2) { font-size: 20px; margin-top: 20px; }
.big-md-preview :deep(h3) { font-size: 16px; margin-top: 16px; }
.big-md-preview :deep(p) { margin: 8px 0; }
.big-md-preview :deep(ul), .big-md-preview :deep(ol) { padding-left: 24px; margin: 8px 0; }
.big-md-preview :deep(code) { background: var(--el-fill-color-light); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.big-md-preview :deep(pre) { background: var(--el-fill-color-light); padding: 12px 14px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
.big-md-preview :deep(pre code) { background: none; padding: 0; }
.big-md-preview :deep(table) { border-collapse: collapse; margin: 8px 0; width: 100%; }
.big-md-preview :deep(th), .big-md-preview :deep(td) { border: 1px solid var(--el-border-color-lighter); padding: 6px 12px; text-align: left; }
.big-md-preview :deep(th) { background: var(--el-fill-color-light); font-weight: 600; }
.big-md-preview :deep(blockquote) { border-left: 4px solid var(--el-border-color); margin: 8px 0; padding: 4px 16px; color: var(--el-text-color-secondary); background: var(--el-fill-color-lighter); border-radius: 0 4px 4px 0; }
.big-md-preview :deep(img) { max-width: 100%; border-radius: 6px; }
.big-md-preview :deep(a) { color: var(--el-color-primary); }
.big-md-preview :deep(hr) { border: none; border-top: 1px solid var(--el-border-color-lighter); margin: 16px 0; }
.url-preview { display: flex; align-items: center; gap: 8px; padding: 0 14px; color: var(--el-color-primary); font-size: 12px; }
.url-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.doc-preview { font-size: 44px; opacity: .55; }

.card-body { padding: 10px 14px; flex: 1; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 8px; }
.asset-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.meta { font-size: 11px; color: var(--el-text-color-secondary); margin-top: 3px; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.tag { font-size: 11px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); padding: 1px 6px; border-radius: 8px; }
.desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.card-actions { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 6px 8px 6px 12px; border-top: 1px solid var(--el-border-color-lighter); }
.icon-actions { display: flex; align-items: center; gap: 2px; }
.icon-actions :deep(.el-button) { padding: 4px; }

.pager { flex-shrink: 0; display: flex; justify-content: flex-end; padding-top: 14px; }
.empty { color: var(--el-text-color-secondary); text-align: center; padding: 60px 0; }
.empty .hint { font-size: 12px; margin-top: 6px; max-width: 460px; margin-left: auto; margin-right: auto; }

/* 套图画廊（组资产展开）：头部 + 网格卡片 */
.group-gallery { padding: 2px 0 8px; overflow: hidden; }
.gallery-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--el-border-color-lighter); }
.gallery-head-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.gallery-head-count { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }

/* 电商式套图浏览：主图大图 + 缩略图图集切换（详情页式） */
.ecom-viewer { display: flex; flex-direction: column; gap: 12px; }
.ecom-main {
  height: 46vh; min-height: 260px;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  background: var(--el-fill-color-lighter); border-radius: 10px; overflow: hidden;
}
.ecom-main-img { width: 100%; height: 100%; cursor: zoom-in; }
.ecom-main :deep(.el-image__inner) { width: 100% !important; height: 100% !important; object-fit: contain !important; }
.ecom-bar {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 12px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, .45));
  pointer-events: none;
}
.ecom-bar .ecom-count, .ecom-bar .ecom-dl { pointer-events: auto; }
.ecom-count { font-size: 12px; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .55); }
.ecom-dl { color: #fff !important; }
.ecom-dl :deep(.el-icon) { font-size: 16px; }
.ecom-thumbs { display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px; }
.ecom-thumb {
  position: relative; flex: 0 0 auto; width: 72px; height: 72px;
  border: 2px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; cursor: pointer;
  transition: border-color .15s, transform .15s;
}
.ecom-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ecom-thumb.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 2px var(--el-color-primary-light-7); }
.ecom-thumb:hover { transform: translateY(-1px); }
.ecom-thumb-badge {
  position: absolute; left: 4px; top: 4px; z-index: 1;
  font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 999px;
  color: #fff; background: var(--el-color-warning);
}
.gallery-item {
  border: 1px solid var(--el-border-color-lighter); border-radius: 10px; overflow: hidden;
  background: var(--el-bg-color); cursor: zoom-in;
  transition: border-color .15s, box-shadow .15s, transform .15s;
  display: flex; flex-direction: column;
}
.gallery-item:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 4px 14px rgba(0, 0, 0, .1); transform: translateY(-1px); }
.gallery-item img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; display: block; background: var(--el-fill-color-lighter); }
.gallery-text { padding: 12px 14px; font-size: 12px; color: var(--el-text-color-regular); min-height: 80px; overflow: hidden; }
.gallery-name {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 8px 10px; border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px; color: var(--el-text-color-primary); min-width: 0;
}
.gallery-name-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.gallery-role { flex-shrink: 0; }
.gallery-dl { flex-shrink: 0; color: var(--el-text-color-secondary); }

/* 大图预览 */
.big-preview { display: flex; align-items: center; justify-content: center; min-height: 120px; }
.big-preview img { max-width: 100%; max-height: 70vh; }
/* 图片预览画布（参考人像设计 preview-img）：浅灰底 + 圆角，缩放后滚动查看 */
.big-img-wrap {
  width: 100%;
  max-height: 62vh;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}
.big-img { transition: transform .15s ease; }
.big-preview :deep(.el-image) { width: 100%; display: flex; align-items: center; justify-content: center; }
.big-preview :deep(.el-image__inner) { max-width: 100%; max-height: 60vh; object-fit: contain; }
.big-preview audio { width: 90%; }
/* 元信息条（参考人像设计 preview-info） */
.preview-meta { margin-top: 12px; background: var(--el-fill-color-lighter); border-radius: 8px; padding: 10px 14px; }
.meta-row { display: flex; font-size: 12.5px; margin-bottom: 6px; }
.meta-row:last-child { margin-bottom: 0; }
.meta-row .k { color: var(--el-text-color-secondary); width: 48px; flex-shrink: 0; }
.meta-row .v { color: var(--el-text-color-primary); flex: 1; }
.big-iframe { width: 100%; height: 62vh; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: #fff; }
.big-text { max-height: 60vh; overflow: auto; width: 100%; white-space: pre-wrap; word-break: break-all; font-size: 13px; }
.big-url { word-break: break-all; }
.big-hint { color: var(--el-text-color-secondary); }

/* 分类管理 */
.cat-mgr { display: flex; flex-direction: column; gap: 10px; }
.cat-mgr-desc { font-size: 12px; color: var(--el-text-color-secondary); }
.kind-tag { margin-right: 4px; }
.cat-mgr-footer { display: flex; justify-content: flex-end; }
.cat-form { padding: 4px 0; }
</style>
