<template>
  <div class="brain-panel">
    <!-- 顶部状态条：标题 + 启用开关 + 可点击统计 + 设置入口 -->
    <header class="bp-header">
      <div class="bp-title">
        <span class="bp-name">知识大脑</span>
        <el-switch v-model="enabled" size="small" :loading="enabling" @change="toggleEnabled" />
        <el-tag :type="enabled ? 'success' : 'info'" size="small" effect="light" round>
          {{ enabled ? '运行中' : '未启用' }}
        </el-tag>
      </div>
      <div class="bp-stats">
        <button type="button" class="bp-stat" :class="{ active: activeView === 'knowledge' }" @click="showKnowledge()">
          <b>{{ stats?.notes?.published ?? '—' }}</b>
          <span>知识</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'total' }" @click="showAtoms('all')">
          <b>{{ stats?.atoms?.total ?? '—' }}</b>
          <span>论断</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'human' }" @click="showAtoms('human')">
          <b>{{ stats?.atoms?.humanOrigin ?? '—' }}</b>
          <span>我的观感</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'cards' }" @click="showCards()">
          <b>{{ stats?.notes?.published ?? '—' }}</b>
          <span>经验卡</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'proposals' }" @click="showProposals()">
          <b>{{ proposalTotal }}</b>
          <span>待审提议</span>
        </button>
        <button type="button" class="bp-stat" :class="{ active: statActive === 'open' }" @click="showAtoms('open-question')">
          <b>{{ stats?.openQuestions ?? '—' }}</b>
          <span>悬而未决</span>
        </button>
      </div>
      <el-button size="small" @click="openConfig">
        <el-icon><Setting /></el-icon>
        设置
      </el-button>
    </header>

    <!-- 主体双栏：左=主内容区（视图切换），右=提炼目标/待审提议/待提取文档 -->
    <div class="bp-body">
      <div class="bp-main">
        <!-- 知识浏览器（v3：按形态展示——体系树/结构弧线/方法文档/书级档案） -->
        <template v-if="activeView === 'knowledge'">
          <KnowledgeBrowser ref="knowledgeBrowser" :kb-id="props.kbId" />
        </template>

        <!-- 论断视图（证据层） -->
        <template v-else-if="activeView === 'atoms'">
          <div class="bp-main-toolbar">
            <el-radio-group v-model="atomFilter" size="small" @change="onAtomFilterChange">
              <el-radio-button value="all">全部论断</el-radio-button>
              <el-radio-button value="human">我的观感</el-radio-button>
              <el-radio-button value="opinions">AI观点</el-radio-button>
              <el-radio-button value="open-question">悬而未决</el-radio-button>
              <el-radio-button value="foreshadow">未回收伏笔</el-radio-button>
            </el-radio-group>
            <el-select
              v-model="atomDocFilter"
              clearable
              placeholder="全部文档"
              size="small"
              style="width: 150px; margin-left: auto"
              @change="onDocFilterChange"
            >
              <el-option v-for="d in allDocs" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
            <el-select
              v-model="atomLayerFilter"
              clearable
              placeholder="全部分层"
              size="small"
              style="width: 110px"
              @change="onDocFilterChange"
            >
              <el-option label="设定层" value="setting" />
              <el-option label="技法层" value="craft" />
              <el-option label="描写层" value="describe" />
              <el-option label="细节层" value="detail" />
            </el-select>
            <el-button size="small" type="primary" plain @click="openRemark">
              <el-icon><Edit /></el-icon>
              记观感
            </el-button>
          </div>
          <div class="atoms-table-region">
            <el-table
              :data="atoms"
              height="100%"
              :empty-text="atomsEmptyText"
              style="width: 100%"
            >
              <el-table-column type="index" label="序号" width="60" align="center" :index="atomIndex" />
              <el-table-column prop="statement" label="论断" min-width="280">
                <template #default="{ row }">
                  <el-tooltip v-if="row.sourceQuote" :content="row.sourceQuote" placement="top" :show-after="200">
                    <span class="stmt">{{ row.statement }}</span>
                  </el-tooltip>
                  <span v-else class="stmt">{{ row.statement }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="90">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain">{{ kbAtomTypeLabel(row.type) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="layer" label="分层" width="80">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" type="info">{{ kbAtomLayerLabel(row.layer) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="statusTagType(row.status)" size="small">{{ kbAtomStatusLabel(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="来源文档" width="130">
                <template #default="{ row }">
                  <el-tooltip v-if="row.documentName" :content="row.documentName" placement="top" :show-after="200">
                    <span class="doc-src">{{ shortDocName(row.documentName) }}</span>
                  </el-tooltip>
                  <span v-else class="muted">—</span>
                </template>
              </el-table-column>
              <el-table-column prop="useCount" label="被用" width="60" align="center" />
              <el-table-column label="操作" width="70" align="center">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" @click="openAtomDetail(row)">详情</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-if="atomTotal > 0" class="atoms-pagination-bar">
            <el-pagination
              :current-page="atomPage"
              :page-size="atomPageSize"
              :page-sizes="[20, 50, 100]"
              :total="atomTotal"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="handleAtomPageChange"
              @size-change="handleAtomPageSizeChange"
            />
          </div>
        </template>

        <!-- 经验卡视图 -->
        <template v-else-if="activeView === 'cards'">
          <div class="bp-main-toolbar">
            <span class="bp-main-title">经验卡</span>
            <span class="bp-main-hint">已入库的提炼经验，写作链路可检索引用</span>
          </div>
          <div class="cards-region">
            <div v-if="notes.length === 0" class="side-empty">
              暂无经验卡——在右侧「提炼目标」中运行提炼，生成的卡经审批后入库
            </div>
            <div v-for="n in notes" :key="n.id" class="note-card">
              <div class="n-head">
                <span class="n-title">{{ n.title }}</span>
                <el-tag v-if="goalNameOf(n)" size="small" effect="plain" color="#ecf5ff">{{ goalNameOf(n) }}</el-tag>
                <el-tag size="small" effect="plain">{{ kbNoteTypeLabel(n.type) }}</el-tag>
              </div>
              <div class="n-desc">{{ n.description }}</div>
              <el-collapse v-if="n.body" class="n-body-collapse">
                <el-collapse-item :title="`正文（${n.body.length} 字）`" :name="n.id">
                  <pre class="n-body">{{ n.body }}</pre>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
          <div v-if="notesTotal > notesPageSize" class="atoms-pagination-bar">
            <el-pagination
              :current-page="notesPage"
              :page-size="notesPageSize"
              :total="notesTotal"
              layout="total, prev, pager, next"
              background
              @current-change="handleNotesPageChange"
            />
          </div>
        </template>

        <!-- 待审提议视图 -->
        <template v-else>
          <div class="bp-main-toolbar">
            <span class="bp-main-title">待审提议</span>
            <span class="bp-main-hint">批准后经验卡正式入库，拒绝则归档留痕</span>
            <el-button
              size="small"
              :disabled="proposals.length === 0"
              style="margin-left: auto"
              @click="toggleSelectAll"
            >
              {{ allProposalsSelected ? '取消全选' : '全选本页' }}
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :disabled="selectedProposalIds.length === 0"
              :loading="batchBusy"
              @click="batchDecide('reject')"
            >
              拒绝所选{{ selectedProposalIds.length ? `（${selectedProposalIds.length}）` : '' }}
            </el-button>
            <el-button
              size="small"
              type="primary"
              :disabled="selectedProposalIds.length === 0"
              :loading="batchBusy"
              @click="batchDecide('publish')"
            >
              批准入库{{ selectedProposalIds.length ? `（${selectedProposalIds.length}）` : '' }}
            </el-button>
          </div>
          <div class="cards-region">
            <div v-if="proposals.length === 0" class="side-empty">暂无待审提议</div>
            <el-checkbox-group v-model="selectedProposalIds" class="proposal-group">
            <div v-for="p in proposals" :key="p.id" class="note-card">
              <div class="n-head">
                <el-checkbox :value="p.id" class="p-check" />
                <span class="n-title">{{ p.title }}</span>
                <el-tag v-if="goalNameOf(p)" size="small" effect="plain" color="#ecf5ff">{{ goalNameOf(p) }}</el-tag>
                <el-tag size="small" effect="plain">{{ kbNoteTypeLabel(p.type) }}</el-tag>
                <el-tag size="small" type="warning" effect="light">{{ kbNoteStatusLabel(p.status) }}</el-tag>
              </div>
              <div class="n-desc">{{ p.description }}</div>
              <pre
                v-if="p.body"
                class="n-body preview"
                :class="{ expanded: expandedProposals.has(p.id) }"
                @click="toggleProposalExpand(p.id)"
              >{{ p.body }}</pre>
              <div v-if="p.body" class="p-expand-hint" @click="toggleProposalExpand(p.id)">
                {{ expandedProposals.has(p.id) ? '收起正文' : `展开全文（${p.body.length} 字）` }}
              </div>
              <div class="p-actions">
                <el-button size="small" :disabled="batchBusy" @click="decide(p.id, 'reject')">拒绝</el-button>
                <el-button size="small" type="primary" :disabled="batchBusy" @click="decide(p.id, 'publish')">批准入库</el-button>
              </div>
            </div>
            </el-checkbox-group>
          </div>
          <div v-if="proposalTotal > inboxPageSize" class="atoms-pagination-bar">
            <el-pagination
              :current-page="inboxPage"
              :page-size="inboxPageSize"
              :total="proposalTotal"
              layout="total, prev, pager, next"
              background
              @current-change="handleInboxPageChange"
            />
          </div>
        </template>
      </div>

      <aside class="bp-side">
        <!-- 提炼目标 -->
        <section class="side-card">
          <header class="side-head">
            <span class="side-title">提炼目标</span>
            <el-button link type="primary" size="small" @click="openConfig">管理</el-button>
          </header>
          <div v-if="enabledGoals.length === 0" class="side-empty">暂无目标，点击「管理」添加</div>
          <div v-for="g in enabledGoals" :key="g.id" class="goal-run" :title="g.hint">
            <div class="goal-run-info">
              <span class="goal-run-name">{{ g.name }}</span>
              <span class="goal-run-hint">{{ g.hint }}</span>
            </div>
            <el-button
              size="small"
              :loading="runningGoalIds.includes(g.id)"
              @click="runGoal(g)"
            >
              {{ runningGoalIds.includes(g.id) ? '提炼中' : '提炼' }}
            </el-button>
          </div>
          <div v-if="enabledGoals.length > 0" class="side-tip">
            基于全书章节摘要提炼，约需一至十几分钟；开启「自动后台提炼」后随消化自动运行（各目标按冷却与素材增长重跑），也可手动点「提炼」立即执行。
          </div>
        </section>

        <!-- 待审提议（快捷审批；完整分页在主区「待审提议」视图） -->
        <section class="side-card">
          <header class="side-head">
            <span class="side-title">
              待审提议
              <span v-if="proposalTotal > 0" class="side-count">{{ proposalTotal }}</span>
            </span>
            <el-button link type="primary" size="small" @click="showProposals()">查看全部</el-button>
          </header>
          <div v-if="proposals.length === 0" class="side-empty">暂无待审提议</div>
          <div v-for="p in proposals" :key="p.id" class="proposal">
            <div class="p-title">{{ p.title }}</div>
            <div class="p-meta">
              <el-tag v-if="goalNameOf(p)" size="small" effect="plain" color="#ecf5ff">{{ goalNameOf(p) }}</el-tag>
              <el-tag size="small" effect="plain">{{ kbNoteTypeLabel(p.type) }}</el-tag>
            </div>
            <div class="p-desc">{{ p.description }}</div>
            <div class="p-actions">
              <el-button size="small" @click="decide(p.id, 'reject')">拒绝</el-button>
              <el-button size="small" type="primary" @click="decide(p.id, 'publish')">批准入库</el-button>
            </div>
          </div>
        </section>

        <!-- 维护工具（收纳深度整理动作；平时由自动后台提炼按冷却执行，这里供手动立即运行） -->
        <section class="side-card">
          <header class="side-head">
            <span class="side-title">维护工具</span>
            <el-button size="small" plain @click="runHealthCheck">大脑体检</el-button>
          </header>
          <el-dropdown style="width: 100%" :disabled="maintBusy" @command="onMaintCommand">
            <el-button size="small" type="primary" plain style="width: 100%" :loading="maintBusy">
              {{ activeMaint ? `${activeMaint.name}中…` : '运行整理工具' }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="reading">全书精读——滚动工作记忆（设定/人物/情节/伏笔）</el-dropdown-item>
                <el-dropdown-item command="viewGraph" divided>查看知识图谱——实体关系图</el-dropdown-item>
                <el-dropdown-item command="review">终审复核——交叉核对知识库找问题</el-dropdown-item>
                <el-dropdown-item command="summary">全书综述——生成完整分析文章</el-dropdown-item>
                <el-dropdown-item command="consolidate">归纳整理——同主题碎片合并成综合论断</el-dropdown-item>
                <el-dropdown-item command="cleanup">垃圾清理——归档确定无疑的垃圾论断</el-dropdown-item>
                <el-dropdown-item command="foreshadow">伏笔扫描——埋设-回收关系判读</el-dropdown-item>
                <el-dropdown-item command="relabel">分层补标——存量论断重标概要/设定/描写/细节</el-dropdown-item>
                <el-dropdown-item command="bookPasses" divided>书级汇总——全书概要/设定索引/人物册</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <template v-if="activeMaint">
            <el-progress :percentage="activeMaint.pct" :stroke-width="6" style="margin-top: 8px" />
            <div class="side-tip">{{ activeMaint.text }}</div>
          </template>
          <template v-else>
            <div v-for="s in maintSummaries" :key="s" class="side-tip" style="margin-top: 6px">{{ s }}</div>
          </template>
        </section>

        <!-- 自动化日志（v2 P4：后台动作时间线 + 撤销） -->
        <section v-if="autoLogs.length > 0" class="side-card">
          <header class="side-head">
            <span class="side-title">自动化日志</span>
          </header>
          <div v-for="log in autoLogs" :key="log.id" class="doc-run">
            <span class="doc-run-name" :title="log.action">
              {{ autoLogLabel(log) }}
            </span>
            <el-button v-if="log.undoable" size="small" :loading="autoUndoBusy === log.id" @click="undoAutoLog(log.id)">
              撤销
            </el-button>
            <span v-else-if="log.undone" class="side-empty">已撤销</span>
          </div>
        </section>

        <!-- 待提取文档（开脑前上传的存量，有才显示） -->
        <section v-if="pendingDigestDocs.length > 0" class="side-card">
          <header class="side-head">
            <span class="side-title">待提取文档</span>
            <el-button size="small" type="primary" plain :loading="digestAllBusy" @click="digestAll">
              全部提取
            </el-button>
          </header>
          <div v-for="d in pendingDigestDocs" :key="d.id" class="doc-run">
            <span class="doc-run-name" :title="d.name">{{ d.name }}</span>
            <el-button size="small" :loading="!!d.busy" @click="digestOne(d)">
              {{ d.busy ? '提取中' : '提取' }}
            </el-button>
          </div>
        </section>
      </aside>
    </div>

    <!-- 知识图谱（P2：实体关系图） -->
    <el-dialog v-model="graphOpen" title="知识图谱（实体关系）" width="90%" top="4vh" destroy-on-close>
      <div v-loading="graphLoading" style="min-height: 480px">
        <ForceGraph
          v-if="graphNodes.length > 0"
          :nodes="graphNodes"
          :edges="graphEdges"
          :width="1200"
          :height="620"
          style="width: 100%"
        />
        <div v-else class="side-empty">图谱为空——先运行「全书精读」，再用「维护工具」里的图谱构建抽取实体关系</div>
      </div>
    </el-dialog>

    <!-- 设置抽屉 -->
    <el-drawer v-model="configOpen" title="大脑设置" size="600px" :close-on-click-modal="false">
      <div class="cfg-body">
        <el-tabs v-model="cfgTab">
        <el-tab-pane label="基础" name="basic">
        <section class="cfg-section">
          <h4>基础</h4>
          <div class="cfg-row">
            <label class="cfg-label">
              启用知识大脑
              <span class="cfg-desc">总开关；关闭后暂停消化与提炼</span>
            </label>
            <el-switch v-model="configDraft.enabled" />
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              自动消化新文档
              <span class="cfg-desc">上传文档后自动原子化 + 裁决</span>
            </label>
            <el-switch v-model="configDraft.digestion.enabled" />
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              内容类型
              <span class="cfg-desc">决定提取侧重与书级汇总关卡；「自动」=首次提取时由 AI 识别</span>
            </label>
            <el-select v-model="configDraft.profile.contentType" size="small" style="width: 160px">
              <el-option label="自动识别" value="" />
              <el-option label="小说 / 叙事" value="novel" />
              <el-option label="知识类" value="knowledge" />
              <el-option label="文史哲" value="history" />
              <el-option label="其他" value="other" />
            </el-select>
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              书级汇总遍
              <span class="cfg-desc">按章提取完成后自动汇总全书概要/设定索引/人物册/伏笔台账卡（待审箱确认）</span>
            </label>
            <el-switch v-model="configDraft.digestion.bookPasses" />
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              自动后台提炼
              <span class="cfg-desc">
                免手点流水线：开机与挂机定时自动续消化 → 分层补标 → 书级汇总 → 目标提炼 → 归纳/清理/伏笔扫描；
                各动作按冷却记账执行，产物进「待审提议」人审。关闭后仅随消化自动触发书级汇总，其余需手动点按钮
              </span>
            </label>
            <el-switch v-model="configDraft.automation.enabled" />
          </div>
          <el-collapse class="cfg-advanced">
            <el-collapse-item title="高级选项" name="adv">
              <div class="cfg-row">
                <label class="cfg-label">
                  情节模式卡归纳
                  <span class="cfg-desc">实验性，成本较高</span>
                </label>
                <el-switch v-model="configDraft.patterns.plotEnabled" />
              </div>
              <div class="cfg-row">
                <label class="cfg-label">
                  人物原型卡归纳
                  <span class="cfg-desc">跨书聚类归纳人物原型（同骨架异参数），提炼时运行</span>
                </label>
                <el-switch v-model="configDraft.patterns.characterEnabled" />
              </div>
              <div class="cfg-row">
                <label class="cfg-label">
                  自动入库阈值
                  <span class="cfg-desc">论断置信度不低于该值直接入库，否则进待审提议</span>
                </label>
                <el-input-number
                  v-model="configDraft.autoApproveThreshold"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  size="small"
                />
                <label class="cfg-label">
                  每日调用上限
                  <span class="cfg-desc">消化/冶炼等每日 LLM 调用超过该值自动熔断到明天；0 或留空 = 不限</span>
                </label>
                <el-input-number
                  v-model="configDraft.dailyCostLimit"
                  :min="0"
                  :step="100"
                  size="small"
                  placeholder="不限"
                />
              </div>
            </el-collapse-item>
          </el-collapse>
        </section>
        </el-tab-pane>

        <el-tab-pane label="模型" name="models">
        <section class="cfg-section">
          <h4>模型</h4>
          <div class="cfg-row">
            <label class="cfg-label">
              原子化模型
              <span class="cfg-desc">从章节原文提取知识论断</span>
            </label>
            <el-select
              v-model="configDraft.models.atomize"
              placeholder="跟随宿主模型"
              clearable
              value-on-clear=""
              size="small"
              style="width: 240px"
            >
              <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </div>
          <div class="cfg-row">
            <label class="cfg-label">
              裁决 / 提炼模型
              <span class="cfg-desc">论断查重裁决与经验卡归纳</span>
            </label>
            <el-select
              v-model="configDraft.models.adjudicate"
              placeholder="跟随宿主模型"
              clearable
              value-on-clear=""
              size="small"
              style="width: 240px"
            >
              <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </div>
        </section>
        </el-tab-pane>

        <el-tab-pane label="提取目标" name="goals">
        <section class="cfg-section">
          <h4>提取目标</h4>
          <div class="cfg-desc" style="margin-bottom: 8px">
            经验提炼的维度，按项目类型定义；保存后在右侧「提炼目标」中运行
          </div>
          <div class="cfg-goals-actions">
            <el-select
              v-model="presetPick"
              placeholder="从模板添加…"
              size="small"
              style="width: 220px"
              @change="addGoalFromPreset"
            >
              <el-option-group v-for="g in presetGroups" :key="g.group" :label="g.group">
                <el-option v-for="(p, i) in g.goals" :key="g.group + i" :label="p.name" :value="g.group + '|' + p.name" />
              </el-option-group>
            </el-select>
            <el-button size="small" @click="addCustomGoal">新建</el-button>
          </div>
          <div v-for="(g, gi) in configDraft.goals" :key="g.id" class="goal-edit">
            <div class="goal-edit-head">
              <el-checkbox v-model="g.enabled" size="small" />
              <el-input v-model="g.name" size="small" placeholder="目标名称" style="flex: 1" />
              <el-button size="small" text type="danger" @click="configDraft.goals.splice(gi, 1)">删除</el-button>
            </div>
            <el-input
              v-model="g.hint"
              type="textarea"
              :rows="4"
              size="small"
              placeholder="提炼指引：要提取什么经验、如何组织成卡"
            />
          </div>
          <div v-if="configDraft.goals.length === 0" class="side-empty">暂无目标——从模板添加或新建</div>
        </section>
        </el-tab-pane>

        <el-tab-pane label="视角遍" name="lenses">
        <section class="cfg-section">
          <h4>视角遍</h4>
          <div class="cfg-desc" style="margin-bottom: 8px">
            启用的视角卡会在消化时重读章节，产出该视角的观感论断（与事实层分域，互不影响）；
            对已消化的书，启用并保存后点侧栏「提取」补跑
          </div>
          <div v-for="lens in lensList" :key="lens.id" class="goal-edit-head">
            <el-checkbox
              :model-value="configDraft.lenses.enabledLensNoteIds.includes(lens.id)"
              size="small"
              @change="onLensToggle(lens, $event)"
            />
            <span style="flex: 1" :title="lens.description">{{ lens.title }}</span>
            <el-button size="small" text @click="openLensEditor(lens)">编辑</el-button>
          </div>
          <div v-if="lensList.length === 0" class="side-empty">暂无视角卡——从模板添加或新建</div>
          <div class="cfg-goals-actions" style="margin-top: 8px">
            <el-select
              v-model="lensPresetPick"
              placeholder="从模板添加…"
              size="small"
              style="width: 220px"
              @change="addLensFromPreset"
            >
              <el-option v-for="p in LENS_PRESETS" :key="p.title" :label="p.title" :value="p.title" />
            </el-select>
            <el-button size="small" @click="openLensEditor(null)">新建</el-button>
          </div>
        </section>
        </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <div class="cfg-actions">
          <el-button @click="discardConfig">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveConfig">保存</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 视角卡编辑（G1：新建/编辑后勾选启用并保存，随消化生效） -->
    <el-dialog v-model="lensEditorOpen" :title="lensForm.id ? '编辑视角卡' : '新建视角卡'" width="520px" :close-on-click-modal="false">
      <el-form label-width="72px" size="small">
        <el-form-item label="名称">
          <el-input v-model="lensForm.title" maxlength="30" placeholder="如：章节功能与叙事结构视角" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="lensForm.description" type="textarea" :rows="2" placeholder="何时用这个视角（第三人称，≤200字）" />
        </el-form-item>
        <el-form-item label="看什么">
          <el-input v-model="lensForm.attendTo" type="textarea" :rows="4" placeholder="每行一条注意力点" />
        </el-form-item>
        <el-form-item label="问什么">
          <el-input v-model="lensForm.questions" type="textarea" :rows="4" placeholder="每行一个提问" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lensEditorOpen = false">取消</el-button>
        <el-button type="primary" :loading="lensEditorBusy" @click="saveLens">保存</el-button>
      </template>
    </el-dialog>

    <!-- 大脑体检（只读报告：覆盖率/知识构成/建议） -->
    <el-dialog v-model="healthOpen" title="大脑体检" width="680px">
      <div v-loading="healthLoading" style="min-height: 160px">
        <template v-if="healthReport">
          <div class="hz-section">
            <h5>提取覆盖</h5>
            <div class="hz-grid">
              <span>文档 {{ healthReport.coverage.documents }} 篇（待提取 {{ healthReport.coverage.documentsPending }}，失败 {{ healthReport.coverage.documentsFailed }}）</span>
              <span>章节 {{ healthReport.coverage.chaptersTotal }} 章，已消化 {{ healthReport.coverage.chaptersDigested }} 章</span>
              <span>零产出章 {{ healthReport.coverage.chaptersNoAtoms }}（重试耗尽 {{ healthReport.coverage.chaptersExhausted }}）</span>
              <span v-if="healthReport.coverage.noAtomChapterSample.length">
                无知识章样例：{{ healthReport.coverage.noAtomChapterSample.join('、') }}
              </span>
            </div>
          </div>
          <div class="hz-section">
            <h5>知识构成（工作集 {{ healthReport.knowledge.atomsWorking }} 条）</h5>
            <div class="hz-grid">
              <span>分层：设定 {{ healthReport.knowledge.byLayer.setting ?? 0 }} · 技法 {{ healthReport.knowledge.byLayer.craft ?? 0 }} · 描写 {{ healthReport.knowledge.byLayer.describe ?? 0 }} · 细节 {{ healthReport.knowledge.byLayer.detail ?? 0 }}</span>
              <span>悬置问题 {{ healthReport.knowledge.openQuestions }} · 存疑 {{ healthReport.knowledge.byStatus.suspected ?? 0 }} · 已过期 {{ healthReport.knowledge.byStatus.stale ?? 0 }}</span>
              <span>实体 {{ healthReport.knowledge.entitiesActive }}（缺摘要 {{ healthReport.knowledge.entitiesPendingSummary }}） · 经验卡已入库 {{ healthReport.knowledge.notesPublished }}（待审 {{ healthReport.knowledge.notesProposed }}）</span>
              <span>被 agent 取用 {{ Object.values(healthReport.knowledge.consumedByTool ?? {}).reduce((a, b) => a + b, 0) }} 次<span v-if="Object.keys(healthReport.knowledge.consumedByTool ?? {}).length">（{{ Object.entries(healthReport.knowledge.consumedByTool!).map(([k, v]) => `${k} ${v}`).join(' · ') }}）</span></span>
            </div>
          </div>
          <div v-if="healthReport.bookPasses.length" class="hz-section">
            <h5>书级汇总</h5>
            <div class="hz-grid">
              <span v-for="(p, i) in healthReport.bookPasses" :key="i">
                {{ p.documentName }} · {{ bookPassLabel(p.passKey) }}：{{ p.status }}{{ p.error ? `（${p.error}）` : '' }}
              </span>
            </div>
          </div>
          <div class="hz-section">
            <h5>建议（{{ healthReport.suggestions.length }}）</h5>
            <div v-if="healthReport.suggestions.length === 0" class="side-empty">一切正常，没有需要处理的事项。</div>
            <ul class="hz-suggestions">
              <li v-for="s in healthReport.suggestions" :key="s.code">{{ s.message }}</li>
            </ul>
          </div>
        </template>
      </div>
      <template #footer>
        <div class="cfg-actions">
          <el-button @click="healthOpen = false">关闭</el-button>
          <el-button type="primary" :loading="healthLoading" @click="runHealthCheck">重新体检</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 记观感（human origin 论断录入） -->
    <el-dialog v-model="remarkOpen" title="记观感" width="480px" :close-on-click-modal="false">
      <div class="rf-body">
        <div class="rf-label">
          我的观感
          <span class="rf-req">*</span>
        </div>
        <el-input
          v-model="remarkText"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="写下你对这本书的判断与喜好，例如：我喜欢反派智斗多于正面对轰；金手指后期不能失控膨胀"
        />
        <div class="rf-label" style="margin-top: 12px">关联文档（可选）</div>
        <el-select v-model="remarkDocId" clearable placeholder="不关联具体文档" style="width: 100%">
          <el-option v-for="d in allDocs" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <div class="rf-label" style="margin-top: 12px">原文引用（可选）</div>
        <el-input v-model="remarkQuote" maxlength="200" placeholder="触动你产生这条观感的原文片段" />
      </div>
      <template #footer>
        <div class="cfg-actions">
          <el-button @click="remarkOpen = false">取消</el-button>
          <el-button type="primary" :loading="remarkBusy" @click="saveRemark">保存观感</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 论断详情 -->
    <el-dialog v-model="atomDetailOpen" title="论断详情" width="640px">
      <div v-loading="atomDetailLoading" style="min-height: 120px">
        <template v-if="atomDetail">
          <div class="ad-stmt">{{ atomDetail.statement }}</div>
          <div class="ad-meta">
            <el-tag size="small" effect="plain">{{ kbAtomTypeLabel(atomDetail.type) }}</el-tag>
            <el-tag size="small" :type="statusTagType(atomDetail.status)">{{ kbAtomStatusLabel(atomDetail.status) }}</el-tag>
            <el-tag size="small" effect="plain">{{ kbAtomOriginLabel(atomDetail.origin) }}</el-tag>
          </div>
          <div v-if="atomDetail.supersededBy" class="ad-row">
            <span class="ad-label">已被替代</span>
            <span class="ad-value">新论断：{{ atomDetail.supersededBy.statement }}</span>
          </div>
          <div class="ad-row">
            <span class="ad-label">原文出处</span>
            <span class="ad-value ad-quote">{{ atomDetail.sourceQuote || '—' }}</span>
          </div>
          <div class="ad-row">
            <span class="ad-label">来源文档</span>
            <span class="ad-value">{{ atomDetail.documentName || '—' }}</span>
          </div>
          <div class="ad-row">
            <span class="ad-label">置信度</span>
            <span class="ad-value">{{ atomDetail.certainty }}</span>
          </div>
          <div class="ad-row">
            <span class="ad-label">被引用</span>
            <span class="ad-value">{{ atomDetail.useCount }} 次</span>
          </div>
          <div class="ad-row">
            <span class="ad-label">提炼批次</span>
            <span class="ad-value">{{ atomDetail.extractionPass }}</span>
          </div>
          <div class="ad-row">
            <span class="ad-label">章节指纹</span>
            <span class="ad-value muted">{{ (atomDetail.sourceChapterHash || '—').slice(0, 12) }}</span>
          </div>
          <div class="ad-row">
            <span class="ad-label">记录时间</span>
            <span class="ad-value">{{ fmtTime(atomDetail.createdAt) }}</span>
          </div>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { KB_BRAIN_GOAL_PRESETS } from '@shared/constants/kb-brain-goal-presets'
import ForceGraph from '@/components/common/ForceGraph.vue'
import type { ForceGraphNode, ForceGraphEdge } from '@/components/common/force-graph.model'
import KnowledgeBrowser from './KnowledgeBrowser.vue'
import { kbAtomLayerLabel, kbAtomOriginLabel, kbAtomStatusLabel, kbAtomTypeLabel, kbNoteStatusLabel, kbNoteTypeLabel } from '@shared/constants/kb-brain-labels'

const props = defineProps<{ kbId: string }>()
const emit = defineEmits<{ (e: 'stats', count: number): void }>()
let requestGen = 0 // kbId 快速切换时丢弃过期响应

interface BrainAtom {
  id: string
  statement: string
  type: string
  layer?: string
  status: string
  lensNoteId: string | null
  origin: string
  useCount: number
  sourceDocumentId: string | null
  documentName: string | null
  sourceChapterHash: string | null
  sourceQuote: string
}
interface BrainNote {
  id: string
  title: string
  description: string
  body: string
  type: string
  status: string
  /** 标签 JSON 数组；`goal-name:<目标名>` 标记经验卡来自哪个提炼目标 */
  tags?: string
}
interface BrainGoal {
  id: string
  name: string
  hint: string
  enabled: boolean
}
interface BrainConfig {
  enabled: boolean
  digestion: { enabled: boolean; bookPasses?: boolean }
  profile: { contentType: string; genre?: string }
  patterns: { plotEnabled: boolean; characterEnabled: boolean }
  lenses: { enabledLensNoteIds: string[] }
  autoApproveThreshold: number
  dailyCostLimit?: number
  models: { atomize: string; adjudicate: string }
  goals: BrainGoal[]
  /** 后台自动化（免手点流水线；产物进待审提议人审） */
  automation: { enabled: boolean }
}
const modelOptions = ref<Array<{ label: string; value: string }>>([])

const stats = ref<Record<string, any> | null>(null)

// ===== 主区视图：论断 / 经验卡 / 待审提议 =====
type MainView = 'knowledge' | 'atoms' | 'cards' | 'proposals'
type AtomFilter = 'all' | 'human' | 'opinions' | 'open-question' | 'foreshadow'
const activeView = ref<MainView>('knowledge')
const atomFilter = ref<AtomFilter>('all')

const atoms = ref<BrainAtom[]>([])
const atomPage = ref(1)
const atomPageSize = ref(50)
const atomTotal = ref(0)
let atomsGen = 0 // 论断列表独立代际：翻页请求与刷新竞态时丢弃过期响应

const notes = ref<BrainNote[]>([])
const notesPage = ref(1)
const notesPageSize = 10
const notesTotal = ref(0)
let notesGen = 0 // 经验卡列表代际守卫：切库/快速翻页竞态时丢弃过期响应

const proposals = ref<BrainNote[]>([])
const proposalTotal = ref(0)
const inboxPage = ref(1)
const inboxPageSize = 20
let inboxGen = 0 // 待审提议列表代际守卫（同上）

const config = ref<BrainConfig | null>(null)
const configDraft = ref<BrainConfig>({
  enabled: false,
  digestion: { enabled: true, bookPasses: true },
  profile: { contentType: '' },
  patterns: { plotEnabled: false, characterEnabled: false },
  lenses: { enabledLensNoteIds: [] },
  autoApproveThreshold: 0.8,
  models: { atomize: '', adjudicate: '' },
  goals: [],
  automation: { enabled: true },
})
const configOpen = ref(false)
const cfgTab = ref<'basic' | 'models' | 'goals' | 'lenses'>('basic')
const saving = ref(false)
const enabled = ref(false)
const enabling = ref(false)
interface DigestDoc {
  id: string
  name: string
  busy?: boolean
}
const pendingDigestDocs = ref<DigestDoc[]>([])
const digestAllBusy = ref(false)
// 全量文档清单（记观感的关联文档下拉用，与待提取列表分开）
const allDocs = ref<Array<{ id: string; name: string }>>([])

// ===== 文档过滤 + 论断详情 =====
const atomDocFilter = ref('')
const atomLayerFilter = ref('')
interface AtomDetail extends BrainAtom {
  certainty: number
  extractionPass: string
  createdAt?: string
  supersededBy?: { id: string; statement: string } | null
}
const atomDetailOpen = ref(false)
const atomDetailLoading = ref(false)
const atomDetail = ref<AtomDetail | null>(null)

// ===== 大脑体检（只读报告） =====
interface HealthReport {
  profile: { contentType: string; detected: boolean }
  coverage: {
    documents: number
    documentsPending: number
    documentsFailed: number
    chaptersTotal: number
    chaptersDigested: number
    chaptersExhausted: number
    chaptersNoAtoms: number
    noAtomChapterSample: string[]
  }
  knowledge: {
    atomsWorking: number
    byStatus: Record<string, number>
    byLayer: Record<string, number>
    consumedByTool?: Record<string, number>
    byType: Record<string, number>
    openQuestions: number
    notesProposed: number
    notesPublished: number
    entitiesActive: number
    entitiesPendingSummary: number
  }
  bookPasses: Array<{ documentName: string; passKey: string; status: string; error: string | null }>
  suggestions: Array<{ code: string; message: string }>
}
const healthOpen = ref(false)
const healthLoading = ref(false)
const healthReport = ref<HealthReport | null>(null)

async function runHealthCheck(): Promise<void> {
  if (!props.kbId) return
  healthOpen.value = true
  healthLoading.value = true
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.healthCheck(props.kbId)
    if (res.success) healthReport.value = res.data
    else ElMessage.error(`体检失败: ${res.error || '未知错误'}`)
  } catch (e) {
    ElMessage.error(`体检失败: ${(e as Error).message}`)
  } finally {
    healthLoading.value = false
  }
}

const BOOK_PASS_LABELS: Record<string, string> = {
  outline: '全书概要',
  'setting-index': '设定索引',
  'character-roster': '人物册',
  'foreshadow-ledger': '伏笔台账',
  'knowledge-map': '知识体系图',
}
function bookPassLabel(passKey: string): string {
  return BOOK_PASS_LABELS[passKey.replace('book:', '')] ?? passKey.replace('book:', '')
}

function onDocFilterChange(): void {
  atomPage.value = 1
  void fetchAtoms()
}

function fmtTime(v?: string): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

async function openAtomDetail(row: BrainAtom): Promise<void> {
  atomDetailOpen.value = true
  atomDetailLoading.value = true
  atomDetail.value = null
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.getAtom(row.id)
    if (res?.success && res.data) {
      atomDetail.value = { ...row, ...res.data, documentName: row.documentName }
    }
  } finally {
    atomDetailLoading.value = false
  }
}

// ===== 记观感（human origin 论断录入） =====
const remarkOpen = ref(false)
const remarkText = ref('')
const remarkDocId = ref('')
const remarkQuote = ref('')
const remarkBusy = ref(false)

// ===== 垃圾清理 =====
interface CleanupProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  archivedCount: number
  failedBatches: number
  lastError?: string
}
const cleanupRunning = ref(false)
const cleanupProgress = ref<CleanupProgress | null>(null)
const cleanupSummary = ref<number | null>(null)
let cleanupPollTimer: ReturnType<typeof setInterval> | null = null
const cleanupPct = computed(() => {
  const p = cleanupProgress.value
  if (!p || p.totalBatches === 0) return 0
  return Math.min(100, Math.round((p.processedBatches / p.totalBatches) * 100))
})

function startCleanupPoll(): void {
  if (cleanupPollTimer) return
  cleanupPollTimer = setInterval(pollCleanup, 5000)
  void pollCleanup()
}

async function pollCleanup(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  const kbAtCall = props.kbId // 代际守卫：切库后丢弃过期响应
  try {
    const res = await client.cleanupStatus(props.kbId)
    if (kbAtCall !== props.kbId) return
    if (res.success && res.data) {
      const wasRunning = cleanupRunning.value
      cleanupProgress.value = res.data
      cleanupRunning.value = !!res.data.running
      if (wasRunning && !cleanupRunning.value) {
        if (res.data.lastError && res.data.archivedCount === 0) {
          ElMessage.error(`清理失败: ${res.data.lastError}`)
        } else if (res.data.failedBatches > 0) {
          ElMessage.warning(`清理完成，但 ${res.data.failedBatches} 批失败：${res.data.lastError || '未知错误'}`)
          cleanupSummary.value = res.data.archivedCount
        } else {
          ElMessage.success(`清理完成：归档 ${res.data.archivedCount} 条垃圾论断`)
          cleanupSummary.value = res.data.archivedCount
        }
        await refresh()
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (!cleanupRunning.value && cleanupPollTimer) {
    clearInterval(cleanupPollTimer)
    cleanupPollTimer = null
  }
}

async function startCleanup(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将用 AI 分批审读论断，把确定无疑的垃圾（纯转述诗句/章节标题/剧照说明类）归档；拿不准的一律保留。会产生 LLM 调用费用。',
      '垃圾清理',
      { type: 'warning', confirmButtonText: '开始清理', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.cleanupRun(props.kbId)
    if (!res.success) {
      ElMessage.error(res.error || '清理启动失败')
      return
    }
    cleanupRunning.value = true
    startCleanupPoll()
  } catch (e) {
    ElMessage.error(`清理启动失败: ${(e as Error).message}`)
  }
}

// ===== 分层补标（老库迁移：存量论断 layer 全 detail → LLM 重标四层） =====
interface RelabelProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  relabeledCount: number
  failedBatches: number
  lastError?: string
}
const relabelRunning = ref(false)
const relabelProgress = ref<RelabelProgress | null>(null)
const relabelSummary = ref<number | null>(null)
let relabelPollTimer: ReturnType<typeof setInterval> | null = null
const relabelPct = computed(() => {
  const p = relabelProgress.value
  if (!p || p.totalBatches === 0) return 0
  return Math.min(100, Math.round((p.processedBatches / p.totalBatches) * 100))
})

function startRelabelPoll(): void {
  if (relabelPollTimer) return
  relabelPollTimer = setInterval(pollRelabel, 5000)
  void pollRelabel()
}

async function pollRelabel(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  const kbAtCall = props.kbId // 代际守卫：切库后丢弃过期响应
  try {
    const res = await client.layerRelabelStatus(props.kbId)
    if (kbAtCall !== props.kbId) return
    if (res.success && res.data) {
      const wasRunning = relabelRunning.value
      relabelProgress.value = res.data
      relabelRunning.value = !!res.data.running
      if (wasRunning && !relabelRunning.value) {
        if (res.data.lastError && res.data.relabeledCount === 0) {
          ElMessage.error(`分层补标失败: ${res.data.lastError}`)
        } else if (res.data.failedBatches > 0) {
          ElMessage.warning(`分层补标完成，但 ${res.data.failedBatches} 批失败：${res.data.lastError || '未知错误'}`)
          relabelSummary.value = res.data.relabeledCount
        } else {
          ElMessage.success(`分层补标完成：重标 ${res.data.relabeledCount} 条论断`)
          relabelSummary.value = res.data.relabeledCount
        }
        await refresh()
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (!relabelRunning.value && relabelPollTimer) {
    clearInterval(relabelPollTimer)
    relabelPollTimer = null
  }
}

// ===== 自动化日志（v2 P4：后台动作时间线 + 撤销） =====
interface AutoLogRow {
  id: string
  action: string
  undone: boolean
  noteCount: number
  undoable: boolean
  createdAt: string | null
}
const autoLogs = ref<AutoLogRow[]>([])
const autoUndoBusy = ref<string | null>(null)

function autoLogLabel(log: AutoLogRow): string {
  const t = log.createdAt ? new Date(log.createdAt) : null
  const time = t
    ? `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    : ''
  const name = log.action === 'smelt' ? '冶炼' : log.action === 'corpus' ? '品类归并' : log.action
  return `${time} ${name}（${log.noteCount} 卡）`
}

async function fetchAutoLogs(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.autoLogList(props.kbId, 8)
    if (res && Array.isArray(res)) autoLogs.value = res
  } catch {
    /* 静默：日志失败不拖垮面板 */
  }
}

async function undoAutoLog(logId: string): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  autoUndoBusy.value = logId
  try {
    const res = await client.autoLogUndo(logId)
    if (res?.ok) {
      ElMessage.success(`已撤销：归档 ${res.archived} 张卡`)
      await fetchAutoLogs()
      await refresh()
    } else {
      ElMessage.error(res?.error ?? '撤销失败')
    }
  } catch {
    ElMessage.error('撤销失败')
  } finally {
    autoUndoBusy.value = null
  }
}

async function startRelabel(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将用 AI 分批给存量论断重标知识分层（概要/设定/描写/细节）——分层筛选、体检分层统计与书级「设定索引」取材都依赖它。会产生 LLM 调用费用。',
      '分层补标',
      { type: 'info', confirmButtonText: '开始补标', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.layerRelabelRun(props.kbId)
    if (!res.success) {
      ElMessage.error(res.error || '分层补标启动失败')
      return
    }
    relabelRunning.value = true
    startRelabelPoll()
  } catch (e) {
    ElMessage.error(`分层补标启动失败: ${(e as Error).message}`)
  }
}

// ===== 书级汇总补跑（老库文档不会再发 completed 事件 → 手动补跑书级卡） =====
interface BookPassesProgress {
  running: boolean
  totalDocs: number
  processedDocs: number
  lastError?: string
}
const bookPassesRunning = ref(false)
const bookPassesProgress = ref<BookPassesProgress | null>(null)
const bookPassesSummary = ref<number | null>(null)
const bookPassesLastError = ref('')
let bookPassesPollTimer: ReturnType<typeof setInterval> | null = null

function startBookPassesPoll(): void {
  if (bookPassesPollTimer) return
  bookPassesPollTimer = setInterval(pollBookPasses, 5000)
  void pollBookPasses()
}

async function pollBookPasses(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  const kbAtCall = props.kbId // 代际守卫：切库后丢弃过期响应
  try {
    const res = await client.bookPassesStatus(props.kbId)
    if (kbAtCall !== props.kbId) return
    if (res.success && res.data) {
      const wasRunning = bookPassesRunning.value
      bookPassesProgress.value = res.data
      bookPassesRunning.value = !!res.data.running
      if (wasRunning && !bookPassesRunning.value) {
        bookPassesSummary.value = res.data.processedDocs
        bookPassesLastError.value = res.data.lastError ?? ''
        if (res.data.lastError) {
          ElMessage.warning(`书级汇总完成，但部分文档失败：${res.data.lastError}`)
        } else {
          ElMessage.success('书级汇总完成，产出的卡在「待审提议」等待确认')
        }
        await refresh()
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (!bookPassesRunning.value && bookPassesPollTimer) {
    clearInterval(bookPassesPollTimer)
    bookPassesPollTimer = null
  }
}

async function startBookPasses(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将对库内已消化的文档补跑书级汇总（全书概要/设定索引/人物册/伏笔台账），产出的卡进「待审提议」。已跑过的文档自动跳过；大书的「全书概要」需要多次 AI 调用，建议先跑「分层补标」让设定索引有材可取。',
      '书级汇总',
      { type: 'info', confirmButtonText: '开始汇总', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.bookPassesRun(props.kbId)
    if (!res.success) {
      ElMessage.error(res.error || '书级汇总启动失败')
      return
    }
    bookPassesRunning.value = true
    startBookPassesPoll()
  } catch (e) {
    ElMessage.error(`书级汇总启动失败: ${(e as Error).message}`)
  }
}

// ===== 视角遍（lens 卡管理与启用；G1 结构视角） =====
interface LensRow {
  id: string
  title: string
  description: string
  status: string
  version: number
  lensAttention: string | null
}
/** 预设视角卡（纯数据，保存后才入库；勾选启用并保存设置后随消化生效） */
const LENS_PRESETS = [
  {
    title: '章节功能与叙事结构视角',
    description: '看全书结构如何由章节功能搭建、节奏如何起伏、线索如何交织时使用。',
    attendTo: [
      '章末钩子（悬念句/断点及其指向）',
      '场景与视角切换（换线/换 POV 的位置与频率）',
      '铺垫与回收（本章埋设或兑现了什么）',
      '节奏节拍（压抑-释放的循环位置）',
      '本章功能位（开局钩子/铺垫/推进/转折/高潮/过渡）',
    ],
    questions: [
      '这一章在全书结构中承担什么功能？依据是本章哪些文本特征？',
      '章末是否留钩、钩向哪里（事件/悬念/情绪）？',
      '本章是否切换叙事线或视角？切换点在哪？',
      '本章埋设或回收了哪些前文/后文的呼应？',
    ],
  },
  {
    title: '伏笔与回收视角',
    description: '看承诺与兑现：哪些异物/异常/悬置被埋设、在哪里兑现、哪些从未兑现。',
    attendTo: ['反复出现却未解释的异物', '人物的微异常行为', '提前出场的高规格威胁', '章末悬置句'],
    questions: ['这个承诺在第几章兑现？', '埋设与回收的间隔拉出了多大张力？', '哪些承诺从未兑现（悬空伏笔）？'],
  },
]
const lensList = ref<LensRow[]>([])
const lensPresetPick = ref('')
const lensEditorOpen = ref(false)
const lensEditorBusy = ref(false)
const lensForm = ref<{ id?: string; title: string; description: string; attendTo: string; questions: string }>({
  title: '',
  description: '',
  attendTo: '',
  questions: '',
})

async function fetchLenses(): Promise<void> {
  if (!props.kbId) return
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.listLens(props.kbId)
    if (res.success && res.data) lensList.value = res.data as LensRow[]
  } catch (e) {
    console.warn('[BrainPanel] 视角卡加载失败', e)
  }
}

/** 启停只改草稿，随「保存」统一生效（与提取目标同动线） */
function onLensToggle(lens: LensRow, checked: unknown): void {
  const id = lens.id
  const arr = configDraft.value.lenses.enabledLensNoteIds
  const i = arr.indexOf(id)
  if (checked && i < 0) arr.push(id)
  if (!checked && i >= 0) arr.splice(i, 1)
}

function openLensEditor(lens: LensRow | null): void {
  if (lens) {
    let att: { attendTo?: string[]; questions?: string[] } = {}
    try {
      att = JSON.parse(lens.lensAttention ?? '{}')
    } catch {
      /* 旧数据缺字段按空处理 */
    }
    lensForm.value = {
      id: lens.id,
      title: lens.title,
      description: lens.description,
      attendTo: (att.attendTo ?? []).join('\n'),
      questions: (att.questions ?? []).join('\n'),
    }
  } else {
    lensForm.value = { title: '', description: '', attendTo: '', questions: '' }
  }
  lensEditorOpen.value = true
}

function addLensFromPreset(title: string): void {
  const preset = LENS_PRESETS.find((p) => p.title === title)
  if (!preset) return
  lensForm.value = {
    title: preset.title,
    description: preset.description,
    attendTo: preset.attendTo.join('\n'),
    questions: preset.questions.join('\n'),
  }
  lensPresetPick.value = ''
  lensEditorOpen.value = true
}

async function saveLens(): Promise<void> {
  if (!lensForm.value.title.trim()) {
    ElMessage.warning('请填写视角名称')
    return
  }
  lensEditorBusy.value = true
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.upsertLens({
      kbId: props.kbId,
      id: lensForm.value.id,
      title: lensForm.value.title.trim(),
      description: lensForm.value.description.trim(),
      attendTo: lensForm.value.attendTo.split('\n').map((s) => s.trim()).filter(Boolean),
      questions: lensForm.value.questions.split('\n').map((s) => s.trim()).filter(Boolean),
    })
    if (res.success && res.data) {
      const row = res.data as LensRow
      // 新建视角默认勾选启用（草稿态，随设置保存生效）
      if (!lensForm.value.id && !configDraft.value.lenses.enabledLensNoteIds.includes(row.id)) {
        configDraft.value.lenses.enabledLensNoteIds.push(row.id)
      }
      lensEditorOpen.value = false
      ElMessage.success('视角卡已保存；勾选启用并保存设置后随消化生效')
      await fetchLenses()
    } else {
      ElMessage.error(res.error || '保存失败')
    }
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    lensEditorBusy.value = false
  }
}

// ===== 伏笔扫描（G3：sets-up 边候选生成器，verified=0 待人审） =====
interface ForeshadowProgress {
  running: boolean
  last?: {
    ok: boolean
    error?: string
    scannedDocs: number
    linksProposed: number
    created: number
    deduped: number
    finishedAt: string
  }
}
const foreshadowRunning = ref(false)
const foreshadowProgress = ref<ForeshadowProgress | null>(null)
const foreshadowSummary = ref<{ linksProposed: number; created: number } | null>(null)
let foreshadowPollTimer: ReturnType<typeof setInterval> | null = null

function startForeshadowPoll(): void {
  if (foreshadowPollTimer) return
  foreshadowPollTimer = setInterval(pollForeshadow, 5000)
  void pollForeshadow()
}

async function pollForeshadow(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  const kbAtCall = props.kbId // 代际守卫：切库后丢弃过期响应
  try {
    const res = await client.foreshadowStatus(props.kbId)
    if (kbAtCall !== props.kbId) return
    if (res.success && res.data) {
      const wasRunning = foreshadowRunning.value
      foreshadowProgress.value = res.data
      foreshadowRunning.value = !!res.data.running
      if (wasRunning && !foreshadowRunning.value) {
        const last = res.data.last
        if (last?.ok) {
          foreshadowSummary.value = { linksProposed: last.linksProposed, created: last.created }
          ElMessage.success(`伏笔扫描完成：提案 ${last.linksProposed} 条，新增 ${last.created} 条伏笔边（待人工确认）`)
        } else {
          ElMessage.error(`伏笔扫描失败: ${last?.error || '未知错误'}`)
        }
        await refresh()
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (!foreshadowRunning.value && foreshadowPollTimer) {
    clearInterval(foreshadowPollTimer)
    foreshadowPollTimer = null
  }
}

async function startForeshadow(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将用 AI 逐书判读「悬而未决」论断与同书后文论断的埋设-回收关系，生成伏笔边候选（待人工确认，不自动生效）。会产生 LLM 调用费用。',
      '伏笔扫描',
      { type: 'info', confirmButtonText: '开始扫描', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.foreshadowRun(props.kbId)
    if (!res.success) {
      ElMessage.error(res.error || '扫描启动失败')
      return
    }
    foreshadowRunning.value = true
    startForeshadowPoll()
  } catch (e) {
    ElMessage.error(`扫描启动失败: ${(e as Error).message}`)
  }
}

// ===== 论断归纳整理 =====
interface ConsolidateProgress {
  running: boolean
  totalBatches: number
  processedBatches: number
  mergedGroups: number
  supersededAtoms: number
  failedBatches: number
  lastError?: string
}
const consolidateRunning = ref(false)
const consolidateProgress = ref<ConsolidateProgress | null>(null)
const consolidateSummary = ref<{ mergedGroups: number; supersededAtoms: number } | null>(null)
let consolidatePollTimer: ReturnType<typeof setInterval> | null = null
const consolidatePct = computed(() => {
  const p = consolidateProgress.value
  if (!p || p.totalBatches === 0) return 0
  return Math.min(100, Math.round((p.processedBatches / p.totalBatches) * 100))
})

// ===== 维护工具收纳（五个深度整理动作共用一个下拉入口 + 统一进度/结果展示） =====
interface ReadingProgress {
  running: boolean
  batchesDone: number
  batchesTotal: number
  memoryChars: number
  docsTotal?: number
  lastError?: string
}
const readingRunning = ref(false)
const readingProgress = ref<ReadingProgress | null>(null)
const readingSummary = ref<string>('')
let readingPollTimer: ReturnType<typeof setInterval> | null = null

async function pollReading(): Promise<void> {
  const resp = await window.electronAPI.knowledgeBase.brain.readingStatus(props.kbId)
  const d = (resp?.data ?? resp) as ReadingProgress | undefined
  readingProgress.value = d ?? null
  readingRunning.value = !!d?.running
  if (!d?.running) {
    if (readingPollTimer) {
      clearInterval(readingPollTimer)
      readingPollTimer = null
    }
    if (d && d.batchesTotal > 0) {
      readingSummary.value = `上次全书精读：${d.batchesDone}/${d.batchesTotal} 批，工作记忆 ${d.memoryChars} 字${d.lastError ? `（部分失败：${d.lastError}）` : ''}`
    }
  }
}

function startReadingPoll(): void {
  if (readingPollTimer) return
  readingPollTimer = setInterval(() => void pollReading(), 5000)
}

async function startReading(): Promise<void> {
  const resp = await window.electronAPI.knowledgeBase.brain.readingRun(props.kbId)
  const payload = (resp?.data ?? resp) as { success?: boolean; error?: string; queued?: boolean } | undefined
  if (payload && payload.success === false) {
    ElMessage.warning(payload.error ?? '无法启动全书精读')
    return
  }
  readingRunning.value = true
  startReadingPoll()
  void pollReading()
}

onBeforeUnmount(() => {
  if (readingPollTimer) clearInterval(readingPollTimer)
})

const maintBusy = computed(
  () =>
    readingRunning.value ||
    consolidateRunning.value ||
    cleanupRunning.value ||
    foreshadowRunning.value ||
    relabelRunning.value ||
    bookPassesRunning.value
)
const activeMaint = computed(() => {
  if (readingRunning.value)
    return {
      name: '全书精读',
      pct: readingProgress.value && readingProgress.value.batchesTotal > 0
        ? Math.min(100, Math.round((readingProgress.value.batchesDone / readingProgress.value.batchesTotal) * 100))
        : 5,
      text: `精读中… 批次 ${readingProgress.value?.batchesDone ?? 0}/${readingProgress.value?.batchesTotal ?? 0}，工作记忆 ${readingProgress.value?.memoryChars ?? 0} 字`,
    }
  if (consolidateRunning.value)
    return {
      name: '归纳整理',
      pct: consolidatePct.value,
      text: `归纳中… 批次 ${consolidateProgress.value?.processedBatches ?? 0}/${consolidateProgress.value?.totalBatches ?? 0}，已合并 ${consolidateProgress.value?.mergedGroups ?? 0} 组`,
    }
  if (cleanupRunning.value)
    return {
      name: '垃圾清理',
      pct: cleanupPct.value,
      text: `清理中… 批次 ${cleanupProgress.value?.processedBatches ?? 0}/${cleanupProgress.value?.totalBatches ?? 0}，已归档 ${cleanupProgress.value?.archivedCount ?? 0} 条`,
    }
  if (relabelRunning.value)
    return {
      name: '分层补标',
      pct: relabelPct.value,
      text: `分层补标中… 批次 ${relabelProgress.value?.processedBatches ?? 0}/${relabelProgress.value?.totalBatches ?? 0}，已重标 ${relabelProgress.value?.relabeledCount ?? 0} 条`,
    }
  if (bookPassesRunning.value)
    return {
      name: '书级汇总',
      pct: 100,
      text: `书级汇总中… 文档 ${bookPassesProgress.value?.processedDocs ?? 0}/${bookPassesProgress.value?.totalDocs ?? 0}，产出的卡进「待审提议」`,
    }
  if (foreshadowRunning.value)
    return { name: '伏笔扫描', pct: 100, text: '扫描中… 逐书判读悬念与后文论断的「埋设-回收」关系' }
  return null
})
const maintSummaries = computed(() => {
  const out: string[] = []
  if (readingSummary.value) out.push(readingSummary.value)
  if (relabelSummary.value !== null) out.push(`上次分层补标：重标 ${relabelSummary.value} 条论断的知识分层`)
  if (bookPassesSummary.value !== null)
    out.push(`上次书级汇总：处理 ${bookPassesSummary.value} 份文档${bookPassesLastError.value ? `（部分失败：${bookPassesLastError.value}）` : ''}`)
  if (consolidateSummary.value)
    out.push(`上次归纳：合并 ${consolidateSummary.value.mergedGroups} 组，归档 ${consolidateSummary.value.supersededAtoms} 条`)
  if (cleanupSummary.value !== null) out.push(`上次清理：归档 ${cleanupSummary.value} 条垃圾论断`)
  if (foreshadowSummary.value)
    out.push(`上次伏笔扫描：提案 ${foreshadowSummary.value.linksProposed} 条伏笔边，新增 ${foreshadowSummary.value.created} 条`)
  return out
})

// ===== P2/P3：知识图谱 + 终审复核 + 全书综述 =====
interface GraphNodeVo {
  id: string
  name: string
  entityType: string
}
interface GraphEdgeVo {
  id: string
  source: string
  target: string
  relation: string
  label: string
  evidence: string
}
const graphOpen = ref(false)
const graphLoading = ref(false)
const graphNodes = ref<ForceGraphNode[]>([])
const graphEdges = ref<ForceGraphEdge[]>([])
const graphBuildBusy = ref(false)
const reviewBusy = ref(false)
const summaryBusy = ref(false)
const ENTITY_TYPE_COLORS: Record<string, string> = {
  character: '#409eff',
  organization: '#e6a23c',
  location: '#67c23a',
  item: '#f56c6c',
  concept: '#909399',
}

async function openGraphView(): Promise<void> {
  graphOpen.value = true
  graphLoading.value = true
  try {
    const resp = await window.electronAPI.knowledgeBase.brain.graphData({ kbId: props.kbId })
    const d = (resp?.data ?? resp) as { nodes: GraphNodeVo[]; edges: GraphEdgeVo[] } | undefined
    const nodes = d?.nodes ?? []
    const edges = d?.edges ?? []
    graphNodes.value = nodes.map(n => ({
      id: n.id,
      name: n.name,
      color: ENTITY_TYPE_COLORS[n.entityType] ?? '#909399',
      radius: 6,
    }))
    graphEdges.value = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      title: e.label,
    }))
    if (nodes.length === 0) ElMessage.info('图谱为空——先运行「全书精读」')
  } catch (e) {
    ElMessage.error(`图谱加载失败: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    graphLoading.value = false
  }
}

async function startGraphBuild(): Promise<void> {
  const resp = await window.electronAPI.knowledgeBase.brain.graphBuildRun({ kbId: props.kbId, documentId: firstDocId() })
  const payload = (resp?.data ?? resp) as { success?: boolean; error?: string } | undefined
  if (payload && payload.success === false) {
    ElMessage.warning(payload.error ?? '无法启动图谱构建')
    return
  }
  graphBuildBusy.value = true
  ElMessage.info('图谱构建中——从工作记忆抽取实体关系（约一分钟）')
  setTimeout(async () => {
    graphBuildBusy.value = false
    await openGraphView()
  }, 60000)
}

function firstDocId(): string {
  return allDocs.value[0]?.id ?? ''
}

async function startReview(): Promise<void> {
  const doc = allDocs.value[0]
  if (!doc) {
    ElMessage.warning('知识库没有文档')
    return
  }
  reviewBusy.value = true
  try {
    const resp = await window.electronAPI.knowledgeBase.brain.reviewRun({
      kbId: props.kbId,
      documentId: doc.id,
      docName: doc.name,
    })
    const payload = (resp?.data ?? resp) as { success?: boolean; error?: string } | undefined
    if (payload && payload.success === false) ElMessage.warning(payload.error ?? '无法启动复核')
    else ElMessage.success('终审复核已排队——完成后复核报告入库（约几分钟）')
  } finally {
    reviewBusy.value = false
  }
}

async function startSummary(): Promise<void> {
  const doc = allDocs.value[0]
  if (!doc) {
    ElMessage.warning('知识库没有文档')
    return
  }
  summaryBusy.value = true
  try {
    const resp = await window.electronAPI.knowledgeBase.brain.summaryRun({
      kbId: props.kbId,
      documentId: doc.id,
      docName: doc.name,
    })
    const payload = (resp?.data ?? resp) as { success?: boolean; error?: string } | undefined
    if (payload && payload.success === false) ElMessage.warning(payload.error ?? '无法生成综述')
    else ElMessage.success('综述已排队——完成后《全书综述》入库，在「经验卡」视图查看')
  } finally {
    summaryBusy.value = false
  }
}

function onMaintCommand(cmd: string | number | object): void {
  const key = String(cmd)
  if (key === 'reading') void startReading()
  else if (key === 'viewGraph') void openGraphView()
  else if (key === 'graphBuild') void startGraphBuild()
  else if (key === 'review') void startReview()
  else if (key === 'summary') void startSummary()
  else if (key === 'consolidate') void startConsolidate()
  else if (key === 'cleanup') void startCleanup()
  else if (key === 'foreshadow') void startForeshadow()
  else if (key === 'relabel') void startRelabel()
  else if (key === 'bookPasses') void startBookPasses()
}

// ===== 提取目标 =====
const presetGroups = KB_BRAIN_GOAL_PRESETS
const presetPick = ref('')
const enabledGoals = computed(() => (config.value?.goals ?? []).filter((g) => g.enabled))
const runningGoalIds = ref<string[]>([])
const lastGoalResults = ref<Record<string, { ok: boolean; error?: string; proposed?: boolean; skippedDuplicate?: boolean; cardTitle?: string | null; fragments?: number; cards?: number }>>({})
let goalPollTimer: ReturnType<typeof setInterval> | null = null

// 顶部统计块的高亮态：与主区视图联动
const statActive = computed(() => {
  if (activeView.value === 'cards') return 'cards'
  if (activeView.value === 'proposals') return 'proposals'
  if (atomFilter.value === 'human') return 'human'
  if (atomFilter.value === 'open-question') return 'open'
  return 'total'
})

const atomsEmptyText = computed(() => {
  if (!enabled.value) return '大脑未启用，打开顶部开关后上传文档自动消化'
  if (atomFilter.value === 'human') return '暂无我的观感——点击右上角「记观感」写下你自己的判断'
  if (atomFilter.value === 'opinions') return '暂无 AI 观点类论断（claim/insight 随消化产出）'
  if (atomFilter.value === 'open-question') return '暂无悬而未决的问题'
  if (atomFilter.value === 'foreshadow') return '没有未回收的伏笔——先在「论断整理」跑伏笔扫描，或悬念都已回收'
  return '尚未消化出论断（上传文档后自动进行）'
})

/** 文档名展示缩短：去扩展名与括注噪音，全名在 tooltip */
function shortDocName(name: string): string {
  const s = name.replace(/\.[a-z0-9]+$/i, '').replace(/[（(【[][^）)】\]]*[）)】\]]/g, '').trim()
  return s || name
}

const knowledgeBrowser = ref<InstanceType<typeof KnowledgeBrowser> | null>(null)
function showKnowledge(): void {
  activeView.value = 'knowledge'
  void knowledgeBrowser.value?.reload()
}

function showAtoms(filter: AtomFilter): void {
  activeView.value = 'atoms'
  if (atomFilter.value !== filter) {
    atomFilter.value = filter
    atomPage.value = 1
    void fetchAtoms()
  }
}

function showCards(): void {
  activeView.value = 'cards'
  notesPage.value = 1
  void fetchNotes()
}

function showProposals(): void {
  activeView.value = 'proposals'
  inboxPage.value = 1
  selectedProposalIds.value = []
  void fetchProposals()
}

function onAtomFilterChange(): void {
  atomPage.value = 1
  void fetchAtoms()
}

function addGoalFromPreset(val: string): void {
  const [group, name] = val.split('|')
  const preset = presetGroups.find((g) => g.group === group)?.goals.find((p) => p.name === name)
  if (!preset) return
  configDraft.value.goals.push({ id: genGoalId(), name: preset.name, hint: preset.hint, enabled: true })
  presetPick.value = ''
}

function addCustomGoal(): void {
  configDraft.value.goals.push({ id: genGoalId(), name: '新目标', hint: '要提取什么经验、如何组织成卡', enabled: true })
}

function genGoalId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

async function runGoal(g: BrainGoal): Promise<void> {
  if (runningGoalIds.value.includes(g.id)) return
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.goalRun({ kbId: props.kbId, goalId: g.id })
    if (!res.success) {
      ElMessage.error(res.error || '提炼启动失败')
      return
    }
    runningGoalIds.value = [...runningGoalIds.value, g.id]
    ElMessage.info(`「${g.name}」提炼已开始，完成后出现在待审提议`)
    startGoalPoll()
  } catch (e) {
    ElMessage.error(`提炼启动失败: ${(e as Error).message}`)
  }
}

function startGoalPoll(): void {
  if (goalPollTimer) return
  goalPollTimer = setInterval(pollGoalStatus, 8000)
  void pollGoalStatus()
}

async function pollGoalStatus(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.goalStatus(props.kbId)
    if (res.success && res.data) {
      const prev = [...runningGoalIds.value]
      runningGoalIds.value = res.data.running as string[]
      lastGoalResults.value = res.data.last ?? {}
      // 刚完成的：报结果
      for (const id of prev) {
        if (!runningGoalIds.value.includes(id)) reportGoalDone(id)
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (runningGoalIds.value.length === 0 && goalPollTimer) {
    clearInterval(goalPollTimer)
    goalPollTimer = null
  }
}

function reportGoalDone(goalId: string): void {
  const rec = lastGoalResults.value[goalId]
  const name = config.value?.goals.find((g) => g.id === goalId)?.name ?? goalId
  if (!rec) return
  const openProposals = (): void => showProposals()
  if (!rec.ok) {
    ElMessage.error(`「${name}」提炼失败: ${rec.error || '未知错误'}`)
  } else if (rec.skippedDuplicate) {
    ElNotification({ title: `「${name}」已有同题经验卡`, message: '未重复生成，可在「经验卡」视图查看已有卡', type: 'info', duration: 0 })
  } else if (rec.proposed) {
    // 常驻通知（自动关闭会被忽略导致"找不到产物"——真机反馈），点击直达待审提议
    ElNotification({
      title: `「${name}」提炼完成`,
      message: `生成 ${rec.cards ?? 1} 张经验卡（素材 ${rec.fragments ?? 0} 条），已放入「待审提议」——点击查看并批准入库`,
      type: 'success',
      duration: 0,
      onClick: openProposals,
    })
    openProposals()
  } else {
    ElNotification({
      title: `「${name}」提炼完成但没有产出`,
      message: `收集到素材 ${rec.fragments ?? 0} 条，未达到成卡条件（素材不足或质量不够）——可先「提取知识」积累论断后再试`,
      type: 'warning',
      duration: 0,
    })
  }
  void refresh()
}

onBeforeUnmount(() => {
  if (goalPollTimer) clearInterval(goalPollTimer)
  goalPollTimer = null
  if (consolidatePollTimer) clearInterval(consolidatePollTimer)
  consolidatePollTimer = null
  if (cleanupPollTimer) clearInterval(cleanupPollTimer)
  cleanupPollTimer = null
  if (foreshadowPollTimer) clearInterval(foreshadowPollTimer)
  foreshadowPollTimer = null
  if (relabelPollTimer) clearInterval(relabelPollTimer)
  relabelPollTimer = null
  if (bookPassesPollTimer) clearInterval(bookPassesPollTimer)
  bookPassesPollTimer = null
})

/** 卡片来源目标名：tags 里的 `goal-name:<名>` 标记（老卡无标记回退空，显示类型标签兜底） */
function goalNameOf(n: BrainNote): string {
  if (!n.tags) return ''
  try {
    const arr = JSON.parse(n.tags) as unknown[]
    const t = arr.find((x) => typeof x === 'string' && x.startsWith('goal-name:')) as string | undefined
    return t ? t.slice('goal-name:'.length) : ''
  } catch {
    return ''
  }
}

function statusTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  switch (status) {
    case 'supported':
      return 'success'
    case 'proposed':
    case 'suspected':
      return 'warning'
    case 'stale':
    case 'superseded':
    case 'archived':
      return 'info'
    default:
      return 'info'
  }
}

/** 跨页连续序号：第 N 页从 (N-1)*pageSize+1 起编 */
function atomIndex(index: number): number {
  return (atomPage.value - 1) * atomPageSize.value + index + 1
}

async function fetchAtoms(): Promise<void> {
  if (!props.kbId) return
  const gen = ++atomsGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.listAtoms({
      kbId: props.kbId,
      page: atomPage.value,
      pageSize: atomPageSize.value,
      origin: atomFilter.value === 'human' ? 'human' : undefined,
      type: atomFilter.value === 'open-question' ? 'open-question' : undefined,
      types: atomFilter.value === 'opinions' ? ['claim', 'insight'] : undefined,
      foreshadow: atomFilter.value === 'foreshadow' ? 'dangling' : undefined,
      documentId: atomDocFilter.value || undefined,
      layer: atomLayerFilter.value || undefined,
    })
    if (gen !== atomsGen) return // 过期响应丢弃
    if (res.success && res.data) {
      atoms.value = res.data.rows as BrainAtom[]
      atomTotal.value = res.data.total
      // 父组件页签徽标语义是库内论断总数——过滤视图（我的观感/悬而未决）不上报子集数
      if (atomFilter.value === 'all') emit('stats', res.data.total)
      // 数据收缩后当前页可能越界（重消化/清理后论断变少）：回退到有效末页重取
      const maxPage = Math.max(1, Math.ceil(atomTotal.value / atomPageSize.value))
      if (atomPage.value > maxPage) {
        atomPage.value = maxPage
        void fetchAtoms()
      }
    }
  } catch (e) {
    console.warn('[BrainPanel] 论断列表加载失败', e)
  }
}

async function fetchNotes(): Promise<void> {
  if (!props.kbId) return
  const gen = ++notesGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.listNotes({ kbId: props.kbId, status: 'published', page: notesPage.value, pageSize: notesPageSize })
    if (gen !== notesGen) return // 过期响应丢弃
    if (res.success && res.data) {
      notes.value = res.data.rows as BrainNote[]
      notesTotal.value = res.data.total
    }
  } catch (e) {
    console.warn('[BrainPanel] 经验卡加载失败', e)
  }
}

async function fetchProposals(): Promise<void> {
  if (!props.kbId) return
  const gen = ++inboxGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.proposalInbox({ kbId: props.kbId, page: inboxPage.value, pageSize: inboxPageSize })
    if (gen !== inboxGen) return // 过期响应丢弃
    if (res.success && res.data) {
      proposals.value = res.data.rows as BrainNote[]
      proposalTotal.value = res.data.total
      // 审批掉末页最后一条后页码越界：回退重取
      const maxPage = Math.max(1, Math.ceil(proposalTotal.value / inboxPageSize))
      if (inboxPage.value > maxPage) {
        inboxPage.value = maxPage
        void fetchProposals()
      }
    }
  } catch (e) {
    console.warn('[BrainPanel] 待审提议加载失败', e)
  }
}

async function handleAtomPageChange(page: number): Promise<void> {
  atomPage.value = page
  await fetchAtoms()
}

async function handleAtomPageSizeChange(size: number): Promise<void> {
  atomPageSize.value = size
  atomPage.value = 1
  await fetchAtoms()
}

async function handleNotesPageChange(page: number): Promise<void> {
  notesPage.value = page
  await fetchNotes()
}

async function handleInboxPageChange(page: number): Promise<void> {
  inboxPage.value = page
  selectedProposalIds.value = []
  await fetchProposals()
}

// ===== 批量审批 =====
const selectedProposalIds = ref<string[]>([])
/** 待审卡正文展开态：预览默认钳在 130px——2500 字的卡只看得见开头，审批时需要展开读全文 */
const expandedProposals = ref<Set<string>>(new Set())

function toggleProposalExpand(id: string): void {
  const next = new Set(expandedProposals.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedProposals.value = next
}
const batchBusy = ref(false)
const allProposalsSelected = computed(
  () => proposals.value.length > 0 && selectedProposalIds.value.length === proposals.value.length,
)

function toggleSelectAll(): void {
  selectedProposalIds.value = allProposalsSelected.value ? [] : proposals.value.map((p) => p.id)
}

async function batchDecide(action: 'publish' | 'reject'): Promise<void> {
  const ids = [...selectedProposalIds.value]
  if (ids.length === 0) return
  batchBusy.value = true
  let ok = 0
  const failed: string[] = []
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    for (const id of ids) {
      try {
        const res = await client.decideProposal({ noteId: id, action })
        if (res?.success) ok++
        else failed.push(id)
      } catch {
        failed.push(id)
      }
    }
    if (failed.length === 0) {
      ElMessage.success(`已${action === 'publish' ? '批准入库' : '拒绝'} ${ok} 张卡片`)
    } else {
      ElMessage.warning(`成功 ${ok} 张，失败 ${failed.length} 张`)
    }
    selectedProposalIds.value = []
  } finally {
    batchBusy.value = false
  }
  await refresh()
  if (activeView.value === 'cards') void fetchNotes()
}

async function refresh(): Promise<void> {
  if (!props.kbId) return
  const gen = ++requestGen
  const client = (window as any).electronAPI.knowledgeBase.brain
  // 全书精读状态恢复（后台跑着的批次进度/上次结果）
  void pollReading().then(() => {
    if (readingRunning.value) startReadingPoll()
  })
  try {
    const [cfgRes, statsRes, , , docRes] = await Promise.all([
      client.getConfig(props.kbId),
      client.stats(props.kbId),
      fetchAtoms(),
      fetchProposals(),
      client.docStatus(props.kbId),
    ])
    if (gen !== requestGen) return // 过期响应丢弃
    if (cfgRes.success && cfgRes.data) {
      config.value = cfgRes.data.config
      enabled.value = !!cfgRes.data.config?.enabled
      // 抽屉打开期间不覆写草稿：用户可能正在编辑未保存的设置
      if (cfgRes.data.config && !configOpen.value) {
        configDraft.value = JSON.parse(JSON.stringify(cfgRes.data.config))
      }
    }
    if (statsRes.success) stats.value = statsRes.data
    // 自动化日志（v2 P4：时间线 + 撤销；失败静默）
    void fetchAutoLogs()
    // 待提取文档：已处理完成但大脑未消化的（开脑前上传的存量）
    if (docRes.success && docRes.data) {
      allDocs.value = (docRes.data as Array<{ id: string; name: string }>).map((d) => ({ id: d.id, name: d.name }))
      pendingDigestDocs.value = (docRes.data as Array<{ id: string; name: string; brainStatus: string | null }>)
        .filter((d) => d.brainStatus !== 'digested' && d.brainStatus !== 'digesting')
        .map((d) => ({ id: d.id, name: d.name }))
    }
  } catch (e) {
    console.warn('[BrainPanel] 刷新失败', e)
  }
  // 模型列表单独拉（通道缺失/失败不拖垮面板主数据）
  try {
    const modelsRes = await client.listModels()
    if (modelsRes.success && modelsRes.data) modelOptions.value = modelsRes.data
  } catch {
    /* 旧宿主无此通道：下拉为空但不影响其他功能 */
  }
  // 提炼中的目标状态同步（面板重开后恢复 busy）
  try {
    const gsRes = await client.goalStatus(props.kbId)
    if (gsRes.success && gsRes.data) {
      runningGoalIds.value = gsRes.data.running as string[]
      lastGoalResults.value = gsRes.data.last ?? {}
      if (runningGoalIds.value.length > 0) startGoalPoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
  // 清理进行中状态同步
  try {
    const clRes = await client.cleanupStatus(props.kbId)
    if (clRes.success && clRes.data) {
      cleanupProgress.value = clRes.data
      if (clRes.data.archivedCount > 0) cleanupSummary.value = clRes.data.archivedCount
      cleanupRunning.value = !!clRes.data.running
      if (cleanupRunning.value) startCleanupPoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
  // 归纳进行中状态同步（面板重开后恢复进度条）
  try {
    const csRes = await client.consolidateStatus(props.kbId)
    if (csRes.success && csRes.data) {
      consolidateProgress.value = csRes.data
      consolidateSummary.value = csRes.data.mergedGroups > 0 ? { mergedGroups: csRes.data.mergedGroups, supersededAtoms: csRes.data.supersededAtoms } : null
      consolidateRunning.value = !!csRes.data.running
      if (consolidateRunning.value) startConsolidatePoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
  // 分层补标进行中状态同步（面板重开后恢复进度条）
  try {
    const rlRes = await client.layerRelabelStatus(props.kbId)
    if (rlRes.success && rlRes.data) {
      relabelProgress.value = rlRes.data
      if (rlRes.data.relabeledCount > 0) relabelSummary.value = rlRes.data.relabeledCount
      relabelRunning.value = !!rlRes.data.running
      if (relabelRunning.value) startRelabelPoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
  // 书级汇总进行中状态同步（面板重开后恢复进度条）
  try {
    const bpRes = await client.bookPassesStatus(props.kbId)
    if (bpRes.success && bpRes.data) {
      bookPassesProgress.value = bpRes.data
      if (bpRes.data.processedDocs > 0) bookPassesSummary.value = bpRes.data.processedDocs
      bookPassesRunning.value = !!bpRes.data.running
      if (bookPassesRunning.value) startBookPassesPoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
  // 视角卡列表（G1；通道缺失不拖垮面板主数据）
  try {
    await fetchLenses()
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
  // 伏笔扫描进行中状态同步（G3）
  try {
    const fsRes = await client.foreshadowStatus(props.kbId)
    if (fsRes.success && fsRes.data) {
      foreshadowProgress.value = fsRes.data
      const fsLast = fsRes.data.last
      if (!fsRes.data.running && fsLast?.ok && fsLast.created > 0) {
        foreshadowSummary.value = { linksProposed: fsLast.linksProposed, created: fsLast.created }
      }
      foreshadowRunning.value = !!fsRes.data.running
      if (foreshadowRunning.value) startForeshadowPoll()
    }
  } catch {
    /* 旧宿主无此通道：忽略 */
  }
}

function openConfig(): void {
  if (config.value) configDraft.value = JSON.parse(JSON.stringify(config.value))
  // 旧配置无 profile/digestion.bookPasses/automation 段时补缺省（v-model 需要可写路径）
  if (!configDraft.value.profile) configDraft.value.profile = { contentType: '' }
  if (!configDraft.value.digestion) configDraft.value.digestion = { enabled: true, bookPasses: true }
  if (!configDraft.value.automation) configDraft.value.automation = { enabled: true }
  configOpen.value = true
}

/** 头部总开关：立即落库（部分 patch 只动 enabled），失败回滚 */
async function toggleEnabled(): Promise<void> {
  const next = enabled.value
  if (!props.kbId) {
    enabled.value = !next
    return
  }
  enabling.value = true
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.updateConfig({ kbId: props.kbId, patch: { enabled: next } })
    if (res.success) {
      config.value = res.data
      enabled.value = !!res.data?.enabled
      configDraft.value = JSON.parse(JSON.stringify(res.data))
    } else {
      enabled.value = !next
      ElMessage.error(`操作失败: ${res.error || '未知错误'}`)
    }
  } catch (e) {
    enabled.value = !next
    ElMessage.error(`操作失败: ${(e as Error).message}`)
  } finally {
    enabling.value = false
  }
}

function discardConfig(): void {
  if (config.value) configDraft.value = JSON.parse(JSON.stringify(config.value))
  configOpen.value = false
}

async function saveConfig(): Promise<void> {
  saving.value = true
  try {
    const draft = JSON.parse(JSON.stringify(configDraft.value)) as BrainConfig
    // 数字输入被清空时 el-input-number 会置 null——回退到已有值，避免校验失败打断保存
    if (draft.autoApproveThreshold == null) {
      draft.autoApproveThreshold = config.value?.autoApproveThreshold ?? 0.8
    }
    if (draft.dailyCostLimit == null) {
      draft.dailyCostLimit = 0
    }
    const res = await (window as any).electronAPI.knowledgeBase.brain.updateConfig({
      kbId: props.kbId,
      patch: draft,
    })
    if (res.success) {
      config.value = res.data
      enabled.value = !!res.data?.enabled
      configDraft.value = JSON.parse(JSON.stringify(res.data))
      ElMessage.success('大脑设置已保存')
      configOpen.value = false
    } else {
      ElMessage.error(`保存失败: ${res.error || '未知错误'}`)
    }
  } catch (e) {
    // ajv 校验失败（如手输越界阈值）响亮可见
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    saving.value = false
  }
}

async function decide(noteId: string, action: 'publish' | 'reject'): Promise<void> {
  await (window as any).electronAPI.knowledgeBase.brain.decideProposal({ noteId, action })
  selectedProposalIds.value = selectedProposalIds.value.filter((id) => id !== noteId)
  await refresh()
  // 审批的是当前浏览的经验卡列表之外的数据时，卡片视图也跟着刷新
  if (activeView.value === 'cards') void fetchNotes()
}

async function digestOne(d: DigestDoc): Promise<void> {
  d.busy = true
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.digestDocument(d.id)
    if (res?.success) ElMessage.success(`「${d.name}」已加入提取队列`)
    else ElMessage.error(`提取失败: ${res?.error || '未知错误'}`)
  } catch (e) {
    ElMessage.error(`提取失败: ${(e as Error).message}`)
  } finally {
    d.busy = false
  }
  await refresh()
}

async function digestAll(): Promise<void> {
  digestAllBusy.value = true
  const failed: string[] = []
  try {
    for (const d of pendingDigestDocs.value) {
      d.busy = true
      try {
        const res = await (window as any).electronAPI.knowledgeBase.brain.digestDocument(d.id)
        if (!res?.success) failed.push(d.name)
      } catch {
        failed.push(d.name)
      } finally {
        d.busy = false
      }
    }
    // 单个失败不放弃剩余文档；结束时如实汇报
    if (failed.length === 0) ElMessage.success('全部文档已加入提取队列')
    else ElMessage.warning(`已入队 ${pendingDigestDocs.value.length - failed.length} 个，失败 ${failed.length} 个：${failed.join('、')}`)
  } finally {
    digestAllBusy.value = false
  }
  await refresh()
}

// ===== 记观感 =====
function openRemark(): void {
  remarkText.value = ''
  remarkDocId.value = ''
  remarkQuote.value = ''
  remarkOpen.value = true
}

async function saveRemark(): Promise<void> {
  const text = remarkText.value.trim()
  if (!text) {
    ElMessage.warning('观感内容不能为空')
    return
  }
  remarkBusy.value = true
  try {
    const res = await (window as any).electronAPI.knowledgeBase.brain.captureReading({
      kbId: props.kbId,
      documentId: remarkDocId.value || '',
      quote: remarkQuote.value.trim(),
      remark: text,
    })
    if (res?.success) {
      ElMessage.success('观感已记录，在「我的观感」中查看')
      remarkOpen.value = false
      atomFilter.value = 'human'
      atomPage.value = 1
      activeView.value = 'atoms'
      await refresh()
    } else {
      ElMessage.error(`保存失败: ${res?.error || '未知错误'}`)
    }
  } catch (e) {
    ElMessage.error(`保存失败: ${(e as Error).message}`)
  } finally {
    remarkBusy.value = false
  }
}

// ===== 论断归纳整理 =====
function startConsolidatePoll(): void {
  if (consolidatePollTimer) return
  consolidatePollTimer = setInterval(pollConsolidate, 5000)
  void pollConsolidate()
}

async function pollConsolidate(): Promise<void> {
  const client = (window as any).electronAPI.knowledgeBase.brain
  const kbAtCall = props.kbId // 代际守卫：切库后丢弃旧库的过期轮询响应
  try {
    const res = await client.consolidateStatus(props.kbId)
    if (kbAtCall !== props.kbId) return
    if (res.success && res.data) {
      const wasRunning = consolidateRunning.value
      consolidateProgress.value = res.data
      consolidateRunning.value = !!res.data.running
      // 刚跑完：报结果 + 刷新列表（合并出的新论断 / 归档的碎片）
      if (wasRunning && !consolidateRunning.value) {
        if (res.data.lastError && res.data.mergedGroups === 0) {
          // 顶层失败（如全批失败/库异常）：零产出不得报成功
          ElMessage.error(`归纳失败: ${res.data.lastError}`)
        } else if (res.data.failedBatches > 0) {
          ElMessage.warning(`归纳完成，但 ${res.data.failedBatches} 批失败：${res.data.lastError || '未知错误'}`)
          consolidateSummary.value = { mergedGroups: res.data.mergedGroups, supersededAtoms: res.data.supersededAtoms }
        } else {
          ElMessage.success(`归纳完成：合并 ${res.data.mergedGroups} 组，归档 ${res.data.supersededAtoms} 条碎片`)
          consolidateSummary.value = { mergedGroups: res.data.mergedGroups, supersededAtoms: res.data.supersededAtoms }
        }
        await refresh()
      }
    }
  } catch {
    /* 轮询失败静默，下轮再试 */
  }
  if (!consolidateRunning.value && consolidatePollTimer) {
    clearInterval(consolidatePollTimer)
    consolidatePollTimer = null
  }
}

async function startConsolidate(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将用 AI 分批审读库内论断，把同主题碎片合并为综合论断，被合并的原论断归档（列表默认不再显示）。会产生 LLM 调用费用。',
      '论断归纳整理',
      { type: 'warning', confirmButtonText: '开始归纳', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  const client = (window as any).electronAPI.knowledgeBase.brain
  try {
    const res = await client.consolidateRun(props.kbId)
    if (!res.success) {
      ElMessage.error(res.error || '归纳启动失败')
      return
    }
    consolidateRunning.value = true
    startConsolidatePoll()
  } catch (e) {
    ElMessage.error(`归纳启动失败: ${(e as Error).message}`)
  }
}

watch(
  () => props.kbId,
  () => {
    atomPage.value = 1 // 换库回到第一页
    atomFilter.value = 'all'
    atomDocFilter.value = ''
    selectedProposalIds.value = [] // 跨库选中是幽灵操作：decideProposal 只按 noteId，不清会误审别库的卡
    activeView.value = 'knowledge'
    inboxPage.value = 1
    notesPage.value = 1
    // 清掉上一库的行，避免切库瞬间闪现旧数据
    atoms.value = []
    atomTotal.value = 0
    notes.value = []
    notesTotal.value = 0
    proposals.value = []
    proposalTotal.value = 0
    void refresh()
  },
  { immediate: true },
)
defineExpose({ refresh })
</script>

<style scoped>
.brain-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 顶部状态条 ===== */
.bp-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}
.bp-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.bp-name {
  font-size: 15px;
  font-weight: 600;
}
.bp-stats {
  display: flex;
  align-items: stretch;
  margin-left: auto;
}
.bp-stat {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  padding: 2px 12px;
  border-left: 1px solid var(--el-border-color-lighter);
  line-height: 1.3;
}
.bp-stat:first-child {
  border-left: none;
}
.bp-stat b {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.bp-stat span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.bp-stat:hover b,
.bp-stat:hover span {
  color: var(--el-color-primary);
}
.bp-stat.active b,
.bp-stat.active span {
  color: var(--el-color-primary);
}

/* ===== 主体双栏 ===== */
.bp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}
.bp-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.bp-side {
  width: 320px;
  flex: none;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 4px;
}

.bp-main-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.bp-main-title {
  font-size: 14px;
  font-weight: 600;
}
.bp-main-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 论断三段式：表格区弹性伸展内部滚动，分页栏固定底部 */
.atoms-table-region {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background-color: var(--el-bg-color);
}
.atoms-pagination-bar {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
}
.stmt {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.doc-src {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.muted {
  opacity: 0.5;
}

/* ===== 卡片视图（经验卡 / 待审提议） ===== */
.cards-region {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 2px;
}
.note-card {
  flex: none;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  padding: 12px;
}
.n-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.p-check {
  flex: none;
  height: auto;
  margin-right: -4px;
}
.proposal-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.n-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}
.n-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.55;
  margin-top: 4px;
}
.n-body {
  font-family: inherit;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--el-text-color-primary);
}
.n-body.preview {
  max-height: 130px;
  overflow: hidden;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
  cursor: pointer;
}
.n-body.preview.expanded {
  max-height: none;
}
.p-expand-hint {
  font-size: 12px;
  color: var(--el-color-primary);
  cursor: pointer;
  margin-top: 4px;
  user-select: none;
}
.n-body-collapse {
  border-top: 1px dashed var(--el-border-color-lighter);
  margin-top: 8px;
}
.n-body-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  height: 32px;
  line-height: 32px;
  border-bottom: none;
}
.n-body-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
.n-body-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 4px;
}

/* ===== 右侧行动栏 ===== */
.side-card {
  flex: none;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  padding: 12px;
}
.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.side-title {
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.side-count {
  font-size: 11px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 8px;
  padding: 0 7px;
  line-height: 16px;
}
.side-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 12px 0;
}
.side-tip {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.goal-run {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
}
.goal-run:hover {
  background: var(--el-fill-color-light);
}
.goal-run-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.goal-run-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.goal-run-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proposal {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px;
}
.proposal + .proposal {
  margin-top: 8px;
}
.p-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}
.p-meta {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.p-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  margin: 4px 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.p-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.doc-run {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
}
.doc-run + .doc-run {
  border-top: 1px solid var(--el-border-color-extra-light);
}
.doc-run-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 设置抽屉 ===== */
.cfg-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
/* 设置抽屉标签页内取消 cfg-body 的大间距，改由 tab pane 分隔 */
.cfg-body .el-tabs__content {
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
.cfg-advanced {
  margin-top: 4px;
  border-top: 1px dashed var(--el-border-color-lighter);
  border-bottom: none;
}
.cfg-section h4 {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 600;
}
.cfg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
}
.cfg-row + .cfg-row {
  border-top: 1px solid var(--el-border-color-extra-light);
}
.cfg-label {
  font-size: 13px;
  display: block;
}
.cfg-desc {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.cfg-goals-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.goal-edit {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.goal-edit + .goal-edit {
  margin-top: 8px;
}
.goal-edit-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cfg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ===== 论断详情 ===== */
.ad-stmt {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  margin-bottom: 10px;
}
.ad-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.ad-row {
  display: flex;
  gap: 12px;
  padding: 7px 0;
  border-top: 1px solid var(--el-border-color-extra-light);
  font-size: 12px;
  line-height: 1.6;
}
.ad-label {
  flex: none;
  width: 64px;
  color: var(--el-text-color-secondary);
}
.ad-value {
  min-width: 0;
  word-break: break-all;
  white-space: pre-wrap;
}
.ad-quote {
  color: var(--el-text-color-primary);
}

/* ===== 记观感对话框 ===== */
.rf-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}
.rf-req {
  color: var(--el-color-danger);
}

/* ===== 大脑体检对话框 ===== */
.hz-section {
  margin-bottom: 14px;
}
.hz-section h5 {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.hz-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  line-height: 1.6;
}
.hz-suggestions {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
}
</style>
