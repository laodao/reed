<template>
  <div class="domain-learning-space">
    <!-- 顶部：空间元信息 -->
    <div class="space-header">
      <el-button text :icon="ArrowLeft" @click="goBack">主题列表</el-button>
      <div class="space-title">
        <h2>{{ spaceName }}</h2>
        <!-- 学习前置 / 推荐书籍收进标题旁图标（2026-10-05 用户口径：不再占整条横幅，悬停看内容） -->
        <el-tooltip
          v-if="spacePrereqs.length"
          placement="bottom"
          :show-after="200"
          popper-class="dl-title-tip"
        >
          <template #content>
            <div class="dl-tip-block">
              <div class="dl-tip-title">学习前置（进这个领域前需要会什么）</div>
              <div v-for="p in spacePrereqs" :key="p.name" class="dl-tip-line">
                <div class="dl-tip-head">
                  <span class="dl-tip-name">{{ p.name }}</span>
                  <span class="dl-tip-flag" :class="{ external: !p.inSpace }">
                    {{ p.inSpace ? '空间内会教' : '需自备' }}
                  </span>
                </div>
                <div v-if="prereqTip(p)" class="dl-tip-desc">{{ prereqTip(p) }}</div>
              </div>
            </div>
          </template>
          <el-icon class="title-tip-icon"><Guide /></el-icon>
        </el-tooltip>
        <el-tooltip
          v-if="bookSuggestions.length"
          placement="bottom"
          :show-after="200"
          popper-class="dl-title-tip"
        >
          <template #content>
            <div class="dl-tip-block">
              <div class="dl-tip-title">推荐书籍（获取后上传绑定知识库，研究可直接引用）</div>
              <div v-for="b in bookSuggestions" :key="b.title" class="dl-tip-line">
                <div class="dl-tip-head">
                  <span class="dl-tip-name">{{ b.title }}</span>
                  <span v-if="b.author" class="dl-tip-flag">{{ b.author }}</span>
                  <span class="dl-tip-flag" :class="b.priority ?? 'recommended'">
                    {{ bookPriorityLabel(b.priority) }}
                  </span>
                </div>
                <div v-if="b.why" class="dl-tip-desc">{{ b.why }}</div>
              </div>
              <div class="dl-tip-hint">点击图标 → 去知识库上传书籍资料</div>
            </div>
          </template>
          <el-icon class="title-tip-icon clickable" @click="goKbUpload"><Reading /></el-icon>
        </el-tooltip>
      </div>
      <div class="space-progress">
        <span class="progress-text">{{ progressText }}</span>
        <el-progress :percentage="masteryPercent" :stroke-width="8" :show-text="false" style="width: 160px" />
      </div>
      <el-button plain :icon="Setting" @click="settingsVisible = true">空间设置</el-button>
      <el-button type="primary" plain :icon="Share" @click="openAtlas">知识全景</el-button>
      <el-button type="primary" :icon="Promotion" :loading="pickingNext" @click="continueLearning">
        继续学习 →
      </el-button>
    </div>

    <!-- Agent 活动行（2026-09-13：起步研究/研究此概念这类长任务，滚动显示系统正在做什么）。
         空主题的起步态改在起步卡片内、按钮下方显示（用户需求：反馈要贴着触发点），
         这里让位避免同一轮出现两份活动行。
         2026-09-14 追加：选中的概念没有讲义时（中栏是「生成中/研究此概念」空态），
         活动行改在空态里、「研究此概念」按钮下方居中显示，这里同样让位。 -->
    <AgentActivityStrip v-if="spaceId && !isEmptySpace && !currentConceptNoCard" :space-id="spaceId" />

    <!-- 知识体系方案（固定流程入口：待确认时有高亮提示，确认后才生成知识点） -->
    <div v-if="planHint" class="plan-bar" :class="{ pending: planHint.pending }">
      <span class="plan-bar-text">{{ planHint.text }}</span>
      <el-button link type="primary" size="small" @click="openPlan">查看方案</el-button>
    </div>

    <!-- 知识体系方案确认弹窗（2026-09-13 用户需求：对齐诉求 → 确认体系 → 才生成） -->
    <PlanConfirmDialog
      v-if="spaceId"
      v-model="planVisible"
      :space-id="spaceId"
      :mode="planDriveMode"
      :concept-id="null"
      @done="onPlanDriven"
    />

    <!-- 讲义方案确认弹窗（2026-09-14 讲义流水线：先规划规格与区级计划 → 确认 → 再逐区精写） -->
    <LessonPlanDialog
      v-if="spaceId && currentConceptId"
      v-model="lessonPlanVisible"
      :space-id="spaceId"
      :concept-id="currentConceptId"
      :concept-name="currentConcept?.name"
      mode="research"
      @done="onLessonPlanDriven"
    />

    <!-- 知识点拆分方案确认弹窗（2026-10-06：复杂知识点 agent 提案拆分 → 确认即执行） -->
    <ConceptSplitDialog
      v-if="spaceId && currentConceptId"
      v-model="conceptSplitVisible"
      :space-id="spaceId"
      :concept-id="currentConceptId"
      :concept-name="currentConcept?.name"
      mode="research"
      @done="onConceptSplitDriven"
    />

    <!-- 手工追加知识点（2026-09-12：用户补全知识体系；前置直连为已确认边） -->
    <el-dialog v-model="createConceptVisible" title="追加知识点" width="520px" append-to-body>
      <div class="cc-form">
        <div class="cc-row">
          <span class="cc-label">名称</span>
          <el-input v-model="conceptDraft.name" size="small" placeholder="如：导数与链式法则" maxlength="60" />
        </div>
        <div class="cc-row">
          <span class="cc-label">类型</span>
          <el-select v-model="conceptDraft.nodeType" size="small" style="width: 200px">
            <el-option
              v-for="t in creatableNodeTypes"
              :key="t"
              :label="nodeTypeMeta(t).label"
              :value="t"
            />
          </el-select>
        </div>
        <div class="cc-row">
          <span class="cc-label">所属分支</span>
          <el-select
            v-model="conceptDraft.parentId"
            size="small"
            clearable
            placeholder="不选=根层"
            style="width: 260px"
          >
            <el-option v-for="g in groupOptions" :key="g.id" :label="g.label" :value="g.id" />
          </el-select>
        </div>
        <div class="cc-row">
          <span class="cc-label">一句话定义</span>
          <el-input
            v-model="conceptDraft.definitionShort"
            type="textarea"
            :rows="2"
            size="small"
            placeholder="选填：地图悬停显示"
            maxlength="200"
          />
        </div>
        <div class="cc-row">
          <span class="cc-label">前置知识点</span>
          <el-select
            v-model="conceptDraft.prerequisites"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            size="small"
            placeholder="学它之前必须先掌握什么（可多选，也可直接输入新名字）"
            style="width: 100%"
          >
            <el-option v-for="c in prereqOptions" :key="c.id" :label="c.name" :value="c.name" />
          </el-select>
        </div>
        <div class="cc-hint">
          前置会自动落成「已确认」的学习顺序边（你选的就是你确认的）；若某个前置还选不到，
          先用「AI 补全」把它建出来，或直接回车输入名字——它会记为"待补前置"，AI 下次会补上。
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="createConceptVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="creatingConcept" @click="submitCreateConcept">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 前置知识点手动创建（2026-10-05 用户口径：系统没有该前置且**用户想系统学它**时才创建，
         主题/分类必须由用户显式选择，系统不代做决定；已会的前置不用创建，chip 悬浮「＋」仅是入口）。 -->
    <el-dialog v-model="prereqCreateVisible" title="创建前置知识点" width="520px" append-to-body>
      <div class="cc-form">
        <div class="cc-row">
          <span class="cc-label">名称</span>
          <el-input v-model="prereqCreateDraft.name" size="small" placeholder="前置知识点名称" maxlength="60" />
        </div>
        <div class="cc-row">
          <span class="cc-label">主题</span>
          <el-select
            v-model="prereqCreateDraft.spaceId"
            size="small"
            filterable
            placeholder="必选：建到哪个主题下"
            style="width: 260px"
            @change="onPrereqSpaceChange"
          >
            <el-option v-for="s in spaceOptions" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </div>
        <div class="cc-row">
          <span class="cc-label">知识分类</span>
          <el-select
            v-model="prereqCreateDraft.parentId"
            size="small"
            :loading="loadingForeignGroups"
            placeholder="必选：归到该主题的哪个分类下"
            style="width: 260px"
          >
            <el-option v-for="g in prereqGroupOptions" :key="g.id" :label="g.label" :value="g.id" />
          </el-select>
        </div>
        <div class="cc-row">
          <span class="cc-label">一句话定义</span>
          <el-input
            v-model="prereqCreateDraft.definitionShort"
            type="textarea"
            :rows="2"
            size="small"
            placeholder="选填"
            maxlength="200"
          />
        </div>
        <div class="cc-hint">
          只在你想把这个前置补进系统、跟着学一遍时才创建：主题与分类都要自己选定（分类必选，不会默认落到根层）。
          选当前主题会同时把它连为「{{ currentConcept?.name ?? '当前知识点' }}」的前置；选其他主题只在该主题下落点、不建跨主题边。
          已经会了这个前置？直接关闭即可，不创建任何东西。
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="prereqCreateVisible = false">不用创建，关闭</el-button>
        <el-button size="small" type="primary" :loading="prereqCreating" @click="submitPrereqCreate">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 拆细知识点（2026-10-05 用户需求：庞杂的知识点拆成一层的子知识点）。
         原知识点就地转为分支目录（树位置不变）；前置边自动继承给每个子知识点；
         总览讲义/笔记/问答随拆分退役（数量在结果反馈里报告）。 -->
    <el-dialog v-model="splitVisible" title="拆细知识点" width="600px" append-to-body>
      <div class="cc-form">
        <div class="cc-row">
          <span class="cc-label">分支名称</span>
          <el-input v-model="splitDraft.branchName" size="small" maxlength="60" placeholder="原知识点将转为这个分支目录" />
        </div>
        <div class="cc-row">
          <span class="cc-label">子知识点</span>
          <div class="split-rows">
            <div v-for="(row, i) in splitDraft.rows" :key="i" class="split-row">
              <el-input
                v-model="row.name"
                size="small"
                maxlength="60"
                class="split-row-name"
                placeholder="子知识点名称"
              />
              <el-input
                v-model="row.definitionShort"
                size="small"
                maxlength="200"
                class="split-row-def"
                placeholder="一句话定义（选填）"
              />
              <el-button
                link
                type="danger"
                size="small"
                :disabled="splitDraft.rows.length <= 1"
                @click="removeSplitRow(i)"
              >删除</el-button>
            </div>
            <el-button link type="primary" size="small" :icon="Plus" @click="addSplitRow">加一个子知识点</el-button>
          </div>
        </div>
        <div class="cc-hint">
          拆分后「{{ currentConcept?.name ?? '' }}」就地转为分支目录，上面每个子知识点各是一张讲义（点进去「研究此概念」逐个生成，互不混讲）。
          <template v-if="splitInheritedPrereqNames.length">它们会自动继承本知识点的前置（{{ splitInheritedPrereqNames.join('、') }}）。</template>
          <template v-if="currentConcept?.card"> ⚠️ 本知识点现有的讲义会随拆分删除（子讲义会各自覆盖其内容）。</template>
          笔记与问答记录也会一并清掉，不可恢复。
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="splitVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="splitting" @click="submitSplitConcept">
          拆分
        </el-button>
      </template>
    </el-dialog>

    <div class="space-body">
      <!-- 左栏：知识地图（大纲树，可折叠/搜索/掌握度过滤/父级聚合） -->
      <aside class="pane pane-map">
        <div class="pane-title">
          <span>知识地图</span>
          <el-tooltip content="分支行显示子节点掌握度聚合；点击分支展开/收起；绿色=已理解 · 橙色=学习中 · 灰色=待学/待复习" placement="top">
            <el-icon><InfoFilled /></el-icon>
          </el-tooltip>
          <span class="pane-title-actions">
            <!-- 体系完整度（图标 + 分数徽标；悬停看缺口清单） -->
            <el-tooltip placement="bottom" :show-after="150" effect="light">
              <template #content>
                <div class="coverage-tip">
                  <div class="coverage-tip-head">{{ coverage.summary }}</div>
                  <div v-if="coverage.gaps.length" class="coverage-tip-list">
                    <div v-for="(g, i) in coverage.gaps" :key="i" class="coverage-tip-item" :class="g.severity">
                      [{{ g.severity === 'high' ? '优先' : '建议' }}] {{ g.message }}
                    </div>
                  </div>
                  <div v-else class="coverage-tip-ok">未发现结构性缺口 ✓</div>
                </div>
              </template>
              <span class="coverage-btn" :class="coverageLevel">
                <el-icon><DataAnalysis /></el-icon>
                <span class="coverage-score">{{ coverage.score }}</span>
              </span>
            </el-tooltip>
            <el-tooltip content="追加知识点：自己补一个（落库后出现在地图里，尚无讲义）" placement="top">
              <el-button
                link
                class="map-icon-btn"
                :icon="Plus"
                aria-label="追加知识点"
                @click="openCreateConcept"
              />
            </el-tooltip>
            <el-tooltip content="AI 补全：先检索知识库/联网取资料，再结合资料与模型知识规划整体体系（只补结构，不产讲义）" placement="top">
              <el-button
                link
                class="map-icon-btn"
                :icon="MagicStick"
                aria-label="AI 补全知识地图"
                :loading="completingMap"
                @click="completeMapWithAi"
              />
            </el-tooltip>
          </span>
        </div>
        <div class="map-legend">
          <span><i class="dot dot-mastered" />已理解</span>
          <span><i class="dot dot-learning" />学习中</span>
          <span><i class="dot dot-todo" />待学/复习</span>
        </div>

        <!-- 过滤条 -->
        <div class="map-filters">
          <el-input
            v-model="mapKeyword"
            size="small"
            clearable
            placeholder="搜索概念…"
            :prefix-icon="Search"
          />
          <el-select v-model="mapFilter" size="small" class="filter-select">
            <el-option label="全部" value="all" />
            <el-option label="待学" value="untouched" />
            <el-option label="学习中" value="learning" />
            <el-option label="已理解" value="mastered" />
            <el-option label="待复习" value="review" />
          </el-select>
        </div>

        <!-- 树形行（扁平渲染：展开集 + 层级缩进） -->
        <div v-loading="store.loadingView" class="tree-scroll">
          <template v-for="row in mapRows" :key="row.key">
            <!-- 分支/模块行 -->
            <div
              v-if="!row.isLeaf"
              class="tree-branch"
              :class="{ expanded: expandedBranches.has(row.node.id) }"
              :style="{ paddingLeft: 6 + row.depth * 14 + 'px' }"
              @click="toggleBranch(row.node.id)"
            >
              <el-icon class="branch-caret" :class="{ open: expandedBranches.has(row.node.id) }">
                <CaretRight />
              </el-icon>
              <span class="branch-name">{{ row.node.name }}</span>
              <span v-if="row.stats" class="branch-stats" :class="row.stats.mastered === row.stats.total && row.stats.total > 0 ? 'done' : ''">
                {{ row.stats.mastered }}/{{ row.stats.total }}
              </span>
            </div>
            <!-- 概念叶行（悬浮浮现删除图标；2026-10-05 用户需求：知识点可删除） -->
            <div
              v-else
              class="tree-leaf"
              :class="{ active: currentConceptId === row.concept?.id }"
              :style="{ paddingLeft: 10 + row.depth * 14 + 'px' }"
              @click="selectTreeLeaf(row.concept)"
            >
              <i class="dot" :class="masteryDotClass(leafMastery(row))" />
              <span class="leaf-name">{{ leafName(row) }}</span>
              <el-icon v-if="isMasteredRow(row)" class="leaf-check"><CircleCheckFilled /></el-icon>
              <el-icon
                class="leaf-del"
                :class="{ busy: deletingConceptId === row.concept?.id }"
                title="删除知识点"
                @click.stop="askDeleteConcept(row.concept)"
              ><Delete /></el-icon>
            </div>
          </template>
          <div v-if="!store.loadingView && mapRows.length === 0" class="tree-empty">
            {{ view ? '无匹配概念' : '暂无知识地图（可先建空间并研究领域）' }}
          </div>
        </div>

        <!-- 当前概念研究状态 -->
        <template v-if="currentConcept">
          <div class="pane-title pane-title-sub">
            <span>讲义状态</span>
          </div>
          <div class="research-status">
            <el-icon v-if="researching || currentConcept.researchState === 'researching'" class="is-loading"><Loading /></el-icon>
            <el-icon v-else-if="currentConcept.hasCard"><CircleCheckFilled /></el-icon>
            <el-icon v-else><Document /></el-icon>
            <span>{{ conceptResearchText }}</span>
          </div>
        </template>
      </aside>

      <!-- 中栏：当前讲义（知识点主序列：一概念一讲义） -->
      <section class="pane pane-lesson">
        <template v-if="currentConcept">
          <div class="lesson-head">
            <div class="lesson-top">
              <div class="lesson-title">
                <h3>{{ currentConcept.name }}</h3>
                <span class="lesson-en">{{ currentConcept.en || '' }}</span>
                <el-tag size="small" :type="masteryTagType(currentConcept.mastery)" effect="plain">
                  {{ masteryLabel(currentConcept.mastery) }}
                </el-tag>
              </div>
              <!-- 看懂反馈（icon + tooltip，置标题栏右侧） -->
              <div class="lesson-actions">
                <el-tooltip content="懂了（已理解，解锁后续知识点）" placement="bottom" :show-after="300">
                  <el-button
                    circle
                    size="small"
                    type="success"
                    plain
                    :disabled="!prereqReady || acking"
                    :icon="CircleCheckFilled"
                    @click="markMastered"
                  />
                </el-tooltip>
                <el-tooltip content="没懂，拆细一点（换讲法 / 拆成更小概念）" placement="bottom" :show-after="300">
                  <el-button
                    circle
                    size="small"
                    type="warning"
                    plain
                    :disabled="!prereqReady || acking"
                    :icon="QuestionFilled"
                    @click="markConfused"
                  />
                </el-tooltip>
                <!-- 拆细知识点（2026-10-05 用户需求）：内容太庞杂的知识点拆成一层的子知识点，
                     各自独立研究聚焦讲义；原知识点就地转为分支目录。有卡没卡都可用。 -->
                <el-tooltip content="拆细：把这个知识点拆成一层的子知识点（各讲各的，原知识点转为分支目录）" placement="bottom" :show-after="300">
                  <el-button
                    circle
                    size="small"
                    plain
                    aria-label="拆细知识点"
                    :disabled="splitting"
                    :icon="Scissor"
                    @click="openSplitConcept"
                  />
                </el-tooltip>
                <el-tooltip v-if="currentConcept.card" content="讲义生成演示（在线浏览）" placement="bottom" :show-after="300">
                  <el-button circle size="small" plain :icon="Promotion" @click="slidesVisible = true" />
                </el-tooltip>
                <!-- 发布闭环（2026-09-09 复盘）：draft=AI 草稿待人工确认；确认后正式采用并计入统计。
                     2026-09-15 用户需求：标题栏右侧这几项一律压成图标（悬停看 tooltip），
                     腾出横向空间给讲义标题——原本靠文字承载的信息（发布版本号、待复核条数、
                     导出格式）分别挪进 tooltip / 角标，不许丢。 -->
                <template v-if="currentConcept.card">
                  <!-- 自动核验结果消费（M4-UX2 的 verification 从"只写不读"到可见） -->
                  <el-tooltip :content="verifyTip" placement="bottom" :show-after="300">
                    <!-- role=img + aria-label：文字撤掉后，读屏器与键盘用户仍拿得到状态 -->
                    <span
                      class="verify-chip"
                      :class="verifyTone"
                      role="img"
                      :aria-label="verifyLabel"
                      tabindex="0"
                    >
                      <el-icon :class="{ 'is-loading': verifyStatus === 'verifying' }">
                        <component :is="verifyIcon" />
                      </el-icon>
                      <span v-if="verifyIssues > 0" class="verify-count">{{ verifyIssues }}</span>
                    </span>
                  </el-tooltip>
                  <el-tooltip
                    v-if="currentConcept.card.status === 'draft'"
                    :content="publishTip"
                    placement="bottom"
                    :show-after="300"
                  >
                    <el-button
                      circle
                      size="small"
                      type="primary"
                      plain
                      aria-label="确认发布"
                      :loading="publishing"
                      :icon="Stamp"
                      @click="publishCurrentLesson"
                    />
                  </el-tooltip>
                  <el-tag v-else size="small" type="success" effect="plain">已发布 v{{ currentConcept.card.version }}</el-tag>
                  <!-- 讲义导出（2026-09-15：知识点正文 md / PDF / 长图） -->
                  <!-- 注意：command 事件带 (command, 组件实例, 事件)，处理函数只收第一个参数（见 onExportCommand） -->
                  <el-tooltip content="导出讲义（Markdown / PDF / 长图 PNG）" placement="bottom" :show-after="300">
                    <el-dropdown trigger="click" @command="onExportCommand">
                      <el-button
                        circle
                        size="small"
                        plain
                        aria-label="导出讲义"
                        :loading="exportingLesson"
                        :icon="Download"
                      />
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="md">Markdown</el-dropdown-item>
                          <el-dropdown-item command="pdf">PDF</el-dropdown-item>
                          <el-dropdown-item command="image">长图 PNG</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </el-tooltip>
                  <!-- 讲义版本历史（2026-09-15：查看/预览/恢复到草稿） -->
                  <el-tooltip content="版本历史（预览 / 导出 / 恢复）" placement="bottom" :show-after="300">
                    <el-button
                      circle
                      size="small"
                      plain
                      aria-label="版本历史"
                      :icon="Clock"
                      @click="openVersionHistory"
                    />
                  </el-tooltip>
                </template>
                <!-- 2026-10-05：标题栏右侧只保留成功类短提示；warn（研究报错等）可能是
                     长文本，截断在 240px 的 toast 里看不全——挪到标题行下方全宽横幅 -->
                <span v-if="lastFeedback && !lastFeedbackIsWarn" class="feedback-toast">{{ lastFeedback }}</span>
              </div>
            </div>
            <!-- 警告/错误反馈横幅（全宽可换行，完整展示研究失败原因等长文本；点击关闭） -->
            <div v-if="lastFeedback && lastFeedbackIsWarn" class="lesson-feedback-bar" role="alert" @click="dismissFeedback">
              <el-icon><WarningFilled /></el-icon>
              <span class="lfb-text">{{ lastFeedback }}</span>
              <el-icon class="lfb-close"><Close /></el-icon>
            </div>
            <!-- 前置依赖就绪条（依赖拓扑门控：先学完前置再学本概念）。
                 2026-10-05 用户需求：chip 即跳转链接（系统已有该知识点 → 点击跳过去先学）；
                 系统还没有的（已声明未落点）悬停浮现「＋」，点击弹窗选主题/分类创建。 -->
            <div v-if="prereqs.length || declaredOnlyPrereqs.length" class="lesson-prereq">
              <span class="prereq-label">前置：</span>
              <el-tooltip
                v-for="p in prereqs"
                :key="p.id"
                :content="p.ready ? `已掌握 · 点击跳到「${p.name}」` : `未掌握 · 点击跳到「${p.name}」先学它`"
                placement="top"
                :show-after="200"
              >
                <span
                  class="prereq-chip clickable"
                  :class="p.ready ? 'ready' : 'pending'"
                  role="link"
                  tabindex="0"
                  @click="gotoRelatedConcept(p.id)"
                  @keydown.enter="gotoRelatedConcept(p.id)"
                >
                  {{ p.name }}
                  <el-icon v-if="p.ready"><CircleCheckFilled /></el-icon>
                  <el-icon v-else><Lock /></el-icon>
                </span>
              </el-tooltip>
              <!-- 声明了但尚未建关系边的前置（2026-09-12：生成知识点时声明的顺序）。
                   判定优先级：本空间已有 → 跳转；其他主题有同名 → 跨主题跳转；都没有 → 悬停＋创建 -->
              <el-tooltip
                v-for="d in declaredOnlyPrereqs"
                :key="`declared-${d.name}`"
                placement="top"
                :show-after="200"
              >
                <template #content>
                  <div class="prereq-tip-block">
                    <template v-if="d.conceptId">已声明的前置（尚未建立关系边，暂未门控）；点击跳转</template>
                    <template v-else-if="remoteHitOf(d.name)">
                      <div>系统已有该知识点（主题「{{ remoteHitOf(d.name)!.spaceName }}」{{ remoteHitsOf(d.name).length > 1 ? `等 ${remoteHitsOf(d.name).length} 处` : '' }}）</div>
                      <div>点击跳转过去先学它</div>
                    </template>
                    <template v-else-if="remoteHitKnown(d.name)">
                      <div>系统还没有该知识点——已经会了就不用管</div>
                      <div>想系统学它，再点右侧 ＋ 选主题与分类手动创建</div>
                    </template>
                    <template v-else>正在检索系统是否已有该知识点…</template>
                  </div>
                </template>
                <span
                  class="prereq-chip declared"
                  :class="{ clickable: !!d.conceptId || !!remoteHitOf(d.name) }"
                  @click="onDeclaredPrereqClick(d)"
                >
                  {{ d.name }}
                  <el-icon v-if="d.conceptId"><InfoFilled /></el-icon>
                  <el-icon v-else-if="remoteHitOf(d.name)" class="prereq-jump-icon"><Link /></el-icon>
                  <el-icon v-else-if="remoteHitKnown(d.name)" class="prereq-add-icon" title="创建该知识点" @click.stop="openPrereqCreate(d.name)"><Plus /></el-icon>
                  <el-icon v-else class="is-loading"><Loading /></el-icon>
                </span>
              </el-tooltip>
              <span v-if="!prereqReady" class="prereq-tip">先掌握带锁的前置概念再来学它</span>
            </div>
          </div>

          <!-- 已发布/草稿讲义（DlCardView） -->
          <div v-if="currentConcept.card" ref="lessonBodyRef" class="lesson-body block-body-pad" @mouseup="onLessonMouseUp">
            <!-- 拆分方案（agent 判断装不下时提案）：待确认时高亮——确认即执行，比讲义方案优先展示 -->
            <div v-if="conceptSplitHint?.pending" class="lesson-plan-bar pending">
              <span class="lpb-text">{{ conceptSplitHint.text }}</span>
              <el-button link type="primary" size="small" @click="openConceptSplit">查看拆分方案</el-button>
            </div>
            <!-- 讲义方案（讲义流水线 Plan 阶段）：待确认时高亮，已确认也可回看规格 -->
            <div v-if="lessonPlanHint" class="lesson-plan-bar" :class="{ pending: lessonPlanHint.pending }">
              <span class="lpb-text">{{ lessonPlanHint.text }}</span>
              <el-button link type="primary" size="small" @click="openLessonPlan">查看讲义方案</el-button>
            </div>
            <SectionLesson
              :card="currentConcept.card"
              :related="currentRelated"
              @not-understand="onSectionNotUnderstand"
              @goto-concept="gotoRelatedConcept"
              @rewrite-section="onSectionRewrite"
            />
          </div>
          <!-- 无讲义：提示 + 研究入口（dl:agent-send mode='research' 产出草稿卡片） -->
          <div v-else class="lesson-body empty-body">
            <!-- 拆分方案（agent 判断装不下时提案）：待确认时高亮 -->
            <div v-if="conceptSplitHint?.pending" class="lesson-plan-bar pending in-empty">
              <span class="lpb-text">{{ conceptSplitHint.text }}</span>
              <el-button link type="primary" size="small" @click="openConceptSplit">查看拆分方案</el-button>
            </div>
            <!-- 已有讲义方案（正文还没写）：先确认方案，再逐区精写 -->
            <div v-if="lessonPlanHint" class="lesson-plan-bar pending in-empty">
              <span class="lpb-text">{{ lessonPlanHint.text }}</span>
              <el-button link type="primary" size="small" @click="openLessonPlan">查看讲义方案</el-button>
            </div>
            <el-empty description="本概念讲义生成中">
              <el-button
                type="primary"
                :icon="Promotion"
                :loading="researching"
                @click="researchConcept"
              >
                研究此概念
              </el-button>
            </el-empty>
            <!-- 研究此概念 的 agent 执行过程（滚动小字）：贴着触发按钮下方居中显示，表示 agent 正在工作；
                 不再跑到页面顶部（顶部那只在普通讲义态显示）。行尾图标可弹窗看完整输出（2026-10-05） -->
            <AgentActivityStrip
              v-if="spaceId"
              :space-id="spaceId"
              class="research-activity"
              detail-title="研究输出详情"
              :result-text="researchResultText"
            />
          </div>
        </template>
        <template v-else>
          <!-- 空主题起步态：无任何知识点 → 空间级起步研究（生成首批概念/关系 + 首个讲义） -->
          <div v-if="view && isEmptySpace" class="lesson-body boot-body">
            <div class="boot-card">
              <div class="boot-icon"><el-icon><Promotion /></el-icon></div>
              <h3>开始学习「{{ spaceName }}」</h3>
              <p>这个主题还是空的。研究助手会先为整个领域建立首批核心知识点与学习顺序，并为最基础的概念生成第一份讲义。</p>
              <p class="boot-tip">
                资料源说明：研究优先检索已绑定的知识库，再考虑联网资料与模型先验；建议先在「知识全景 → 空间设置 → 关联知识库」绑定你的资料库。
              </p>
              <el-button type="primary" size="large" :icon="Promotion" :loading="researching" @click="bootResearch">
                {{ researching ? '正在研究领域…' : '生成首批知识' }}
              </el-button>
              <!-- 起步研究的 agent 执行过程（滚动小字）：贴着触发按钮显示，不再跑到页面顶部；
                   轮次结束不自动清空（persist），留「查看完整输出」图标可回看（2026-10-05） -->
              <AgentActivityStrip
                v-if="spaceId"
                :space-id="spaceId"
                class="boot-activity"
                detail-title="起步研究输出详情"
                :result-text="researchResultText"
                persist-on-done
              />
              <div v-if="bootMessage" class="boot-message" :class="{ warn: bootWarn }">{{ bootMessage }}</div>
            </div>
          </div>
          <el-empty v-else-if="view" description="从左侧知识地图选择一个知识点开始学习" />
          <!-- 加载失败与加载中区分（2026-09-09 复盘：不再永久"加载中"） -->
          <el-empty v-else-if="viewError" :description="viewError">
            <el-button type="primary" @click="loadSpace">重试</el-button>
          </el-empty>
          <el-empty v-else description="正在加载学习空间…" />
        </template>
      </section>

      <!-- 右栏：追问答疑（tutor）/ 概念笔记（dl_note 浏览，M4-UX1 补全） -->
      <aside class="pane pane-qa">
        <div class="qa-head">
          <div class="head-tabs" role="tablist">
            <button
              class="head-tab"
              :class="{ active: rightPane === 'qa' }"
              @click="rightPane = 'qa'"
            >追问 · 答疑</button>
            <button
              class="head-tab"
              :class="{ active: rightPane === 'notes' }"
              @click="rightPane = 'notes'"
            >
              笔记<span v-if="noteCountOfCurrent > 0" class="head-tab-count">{{ noteCountOfCurrent }}</span>
            </button>
          </div>
          <div class="qa-head-right">
            <span v-if="rightPane === 'qa'" class="qa-badge">未解问题 {{ openQuestionCount }}</span>
            <span v-else class="qa-badge">当前概念 {{ noteCountOfCurrent }} 条</span>
          </div>
        </div>

        <!-- 答疑面板：历史 + 实时流式问答 -->
        <template v-if="rightPane === 'qa'">
          <div ref="qaListRef" class="qa-list">
            <div v-for="(t, i) in displayTurns" :key="i" class="qa-turn" :class="t.role">
              <div class="qa-bubble">
                <!-- 回答：渲染 markdown（公式/表格/图/代码），可切「源码」核对原文；提问保持纯文本 -->
                <QaAnswerView
                  v-if="t.role === 'assistant'"
                  :md="t.text"
                  :streaming="isTurnStreaming(i, t)"
                />
                <div v-else class="qa-text-user">{{ t.text || '…' }}</div>
                <div v-if="isTurnStreaming(i, t)" class="qa-streaming">
                  <el-icon class="is-loading"><Loading /></el-icon>正在组织回答…
                </div>
                <div v-if="t.sourceLabel && !tutorStreaming" class="qa-source">
                  <el-icon><Position /></el-icon>{{ t.sourceLabel }}
                </div>
                <div v-if="t.suggestsResearch" class="qa-research">
                  <el-icon><Promotion /></el-icon>已登记为新研究方向
                </div>
                <!-- 好回答可收藏为笔记（qna → dl_note；再次点击取消收藏） -->
                <div
                  v-if="t.role === 'assistant' && t.questionId && !tutorStreaming && t.text"
                  class="qa-fav"
                >
                  <el-button
                    link
                    size="small"
                    :type="favOfTurn(t.questionId) ? '' : 'success'"
                    :icon="favOfTurn(t.questionId) ? StarFilled : Star"
                    @click="toggleFavTurn(t)"
                  >{{ favOfTurn(t.questionId) ? '已收藏' : '收藏为笔记' }}</el-button>
                </div>
              </div>
            </div>
            <div v-if="displayTurns.length === 0" class="qa-empty">
              {{ view ? '还没有追问记录——读完讲义后在这里提问。' : '答疑历史加载中…' }}
            </div>
          </div>
          <!-- task 会话执行进度（动作流水；默认折叠为一行，展开滚动查看，M6-3 阶段二/四） -->
          <div v-if="taskLog.length" class="task-log" :class="{ open: taskLogOpen }">
            <button class="task-log-head" @click="taskLogOpen = !taskLogOpen">
              <span class="task-log-title">任务执行</span>
              <span class="task-log-summary">{{ taskLogSummary }}</span>
              <span class="task-log-toggle">{{ taskLogOpen ? '▾ 收起' : '▸ 展开' }}</span>
            </button>
            <div v-if="taskLogOpen" class="task-log-list">
              <span
                v-for="(a, i) in taskLog"
                :key="i"
                class="task-action"
                :class="a.tool === 'dl_task_progress' ? 'progress-chip' : a.status"
                :title="a.tool === 'dl_task_progress' ? '任务子步骤进度' : a.message"
              >{{ taskChipText(a) }}</span>
            </div>
          </div>
          <div class="qa-input">
            <el-input
              v-model="draft"
              type="textarea"
              :rows="4"
              resize="none"
              placeholder="追问：还有哪里不懂？例如“为什么……”（Enter 发送）"
              :disabled="tutorStreaming"
              @keydown.enter.exact.prevent="ask($event)"
            />
            <div class="qa-send-row">
              <span class="qa-hint">{{ tutorStreaming ? 'AI 正在回答…' : '支持追问 · 换种讲法 · 拆细一点' }}</span>
              <el-button v-if="tutorStreaming" class="qa-stop" plain @click="stopAsk">停止</el-button>
              <el-button type="primary" :icon="Promotion" class="qa-send" :loading="tutorStreaming" @click="ask">
                {{ tutorStreaming ? '回答中' : '追问' }}
              </el-button>
            </div>
          </div>
        </template>

        <!-- 笔记面板：当前概念 / 空间全部（引文 + 正文；M7-B 空间级总览） -->
        <div v-else class="note-pane">
          <div class="note-scope-bar">
            <button class="scope-tab" :class="{ active: noteScope === 'concept' }" @click="noteScope = 'concept'">
              当前概念<span v-if="noteCountOfCurrent > 0" class="head-tab-count">{{ noteCountOfCurrent }}</span>
            </button>
            <button class="scope-tab" :class="{ active: noteScope === 'all' }" @click="noteScope = 'all'">
              全部笔记<span v-if="notesAllTotal > 0" class="head-tab-count">{{ notesAllTotal }}</span>
            </button>
          </div>

          <!-- 当前概念笔记 -->
          <template v-if="noteScope === 'concept'">
            <div class="note-list">
              <template v-if="currentConcept">
                <template v-if="sortedNotes.length > 0">
                  <div v-for="n in sortedNotes" :key="n.id" class="note-item">
                    <div class="note-item-head">
                      <el-tag size="small" effect="plain" :type="n.source === 'selection' ? 'primary' : 'success'">
                        {{ n.source === 'selection' ? '选区笔记' : '问答收藏' }}
                      </el-tag>
                      <span class="note-time">{{ fmtNoteTime(n.createdAt) }}</span>
                      <el-button
                        class="note-del"
                        link
                        type="danger"
                        size="small"
                        :loading="deletingNoteId === n.id"
                        @click="removeNoteItem(n)"
                      >删除</el-button>
                    </div>
                    <div v-if="n.anchorText" class="note-anchor-text">「{{ n.anchorText }}」</div>
                    <div v-if="n.contentMd" class="note-text">{{ n.contentMd }}</div>
                  </div>
                </template>
                <div v-else class="qa-empty">
                  当前知识点还没有笔记——在讲义上选中一段文字「做笔记」，或收藏答疑中的好回答。
                </div>
              </template>
              <div v-else class="qa-empty">先从左侧选择一个知识点，或切到「全部笔记」查看本空间笔记。</div>
            </div>
          </template>

          <!-- 空间全部笔记（跨概念总览：点击条目跳到所属概念） -->
          <template v-else>
            <div class="note-list">
              <template v-if="sortedNotesAll.length > 0">
                <div
                  v-for="n in sortedNotesAll"
                  :key="n.id"
                  class="note-item"
                  :class="{ clickable: !!noteConceptIdOf(n) }"
                  @click="gotoNoteConcept(n)"
                >
                  <div class="note-item-head">
                    <el-tag size="small" effect="plain" :type="n.source === 'selection' ? 'primary' : 'success'">
                      {{ n.source === 'selection' ? '选区笔记' : '问答收藏' }}
                    </el-tag>
                    <span class="note-concept">{{ noteConceptNameOf(n) }}</span>
                    <span class="note-time">{{ fmtNoteTime(n.createdAt) }}</span>
                    <el-button
                      class="note-del"
                      link
                      type="danger"
                      size="small"
                      :loading="deletingNoteId === n.id"
                      @click.stop="removeNoteItemAll(n)"
                    >删除</el-button>
                  </div>
                  <div v-if="n.anchorText" class="note-anchor-text">「{{ n.anchorText }}」</div>
                  <div v-if="n.contentMd" class="note-text">{{ n.contentMd }}</div>
                </div>
              </template>
              <div v-else class="qa-empty">
                还没有笔记——在讲义上选中文字「做笔记」、收藏答疑回答，都会汇总到这里跨概念回顾。
              </div>
            </div>
          </template>
        </div>
      </aside>

      <!-- 讲义选区浮层：提问 / 做笔记（M4-UX1） -->
      <div
        v-if="sel.show"
        class="sel-bar"
        :style="{ left: sel.x + 'px', top: sel.y + 'px' }"
      >
        <el-button size="small" type="primary" :icon="QuestionFilled" @click="askSelection">提问</el-button>
        <el-button size="small" :icon="Notebook" @click="openNoteSelection">做笔记</el-button>
      </div>

      <!-- 选区笔记编辑 -->
      <el-dialog v-model="noteDlg.visible" title="记笔记" width="460px" append-to-body>
        <div v-if="noteDlg.anchor" class="note-anchor">「{{ noteDlg.anchor }}」</div>
        <el-input v-model="noteText" type="textarea" :rows="5" placeholder="写下你的想法、疑问或总结……" />
        <template #footer>
          <el-button @click="noteDlg.visible = false">取消</el-button>
          <el-button type="primary" :loading="noteSaving" @click="saveSelectionNote">保存笔记</el-button>
        </template>
      </el-dialog>

      <!-- 讲义演示（M4-UX3：HTML 幻灯片在线浏览） -->
      <el-dialog v-model="slidesVisible" title="讲义演示" width="70%" top="3vh" destroy-on-close append-to-body>
        <div class="slides-holder">
          <LessonSlides
            v-if="currentConcept?.card"
            :title="currentConcept.name"
            :sub-title="`${currentConcept.nodeType} · ${currentConcept.mastery}${currentConcept.en ? ' · ' + currentConcept.en : ''}`"
            :sections="currentConcept.card.sections"
            :works="currentConcept.card.works ?? null"
          />
        </div>
      </el-dialog>

      <!-- 空间设置（M6：设置入口移到主题主界面；共享面板组件，打开时按空间加载） -->
      <el-dialog v-model="settingsVisible" title="空间设置" width="900px" append-to-body :close-on-click-modal="false">
        <SpaceSettingsPanel v-if="settingsVisible" :space-id="spaceId" @applied="settingsVisible = false" />
      </el-dialog>

      <!-- 讲义版本历史抽屉（2026-09-15：查看/预览/恢复/导出指定版本） -->
      <el-drawer v-model="historyVisible" title="讲义版本历史" size="480px" append-to-body>
        <template #header>
          <div style="display: flex; align-items: center; gap: 8px">
            <span>讲义版本历史</span>
            <el-tag v-if="currentConcept" size="small" type="info">{{ currentConcept.name }}</el-tag>
          </div>
        </template>
        <div v-if="!versions.length" style="color: #909399; padding: 20px 0; text-align: center">暂无历史版本</div>
        <div v-for="v in versions" :key="v.cardId" class="version-item">
          <div class="version-head">
            <span class="version-tag">v{{ v.version }}</span>
            <el-tag size="small" :type="v.status === 'published' ? 'success' : 'info'" effect="plain">{{ v.status === 'published' ? '已发布' : '草稿' }}</el-tag>
            <el-tag v-if="v.isCurrent" size="small" type="warning" effect="dark">当前</el-tag>
            <span class="version-time">{{ v.createdAt?.slice(0, 16).replace('T', ' ') }}</span>
          </div>
          <div v-if="v.revisionNote" class="version-note">{{ v.revisionNote }}</div>
          <div v-if="v.changeSource" class="version-source">来源：{{ v.changeSource }}</div>
          <div class="version-meta">
            {{ v.sectionsCount }} 区 · {{ v.worksCount }} 著作 · {{ v.evidenceCount }} 证据
            <template v-if="v.verifyStatus"> · 核验：{{ v.verifyStatus }}</template>
          </div>
          <div class="version-actions">
            <el-button size="small" text type="primary" @click="previewVersion(v)">预览</el-button>
            <el-button size="small" text type="primary" @click="exportVersion(v, 'md')">导出 MD</el-button>
            <el-button size="small" text type="primary" @click="exportVersion(v, 'pdf')">导出 PDF</el-button>
            <el-button
              v-if="!v.isCurrent"
              size="small"
              text
              type="warning"
              :loading="restoringCardId === v.cardId"
              @click="restoreVersion(v)"
            >恢复到草稿</el-button>
          </div>
        </div>
      </el-drawer>

      <!-- 版本预览对话框（markdown 源码，便于看"改了什么"） -->
      <el-dialog v-model="previewVisible" :title="`预览 v${previewVersionNo}`" width="720px" append-to-body>
        <pre style="max-height: 60vh; overflow: auto; white-space: pre-wrap; font-size: 13px; background: #f6f8fa; padding: 12px; border-radius: 6px">{{ previewMarkdown }}</pre>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 领域共学空间 —— 三栏学习空间页
 * @module views/domain-learning/DomainLearningSpace
 * @description 数据源 = dl:get-space-view（store.fetchSpaceView → DlSpaceView），
 *              后端聚合概念/关系/大纲树/追问历史/统计一次拉取。三栏：
 *              左概念地图（树 + 掌握度过滤）、中讲义（DlCardView，无卡可触发
 *              research Agent 研究）、右追问（tutor Agent：历史 view.turns +
 *              新问答实时流式拼 dl:generate，事件走 dl:agent 通道）。
 *              掌握度推进（懂了/没懂）、继续学习（dl:pick-next）均调后端。
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Share,
  InfoFilled,
  CircleCheckFilled,
  CaretRight,
  Search,
  Loading,
  Lock,
  Plus,
  DataAnalysis,
  MagicStick,
  QuestionFilled,
  Position,
  Promotion,
  Document,
  Notebook,
  Setting,
  Star,
  StarFilled,
  // 讲义动作行图标化（2026-09-15）：核验状态 / 确认发布 / 导出 / 版本历史
  WarningFilled,
  Download,
  Clock,
  Stamp,
  // 标题旁信息图标（2026-10-05）：学习前置 / 推荐书籍，悬停出内容
  Guide,
  Reading,
  // 警告横幅关闭按钮（2026-10-05：报错类反馈全宽横幅化）
  Close,
  // 前置 chip 跨主题跳转图标（2026-10-05：系统已有该知识点 → 跳转链接）
  Link,
  // 左栏叶行悬浮删除图标（2026-10-05：知识点可删除）
  Delete,
  // 拆细知识点（2026-10-05：庞杂知识点拆成一层的子知识点，原知识点转分支）
  Scissor,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { saveBlobAs, base64ToBlob } from '@/utils/file-saver'
import { useTabsStore } from '@/stores/tabs'
import { routeDlIntent } from '@shared/utils/domain-learning-intent'
import { dlMapCompletionMission } from '@shared/utils/domain-learning-mission'
import {
  useDomainLearningStore,
  type DlAgentUiEvent,
  type DlGenerateUiEvent,
} from '@/stores/domain-learning'
import {
  masteryDotClass,
  masteryLabel,
  masteryTagType,
  nodeTypeMeta,
  relLabel,
  tabTitleOf,
} from './domain-learning-ui'
import SectionLesson from './SectionLesson.vue'
import LessonSlides from './LessonSlides.vue'
import QaAnswerView from './QaAnswerView.vue'
import SpaceSettingsPanel from './SpaceSettingsPanel.vue'
import AgentActivityStrip from './AgentActivityStrip.vue'
import PlanConfirmDialog from './PlanConfirmDialog.vue'
import LessonPlanDialog from './LessonPlanDialog.vue'
import ConceptSplitDialog from './ConceptSplitDialog.vue'
import type {
  DlBookSuggestion,
  DlCardSection,
  DlChatTurn,
  DlConceptHit,
  DlConceptView,
  DlLessonExportFormat,
  DlMapCoverage,
  DlMastery,
  DlNote,
  DlRelationView,
  DlSpacePrereq,
  DlSpaceView,
  DlTreeNode,
} from '@shared/types/domain-learning.types'
import { DL_KNOWLEDGE_NODE_TYPES } from '@shared/types/domain-learning.types'
import { normalizeLessonCardId, parseLessonExportFormat } from '@shared/utils/domain-learning-lesson-export'

const route = useRoute()
const router = useRouter()
const tabsStore = useTabsStore()
const store = useDomainLearningStore()

// keep-alive 缓存按组件名匹配（与路由名一致）
defineOptions({ name: 'DomainLearningSpace' })

const spaceId = computed(() => String(route.params.id ?? ''))

// keep-alive 缓存按实例隔离（MainLayout :key=route.path）：记录本实例路径，
// 全局路由变化时不串改缓存实例的状态（deactivated 实例的 watch 仍会触发）
const ownPath = route.path

/** 当前空间聚合视图（store 缓存；路由变化时重拉） */
const view = computed<DlSpaceView | null>(() => store.currentSpaceView)
const concepts = computed<DlConceptView[]>(() => view.value?.concepts ?? [])
const relations = computed<DlRelationView[]>(() => view.value?.relations ?? [])
const treeRoots = computed<DlTreeNode[]>(() => view.value?.tree ?? [])
/** 空间视图加载失败信息（区分"加载中"与"加载失败"，2026-09-09 复盘） */
const viewError = ref('')

const spaceName = computed(() => view.value?.name ?? '学习空间')

// ---------- 选中与本地展示状态 ----------
const currentConceptId = ref<string | null>(null)
const lastFeedback = ref('')
const lastFeedbackIsWarn = ref(false)
/** 手动关闭警告横幅（2026-10-05：报错类反馈改全宽横幅后补关闭入口） */
function dismissFeedback(): void {
  lastFeedback.value = ''
  lastFeedbackIsWarn.value = false
}
const acking = ref(false)
const pickingNext = ref(false)

// ---------- 大纲树状态（左栏知识地图） ----------
/** 展开的分支/模块节点 id 集合 */
const expandedBranches = reactive(new Set<string>())
/** 概念名搜索关键词 */
const mapKeyword = ref('')
/** 掌握度过滤：all / untouched(待学) / learning / mastered / review */
const mapFilter = ref<'all' | 'untouched' | 'learning' | 'mastered' | 'review'>('all')

/** 加载当前空间（路由参数变化或页面进入时） */
async function loadSpace(): Promise<void> {
  const id = spaceId.value
  if (!id) return
  mountedSpaceId = id
  currentConceptId.value = null
  lastFeedback.value = ''
  lastFeedbackIsWarn.value = false
  liveTurns.value = []
  researchResultText.value = ''
  viewError.value = ''
  taskLog.value = []
  taskLogOpen.value = false
  expandedBranches.clear()
  await store.fetchSpaceView(id)
  if (!view.value) viewError.value = store.error || '学习空间加载失败，请重试'
  // 预热空间级笔记（qna 收藏态判定的数据源；静默失败、每空间一次）
  if (notesAllWarmed.value !== id) {
    notesAllWarmed.value = id
    void store.fetchNotesAll(id, true)
  }
  // 默认选中：Atlas「去学它」带 query.concept → 否则第一个未掌握的概念（学习中优先）
  const qConcept = typeof route.query.concept === 'string' ? route.query.concept : null
  const target =
    concepts.value.find(c => c.id === qConcept && c.nodeType !== 'group') ??
    firstUnmasteredLeaf() ??
    firstLeaf()
  if (target) {
    expandPathTo(target.id)
    selectConcept(target)
  }
  // 深链参数用完即清：防后续重挂载/标签恢复时被旧 query 拽回旧概念
  if (qConcept) void router.replace({ query: {} })
}

watch(
  () => route.params.id,
  () => {
    // 仅当路由落在本实例自己的路径上才重载（keep-alive 下 deactivated 实例不串写共享 store）
    if (route.path === ownPath) void loadSpace()
  }
)
// tab 标题跟主题名走（超 6 字截断，口径见 tabTitleOf）：覆盖深链/会话恢复等未经
// preloadTab 的入口，空间设置里改名后当前 tab 也即时同步。
// 写的是本实例自己的 tab（ownPath），deactivated 实例触发也不串写别人的标签。
watch(
  () => view.value?.name,
  (n) => {
    if (n) tabsStore.updateTabTitle(ownPath, tabTitleOf(n))
  },
  { immediate: true }
)
// keep-alive 下从 Atlas「去学它」回到本实例（path 未变、仅 query 变化）时在此消费
watch(
  () => route.query.concept,
  (cid) => {
    if (route.path !== ownPath || typeof cid !== 'string' || !cid) return
    const c = concepts.value.find(x => x.id === cid && x.nodeType !== 'group')
    if (c) {
      expandPathTo(c.id)
      selectConcept(c)
    }
    void router.replace({ query: {} })
  }
)

/** 组件挂载期间所在空间（卸载时取消在途轮次用；路由切换后不误取消新空间） */
let mountedSpaceId = ''
const lastResearchScope = ref<{ conceptId: string | null }>({ conceptId: null })

onMounted(() => {
  void loadSpace()
  // 载入方案状态：从知识全景页起步研究回来时，也要能自动弹确认框（2026-09-13 固定流程）
  void openPlanIfPending()
})

onUnmounted(() => {
  // 页面卸载：清理全部事件订阅；答疑/任务轮是对话式回复，跟着页面取消。
  // 研究轮（研究此概念/讲义精写/体系落库）2026-10-05 起后台化：主进程继续跑完并落库，
  // 不再随页面关闭取消——回页时由 reattachRunningResearch 重挂状态与事件流。
  store.unsubscribeAll()
  const sid = mountedSpaceId || spaceId.value
  if (tutorStreaming.value) {
    void store.cancelAgent(lastAskMode.value, sid, currentConceptId.value)
  }
})

// ==================== 大纲树渲染逻辑 ====================

/** 树内叶子概念的有序扁平（用于默认选中/推荐） */
function leafConcepts(nodes: DlTreeNode[]): DlTreeNode[] {
  const out: DlTreeNode[] = []
  const walk = (list: DlTreeNode[]) => {
    for (const n of list) {
      if (n.conceptId) out.push(n)
      else if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** 第一个未掌握的概念叶（学习中优先，再待学/复习） */
function firstUnmasteredLeaf(): DlConceptView | null {
  const leaves = leafConcepts(treeRoots.value)
    .map(n => concepts.value.find(c => c.id === n.conceptId))
    .filter((c): c is DlConceptView => !!c)
  return (
    leaves.find(c => c.mastery === 'learning') ??
    leaves.find(c => c.mastery === 'untouched') ??
    leaves.find(c => c.mastery === 'review') ??
    null
  )
}

/** 第一个概念叶（树序兜底） */
function firstLeaf(): DlConceptView | null {
  const leaf = leafConcepts(treeRoots.value)[0]
  return leaf ? concepts.value.find(c => c.id === leaf.conceptId) ?? null : null
}

/** 掌握度过滤命中（叶级；filter=all 全放行） */
function masteryOk(m: DlConceptView['mastery']): boolean {
  if (mapFilter.value === 'all') return true
  return m === mapFilter.value
}

/** 关键字命中（分支名或概念名/英文） */
function keywordHit(node: DlTreeNode, concept?: DlConceptView): boolean {
  const kw = mapKeyword.value.trim().toLowerCase()
  if (!kw) return true
  if (node.name.toLowerCase().includes(kw)) return true
  if (concept) {
    if (concept.name.toLowerCase().includes(kw)) return true
    if ((concept.en ?? '').toLowerCase().includes(kw)) return true
  }
  return false
}

/** 分支聚合统计：其下全部叶子 mastered/total */
function branchStats(node: DlTreeNode): { mastered: number; total: number } {
  let mastered = 0
  let total = 0
  const walk = (list: DlTreeNode[]) => {
    for (const n of list) {
      if (n.conceptId) {
        const c = concepts.value.find(x => x.id === n.conceptId)
        if (c && c.nodeType !== 'group') {
          total++
          if (c.mastery === 'mastered') mastered++
        }
      } else if (n.children?.length) {
        walk(n.children)
      }
    }
  }
  walk(node.children ?? [])
  return { mastered, total }
}

/** 分支下是否存在"通过过滤的可见叶子" */
function hasVisibleLeaf(node: DlTreeNode): boolean {
  if (!node.children?.length) return false
  return node.children.some(n => {
    if (n.conceptId) {
      const c = concepts.value.find(x => x.id === n.conceptId)
      if (!c) return false
      return masteryOk(c.mastery) && keywordHit(n, c)
    }
    return hasVisibleLeaf(n)
  })
}

interface MapRow {
  key: string
  depth: number
  isLeaf: boolean
  node: DlTreeNode
  concept?: DlConceptView
  stats?: { mastered: number; total: number }
}

/** 扁平行集合：无搜索时按展开集裁剪；有搜索时强制展开命中路径 */
const mapRows = computed<MapRow[]>(() => {
  const rows: MapRow[] = []
  const searching = mapKeyword.value.trim().length > 0
  const walk = (list: DlTreeNode[], depth: number) => {
    for (const node of list) {
      if (node.conceptId) {
        const c = concepts.value.find(x => x.id === node.conceptId)
        if (!c) continue
        if (!masteryOk(c.mastery)) continue
        if (!keywordHit(node, c)) continue
        rows.push({ key: `n-${node.id}`, depth, isLeaf: true, node, concept: c })
        continue
      }
      // 分支：过滤后无可见叶子则整支隐藏（除非自身命中关键词）
      const selfHit = keywordHit(node)
      if (!selfHit && !hasVisibleLeaf(node)) continue
      rows.push({
        key: `b-${node.id}`,
        depth,
        isLeaf: false,
        node,
        stats: branchStats(node),
      })
      // 掌握度过滤 = 全局视图：命中分支强制展开（否则看不到满足过滤的叶子）
      const open = searching || mapFilter.value !== 'all' || expandedBranches.has(node.id)
      if (open && node.children?.length) walk(node.children, depth + 1)
    }
  }
  walk(treeRoots.value, 0)
  return rows
})

function toggleBranch(id: string): void {
  if (expandedBranches.has(id)) expandedBranches.delete(id)
  else expandedBranches.add(id)
}

// ---------- 叶行展示辅助（模板防未定义解引用） ----------
function leafMastery(row: MapRow): DlMastery {
  return row.concept?.mastery ?? 'untouched'
}
function leafName(row: MapRow): string {
  return row.concept?.name ?? row.node.name
}
function isMasteredRow(row: MapRow): boolean {
  return row.concept?.mastery === 'mastered'
}

/** 展开通向某概念的分支链（选中/继续学习时保证可见） */
function expandPathTo(conceptId: string): void {
  const find = (list: DlTreeNode[]): boolean => {
    for (const node of list) {
      if (node.conceptId === conceptId) return true
      if (node.children?.length && find(node.children)) {
        expandedBranches.add(node.id)
        return true
      }
    }
    return false
  }
  find(treeRoots.value)
}

/** 叶行选中（同步展开链 + 高亮 + 讲义） */
function selectTreeLeaf(c?: DlConceptView): void {
  if (!c) return
  expandPathTo(c.id)
  selectConcept(c)
}

/** 当前概念（中栏讲义依据） */
const currentConcept = computed<DlConceptView | null>(
  () => concepts.value.find(x => x.id === currentConceptId.value) ?? null
)

/**
 * 当前选中的概念没有讲义 → 中栏是「生成中/研究此概念」空态。
 * 该空态下 agent 活动行要贴在按钮下方显示，顶部那条须让位（否则活动行跑到页面顶部，
 * 2026-09-14 用户需求）。
 */
const currentConceptNoCard = computed(() => !isEmptySpace.value && !!currentConcept.value && !currentConcept.value.card)

/** 前置依赖边类型（后端关系枚举：prerequisite） */
const PREREQ_TYPE = 'prerequisite'

/** 当前概念的前置依赖（含就绪状态） */
const prereqs = computed<Array<{ id: string; name: string; ready: boolean }>>(() => {
  const id = currentConceptId.value
  if (!id) return []
  const deps: string[] = []
  for (const e of relations.value) {
    if (e.target === id && e.type === PREREQ_TYPE && !deps.includes(e.source)) deps.push(e.source)
  }
  return deps.map(did => {
    const c = concepts.value.find(x => x.id === did)
    return { id: did, name: c?.name ?? did, ready: !!c && c.mastery === 'mastered' }
  })
})

/** 前置是否全部就绪（未就绪禁止"懂了/没懂"） */
const prereqReady = computed(() => prereqs.value.every(p => p.ready))

// ---------- 主题学习前置要求（2026-09-12：整个领域的学习门槛） ----------
const spacePrereqs = computed<DlSpacePrereq[]>(() => view.value?.prerequisites ?? [])

/** 前置 chip 的悬停说明（为什么需要 + 掌握到什么程度） */
function prereqTip(p: DlSpacePrereq): string {
  const bits = [p.why, p.level].filter((x): x is string => !!x)
  return bits.length ? bits.join(' · ') : p.name
}

// ---------- 书籍建议（2026-10-04：知识体系规划后的书籍内容提示） ----------
const bookSuggestions = computed<DlBookSuggestion[]>(() => view.value?.bookSuggestions ?? [])

/** 优先级徽标文案 */
function bookPriorityLabel(priority?: DlBookSuggestion['priority']): string {
  if (priority === 'essential') return '强烈建议'
  if (priority === 'reference') return '参考查阅'
  return '推荐'
}

/** 去知识库上传：把建议的书籍资料传进空间绑定的知识库，后续研究轮 wf_kb_retrieve 可直接引用 */
function goKbUpload(): void {
  void router.push('/knowledge-base')
}

/** 当前概念"已声明但未建关系边"的前置（顺序声明可见，关系待补） */
const declaredOnlyPrereqs = computed<Array<{ name: string; conceptId: string | null }>>(() => {
  const cur = concepts.value.find(c => c.id === currentConceptId.value)
  const declared = cur?.declaredPrereqs ?? []
  if (!declared.length) return []
  const linkedNames = new Set(prereqs.value.map(p => p.name))
  return declared
    .filter(name => !linkedNames.has(name))
    .map(name => {
      // 只认知识节点：拆分/规划产生的分支目录（group）不是可学的前置，不能被同名命中
      const hit = concepts.value.find(c => c.name === name && c.nodeType !== 'group')
      return { name, conceptId: hit?.id ?? null }
    })
})

// ---------- 前置知识点：系统已有判定 + 跳转/创建（2026-10-05 用户需求） ----------
// 口径：本空间已有同名 → chip 直连跳转（declaredOnlyPrereqs.conceptId）；
//       其他主题有同名 → 跨主题跳转（dl:search-concepts）；都没有 → 悬停＋弹窗创建。

/** 跨空间同名命中缓存（名 → 命中列表；undefined=尚未查过。不含本空间命中——那走 conceptId 直连） */
const prereqRemoteHits = ref<Record<string, DlConceptHit[] | undefined>>({})

/** 该名是否已查过（区分"查过没有"与"还在查"） */
function remoteHitKnown(name: string): boolean {
  return prereqRemoteHits.value[name] !== undefined
}

/** 该名的首个跨主题命中（无 → null） */
function remoteHitOf(name: string): DlConceptHit | null {
  return prereqRemoteHits.value[name]?.[0] ?? null
}

/** 该名的全部跨主题命中（tooltip 提示"等 N 处"用） */
function remoteHitsOf(name: string): DlConceptHit[] {
  return prereqRemoteHits.value[name] ?? []
}

/** 需要跨空间判定的前置名（本空间没有同名落点的） */
const pendingLookupNames = computed(
  () => declaredOnlyPrereqs.value.filter(d => !d.conceptId).map(d => d.name)
)

watch(pendingLookupNames, (names) => {
  const missing = names.filter(n => prereqRemoteHits.value[n] === undefined)
  if (missing.length) void lookupPrereqNames(missing)
}, { immediate: true })

async function lookupPrereqNames(names: string[]): Promise<void> {
  // 查前先占位（防并发重复查；失败按"系统没有"处理，可走创建）
  const placeholder: Record<string, DlConceptHit[] | undefined> = {}
  for (const n of names) placeholder[n] = []
  prereqRemoteHits.value = { ...prereqRemoteHits.value, ...placeholder }
  const hits = await store.searchConceptsAcrossSpaces(names)
  const byName: Record<string, DlConceptHit[]> = {}
  for (const n of names) byName[n] = []
  for (const h of hits) {
    // 本空间命中无意义（有同名概念时 conceptId 已直连）；防御剔除防自我跳转
    if (h.spaceId === spaceId.value) continue
    ;(byName[h.name] ??= []).push(h)
  }
  prereqRemoteHits.value = { ...prereqRemoteHits.value, ...byName }
}

/** 声明前置 chip 点击：本空间直连 / 跨主题跳转；系统没有 → 只提示，绝不代用户创建 */
function onDeclaredPrereqClick(d: { name: string; conceptId: string | null }): void {
  if (d.conceptId) {
    gotoRelatedConcept(d.conceptId)
    return
  }
  const hit = remoteHitOf(d.name)
  if (hit) {
    jumpToSpaceConcept(hit)
    return
  }
  if (remoteHitKnown(d.name)) {
    ElMessage.info(`「${d.name}」系统里还没有——已会可忽略；想系统学它，点 chip 上的 ＋ 手动创建`)
  }
}

/** 跳到其他主题的知识点（Atlas「去学它」同款深链：目标空间页自动展开并选中） */
function jumpToSpaceConcept(hit: DlConceptHit): void {
  tabsStore.preloadTab(`/domain-learning/${hit.spaceId}`, tabTitleOf(hit.spaceName))
  void router.push({ path: `/domain-learning/${hit.spaceId}`, query: { concept: hit.conceptId } })
}

// ----- 前置快捷创建对话框（选主题 → 拉该主题分类树 → 落点建点） -----
const prereqCreateVisible = ref(false)
const prereqCreating = ref(false)
const prereqCreateDraft = reactive({
  name: '',
  spaceId: '',
  parentId: null as string | null,
  definitionShort: '',
})
/** 主题选项（store.spaces；进对话框时懒拉一次。??[] 兜底：测试假 store 无该字段也不炸渲染） */
const spaceOptions = computed(() => ((store.spaces ?? []) as Array<{ id: string; name: string }>).map(s => ({ id: s.id, name: s.name })))
/** 所选主题下的分类树（带层级缩进；当前主题直接复用已加载视图） */
const prereqGroupOptions = ref<Array<{ id: string; label: string }>>([])
const loadingForeignGroups = ref(false)

async function openPrereqCreate(name: string): Promise<void> {
  prereqCreateDraft.name = name
  prereqCreateDraft.spaceId = spaceId.value
  prereqCreateDraft.parentId = null
  prereqCreateDraft.definitionShort = ''
  prereqCreateVisible.value = true
  // 主题列表兜底（本空间通常已含；空间列表缺失时补拉一次）
  if (!(store.spaces ?? []).length) void store.fetchSpaces()
  await loadPrereqGroups(spaceId.value)
}

/** 切主题 → 重拉该主题的分类树（清掉上个主题的落点选择） */
async function onPrereqSpaceChange(): Promise<void> {
  prereqCreateDraft.parentId = null
  await loadPrereqGroups(prereqCreateDraft.spaceId)
}

async function loadPrereqGroups(sid: string): Promise<void> {
  if (!sid) {
    prereqGroupOptions.value = []
    return
  }
  loadingForeignGroups.value = true
  try {
    if (sid === spaceId.value) {
      prereqGroupOptions.value = groupOptions.value
      return
    }
    // 其他主题：detached 拉视图（不写 currentSpaceView，防串掉当前页数据）
    const v = await store.fetchSpaceViewDetached(sid)
    prereqGroupOptions.value = groupOptionsOfView(v)
  } finally {
    loadingForeignGroups.value = false
  }
}

/** 从空间视图抽分类树（只取 group 目录，带层级缩进；供跨主题建点选落点） */
function groupOptionsOfView(v: DlSpaceView | null): Array<{ id: string; label: string }> {
  if (!v) return []
  const out: Array<{ id: string; label: string }> = []
  const walk = (nodes: DlTreeNode[], depth: number): void => {
    for (const n of nodes) {
      if (n.conceptId) continue
      out.push({ id: n.id, label: `${'　'.repeat(depth)}${n.name}` })
      if (n.children?.length) walk(n.children, depth + 1)
    }
  }
  walk(v.tree ?? [], 0)
  return out
}

async function submitPrereqCreate(): Promise<void> {
  const name = prereqCreateDraft.name.trim()
  const cur = currentConcept.value
  if (!name) {
    ElMessage.warning('请先填知识点名称')
    return
  }
  if (!prereqCreateDraft.spaceId) {
    ElMessage.warning('请先选择要建到哪个主题')
    return
  }
  // 分类必选（2026-10-05 用户口径）：不允许"不选=落到主题根层"的隐式默认，
  // 知识点归到哪个分类必须由用户显式挑定
  if (!prereqCreateDraft.parentId) {
    ElMessage.warning('请先选择所属知识分类（必选）')
    return
  }
  const targetSpaceId = prereqCreateDraft.spaceId
  const sameSpace = targetSpaceId === spaceId.value
  const spaceName = spaceOptions.value.find(s => s.id === targetSpaceId)?.name ?? ''
  prereqCreating.value = true
  try {
    const input = {
      id: targetSpaceId,
      name,
      nodeType: 'concept',
      parentId: prereqCreateDraft.parentId,
      definitionShort: prereqCreateDraft.definitionShort.trim() || null,
    }
    // 当前主题走带刷新版（顺带把新概念刷进地图）；跨主题用 detached（不串当前视图）
    const r = sameSpace
      ? await store.createConceptOf(input)
      : await store.createConceptDetached(input)
    if (!r) {
      ElMessage.error(store.error ?? '创建失败，请重试')
      return
    }
    // 当前主题：把它连为当前知识点的前置（已确认边，门控立即生效）
    if (sameSpace && cur) {
      const linked = await store.confirmRelationOf({
        id: spaceId.value,
        sourceId: r.conceptId,
        targetId: cur.id,
        relationType: PREREQ_TYPE,
        evidence: '用户在前置提示中快捷创建并连边',
      })
      if (!linked) ElMessage.warning(`知识点已创建，但连前置边失败：${store.error ?? '请手动在地图里连边'}`)
    }
    prereqCreateVisible.value = false
    if (sameSpace) {
      lastFeedbackIsWarn.value = false
      lastFeedback.value = `已创建前置知识点「${name}」${cur ? '，并连为当前知识点的前置' : ''}`
    } else {
      ElMessage.success(`已在主题「${spaceName}」下创建「${name}」——跨主题不建关系边，学完再回来继续`)
    }
    // 跨主题落点回写缓存：chip 从"可创建"转为"可跳转"
    if (!sameSpace) {
      prereqRemoteHits.value = {
        ...prereqRemoteHits.value,
        [name]: [{
          name,
          conceptId: r.conceptId,
          spaceId: targetSpaceId,
          spaceName,
          nodeType: 'concept',
          mastery: 'untouched',
          hasCard: false,
        }],
      }
    }
  } finally {
    prereqCreating.value = false
  }
}

// ---------- 手工追加知识点（2026-09-12 用户需求：用户建点 + AI 完善） ----------

/** 地图完整度诊断（后端 assessMapCoverage；进空间即见，缺口清单可悬停查看） */
const coverage = computed<DlMapCoverage>(
  () =>
    view.value?.coverage ?? {
      score: 0,
      summary: '地图完整度暂不可用（加载中）',
      metrics: { leaves: 0, groups: 0, edges: 0, verifiedEdges: 0, entries: 0, levels: 0, lessons: 0 },
      gaps: [],
    },
)

/** 完整度徽标配色：≥85 好 / ≥60 中 / 其余差 */
const coverageLevel = computed<'good' | 'mid' | 'low'>(() => {
  const s = coverage.value.score
  return s >= 85 ? 'good' : s >= 60 ? 'mid' : 'low'
})

const createConceptVisible = ref(false)
const creatingConcept = ref(false)
const completingMap = ref(false)

const conceptDraft = reactive({
  name: '',
  nodeType: 'concept',
  parentId: null as string | null,
  definitionShort: '',
  prerequisites: [] as string[],
})

/** 可建的知识节点类型（排除 group 目录） */
const creatableNodeTypes = DL_KNOWLEDGE_NODE_TYPES

/** 分支目录选项（带层级缩进，便于辨认归属） */
const groupOptions = computed<Array<{ id: string; label: string }>>(() => {
  const groups = concepts.value.filter(c => c.nodeType === 'group')
  const byId = new Map(groups.map(g => [g.id, g]))
  const depthOf = (id: string): number => {
    let d = 0
    let cur = byId.get(id)
    while (cur?.parentId && d < 8) {
      d++
      cur = byId.get(cur.parentId)
    }
    return d
  }
  return groups.map(g => ({ id: g.id, label: `${'　'.repeat(depthOf(g.id))}${g.name}` }))
})

/** 前置候选（空间内已有知识节点） */
const prereqOptions = computed(() =>
  concepts.value.filter(c => c.nodeType !== 'group').map(c => ({ id: c.id, name: c.name })),
)

function openCreateConcept(): void {
  conceptDraft.name = ''
  conceptDraft.nodeType = 'concept'
  // 只有一个分支目录时默认落在它下面（省一次选择）
  conceptDraft.parentId = groupOptions.value.length === 1 ? groupOptions.value[0].id : null
  conceptDraft.definitionShort = ''
  conceptDraft.prerequisites = []
  createConceptVisible.value = true
}

/** 提交新建：落库 → 选中新概念；有"待补前置"时提示可让 AI 补全 */
async function submitCreateConcept(): Promise<void> {
  const name = conceptDraft.name.trim()
  if (!name) {
    lastFeedbackIsWarn.value = true
    lastFeedback.value = '请先填知识点名称'
    return
  }
  creatingConcept.value = true
  lastFeedback.value = ''
  const r = await store.createConceptOf({
    id: spaceId.value,
    name,
    nodeType: conceptDraft.nodeType,
    parentId: conceptDraft.parentId,
    definitionShort: conceptDraft.definitionShort.trim() || null,
    prerequisites: conceptDraft.prerequisites,
  })
  creatingConcept.value = false
  if (!r) {
    lastFeedbackIsWarn.value = true
    lastFeedback.value = store.error ?? '新建知识点失败，请重试'
    return
  }
  createConceptVisible.value = false
  lastFeedbackIsWarn.value = r.missingPrereqs.length > 0
  lastFeedback.value = r.created
    ? `已追加知识点「${name}」${r.linkedPrereqs.length ? `，前置 ${r.linkedPrereqs.map(l => l.name).join('、')} 已连上` : ''}`
    : `「${name}」已存在，已更新它的定义/前置`
  if (r.missingPrereqs.length) {
    lastFeedback.value += `；待补前置：${r.missingPrereqs.join('、')}（可用「AI 补全」建出来）`
  }
  // 选中新建的概念（左栏高亮 + 中栏显示"讲义生成中/研究此概念"）
  gotoRelatedConcept(r.conceptId)
}

// ---------- 删除知识点（2026-10-05 用户需求：左栏叶行悬浮删除图标） ----------

const deletingConceptId = ref<string | null>(null)

/** 删除确认 → 级联落库（关系边/讲义含历史版本/笔记/问答连带删，后端收口）→ 视图刷新与选中兜底 */
async function askDeleteConcept(c?: DlConceptView): Promise<void> {
  if (!c || deletingConceptId.value) return
  // 研究进行中不删：本轮产物（讲义草稿/关系边）落库时会找不到概念
  if (researching.value && currentConceptId.value === c.id) {
    ElMessage.warning('该知识点正在研究中——等这轮结束再删')
    return
  }
  try {
    await ElMessageBox.confirm(
      `删除知识点「${c.name}」？将连带删除它的前置/相关关系边、讲义（含全部历史版本）、笔记与问答记录，删除后不可恢复。`,
      '删除知识点',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }
  deletingConceptId.value = c.id
  try {
    const r = await store.deleteConceptOf({ id: spaceId.value, conceptId: c.id })
    if (!r) {
      ElMessage.error(store.error ?? '删除失败，请重试')
      return
    }
    const bits = [
      r.relations ? `${r.relations} 条关系边` : '',
      r.cards ? `${r.cards} 篇讲义` : '',
      r.notes ? `${r.notes} 条笔记` : '',
      r.questions ? `${r.questions} 条问答` : '',
    ].filter(Boolean)
    lastFeedbackIsWarn.value = false
    lastFeedback.value = `已删除「${c.name}」${bits.length ? `（连带 ${bits.join('、')}）` : ''}`
    // 删的是当前选中概念：清选中并兜底选下一个（左栏高亮/中栏讲义不能悬在已删概念上）
    if (currentConceptId.value === c.id) {
      currentConceptId.value = null
      const next = firstUnmasteredLeaf() ?? firstLeaf()
      if (next) {
        expandPathTo(next.id)
        selectConcept(next)
      }
    }
  } finally {
    deletingConceptId.value = null
  }
}

// ---------- 拆细知识点（2026-10-05 用户需求：庞杂知识点 → 一层分支 + 子知识点） ----------

const splitVisible = ref(false)
const splitting = ref(false)
const splitDraft = reactive({
  branchName: '',
  rows: [{ name: '', definitionShort: '' }] as Array<{ name: string; definitionShort: string }>,
})

/** 原知识点的前置名（拆分对话框里说明"会自动继承给每个子知识点"） */
const splitInheritedPrereqNames = computed<string[]>(() => {
  const id = currentConceptId.value
  if (!id) return []
  const names: string[] = []
  for (const e of relations.value) {
    if (e.target === id && e.type === PREREQ_TYPE) {
      const n = concepts.value.find(x => x.id === e.source)?.name
      if (n) names.push(n)
    }
  }
  return names
})

function openSplitConcept(): void {
  const c = currentConcept.value
  if (!c || splitting.value) return
  // 研究进行中不拆：本轮讲义/关系落库会找不到概念
  if (researching.value && currentConceptId.value === c.id) {
    ElMessage.warning('该知识点正在研究中——等这轮结束再拆')
    return
  }
  splitDraft.branchName = c.name
  splitDraft.rows = [{ name: '', definitionShort: '' }]
  splitVisible.value = true
}

function addSplitRow(): void {
  splitDraft.rows.push({ name: '', definitionShort: '' })
}

function removeSplitRow(i: number): void {
  if (splitDraft.rows.length <= 1) return
  splitDraft.rows.splice(i, 1)
}

async function submitSplitConcept(): Promise<void> {
  const c = currentConcept.value
  if (!c || splitting.value) return
  const branchName = splitDraft.branchName.trim() || c.name
  const rows = splitDraft.rows
    .map(r => ({ name: r.name.trim(), definitionShort: r.definitionShort.trim() || null }))
    .filter(r => r.name)
  if (!rows.length) {
    ElMessage.warning('至少填一个子知识点名称')
    return
  }
  const names = rows.map(r => r.name)
  if (new Set(names).size !== names.length) {
    ElMessage.warning('子知识点名称不能重复')
    return
  }
  splitting.value = true
  try {
    const r = await store.splitConceptOf({
      id: spaceId.value,
      conceptId: c.id,
      branchName,
      children: rows,
    })
    if (!r) {
      ElMessage.error(store.error ?? '拆分失败，请重试')
      return
    }
    splitVisible.value = false
    const bits = [
      r.removed.cards ? `${r.removed.cards} 篇总览讲义` : '',
      r.removed.notes ? `${r.removed.notes} 条笔记` : '',
      r.removed.questions ? `${r.removed.questions} 条问答` : '',
    ].filter(Boolean)
    lastFeedbackIsWarn.value = false
    lastFeedback.value =
      `已拆出 ${r.children.length} 个子知识点（${r.children.map(x => x.name).join('、')}）` +
      (r.inheritedPrereqs.length ? `，前置已继承：${r.inheritedPrereqs.map(x => x.name).join('、')}` : '') +
      (bits.length ? `；退役：${bits.join('、')}` : '') +
      (r.droppedRelations ? `；${r.droppedRelations} 条其他关系边已清理（可回知识全景复核）` : '')
    // 定位到分支下第一个子知识点，直接可见"拆好了"
    const first = concepts.value.find(x => x.id === r.children[0]?.conceptId)
    if (first) {
      expandPathTo(first.id)
      selectConcept(first)
    }
  } finally {
    splitting.value = false
  }
}

/** 一键让研究助手补全地图（走 task 会话；指令见 shared/utils/domain-learning-mission） */
async function completeMapWithAi(): Promise<void> {
  if (completingMap.value || tutorStreaming.value) return
  // 把后端诊断出的结构性缺口带进指令：让模型从"已知缺口"起步，而不是自由发挥
  const c = coverage.value
  const mission = dlMapCompletionMission({
    spaceName: spaceName.value,
    conceptCount: c.metrics.leaves,
    goal: view.value?.goal ?? null,
    coverageSummary: c.summary,
    coverageGaps: c.gaps.map(
      (g) => `[${g.severity === 'high' ? 'high' : 'medium'}] ${g.message}${g.conceptNames?.length ? `（涉及：${g.conceptNames.join('、')}）` : ''}`,
    ),
  })
  completingMap.value = true
  rightPane.value = 'qa'
  planDriveMode.value = 'task'
  try {
    await runAsk(mission, 'task')
    // 固定流程第 1 步：模型应已提交诉求理解草案 → 拉方案并弹窗确认
    await openPlanIfPending()
  } finally {
    completingMap.value = false
  }
}

// ==================== 知识体系方案（固定流程；2026-09-13） ====================

/** 方案弹窗可见性 与 驱动下一轮的会话模式（research=起步研究 / task=补全地图） */
const planVisible = ref(false)
const planDriveMode = ref<'research' | 'task'>('research')

/** 方案提示条（有草稿待确认时高亮） */
const planHint = computed(() => {
  const p = store.plan
  if (!p) return null
  if (p.syllabusConfirmed) return null // 已确认后不再显示提示条（2026-09-14 用户要求去掉那行常驻文案）
  if (p.syllabus) return { pending: true, text: '知识体系方案待你确认：勾选要生成的知识点后才会开始生成' }
  if (p.understandingConfirmed) return { pending: true, text: '诉求已确认——模型正在规划知识体系，稍后确认方案即可生成' }
  if (p.understanding) return { pending: true, text: '模型提交了「我对你诉求的理解」，请确认或纠正后再生成知识点' }
  return null
})

function openPlan(): void {
  planVisible.value = true
}

/** 拉方案；若有待确认内容则自动弹窗（固定流程的"弹出对话框"体验）
 *  @returns 是否弹了窗（调用方据此决定要不要再提示别的） */
async function openPlanIfPending(): Promise<boolean> {
  const p = await store.fetchPlan(spaceId.value)
  if (!p) return false
  if ((p.understanding && !p.understandingConfirmed) || (p.syllabus && !p.syllabusConfirmed)) {
    planVisible.value = true
    return true
  }
  return false
}

/** 弹窗驱动过一轮（确认/调整）后的收尾：刷新空间视图 */
async function onPlanDriven(): Promise<void> {
  await refreshView()
}

// ==================== 讲义方案（讲义流水线；2026-09-14） ====================

/** 讲义方案弹窗可见性 */
const lessonPlanVisible = ref(false)

/** 当前概念的讲义方案（只有属于当前概念时才认——讲义是按概念写的） */
const currentLessonPlan = computed(() => {
  const p = store.plan
  const id = currentConceptId.value
  if (!p?.lesson || !id) return null
  if (p.lessonConceptId && p.lessonConceptId !== id) return null
  return p.lesson
})

/**
 * 讲义方案提示条：待确认时高亮催办；已确认时给"回看规格"的入口（有卡才提示，无卡时
 * 由空态里的那份提示条承担）。没有方案时不出条（不干扰"研究此概念"入口）。
 */
const lessonPlanHint = computed(() => {
  const lp = currentLessonPlan.value
  if (!lp) return null
  if (store.plan?.lessonConfirmed) {
    return { pending: false, text: `讲义方案已确认（第 ${lp.revision} 版）——助手按它逐区精写；可回看规格与区级计划` }
  }
  return { pending: true, text: '讲义方案待你确认：确认后助手才按每区的版式逐区精写正文' }
})

function openLessonPlan(): void {
  lessonPlanVisible.value = true
}

/**
 * 拉当前概念的讲义方案；有**待确认**方案时自动弹窗（与知识体系弹窗同款体验）。
 * @returns 是否弹了窗
 */
async function openLessonPlanIfPending(): Promise<boolean> {
  const id = currentConceptId.value
  if (!id) return false
  const p = await store.fetchPlan(spaceId.value, id)
  if (!p?.lesson) return false
  if (p.lessonConceptId && p.lessonConceptId !== id) return false
  if (!p.lessonConfirmed) {
    lessonPlanVisible.value = true
    return true
  }
  return false
}

/** 讲义方案弹窗驱动过一轮（确认后逐区精写 / 调整后重做方案）后的收尾 */
async function onLessonPlanDriven(): Promise<void> {
  await refreshView()
}

// ==================== 知识点拆分方案（2026-10-06：复杂知识点 agent 提案拆分） ====================

/** 拆分方案弹窗可见性 */
const conceptSplitVisible = ref(false)

/** 当前概念的拆分方案（只有属于当前概念时才认——拆分是按概念提案的） */
const currentConceptSplit = computed(() => {
  const p = store.plan
  const id = currentConceptId.value
  if (!p?.conceptSplit || !id) return null
  if (p.conceptSplitConceptId && p.conceptSplitConceptId !== id) return null
  return p.conceptSplit
})

/** 拆分方案提示条：待确认时高亮催办（确认即执行，执行后原概念转成分支、此条自然消失） */
const conceptSplitHint = computed(() => {
  const s = currentConceptSplit.value
  if (!s) return null
  if (store.plan?.conceptSplitConfirmed) {
    return { pending: false, text: '拆分方案已确认执行——原知识点已转成分支目录，请依次为子知识点出讲义' }
  }
  return { pending: true, text: '助手建议把本知识点拆细：确认后会转成分支目录并新建子知识点（原讲义退役）' }
})

function openConceptSplit(): void {
  conceptSplitVisible.value = true
}

/** 拉当前概念的拆分方案；有**待确认**方案时自动弹窗（与讲义方案弹窗同款体验） */
async function openConceptSplitIfPending(): Promise<boolean> {
  const id = currentConceptId.value
  if (!id) return false
  const p = await store.fetchPlan(spaceId.value, id)
  if (!p?.conceptSplit) return false
  if (p.conceptSplitConceptId && p.conceptSplitConceptId !== id) return false
  if (!p.conceptSplitConfirmed) {
    conceptSplitVisible.value = true
    return true
  }
  return false
}

/** 拆分方案驱动过一轮（确认即执行 / 调整后重做方案）后的收尾 */
async function onConceptSplitDriven(): Promise<void> {
  await refreshView()
}

/**
 * 区级「重写此区」（2026-09-14）：只重做这一区，不整篇重来。
 * 把该区现状（key/版式/正文）交给研究助手，要求**只回这一区的新 md**，其余区逐字保留，
 * 最后仍走 dl_save_card（门禁与质检照旧）——对应 ppt-master 的"在拥有该层的那一层修"。
 */
async function onSectionRewrite(section: DlCardSection): Promise<void> {
  const c = currentConcept.value
  if (!c || researching.value || tutorStreaming.value) return
  const layout = section.layout ?? ''
  const takeaway = section.takeaway ? `\n- 现有结论条：${section.takeaway}` : ''
  const body = String(section.md ?? '').slice(0, 4000)
  await runAsk(
    [
      `【重写此区】概念「${c.name}」的「${section.title ?? section.key}」区（key=${section.key}${layout ? `，版式=${layout}` : ''}）需要重做：`,
      '要求：',
      '1. 只重做这一区——其余区**逐字保留**，不要顺手改；',
      `2. 按版式写：${layout || '按内容选一个合适版式（要点卡/对比表/步骤条/图解/算例/公式/数据看点/引文/时间线/误区/清单/代码/结论条）'}，正文形状要与版式一致（声明要点卡就是 2~6 条短要点，声明图解就真给 figure 规格块）；`,
      '3. 长段信息要归纳成要点/小标题/表格，不要写成一堵文字墙；给这一区补 takeaway（一句话结论）；',
      '4. 内容要有据：沿用原证据来源，新增论断必须来自资料（不要编造）；',
      '5. 完成后用 dl_save_card 落库（sections 全量重发，未改动的区原样照抄）。',
      '',
      `【该区现状】${takeaway}`,
      body,
    ].join('\n'),
    'task',
  )
}

// ---------- 空间整体进度（后端 stats 为准） ----------
const masteryPercent = computed(() => {
  const s = view.value?.stats
  if (!s || s.total === 0) return 0
  return Math.round((s.mastered / s.total) * 100)
})

const progressText = computed(() => {
  const s = view.value?.stats
  if (!s) return ''
  const learningNames = concepts.value
    .filter(c => c.mastery === 'learning' && c.nodeType !== 'group')
    .map(c => c.name)
  return `已理解 ${s.mastered} / ${s.total} 个知识点${learningNames.length ? ` · 学习中：${learningNames.join('、')}` : ''}`
})

/** 当前概念讲义/研究状态文案（左栏底部） */
const researching = ref(false)
/** 最近一轮研究的回复正文（2026-10-05：完整输出弹窗的「本轮回复」节；随轮次/概念切换重置） */
const researchResultText = ref('')
const conceptResearchText = computed(() => {
  const c = currentConcept.value
  if (!c) return ''
  if (researching.value) return `正在研究「${c.name}」…`
  if (c.researchState === 'researching') return '后台研究中…'
  if (c.hasCard) return '讲义已就绪'
  return `「${c.name}」讲义待研究`
})

/** 未解问题数量（后端队列统计） */
const openQuestionCount = computed(() => view.value?.openQuestionCount ?? 0)

/** 当前概念的直接关系邻居（related 区：图关系边派生） */
const currentRelated = computed<Array<{ conceptId: string; name: string; rel?: string }>>(() => {
  const id = currentConceptId.value
  if (!id) return []
  const out: Array<{ conceptId: string; name: string; rel?: string }> = []
  const seen = new Set<string>()
  for (const e of relations.value) {
    if (e.source === id && !seen.has(e.target)) {
      const t = concepts.value.find(x => x.id === e.target)
      if (t) { out.push({ conceptId: t.id, name: t.name, rel: relLabel(e.type) }); seen.add(e.target) }
    } else if (e.target === id && !seen.has(e.source)) {
      const s = concepts.value.find(x => x.id === e.source)
      if (s) { out.push({ conceptId: s.id, name: s.name, rel: `←${relLabel(e.type)}` }); seen.add(e.source) }
    }
  }
  return out
})

/** 相关知识点点击 → 跳该概念讲义 */
function gotoRelatedConcept(conceptId: string): void {
  const c = concepts.value.find(x => x.id === conceptId)
  if (c) {
    expandPathTo(c.id)
    selectConcept(c)
  }
}

// ---------- 视图跳转 ----------
function openAtlas(): void {
  tabsStore.preloadTab(`/domain-learning/${spaceId.value}/atlas`, '知识全景')
  router.push(`/domain-learning/${spaceId.value}/atlas`)
}

function goBack(): void {
  router.push('/domain-learning')
}

function conceptById(id: string): DlConceptView | undefined {
  return concepts.value.find(c => c.id === id)
}

// ---------- 交互：地图选课 ----------
function selectConcept(c: DlConceptView): void {
  currentConceptId.value = c.id
  lastFeedback.value = ''
  lastFeedbackIsWarn.value = false
  // 概念切换：清掉未落库的 task 临时气泡与动作流水（答疑历史由 view.turns 按概念刷新）
  liveTurns.value = []
  taskLog.value = []
  taskLogOpen.value = false
  // 研究输出弹窗的「本轮回复」跟概念走，切概念即失效（strip 的滚动/历史随实例重建）
  researchResultText.value = ''
  // 前置跨主题命中缓存跟概念走：清掉防串（下个概念的前置按需重查）
  prereqRemoteHits.value = {}
  void store.fetchNotesOf(spaceId.value, c.id)
  // 讲义方案提示条按当前概念判定（2026-09-14）：切概念时把该概念的方案读回来（失败静默，不阻塞选课）
  void store.fetchPlan(spaceId.value, c.id)
}

// ---------- 交互：掌握度反馈（后端推进 + 重拉视图） ----------
async function refreshView(): Promise<void> {
  await store.fetchSpaceView(spaceId.value)
  // 笔记/收藏态随视图刷新（追问落库后 qna 笔记可见）
  if (currentConceptId.value) await store.fetchNotesOf(spaceId.value, currentConceptId.value)
}

async function markMastered(): Promise<void> {
  const c = currentConcept.value
  if (!c || acking.value) return
  acking.value = true
  try {
    const ok = await store.ackMastered(spaceId.value, c.id)
    if (ok) {
      lastFeedbackIsWarn.value = false
      lastFeedback.value = `「${c.name}」已标记为理解 ✓`
      await refreshView()
    } else {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = store.error ?? '标记失败，请重试'
    }
  } finally {
    acking.value = false
  }
}

/** 没懂（无定位区；sectionKey 由 onSectionNotUnderstand 携带） */
async function markConfused(): Promise<void> {
  await doAckConfused(undefined)
}

/** 确认发布当前讲义（draft→published；2026-09-09 复盘补发布闭环） */
const publishing = ref(false)

/** 讲义导出状态（2026-09-15：知识点正文 md / PDF / 长图） */
const exportingLesson = ref(false)

// ==================== 讲义版本历史（2026-09-15） ====================
const historyVisible = ref(false)
const versions = ref<Array<{ cardId: string; version: number; status: string; essenceType: string; sectionsCount: number; worksCount: number; evidenceCount: number; verifyStatus: string | null; revisionNote: string | null; changeSource: string | null; createdAt: string | null; updatedAt: string | null; isCurrent: boolean }>>([])
const restoringCardId = ref<string | null>(null)
const previewVisible = ref(false)
const previewVersionNo = ref<number>(0)
const previewMarkdown = ref('')

async function openVersionHistory(): Promise<void> {
  const c = currentConcept.value
  if (!c) return
  historyVisible.value = true
  await loadVersions(c.id)
}

async function loadVersions(conceptId: string): Promise<void> {
  const list = await store.listCardVersionsOf(spaceId.value, conceptId)
  versions.value = list ?? []
}

async function previewVersion(v: typeof versions.value[number]): Promise<void> {
  const row = await store.getCardVersionOf(spaceId.value, v.cardId)
  if (!row) {
    ElMessage.error('拉取版本详情失败')
    return
  }
  // 拼接 markdown 预览（简化版：区标题 + 正文）
  const lines: string[] = [`# ${currentConcept.value?.name ?? ''} v${v.version}`]
  for (const s of row.sections ?? []) {
    lines.push(`## ${s.title ?? s.key}`)
    if (s.takeaway) lines.push(`> ${s.takeaway}`)
    lines.push(s.md)
    lines.push('')
  }
  previewVersionNo.value = v.version
  previewMarkdown.value = lines.join('\n')
  previewVisible.value = true
}

async function restoreVersion(v: typeof versions.value[number]): Promise<void> {
  if (restoringCardId.value) return
  const c = currentConcept.value
  if (!c) return
  try {
    await ElMessageBox.confirm(
      `恢复到 v${v.version}？将新建一版草稿（旧版全部保留），当前未保存的修改会丢失。`,
      '恢复历史版本',
      { confirmButtonText: '恢复', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }
  restoringCardId.value = v.cardId
  try {
    const r = await store.restoreCardOf({ spaceId: spaceId.value, conceptId: c.id, cardId: v.cardId })
    if (!r) {
      ElMessage.error(store.error ?? '恢复失败')
      return
    }
    ElMessage.success(`已恢复到 v${r.restoredFrom} → 新 v${r.version}（草稿）`)
    await refreshView()
    await loadVersions(c.id)
  } finally {
    restoringCardId.value = null
  }
}

async function exportVersion(v: typeof versions.value[number], format: 'md' | 'pdf'): Promise<void> {
  await handleExportLesson(format, v.cardId)
}

/**
 * 「导出」下拉的命令处理（`el-dropdown` 的 command 事件）。
 *
 * ⚠️ Element Plus 的事件签名是 `(command, _instance, event)`：第二个参数是
 * ElDropdownItem 的**组件实例**（element-plus 内部 `commandHandler(props.command, _instance, e)`），
 * 第三个是原生事件。组件实例含函数与循环引用，过不了 IPC 的结构化克隆——2026-09-15 实测：
 * 把它当 `cardId` 透传 → 导出必报「An object could not be cloned.」。
 * 因此这里**只声明第一个参数**（格式），其余参数一律不接。
 */
function onExportCommand(command: unknown): void {
  const format = parseLessonExportFormat(command)
  if (!format) {
    ElMessage.error('不支持的导出格式')
    return
  }
  void handleExportLesson(format)
}

/**
 * 导出讲义（md / PDF / 长图）。
 * @param format 导出格式（白名单校验，未知格式直接拒绝）
 * @param cardId 指定版本（缺省=当前版；历史抽屉里"导出该版"用；非字符串一律忽略）
 */
async function handleExportLesson(format: DlLessonExportFormat, cardId?: unknown): Promise<void> {
  if (exportingLesson.value) return
  const fmt = parseLessonExportFormat(format)
  if (!fmt) {
    ElMessage.error('不支持的导出格式')
    return
  }
  const versionCardId = normalizeLessonCardId(cardId)
  const c = currentConcept.value
  if (!c?.card && !versionCardId) {
    ElMessage.warning('该知识点还没有讲义，无法导出')
    return
  }
  exportingLesson.value = true
  try {
    const r = await store.exportLessonOf({
      spaceId: spaceId.value,
      conceptId: c?.id ?? '',
      format: fmt,
      cardId: versionCardId,
    })
    if (!r) {
      ElMessage.error(store.error ?? '导出失败')
      return
    }
    if (r.format === 'md' && r.markdown) {
      await saveBlobAs(r.markdown, { defaultName: r.filename, mimeType: r.mime })
    } else if ((r.format === 'pdf' || r.format === 'image') && r.contentBase64) {
      const blob = base64ToBlob(r.contentBase64, r.mime)
      await saveBlobAs(blob, {
        defaultName: r.filename,
        filters: [{ name: r.format === 'pdf' ? 'PDF 文档' : 'PNG 图片', extensions: [r.format === 'pdf' ? 'pdf' : 'png'] }],
      })
    } else if (r.format === 'html' && r.html) {
      await saveBlobAs(r.html, { defaultName: r.filename, mimeType: r.mime })
      ElMessage.warning('当前端无 PDF/长图渲染能力，已导出排版 HTML——可打开后用浏览器「打印 → 另存为 PDF」')
    } else {
      ElMessage.error('导出产物异常')
      return
    }
    ElMessage.success(`已导出「${r.conceptName}」v${r.version}`)
  } catch (e: any) {
    ElMessage.error(e?.message ?? '导出失败')
  } finally {
    exportingLesson.value = false
  }
}

/** 自动核验摘要（当前卡；null=未核验） */
const verifySummary = computed(() => currentConcept.value?.card?.verification ?? null)
/** 核验状态（null=未核验） */
const verifyStatus = computed(() => verifySummary.value?.status ?? null)
/** 待复核条数（只有 needs_review 有值；图标化的角标，别把数字丢了） */
const verifyIssues = computed(() =>
  verifyStatus.value === 'needs_review' ? (verifySummary.value?.issues ?? 0) : 0
)
/** 核验状态 → 图标（通过=对勾 / 待复核=警示 / 核验中=转圈 / 未核验=问号） */
const verifyIcon = computed(() => {
  switch (verifyStatus.value) {
    case 'verified':
      return CircleCheckFilled
    case 'needs_review':
      return WarningFilled
    case 'verifying':
      return Loading
    default:
      return QuestionFilled
  }
})
/** 核验状态 → 色调档位（ok/warn/busy/idle，样式见 .lesson-actions .verify-chip） */
const verifyTone = computed(() => {
  switch (verifyStatus.value) {
    case 'verified':
      return 'ok'
    case 'needs_review':
      return 'warn'
    case 'verifying':
      return 'busy'
    default:
      return 'idle'
  }
})
/** 核验状态 → 展示文案（tooltip 详情用） */
const verifyLabel = computed(() => {
  const v = verifySummary.value
  if (!v) return '未核验'
  if (v.status === 'verified') return '核验通过'
  if (v.status === 'needs_review') return `待复核 ${v.issues}`
  if (v.status === 'verifying') return '核验中'
  return '未核验'
})
const verifyTip = computed(() => {
  const v = verifySummary.value
  if (!v) return '尚未自动核验——研究产出讲义后会自动交叉核验（知识库/权威来源）'
  const when = v.checkedAt ? new Date(v.checkedAt).toLocaleString() : '时间未知'
  const base = `自动核验：${verifyLabel.value}（${when}）`
  return v.note ? `${base}｜${v.note}` : base
})

/** 确认发布按钮的悬停提示（图标化后版本号挪到这里，信息不丢） */
const publishTip = computed(() => {
  const card = currentConcept.value?.card
  if (!card) return '确认发布'
  return `确认发布 v${card.version}（草稿 → 正式采用，并计入掌握度统计）`
})

async function publishCurrentLesson(): Promise<void> {
  const c = currentConcept.value
  const card = c?.card
  if (!c || !card || publishing.value) return
  publishing.value = true
  try {
    const ok = await store.publishCard(spaceId.value, card.id)
    // 核验待复核时提示但不阻断（人审优先），由用户决定是否先修订
    const v = card.verification
    const warn = v?.status === 'needs_review' && v.issues > 0 ? `（自动核验有 ${v.issues} 条待复核，建议复核后再修订）` : ''
    lastFeedbackIsWarn.value = ok ? !!warn : true
    lastFeedback.value = ok
      ? `已确认发布「${c.name}」v${card.version} ✓${warn}`
      : (store.error ?? '发布失败，请重试')
  } finally {
    publishing.value = false
  }
}

/** 区级「这块没懂」：带 sectionKey 上报后端定位 */
async function onSectionNotUnderstand(sec: DlCardSection): Promise<void> {
  await doAckConfused(sec.key)
}

async function doAckConfused(sectionKey?: string): Promise<void> {
  const c = currentConcept.value
  if (!c || acking.value) return
  acking.value = true
  try {
    const result = await store.ackConfused(spaceId.value, c.id, sectionKey)
    if (result) {
      lastFeedbackIsWarn.value = false
      if (result.splitSuggested) {
        lastFeedback.value = `「${c.name}」多次没懂——已将其拆成更小概念（拆分建议已入队），稍后会重新讲`
      } else {
        const where = sectionKey ? `的「${sectionKey}」区` : ''
        lastFeedback.value = `收到，稍后会用更基础的讲法重讲「${c.name}」${where}`
      }
      // 没懂计数已累计；视图整体不变化，无需重拉（openQuestionCount 只统计追问队列）
    } else {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = store.error ?? '标记失败，请重试'
    }
  } finally {
    acking.value = false
  }
}

// ---------- 交互：继续学习（dl:pick-next 推荐） ----------
async function continueLearning(): Promise<void> {
  if (pickingNext.value) return
  pickingNext.value = true
  lastFeedback.value = ''
  try {
    const nextId = await store.pickNext(spaceId.value)
    if (nextId) {
      expandPathTo(nextId)
      selectConcept(conceptById(nextId)!)
      lastFeedbackIsWarn.value = false
      lastFeedback.value = '已为你推荐下一个知识点'
    } else {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = '当前没有可继续的知识点（先研究领域填充地图）'
    }
  } finally {
    pickingNext.value = false
  }
}

// ---------- 交互：空主题起步研究（无任何知识点 → 空间级 research 生成首批知识） ----------
/** 空空间判定：视图已加载且尚无知识概念叶（concepts 含 group 目录行，须按叶判定） */
const isEmptySpace = computed(() => {
  const v = view.value
  return !!v && !(v.concepts ?? []).some((c) => c.nodeType !== 'group')
})
/** 起步研究的过程反馈（空态卡内展示；warn=异常/未产出） */
const bootMessage = ref('')
const bootWarn = ref(false)

async function bootResearch(): Promise<void> {
  if (researching.value) return
  // 答疑/任务进行中不并起研究（防同空间双 agent 轮并发；UI 级互斥）
  if (tutorStreaming.value) {
    lastFeedbackIsWarn.value = true
    lastFeedback.value = '回答进行中——稍等它完成后再发起研究'
    return
  }
  researching.value = true
  lastResearchScope.value = { conceptId: null }
  bootMessage.value = ''
  bootWarn.value = false
  researchResultText.value = ''
  planDriveMode.value = 'research'
  // 空间级事件通道 dl:agent:<spaceId>（conceptId 为空）
  const unsub = store.subscribeAgentEvent(spaceId.value, null, (ev) => {
    // 只收本 space 级 research 轮事件（防与其他模式/概念并发混流）
    if (ev.mode && ev.mode !== 'research') return
    if (ev.type === 'error') {
      bootWarn.value = true
      bootMessage.value = `起步研究出错：${ev.error ?? '未知错误'}`
    }
  })
  try {
    const result = await store.sendAgent({
      mode: 'research',
      spaceId: spaceId.value,
      conceptId: null,
      // 固定流程第 1 步：先对齐诉求（宿主会注入阶段指令；这一轮不会直接建点）
      message: `这是新主题「${spaceName.value}」的首次研究——请先复述你对我的诉求的理解，提交诉求理解草案让我确认。`,
    })
    // 完整输出弹窗的「本轮回复」（2026-10-05：滚动行只留 3 条，正文进弹窗可回看）
    researchResultText.value = result?.content ?? ''
    await refreshView()
    // 模型应已提交「诉求理解」草案 → 拉方案并弹窗让用户确认（固定流程的起点）
    const pending = await openPlanIfPending()
    if (!pending) {
      const first = concepts.value.find((c) => c.nodeType !== 'group')
      if (first) {
        // 已有知识点（例如空间非空）→ 自动定位，让用户直接看到讲义或研究入口
        expandPathTo(first.id)
        selectConcept(first)
      } else if (!bootMessage.value) {
        // 未产出：展示会话总结中的原因（资料不足时助手不编造），避免“干等无反馈”
        const reason = (result?.content ?? '').trim()
        bootWarn.value = true
        bootMessage.value = reason
          ? `本轮未提交诉求理解：${reason.slice(0, 260)}`
          : '本轮未提交诉求理解。可先绑定含资料的知识库（知识全景 → 空间设置 → 关联知识库），或在可联网环境重试。'
      }
    }
  } finally {
    unsub()
    researching.value = false
  }
}

// ---------- 交互：研究无讲义概念（dl:agent-send mode='research'） ----------

/**
 * 回页重挂在途研究轮（2026-10-05 后台化改造）。
 * 研究轮不再随页面关闭取消：主进程继续跑完并落库。这里在进入空间/切换概念时查
 * busy——若该概念还有在途轮，恢复「研究中」状态并重挂事件流（错误提示 + 完成后刷新视图、
 * 弹待确认的讲义方案），用户看到的和没离开过一样。错过过程文本属预期：结果以落库为准。
 */
let reattachUnsub: (() => void) | null = null
async function reattachRunningResearch(): Promise<void> {
  if (researching.value) return
  const sid = spaceId.value
  const cid = currentConceptId.value
  if (!sid || !cid) return
  // busy 查询失败/桥未就绪都按"不在途"处理——重挂是增强体验，不构成新的崩溃面
  let busy = false
  try {
    busy = await store.agentBusy('research', sid, cid)
  } catch {
    return
  }
  if (!busy) return
  // await 期间可能已切换概念/空间：快照不一致就不挂
  if (researching.value || spaceId.value !== sid || currentConceptId.value !== cid) return
  researching.value = true
  lastResearchScope.value = { conceptId: cid }
  const c = currentConcept.value
  reattachUnsub?.()
  reattachUnsub = store.subscribeAgentEvent(sid, cid, ev => {
    if (ev.mode && ev.mode !== 'research') return
    if (ev.type === 'error') {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = `研究「${c?.name ?? cid}」出错：${ev.error ?? '未知错误'}`
    } else if (ev.type === 'reply:done') {
      reattachUnsub?.()
      reattachUnsub = null
      researching.value = false
      // 拆分提案优先于讲义方案弹出（agent 判断装不下时不催讲义）
      void refreshView().then(async () => {
        if (await openConceptSplitIfPending()) return
        await openLessonPlanIfPending()
      })
    }
  })
}

// 载入/切换概念时尝试重挂在途研究轮（该概念没有在途轮就静默跳过，一次 IPC 查询）
watch(currentConceptId, () => {
  void reattachRunningResearch()
})

async function researchConcept(): Promise<void> {
  const c = currentConcept.value
  if (!c || researching.value) return
  // 答疑/任务进行中不并起研究（UI 级互斥，防同概念双 agent 轮并发）
  if (tutorStreaming.value) {
    lastFeedbackIsWarn.value = true
    lastFeedback.value = '回答进行中——稍等它完成后再研究'
    return
  }
  researching.value = true
  lastResearchScope.value = { conceptId: c.id }
  researchResultText.value = ''
  // 订阅动作事件：error 直接提示；完成/阶段用于状态行（重拉在 finally）
  const unsub = store.subscribeAgentEvent(spaceId.value, c.id, ev => {
    // 只收本概念 research 轮事件（防与其他模式/空间级研究并发混流）
    if (ev.mode && ev.mode !== 'research') return
    if (ev.type === 'error') {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = `研究「${c.name}」出错：${ev.error ?? '未知错误'}`
    }
  })
  try {
    const result = await store.sendAgent({
      mode: 'research',
      spaceId: spaceId.value,
      conceptId: c.id,
      message: `请系统研究「${c.name}」这一知识点，并产出可展示的讲义草稿（含区级内容）。`,
    })
    // 无反馈不静默：启动失败（如与自动推进调度器撞 busy）要有可见提示
    if (!result) {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = store.error || '研究未能启动（上一轮可能仍在进行，稍后再试）'
    }
    // 完整输出弹窗的「本轮回复」（2026-10-05：滚动行只留 3 条，正文进弹窗可回看）
    researchResultText.value = result?.content ?? ''
    // 研究完成后重拉视图：卡片草稿/新关系/掌握度一并刷新
    await refreshView()
    // 拆分提案优先（agent 判断装不下时不催讲义）；否则按讲义流水线弹方案确认（Plan → Do 分离）
    if (await openConceptSplitIfPending()) return
    await openLessonPlanIfPending()
  } finally {
    unsub()
    researching.value = false
  }
}

// ---------- 交互：追问（tutor Agent 实时流式 / task 任务会话，M6-3 同框自动判断） ----------
const draft = ref('')
const qaListRef = ref<HTMLElement | null>(null)
const tutorStreaming = ref(false)

/** 本轮 task 会话已执行动作流水（action:done → 展示任务真实进度，M6-3 阶段二） */
interface DlTaskActionLog {
  tool: string
  status: string
  message: string
}
const taskLog = ref<DlTaskActionLog[]>([])
/** 任务进度区是否展开（默认折叠成一行；展开后滚动查看全部步骤） */
const taskLogOpen = ref(false)

/** 折叠态摘要：共几项 + 最近一条进度 */
const taskLogSummary = computed(() => {
  const items = taskLog.value
  if (!items.length) return ''
  const last = items[items.length - 1]
  const msg = last.message?.trim() ?? ''
  const tail = msg ? ` · ${msg.length > 26 ? `${msg.slice(0, 26)}…` : msg}` : ''
  return `共 ${items.length} 项${tail}`
})

/** dl 动作 → 简短中文进度（未知原样回显） */
function taskActionText(tool: string): string {
  switch (tool) {
    case 'dl_save_concept':
      return '已建概念'
    case 'dl_save_relation':
      return '已建关系'
    case 'dl_save_card':
      return '已存讲义'
    case 'dl_propose_lesson_plan':
      return '已提交讲义方案'
    case 'dl_answer_question':
      return '已回答存档'
    default:
      return tool
  }
}

/** 进度条 chip 文案：子步骤上报原样展示（含 plan/▶/✓），dl 动作加状态符号 */
function taskChipText(a: DlTaskActionLog): string {
  if (a.tool === 'dl_task_progress') return a.message
  const mark = a.status === 'ok' ? '✓' : a.status === 'error' ? '✕' : '·'
  return `${mark} ${taskActionText(a.tool)}`
}

/** 本轮追问临时消息（后端持久化前先展示；tutor view 刷新后清空；task 保留到切概念） */
const liveTurns = ref<DlChatTurn[]>([])
/** 展示顺序：历史(view.turns)在前，本轮进行中的追问在后 */
const displayTurns = computed<DlChatTurn[]>(() => [
  ...(view.value?.turns ?? []),
  ...liveTurns.value,
])

/**
 * 该轮是否为"正在流式输出"的 assistant 轮（末轮 + 本轮进行中）。
 * 传给 QaAnswerView 用于节流刷新与"正在组织回答"提示的时机判断。
 */
function isTurnStreaming(index: number, turn: DlChatTurn): boolean {
  return turn.role === 'assistant' && tutorStreaming.value && index === displayTurns.value.length - 1
}

/** 最近一次 ask 的模式（停止按钮据此取消对应后端轮次） */
const lastAskMode = ref<'tutor' | 'task'>('tutor')
/** 发起本轮 ask 时的概念快照（"停止"按发起时 scope 取消，切概念不落空） */
const lastAskScopeConceptId = ref<string | null>(null)

/** 停止当前答疑/任务轮次（2026-09-09 复盘：补取消入口；后端 cancel 后 ask finally 收尾） */
async function stopAsk(): Promise<void> {
  if (!tutorStreaming.value) return
  await store.cancelAgent(lastAskMode.value, spaceId.value, lastAskScopeConceptId.value)
  lastFeedbackIsWarn.value = false
  lastFeedback.value = '已停止本轮回答'
  tutorStreaming.value = false
}

async function ask(e?: Event): Promise<void> {
  // 中文 IME 组合期间的 Enter 是"确认候选词"，不是发送
  if (e instanceof KeyboardEvent && e.isComposing) return
  const q = draft.value.trim()
  if (!q || tutorStreaming.value) return
  // 同框自动判断（M6-3 阶段一）：明确任务指令走 task 会话，答疑学习类走 tutor
  await runAsk(q, routeDlIntent(q) === 'task' ? 'task' : 'tutor')
}

/**
 * 发起一轮答疑/任务会话（2026-09-12：从 ask 抽出，供「AI 补全知识地图」等入口复用）。
 * forcedMode 指定时不再走意图路由（按钮入口自带明确 mode）。
 */
async function runAsk(q: string, forcedMode?: 'tutor' | 'task'): Promise<void> {
  if (!q || tutorStreaming.value) return
  // 研究进行中先不追问（避免同空间同概念双 agent 轮并发烧模型与写库；UI 级互斥）
  if (researching.value) {
    lastFeedbackIsWarn.value = true
    lastFeedback.value = '研究进行中——稍等它完成后再追问'
    return
  }
  const targetMode: 'tutor' | 'task' = forcedMode ?? (routeDlIntent(q) === 'task' ? 'task' : 'tutor')
  lastAskMode.value = targetMode
  const scopeConceptId = currentConceptId.value
  lastAskScopeConceptId.value = scopeConceptId
  tutorStreaming.value = true
  lastFeedback.value = ''
  taskLog.value = []
  taskLogOpen.value = false

  // 本地先落 user + assistant 占位（assistant 文本随流式增量拼接）
  const userTurn: DlChatTurn = { role: 'user', text: q }
  const assistantTurn: DlChatTurn = { role: 'assistant', text: '' }
  liveTurns.value.push(userTurn, assistantTurn)
  scrollQaToBottom()

  // 订阅 agent 事件（动作级）与流式正文（reply:start 后按 summaryEventId 订阅）
  let unsubAgent = () => {}
  let unsubStream = () => {}
  unsubAgent = store.subscribeAgentEvent(spaceId.value, scopeConceptId, (ev: DlAgentUiEvent) => {
    // 只收本 ask 发起的模式事件（research 等其它模式并发时不混流）
    if (ev.mode && ev.mode !== targetMode) return
    // task 会话：动作事件收集为执行流水（展示真实进度）
    if (targetMode === 'task' && ev.type === 'action:done' && ev.summary) {
      taskLog.value.push({ tool: ev.summary.tool, status: ev.summary.status, message: ev.summary.message })
    }
    handleAgentEvent(ev, userTurn, assistantTurn, (eventId) => {
      unsubStream()
      unsubStream = store.subscribeStream(eventId, (se: DlGenerateUiEvent) => {
        if (se.type === 'content' && se.content) {
          assistantTurn.text += se.content
          scrollQaToBottom()
        }
      })
    })
  })

  try {
    const result = await store.sendAgent({
      mode: targetMode,
      spaceId: spaceId.value,
      conceptId: scopeConceptId,
      message: q,
    })
    // 无答复不静默：流式正文为空时，用会话总结或明确错误兜底，避免“发了没反应也没报错”
    if (!assistantTurn.text) {
      const summary = (result?.content ?? '').trim()
      if (summary) {
        assistantTurn.text = summary
      } else {
        assistantTurn.text = store.error
          ? `（未收到回答：${store.error}）`
          : targetMode === 'task'
            ? '（任务未产出结果：请换更具体的指令重试）'
            : '（未收到回答：问题已记录，可稍后在“未解问题”中发起研究）'
      }
    }
  } catch (e: any) {
    // 用户主动停止不算失败（后端取消文案含"取消"）——不再给占位气泡惊吓
    const errMsg = e?.message ?? ''
    assistantTurn.text = /取消/.test(String(errMsg)) ? '' : `（处理失败：${errMsg || '未知错误'}）`
  } finally {
    unsubAgent()
    unsubStream()
    tutorStreaming.value = false
    // 视图刷新（动作可能更新树/卡；tutor 已把问答落 dl_question）
    await refreshView()
    if (targetMode === 'tutor') {
      // 答疑已落库：清空临时消息（历史由 view.turns 承载）
      liveTurns.value = []
    }
    // task 不落答疑库：保留本轮气泡供查看（切换概念时统一清空）
    draft.value = ''
    scrollQaToBottom()
  }
}

/** 处理 dl:agent 通道事件（stage/reply:start/reply:done/error/question:open） */
function handleAgentEvent(
  ev: DlAgentUiEvent,
  userTurn: DlChatTurn,
  assistantTurn: DlChatTurn,
  onReplyStart: (eventId: string) => void,
): void {
  switch (ev.type) {
    case 'question:open':
      // 后端已把问题写入队列：记录 questionId，供刷新去重/关联
      if (ev.questionId) userTurn.questionId = ev.questionId
      break
    case 'reply:start':
      if (ev.summaryEventId) onReplyStart(ev.summaryEventId)
      break
    case 'reply:done':
      // 回答结束：内容已由流式拼完（可能为空 = 答不上，保持 open 队列）
      break
    case 'error':
      // 2026-09-09 复盘：部分内容已流式到达时也在末尾补中断标记，不再静默半截
      {
        const note = `（回答中断：${ev.error ?? '未知错误'}）`
        assistantTurn.text = assistantTurn.text ? `${assistantTurn.text}\n${note}` : note
        break
      }
    default:
      break
  }
}

function scrollQaToBottom(): void {
  setTimeout(() => {
    if (qaListRef.value) qaListRef.value.scrollTop = qaListRef.value.scrollHeight
  }, 50)
}

// ==================== M4-UX1：讲义选区交互 / 答疑收藏 ====================

const lessonBodyRef = ref<HTMLElement | null>(null)
const sel = reactive({ show: false, x: 0, y: 0, text: '' })
const noteDlg = reactive({ visible: false, anchor: '' })
const noteText = ref('')
const noteSaving = ref(false)
const slidesVisible = ref(false)
/** 空间设置弹层（M6：设置入口在主界面） */
const settingsVisible = ref(false)

function hideSel(): void {
  sel.show = false
  sel.text = ''
}

/** 讲义区 mouseup：选区非空且落在讲义内 → 浮出 提问/做笔记 工具条 */
function onLessonMouseUp(): void {
  const s = window.getSelection()
  const el = lessonBodyRef.value
  if (!s || s.isCollapsed || s.rangeCount === 0 || !el) {
    hideSel()
    return
  }
  const text = s.toString().trim()
  if (text.length < 2 || text.length > 400) {
    hideSel()
    return
  }
  const an = s.anchorNode
  const fn = s.focusNode
  if (an && fn && !(el.contains(an) && el.contains(fn))) {
    hideSel()
    return
  }
  const rect = s.getRangeAt(0).getBoundingClientRect()
  sel.text = text
  sel.x = Math.min(rect.left, window.innerWidth - 280)
  sel.y = Math.min(rect.bottom + 6, window.innerHeight - 46)
  sel.show = true
}

function focusQaInput(): void {
  void nextTick(() => {
    const inner = document.querySelector('.pane-qa .el-textarea__inner') as HTMLTextAreaElement | null
    inner?.focus()
    ;(document.querySelector('.pane-qa') as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

/** #1 提问：把选中文字填入右侧答疑输入框（不自动发送，由用户编辑后发送） */
function askSelection(): void {
  if (!sel.text) return
  // 笔记 tab 下输入区不在 DOM：先切回追问栏再填充，避免"点了没反应"
  rightPane.value = 'qa'
  draft.value = sel.text
  hideSel()
  focusQaInput()
}

/** #3 做笔记：打开笔记编辑，预置选区原文 */
function openNoteSelection(): void {
  if (!sel.text) return
  noteDlg.anchor = sel.text
  noteText.value = ''
  noteDlg.visible = true
  hideSel()
}

async function saveSelectionNote(): Promise<void> {
  const c = currentConcept.value
  if (noteSaving.value || !noteDlg.anchor) return
  noteSaving.value = true
  try {
    const saved = await store.saveNote({
      id: spaceId.value,
      conceptId: c?.id ?? null,
      source: 'selection',
      anchorText: noteDlg.anchor,
      contentMd: noteText.value.trim() || '',
    })
    if (saved) {
      noteDlg.visible = false
      await store.fetchNotesOf(spaceId.value, c?.id ?? null)
    } else {
      // 2026-09-09 复盘：失败不静默、不关窗
      lastFeedbackIsWarn.value = true
      lastFeedback.value = store.error ?? '保存笔记失败，请重试'
    }
  } finally {
    noteSaving.value = false
  }
}

/** 全部 qna 收藏（当前概念 notes + 空间级 notesAll 按 id 去重；
 *  答疑历史为空间级，收藏态须跨概念判定，避免"别概念问题在当前概念下星标不亮"） */
const allQnaNotes = computed<DlNote[]>(() => {
  const byId = new Map<string, DlNote>()
  for (const n of store.notesAll) if (n.source === 'qna') byId.set(n.id, n)
  for (const n of store.notes) if (n.source === 'qna' && !byId.has(n.id)) byId.set(n.id, n)
  return [...byId.values()]
})

/** #6 收藏态：该问答是否已收藏（按 questionId 全局判定） */
function favOfTurn(qid: string | null | undefined): boolean {
  if (!qid) return false
  return allQnaNotes.value.some((n) => n.questionId === qid)
}

function questionTextOf(qid: string): string {
  const t = view.value?.turns.find((x) => x.role === 'user' && x.questionId === qid)
  return t?.text ?? ''
}

/** #6 收藏 / 取消收藏回答（qna 笔记；归属=问题真实概念，防落到"当前概念"错位） */
async function toggleFavTurn(t: DlChatTurn): Promise<void> {
  const c = currentConcept.value
  if (!t.questionId) return
  const existing = allQnaNotes.value.find((n) => n.source === 'qna' && n.questionId === t.questionId)
  if (existing) {
    const ok = await store.removeNoteOf(spaceId.value, existing.id)
    if (!ok) {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = '取消收藏失败，请重试'
      return
    }
  } else {
    // 结构化快照：anchorText=问题、contentMd=回答原文（与选区笔记同构，笔记面板统一渲染）
    const saved = await store.saveNote({
      id: spaceId.value,
      conceptId: t.conceptId ?? c?.id ?? null,
      source: 'qna',
      questionId: t.questionId,
      anchorText: questionTextOf(t.questionId) || '答疑收藏',
      contentMd: t.text,
    })
    if (!saved) {
      lastFeedbackIsWarn.value = true
      lastFeedback.value = '收藏失败，请重试'
      return
    }
  }
  await store.fetchNotesOf(spaceId.value, c?.id ?? null)
  await store.fetchNotesAll(spaceId.value, true)
}

/** 空间级笔记是否已预热（每空间一次；qna 收藏态判定数据源） */
const notesAllWarmed = ref('')

// ==================== M4-UX1 补全：右栏「笔记」面板（当前概念浏览/删除；M7-B 加空间级总览） ====================
/** 右栏当前面板：qa=追问答疑、notes=笔记 */
const rightPane = ref<'qa' | 'notes'>('qa')
/** 笔记面板范围：concept=当前概念（默认）/ all=本空间全部（M7-B 总览） */
const noteScope = ref<'concept' | 'all'>('concept')
/** 空间全部笔记条数 */
const notesAllTotal = computed(() => store.notesAll.length)
/** 全部笔记按创建时间降序 */
const sortedNotesAll = computed<DlNote[]>(() =>
  [...store.notesAll].sort((a, b) => noteTimeOf(b) - noteTimeOf(a)),
)
/** 笔记所属概念名（概念已不存在/空间级笔记给兜底文案） */
function noteConceptNameOf(n: DlNote): string {
  if (!n.conceptId) return '空间级'
  return concepts.value.find((c) => c.id === n.conceptId)?.name ?? '（已移除的概念）'
}
/** 笔记所属概念是否仍可跳转（返回概念 id 或 null） */
function noteConceptIdOf(n: DlNote): string | null {
  return n.conceptId && concepts.value.some((c) => c.id === n.conceptId) ? n.conceptId : null
}
/** 全部笔记条目点击：跳到所属概念讲义并切回概念笔记视图 */
function gotoNoteConcept(n: DlNote): void {
  const cid = noteConceptIdOf(n)
  if (!cid) return
  const c = concepts.value.find((x) => x.id === cid)
  if (!c) return
  expandPathTo(cid)
  selectConcept(c)
  noteScope.value = 'concept'
}
/** 全部视图删除：scoped 删除后同步空间级列表 */
async function removeNoteItemAll(n: DlNote): Promise<void> {
  if (deletingNoteId.value) return
  deletingNoteId.value = n.id
  try {
    await store.removeNoteOf(spaceId.value, n.id)
    await store.fetchNotesAll(spaceId.value)
  } finally {
    deletingNoteId.value = null
  }
}
// 切到「全部」时拉取空间级最新笔记（收藏/新增发生在概念视图，切回再拉保证同步）
watch(noteScope, (scope) => {
  if (scope === 'all') void store.fetchNotesAll(spaceId.value)
})
/** 正在删除的笔记 id（防连点） */
const deletingNoteId = ref<string | null>(null)
/** 当前概念笔记条数（未选概念按 0 展示） */
const noteCountOfCurrent = computed(() => (currentConceptId.value ? store.notes.length : 0))
/** 笔记按创建时间降序（新笔记在上） */
const sortedNotes = computed<DlNote[]>(() =>
  [...store.notes].sort((a, b) => noteTimeOf(b) - noteTimeOf(a)),
)

function noteTimeOf(n: DlNote): number {
  return n.createdAt ? new Date(n.createdAt).getTime() || 0 : 0
}

/** 时间展示：YYYY-MM-DD HH:mm（本地时区） */
function fmtNoteTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function removeNoteItem(n: DlNote): Promise<void> {
  if (deletingNoteId.value) return
  deletingNoteId.value = n.id
  try {
    await store.removeNoteOf(spaceId.value, n.id)
    // 重拉保持与服务端一致（删空后面板自然进入空态）
    await store.fetchNotesOf(spaceId.value, currentConcept.value?.id ?? null)
  } finally {
    deletingNoteId.value = null
  }
}

// 答疑面板在切换间卸载/重建（v-if），切回时滚动到底部
watch(rightPane, (pane) => {
  if (pane === 'qa') void nextTick(scrollQaToBottom)
})
</script>

<style scoped lang="scss">
.domain-learning-space {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color);
}

.space-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .space-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;

    h2 {
      margin: 0;
      font-size: 17px;
      color: var(--el-text-color-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    // 标题旁信息图标：默认弱化，悬停主色（2026-10-05：学习前置/推荐书籍收进这里）
    .title-tip-icon {
      flex-shrink: 0;
      font-size: 16px;
      color: var(--el-text-color-placeholder);
      cursor: default;
      transition: color 0.15s;

      &:hover {
        color: var(--el-color-primary);
      }

      &.clickable {
        cursor: pointer;
      }
    }
  }
  .space-progress {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .progress-text {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }
}

.space-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

// 追加知识点弹层（2026-09-12）
.cc-form {
  .cc-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 10px;

    .cc-label {
      width: 76px;
      flex-shrink: 0;
      padding-top: 4px;
      font-size: 12.5px;
      color: var(--el-text-color-regular);
    }
  }

  .cc-hint {
    margin-left: 84px;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--el-text-color-placeholder);
  }

  // 拆细知识点：子知识点行编辑器（2026-10-05）
  .split-rows {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .split-row {
    display: flex;
    align-items: center;
    gap: 6px;

    .split-row-name {
      flex: 0 0 220px;
    }

    .split-row-def {
      flex: 1;
      min-width: 0;
    }
  }
}

// 体系完整度悬停卡（缺口清单；2026-09-12）
.coverage-tip {
  max-width: 340px;
  font-size: 12px;
  line-height: 1.7;

  .coverage-tip-head {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .coverage-tip-item {
    &::before {
      content: '';
    }
    &.high {
      color: var(--el-color-danger);
    }
    &.medium {
      color: var(--el-text-color-regular);
    }
  }

  .coverage-tip-ok {
    color: var(--el-color-success);
  }
}

// 前置 chip 悬停说明（跨主题命中/创建引导；2026-10-05）
.prereq-tip-block {
  max-width: 300px;
  font-size: 12px;
  line-height: 1.7;

  b {
    color: var(--el-color-primary-light-3);
  }
}

// 知识体系方案提示条（2026-09-13 固定流程：待确认时高亮，点开弹窗）
.plan-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
  font-size: 12.5px;
  color: var(--el-text-color-secondary);

  &.pending {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
    font-weight: 600;
  }

  .plan-bar-text {
    flex: 1 1 auto;
  }
}

// 讲义方案提示条（2026-09-14 讲义流水线）：挂在讲义上方/空态里，待确认时高亮
.lesson-plan-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 6px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  font-size: 12.5px;
  color: var(--el-text-color-secondary);

  &.pending {
    border-color: var(--el-color-warning-light-7);
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
    font-weight: 600;
  }

  &.in-empty {
    margin-bottom: 4px;
    max-width: 520px;
  }

  .lpb-text {
    flex: 1 1 auto;
  }
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pane-map {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-qa {
  width: 400px;
  flex-shrink: 0;
  border-left: 1px solid var(--el-border-color-lighter);
}

.pane-lesson {
  flex: 1;
  min-width: 0;
}

.pane-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding: 6px 4px;

  // 地图编辑入口（图标按钮：体系完整度 / 追加知识点 / AI 补全；2026-09-12）
  .pane-title-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 400;

    // 图标按钮：去掉 el-button 的内边距与最小宽度，压成纯图标
    .map-icon-btn {
      padding: 2px;
      height: auto;
      min-height: 0;
      font-size: 16px;
      color: var(--el-text-color-secondary);

      &:hover {
        color: var(--el-color-primary);
      }
    }

    // 体系完整度：图标 + 分数徽标（颜色代表档位，悬停看缺口清单）
    .coverage-btn {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 4px;
      border-radius: 6px;
      font-size: 16px;
      cursor: default;

      .coverage-score {
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
      }

      &.good {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }
      &.mid {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }
      &.low {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }
    }
  }

  &.pane-title-sub {
    margin-top: 16px;
    border-top: 1px dashed var(--el-border-color-lighter);
    padding-top: 12px;
  }
}

.qa-badge {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 1px 8px;
  border-radius: 10px;
}

/* 右栏头部：样式与中栏 lesson-head 对齐（同样标题栏观感） */
.qa-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .head-tabs {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .head-tab {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    padding: 3px 0;
    color: var(--el-text-color-secondary);
    border-bottom: 2px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: color 0.15s;

    &:hover {
      color: var(--el-text-color-primary);
    }
    &.active {
      color: var(--el-color-primary);
      border-bottom-color: var(--el-color-primary);
    }
  }
  .head-tab-count {
    min-width: 16px;
    height: 16px;
    padding: 0 5px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    text-align: center;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  .qa-head-right {
    flex-shrink: 0;
  }
}

.map-legend {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 4px 8px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.map-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;

  .el-input {
    flex: 1;
  }
  .filter-select {
    width: 92px;
    flex-shrink: 0;
  }
}

.tree-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.tree-branch {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 4px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  white-space: nowrap;

  &:hover {
    background: var(--el-fill-color-light);
  }

  .branch-caret {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    transition: transform 0.15s;
    flex-shrink: 0;

    &.open {
      transform: rotate(90deg);
    }
  }
  .branch-name {
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .branch-stats {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    background: var(--el-fill-color-lighter);
    border-radius: 8px;
    padding: 0 7px;
    line-height: 16px;
    flex-shrink: 0;

    &.done {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }
  }
}

.tree-leaf {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  white-space: nowrap;

  &:hover {
    background: var(--el-fill-color-light);
  }
  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  .leaf-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .leaf-check {
    color: var(--el-color-success);
    font-size: 13px;
    flex-shrink: 0;
  }
  // 删除入口（2026-10-05）：悬浮叶行才浮现；未悬浮不可点，防误触确认框
  .leaf-del {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--el-text-color-placeholder);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;

    &:hover {
      color: var(--el-color-danger);
    }

    &.busy {
      color: var(--el-text-color-placeholder);
      pointer-events: none;
    }
  }

  // 只管显隐与可点性；颜色由 .leaf-del 自身（含 hover 态）控制，避免选择器打架
  &:hover .leaf-del,
  .leaf-del:focus-visible,
  .leaf-del.busy {
    opacity: 1;
    pointer-events: auto;
  }

  &:hover .leaf-del.busy {
    pointer-events: none;
  }
}

.tree-empty {
  padding: 16px 4px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;

  &.dot-mastered {
    background: var(--el-color-success);
  }
  &.dot-learning {
    background: var(--el-color-warning);
  }
  &.dot-todo {
    background: var(--el-border-color-darker);
  }
}

.research-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 4px;

  .el-icon {
    color: var(--el-color-primary);
    flex-shrink: 0;
  }
}

.lesson-head {
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .lesson-top {
    display: flex;
    align-items: center;
    gap: 12px;

    .lesson-title {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      flex: 1;
      min-width: 0;

      h3 {
        margin: 0;
        font-size: 16px;
        color: var(--el-text-color-primary);
      }
      .lesson-en {
        font-size: 12px;
        color: var(--el-text-color-placeholder);
      }
    }

    .lesson-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;

      // 核验状态图标（2026-09-15 图标化：色调代表档位，待复核带条数角标，悬停看 verifyTip）
      .verify-chip {
        display: inline-flex;
        align-items: center;
        gap: 1px;
        padding: 2px 3px;
        border-radius: 6px;
        font-size: 16px;
        cursor: help;

        .verify-count {
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
        }

        &.ok {
          color: var(--el-color-success);
        }
        &.warn {
          color: var(--el-color-warning);
        }
        &.busy {
          color: var(--el-color-primary);
        }
        &.idle {
          color: var(--el-text-color-placeholder);
        }
      }

      .feedback-toast {
        margin-left: 6px;
        font-size: 12px;
        color: var(--el-color-success);
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  // 警告/错误反馈横幅（2026-10-05：研究报错等长文本不再挤 240px 截断 toast——
  // 标题行下方全宽展示，可换行看全文，点击整条关闭）
  .lesson-feedback-bar {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
    cursor: pointer;

    .lfb-text {
      flex: 1;
      min-width: 0;
      word-break: break-all;
      white-space: pre-wrap;
      // 极端长报错（含堆栈）限高可滚动，不把中栏撑穿
      max-height: 120px;
      overflow-y: auto;
    }

    .lfb-close {
      flex-shrink: 0;
      margin-top: 3px;
      color: var(--el-color-warning);
    }
  }

  .lesson-prereq {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    font-size: 12px;

    .prereq-label {
      color: var(--el-text-color-secondary);
    }
    .prereq-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 8px;
      border-radius: 9px;

      // 关系边前置 chip（2026-10-05）：chip 即跳转链接，悬浮浮出主色
      &.clickable {
        cursor: pointer;
        transition: filter 0.15s;

        &:hover,
        &:focus-visible {
          filter: brightness(0.96);
          outline: none;
          color: var(--el-color-primary);
        }
      }

      &.ready {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }
      &.pending {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }
      // 已声明但尚未建关系边的前置：虚线弱化（顺序声明可见，图上门控待补）
      &.declared {
        color: var(--el-text-color-secondary);
        background: transparent;
        border: 1px dashed var(--el-border-color);
        padding: 0 8px;

        &.clickable {
          cursor: pointer;

          &:hover {
            color: var(--el-color-primary);
            border-color: var(--el-color-primary-light-5);
          }
        }

        // 跨主题跳转图标（系统已有该知识点）：弱主色，暗示可点
        .prereq-jump-icon {
          color: var(--el-color-primary-light-3);
        }

        // 创建入口（系统还没有）：悬浮浮现「＋」（2026-10-05 用户需求：鼠标放上去显示创建 icon）。
        // 未悬浮时 pointer-events 一并关掉——否则隐藏态仍占位可点，点 chip 附近会"莫名"弹出创建框
        .prereq-add-icon {
          color: var(--el-color-primary);
          opacity: 0;
          width: 12px;
          pointer-events: none;
          cursor: pointer;
          transition: opacity 0.15s;

          &:hover {
            color: var(--el-color-primary-light-3);
          }
        }

        &:hover .prereq-add-icon,
        .prereq-add-icon:focus-visible {
          opacity: 1;
          pointer-events: auto;
        }
      }
      .el-icon {
        font-size: 11px;
      }
    }
    .prereq-tip {
      color: var(--el-text-color-placeholder);
      font-size: 11.5px;
    }
  }
}

.lesson-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  min-height: 0;

  &.empty-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  // 「研究此概念」下面的 agent 活动行（2026-09-14：空态下贴着按钮下方居中显示，表示 agent 正在工作）
  .research-activity {
    width: 100%;
    max-width: 440px;
    margin-top: 14px;
    text-align: left;
  }

  // 块化知识点：卡片流间距由 SectionLesson 自管，压缩外层 padding 以留白更匀
  &.block-body-pad {
    padding: 14px 18px;
  }

  .empty-hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}

.qa-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qa-turn {
  display: flex;
  &.user {
    justify-content: flex-end;
  }
}

.qa-bubble {
  max-width: 88%;
  padding: 8px 11px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  background: var(--el-fill-color-light);

  // 提问（user 轮）：纯文本直出，不做 markdown 渲染（用户输入不当作富文本）
  .qa-text-user {
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    color: var(--el-text-color-primary);
  }

  .qa-streaming {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--el-color-primary);
  }

  .qa-source {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--el-color-primary);
  }
  .qa-research {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 11px;
    color: var(--el-color-warning);
  }
}

.qa-turn.user .qa-bubble {
  background: var(--el-color-primary-light-8);
}

.qa-empty {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  line-height: 1.8;
  padding: 18px 6px;
  text-align: center;
}

// M6-3 阶段二/四：task 会话执行进度（默认折叠一行；展开滚动查看全部）
.task-log {
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);

  .task-log-head {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    text-align: left;

    .task-log-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--el-text-color-secondary);
      flex-shrink: 0;
    }
    .task-log-summary {
      flex: 1;
      min-width: 0;
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--el-text-color-regular);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-log-toggle {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--el-color-primary);
    }
  }

  // 展开态：限高滚动查看全部动作/步骤
  .task-log-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 14px 8px;
    max-height: 150px;
    overflow-y: auto;
  }

  .task-action {
    align-self: flex-start;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 8px;
    padding: 0 8px;
    &.ok {
      color: var(--el-color-success);
    }
    &.skipped {
      color: var(--el-text-color-placeholder);
    }
    &.error {
      color: var(--el-color-danger);
    }
    // 子步骤上报（dl_task_progress）：统一主色，plan/▶/✓ 由文案表达
    &.progress-chip {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-color: transparent;
    }
  }
}

.qa-input {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 8px;

  // 输入框加高：底部固定 + 更大字号
  :deep(.el-textarea__inner) {
    min-height: 96px !important;
    font-size: 14px;
    line-height: 1.7;
    padding: 10px 12px;
  }

  .qa-send-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .qa-hint {
      font-size: 11px;
      color: var(--el-text-color-placeholder);
    }
    .qa-send {
      flex-shrink: 0;
    }
  }
}

// M4-UX1：回答收藏入口
.qa-fav {
  display: flex;
  justify-content: flex-end;
  margin-top: 3px;
  border-top: 1px dashed var(--el-border-color-lighter);
  padding-top: 2px;
}

// M4-UX1：讲义选区浮层（fixed 定位在选区下方）
.sel-bar {
  position: fixed;
  z-index: 3000;
  display: flex;
  gap: 6px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 4px 6px;
  box-shadow: var(--el-box-shadow-light);
}

.note-anchor {
  max-height: 120px;
  overflow: auto;
  padding: 8px 10px;
  margin-bottom: 10px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
  border-radius: 0 6px 6px 0;
}

.slides-holder {
  height: 74vh;
  min-height: 420px;
}

/* M4-UX1/M7-B：右栏「笔记」面板（当前概念 + 空间全部总览） */
.note-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.note-scope-bar {
  display: flex;
  gap: 14px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .scope-tab {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    padding: 3px 0;
    color: var(--el-text-color-secondary);
    border-bottom: 2px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    &:hover {
      color: var(--el-text-color-primary);
    }
    &.active {
      color: var(--el-color-primary);
      border-bottom-color: var(--el-color-primary);
    }
  }
}

.note-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  gap: 6px;

  // 全部笔记总览：可跳转条目给 hover 提示
  &.clickable {
    cursor: pointer;
    &:hover {
      border-color: var(--el-color-primary-light-5);
    }
  }

  .note-item-head {
    display: flex;
    align-items: center;
    gap: 8px;

    .note-concept {
      flex-shrink: 0;
      font-size: 11.5px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      padding: 0 8px;
      border-radius: 8px;
      line-height: 1.8;
    }
    .note-time {
      flex: 1;
      min-width: 0;
      font-size: 11px;
      color: var(--el-text-color-placeholder);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .note-del {
      flex-shrink: 0;
    }
  }

  // 引文（选区原文 / 收藏问题）：限高滚动，避免撑爆面板
  .note-anchor-text {
    max-height: 96px;
    overflow-y: auto;
    padding: 6px 8px;
    border-left: 3px solid var(--el-color-primary-light-5);
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.6;
    border-radius: 0 6px 6px 0;
  }

  // 正文（想法 / 回答原文）：防溢出 + 限高滚动
  .note-text {
    font-size: 13px;
    line-height: 1.7;
    color: var(--el-text-color-primary);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-height: 240px;
    overflow-y: auto;
  }
}

/* M5：空主题起步态（无任何知识点 → 生成首批知识） */
.boot-body {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  overflow-y: auto;
}

.boot-card {
  max-width: 460px;
  padding: 28px 30px;
  text-align: center;
  border: 1px dashed var(--el-border-color);
  border-radius: 14px;
  background: var(--el-fill-color-blank);

  .boot-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 10px;
    color: var(--el-color-primary);

    .el-icon {
      font-size: 34px;
    }
  }
  h3 {
    margin: 0 0 10px;
    font-size: 18px;
    color: var(--el-text-color-primary);
  }
  p {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.8;
    color: var(--el-text-color-regular);
  }
  .boot-tip {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
  /* 起步研究的活动行：贴在按钮下方、左对齐（卡片本体是居中的） */
  .boot-activity {
    margin: 12px 0 0;
    text-align: left;
  }
  .boot-message {
    margin-top: 12px;
    font-size: 13px;
    color: var(--el-color-primary);
    line-height: 1.7;
    &.warn {
      color: var(--el-color-warning);
    }
  }
}

// ==================== 讲义版本历史抽屉（2026-09-15） ====================
.version-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  &:last-child { border-bottom: none; }
}
.version-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.version-tag {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
.version-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.version-note {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin: 4px 0 2px;
}
.version-source {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.version-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0;
}
.version-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
</style>

<!-- 标题旁信息图标的 tooltip 弹层（传送至 body，需非 scoped 样式） -->
<style lang="scss">
.dl-title-tip {
  max-width: 380px;

  .dl-tip-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dl-tip-title {
    font-weight: 600;
    font-size: 12.5px;
    color: var(--el-text-color-primary);
  }

  .dl-tip-line {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 5px;
    border-bottom: 1px dashed var(--el-border-color-lighter);

    &:last-of-type {
      padding-bottom: 0;
      border-bottom: none;
    }

    .dl-tip-head {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 6px;
    }

    .dl-tip-name {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    // 徽标：默认主色弱化；需自备 / 主干依赖用强调色区分
    .dl-tip-flag {
      font-size: 10.5px;
      padding: 0 6px;
      border-radius: 8px;
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);

      &.external {
        background: var(--el-fill-color);
        color: var(--el-text-color-secondary);
      }

      &.essential {
        background: var(--el-color-danger-light-9);
        color: var(--el-color-danger);
      }
    }

    .dl-tip-desc {
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
    }
  }

  .dl-tip-hint {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }
}
</style>
