<template>
  <div class="story-room">
    <!-- 顶栏 -->
    <div class="topbar">
      <span class="back" @click="goBack">←</span>
      <span class="title">《{{ projectName }}》</span>
      <span v-if="storyType" class="tag">{{ storyType }}</span>
      <span v-if="store.state.value" class="tag target" @click="toggleTargetMenu">
        {{ store.state.value.contentTarget === 'script' ? '短剧剧本' : '长篇小说' }}
      </span>
      <span class="spacer"></span>
      <el-dropdown trigger="click" @command="onPickModel">
        <span class="tb-btn model-btn">主编模型：{{ modelLabel }} ▾</span>
        <template #dropdown>
          <el-dropdown-menu class="model-menu">
            <el-dropdown-item
              v-for="opt in modelOptions"
              :key="opt.value"
              :command="opt.value"
              :class="{ 'model-on': opt.value === modelSel }"
            >
              {{ opt.label }}
            </el-dropdown-item>
            <el-dropdown-item v-if="modelOptions.length === 0" disabled>暂无可用模型（设置里配置 AI 提供商）</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button v-if="canExportScript" size="small" type="warning" plain @click="exportToEp">转为短剧项目 ↗</el-button>
      <span class="tb-btn" @click="showGraph = true">图谱</span>
      <span class="tb-btn" @click="sideTab = 'bible'">设定集</span>
      <span class="tb-btn" @click="showSettings = true">设定</span>
      <span class="tb-btn accent" @click="goEditor">✍ 写作台 ↗</span>
    </div>

    <!-- 主体：对话 + 右栏 -->
    <div class="main" v-loading="store.status.value === 'loading'">
      <div class="chat-wrap">
        <div v-if="store.gateSuggestion.value" class="gate-banner">
          <span class="gate-text">✦ 主编建议进入「{{ phaseLabel(store.gateSuggestion.value.toPhase) }}」：{{ store.gateSuggestion.value.reason }}</span>
          <div class="gate-ops">
            <el-button size="small" type="primary" @click="store.acceptGate()">提炼并推进</el-button>
            <el-button size="small" @click="dismissGate">继续讨论</el-button>
          </div>
        </div>
        <!-- 矛盾教练：写作期连续性检查疑点（44 号补 UI 渲染，数据位此前已存在） -->
        <!-- 52 号 UI 优化：疑点折叠为摘要条，全量进抽屉（原平铺横幅吞掉 2/3 画布） -->
        <div v-if="store.conflicts.value.length" class="conflict-bar" @click="conflictDrawer = true">
          <span class="conflict-bar-text">⚔ 连续性检查 {{ store.conflicts.value.length }} 处待处理疑点（写作前请先核对）</span>
          <span class="conflict-bar-more">查看 ▸</span>
        </div>
        <!-- 设计任务流水（46 号：design 轮的工具动作 chip，folded 摘要一条） -->
        <div v-if="store.taskLog.value.length" class="task-log" :class="{ open: taskLogOpen }">
          <div class="task-log-summary" @click="taskLogOpen = !taskLogOpen">
            <span>任务执行 共 {{ store.taskLog.value.length }} 项 · {{ store.taskLog.value[store.taskLog.value.length - 1]?.message }}</span>
            <span class="task-log-caret">{{ taskLogOpen ? '▾' : '▸' }}</span>
          </div>
          <div v-if="taskLogOpen" class="task-log-items">
            <div v-for="(t, i) in store.taskLog.value" :key="i" class="task-log-item">
              <span class="tl-tool">{{ t.tool || 'tool' }}</span>
              <span class="tl-msg">{{ t.message }}</span>
            </div>
          </div>
        </div>
        <div v-if="draftPackage && draftPackage.items.length" class="task-log-review-row">
          <el-button size="small" type="warning" plain @click.stop="reviewDraftPackage">审核设计包（{{ draftPackage.items.length }} 项待确认）</el-button>
        </div>
        <ChatCanvas
          :messages="store.messages.value"
          :stream-message="store.streamMessage.value"
          :status="store.status.value"
          :busy="store.busy.value"
          :cards="pendingCards"
          :project-name="projectName"
          :locate-turn="locateReq"
          :approvals="store.state.value?.approvals ?? []"
          @adopt="onAdopt"
          @edit="openEdit"
          @regen="openFeedback"
          @ignore="store.ignoreCard"
          @open-approval="openApproval"
        />
        <div class="composer">
          <div class="composer-inner">
            <!-- 52 号 UI 优化：阶段机移到输入框工具栏（原顶栏纯文字难发现），快捷 chips 移除 -->
            <div class="composer-toolbar">
              <el-dropdown trigger="click" @command="(p: string) => store.setPhase(p as never)">
                <span class="ct-btn phase-ct" :class="{ 'phase-live': store.state.value?.phase === 'writing' }">
                  阶段 · {{ phaseLabel(store.state.value?.phase || 'story-core') }}
                  <span class="ct-sub">{{ phaseIndex(store.state.value?.phase) }}/5</span>
                  ▾
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="p in ROOM_PHASE_META"
                      :key="p.id"
                      :command="p.id"
                      :class="{ 'phase-on': p.id === store.state.value?.phase }"
                    >
                      {{ p.order }} · {{ p.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-dropdown trigger="click" @command="(sc: string) => onDistill(sc as never)">
                <span class="ct-btn" :class="{ 'ct-busy': distilling }">{{ distilling ? '⏳ 提炼中…' : '⚡ 提炼 ▾' }}</span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="overview">概要卡</el-dropdown-item>
                    <el-dropdown-item command="characters">人物卡</el-dropdown-item>
                    <el-dropdown-item command="plots">故事线卡</el-dropdown-item>
                    <el-dropdown-item command="world">世界设定卡</el-dropdown-item>
                    <el-dropdown-item command="outline">大纲卡（逐卷/逐集）</el-dropdown-item>
                    <el-dropdown-item command="chapter">章节卡（写作交接）</el-dropdown-item>
                    <el-dropdown-item command="foreshadow">伏笔卡</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span v-if="store.conflicts.value.length" class="ct-btn conflict-ct" @click="conflictDrawer = true">
                ⚔ 疑点 {{ store.conflicts.value.length }}
              </span>
              <span v-if="store.pendingApprovals.value.length" class="ct-btn approval-ct" @click="openApproval(store.pendingApprovals.value[0]!.id)">
                ✍ 待审批 {{ store.pendingApprovals.value.length }}
              </span>
              <span class="ct-hint">阶段决定主编的讨论焦点与产出物；提提炼把共识整理成卡</span>
            </div>
            <div class="input-row">
              <!-- @ 引用弹层：输入 @ 唤起；设定/章节分页签找，↑↓ 选择回车插入；发送后被 @ 的要素自动在右侧打开 -->
              <div v-if="mentionOpen && mentionSources.length" ref="mentionPopEl" class="mention-pop">
                <div class="mention-tabs">
                  <span class="mt-tab" :class="{ on: mentionTab === 'settings' }" @mousedown.prevent="mentionTab = 'settings'">🧩 设定</span>
                  <span class="mt-tab" :class="{ on: mentionTab === 'chapters' }" @mousedown.prevent="mentionTab = 'chapters'">📄 章节</span>
                  <span class="mt-hint">↑↓ 选择 · 回车插入</span>
                </div>
                <div class="mention-list">
                  <div
                    v-for="(m, i) in mentionFiltered"
                    :key="m.key"
                    class="mention-item"
                    :class="{ on: i === mentionIndex }"
                    @mousedown.prevent="selectMention(m)"
                    @mouseenter="mentionIndex = i"
                  >
                    <span class="m-ico">{{ m.icon }}</span>
                    <span class="m-label">{{ m.label }}</span>
                    <span class="m-sub">{{ m.sub }}</span>
                  </div>
                  <div v-if="!mentionFiltered.length" class="mention-none">这一类里没有匹配项（输入关键词会在当前页签内搜索）</div>
                </div>
              </div>
              <textarea
                ref="inputBoxEl"
                v-model="input"
                class="input-box"
                placeholder="随便聊；输入 @ 可引用章节/人物/设定，如「@第一章 开头钩子太弱，改得更抓人」"
                @input="updateMention"
                @keydown="onInputKeydown"
                @blur="closeMentionSoon"
              ></textarea>
              <button v-if="store.busy.value" class="send-btn stop" @click="store.cancel()">⏹ 停止</button>
              <button v-else class="send-btn" :disabled="!input.trim()" @click="doSend">➤ 发送</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏：内容（agent 产出的完整设定/整章正文实时平铺）+ 设定集，宽度可拖 -->
      <div class="side-resizer" title="拖动调整右栏宽度" @mousedown="startSideResize"></div>
      <div class="side" :style="{ width: sideWidth + 'px' }">
        <div class="side-tabs">
          <div class="s-tab" :class="{ on: sideTab === 'live' }" @click="sideTab = 'live'">
            📖 内容<span v-if="liveItems.length" class="s-cnt">{{ liveItems.length }}</span>
          </div>
          <div class="s-tab" :class="{ on: sideTab === 'bible' }" @click="sideTab = 'bible'">🌏 设定集</div>
        </div>
        <LiveStage
          v-show="sideTab === 'live' && !store.designReady.value"
          :items="liveItems"
          :active-id="liveActiveId"
          :chapters="chapterList"
          :busy="store.busy.value"
          @activate="liveActiveId = $event"
          @ask="askAbout"
          @open-editor="goEditor"
          @switch-tab="sideTab = $event"
          @feedback="onFeedbackChapter"
          @revise="onReviseProfile"
          @edit-card="onEditCard"
          @open-chapter="onOpenChapter"
          @toggle-review="toggleReviewed"
          @chapter-updated="onChapterUpdated"
        />
        <!-- 设计包审核（46 号整体确认制）：面板内直接勾选，不再弹窗挡输入 -->
        <div v-if="store.designReady.value" class="design-review">
          <div class="dr-head">
            <span class="dr-title">📋 审核设计包 · {{ store.designReady.value.title }}</span>
            <span class="dr-close" title="暂不处理（可从对话区「审核设计包」再打开）" @click="closeDesignReview">收起</span>
          </div>
          <div class="dr-hint">以下 {{ designItems.length }} 项为本轮任务的设计草稿，勾选确认后才会落库生效。</div>
          <div class="dr-items">
            <label v-for="item in designItems" :key="item.id" class="design-item" :class="{ on: checkedIds.has(item.id) }">
              <input type="checkbox" :checked="checkedIds.has(item.id)" @change="toggleItem(item.id)" />
              <span class="di-kind">{{ kindLabel(item.kind) }}</span>
              <span class="di-label">{{ item.label }}</span>
              <span v-if="item.note" class="di-note">{{ item.note }}</span>
            </label>
          </div>
          <div class="dr-ops">
            <el-button size="small" @click="onDiscardDesign">整包驳回</el-button>
            <el-button size="small" type="primary" :disabled="checkedIds.size === 0" @click="onConfirmDesign">确认所选（{{ checkedIds.size }}）</el-button>
          </div>
        </div>
        <BiblePanel
          v-show="sideTab === 'bible'"
          dock
          :project-id="projectId"
          :ledger="store.state.value?.ledger || []"
          :refresh-key="bibleRefresh"
          :cards="store.state.value?.pendingCards || []"
          @op="store.ledgerOp"
          @revise="openRevise"
          @ask="askAbout"
          @distill="onDistill"
          @open-editor="goEditor"
          @locate-turn="locateTurn"
          @foreshadow-status="onForeshadowStatus"
          @view="onBibleView"
        />
      </div>
    </div>

    <!-- 设计包确认（46 号：长程任务产物整体确认制） -->
        <el-dialog v-model="showGraph" title="知识图谱" width="92%" top="3vh" destroy-on-close class="graph-dialog">
      <GraphView :project-id="projectId" />
    </el-dialog>

    <el-drawer v-model="conflictDrawer" title="⚔ 连续性检查疑点" size="42%" :append-to-body="true" @open="onConflictDrawerOpen">
      <div class="conflict-drawer-list">
        <!-- §3b 批量处置工具条：规则筛选 + 复选 + 批量知情保留 -->
        <div class="conflict-toolbar">
          <div class="ct-chips">
            <span
              v-for="r in conflictRuleChips"
              :key="r"
              class="ct-chip"
              :class="{ on: conflictRuleFilter === r }"
              @click="conflictRuleFilter = conflictRuleFilter === r ? '' : r"
            >{{ r === '' ? '全部' : r }}</span>
          </div>
          <div class="ct-actions">
            <el-button size="small" text @click="selectAllFiltered">全选当前筛选</el-button>
            <el-button size="small" type="warning" plain :disabled="!selectedKeys.size" @click="batchKeepSelected">
              批量知情保留（{{ selectedKeys.size }}）
            </el-button>
          </div>
        </div>
        <div v-for="(c, i) in filteredConflicts" :key="i" class="conflict-item-wrap">
          <div class="conflict-item">
            <el-checkbox
              class="conflict-check"
              :model-value="selectedKeys.has(conflictKeyOf(c))"
              @change="toggleSelect(conflictKeyOf(c))"
            />
            <span class="conflict-rule">{{ ruleLabel(c.rule) }}</span>
            <span class="conflict-msg">{{ c.description || c.message }}</span>
            <el-button
              v-if="c.rule === 'R8' && c.foreshadowId"
              size="small"
              type="success"
              plain
              @click="payForeshadow(c.foreshadowId)"
            >已回收</el-button>
            <el-button
              v-if="c.rule === 'R8' && c.foreshadowId"
              size="small"
              type="danger"
              text
              @click="dropForeshadow(c.foreshadowId)"
            >弃置</el-button>
            <el-button
              v-if="c.rule === 'R9' && c.entityName"
              size="small"
              @click="whitelistName(c.entityName)"
            >白名单</el-button>
            <el-button size="small" @click="askAgentFix(i)">交主编修正</el-button>
            <el-button size="small" type="primary" plain class="conflict-solve" :loading="plans[i]?.loading" @click="solveConflict(i)">
              {{ plans[i]?.loading ? '解题中…' : 'AI 解题' }}
            </el-button>
          </div>
          <div v-if="conflictLocLine(c)" class="conflict-loc">{{ conflictLocLine(c) }}</div>
          <div v-if="plans[i]?.plan || plans[i]?.error" class="conflict-plan">
            <div v-if="plans[i]?.error" class="plan-error">解题失败：{{ plans[i].error }}</div>
            <template v-else>
              <div class="plan-diagnosis"><b>诊断：</b>{{ plans[i]!.plan!.diagnosis }}</div>
              <div
                v-for="(opt, oi) in plans[i]!.plan!.options"
                :key="oi"
                class="plan-option"
                :class="{ recommended: plans[i]!.plan!.recommended === oi }"
              >
                <div class="po-head">
                  <span class="po-label">{{ recommendedTag(plans[i]!.plan!.recommended === oi) }}{{ opt.label }}</span>
                  <el-button size="small" @click="keepConflict(i)">知情保留</el-button>
                  <el-button
                    v-if="opt.action !== 'edit_chapter' && opt.action !== 'none'"
                    size="small"
                    type="primary"
                    @click="execOption(i, oi, opt)"
                  >执行</el-button>
                  <el-button v-if="opt.action === 'edit_chapter'" size="small" @click="copyEdit(opt)">复制改文</el-button>
                  <el-button v-if="opt.action === 'edit_chapter'" size="small" @click="goEditor">去写作台</el-button>
                </div>
                <div class="po-detail">{{ opt.detail }}</div>
                <div v-if="opt.editText?.text" class="po-edit">建议文本：{{ opt.editText.text }}</div>
                <div v-if="execResults[i + '-' + oi]" class="po-result">→ {{ execResults[i + '-' + oi] }}</div>
              </div>
            </template>
          </div>
        </div>
        <div v-if="!filteredConflicts.length" class="conflict-empty">当前没有待处理疑点。</div>

        <!-- 已保留分区：保留不再只进不出，误保留可撤销；折叠避免淹没待处理项 -->
        <details v-if="store.keptConflicts.value.length" class="conflict-kept">
          <summary class="conflict-kept-summary">已保留（{{ store.keptConflicts.value.length }}）· 不拦截生成</summary>
          <div v-for="(c, i) in store.keptConflicts.value" :key="'kept-' + i" class="conflict-item-wrap">
            <div class="conflict-item kept">
              <span class="conflict-rule">{{ ruleLabel(c.rule) }}</span>
              <span class="conflict-msg">{{ c.description || c.message }}</span>
              <el-button size="small" class="conflict-solve" @click="unkeepConflict(i)">撤销保留</el-button>
            </div>
            <div v-if="c.note" class="conflict-kept-note">保留备注：{{ c.note }}</div>
          </div>
        </details>

        <!-- §3a R9 名册白名单：一次性人名不再反复上报 -->
        <details v-if="store.rosterWhitelist.value.length" class="conflict-kept">
          <summary class="conflict-kept-summary">名册白名单（{{ store.rosterWhitelist.value.length }}）· R9 不再上报</summary>
          <div v-for="w in store.rosterWhitelist.value" :key="w.name" class="conflict-item-wrap">
            <div class="conflict-item kept">
              <span class="conflict-rule">白名单</span>
              <span class="conflict-msg">{{ w.name }}<template v-if="w.note">（{{ w.note }}）</template></span>
              <el-button size="small" class="conflict-solve" @click="store.removeRosterWhitelist(w.name)">移除</el-button>
            </div>
          </div>
        </details>
      </div>
    </el-drawer>

    <ProjectSettingsDialog v-model:visible="showSettings" :project-id="projectId" />

    <!-- 账本条目轻编辑 -->
    <el-dialog v-model="reviseVisible" title="修改共识" width="460px">
      <el-input v-model="reviseTitle" placeholder="共识一句话" />
      <div class="revise-points">
        <el-input
          v-for="(_, i) in revisePoints"
          :key="i"
          v-model="revisePoints[i]"
          size="small"
          :placeholder="`支撑细节 ${i + 1}`"
        />
      </div>
      <template #footer>
        <el-button @click="reviseVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRevise">保存</el-button>
      </template>
    </el-dialog>

    <!-- 卡片轻编辑（阅读态+改一句话级别） -->
    <el-dialog v-model="editVisible" :title="`编辑卡片 · ${editCard?.title || ''}`" width="540px">
      <div class="edit-rows">
        <div v-for="(f, i) in editFields" :key="i" class="edit-row">
          <span class="edit-label">{{ f.label }}</span>
          <el-input v-model="editFields[i].value" :rows="f.value.length > 40 ? 3 : 1" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" />
        </div>
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEditAndAdopt">保存并采纳</el-button>
      </template>
    </el-dialog>

    <!-- 待审批界面：聊天里的审批按钮/顶栏「待审批」角标点击打开，通过后才继续下一章 -->
    <el-dialog
      v-model="approvalVisible"
      :title="`待审批 · ${store.approvalOpen.value?.title || ''}`"
      width="760px"
      top="4vh"
      class="approval-dialog"
    >
      <div v-if="store.approvalOpen.value" class="approval-body">
        <div class="ap-meta">
          <span v-if="store.approvalOpen.value.payload?.chapterNo">第 {{ store.approvalOpen.value.payload.chapterNo }} 章</span>
          <span v-if="store.approvalOpen.value.payload?.wordCount">{{ store.approvalOpen.value.payload.wordCount }} 字</span>
          <span v-if="store.approvalOpen.value.payload?.runId" class="ap-run">章法 run：{{ store.approvalOpen.value.payload.runId }}</span>
        </div>
        <div class="ap-checks">
          <div class="ap-check" :class="store.approvalOpen.value.payload?.postCheck?.passed ? 'ok' : 'warn'">
            <div class="ap-check-head">
              <b>一致性检查</b>
              <span>{{ store.approvalOpen.value.payload?.postCheck?.passed ? '✓ 通过' : '有疑点（见下）' }}</span>
            </div>
            <pre v-if="store.approvalOpen.value.payload?.postCheck?.report" class="ap-report">{{ store.approvalOpen.value.payload?.postCheck?.report }}</pre>
          </div>
          <div v-if="store.approvalOpen.value.payload?.storyCheck?.ran" class="ap-check" :class="store.approvalOpen.value.payload?.storyCheck?.attractive ? 'ok' : 'warn'">
            <div class="ap-check-head">
              <b>故事性检查</b>
              <span>{{ store.approvalOpen.value.payload?.storyCheck?.attractive ? '✓ 吸引人' : '偏弱' }} · {{ store.approvalOpen.value.payload?.storyCheck?.verdict }}</span>
            </div>
            <ul class="ap-sc-list">
              <li v-for="(h, i) in store.approvalOpen.value.payload?.storyCheck?.hooks || []" :key="'hk' + i">
                <b>钩子</b>{{ h.where ? `「${h.where}」` : '' }}——{{ h.what }}
              </li>
              <li v-for="(h, i) in store.approvalOpen.value.payload?.storyCheck?.highlights || []" :key="'hl' + i">
                <b>爽点</b>{{ h.where ? `「${h.where}」` : '' }}——{{ h.what }}
              </li>
              <li v-for="(r, i) in store.approvalOpen.value.payload?.storyCheck?.reasons || []" :key="'rs' + i">
                <b>依据</b>{{ r }}
              </li>
            </ul>
          </div>
        </div>
        <div class="ap-content">
          <div class="ap-content-head">本章正文</div>
          <div class="ap-content-text">{{ approvalContent || '（正文加载中…）' }}</div>
        </div>
        <el-input v-model="approvalNote" type="textarea" :rows="2" placeholder="评审意见（可选；驳回时建议填写修改方向，将转给主编）" />
      </div>
      <template #footer>
        <el-button @click="approvalVisible = false">稍后再看</el-button>
        <el-button type="danger" plain :loading="deciding" @click="onRejectApproval">驳回</el-button>
        <el-button type="primary" :loading="deciding" @click="onApproveApproval">通过并继续</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ChatCanvas from '@/components/longwriting/room/ChatCanvas.vue'
import ProjectSettingsDialog from '@/components/longwriting/ProjectSettingsDialog.vue'
import { defineAsyncComponent } from 'vue'
import BiblePanel from '@/components/longwriting/room/BiblePanel.vue'
import LiveStage from '@/components/longwriting/room/LiveStage.vue'
import {
  cardToProfile,
  cardProfileId,
  resolveBibleProfile,
  resolveCardPersistedProfile,
  type LiveItem,
  type LiveProfileItem,
} from '@/components/longwriting/room/liveItems'
import { useStoryRoom } from '@/composables/useStoryRoom'
import type { ArtifactCard, BibleGroupWire, ConsensusEntry, RoomEvent } from '@shared/types/story-room.types'
import { conflictLocLine, buildConflictFixMessage } from '@/utils/conflict-fix'

defineOptions({ name: 'StoryRoom' })

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId || ''))
const store = useStoryRoom(projectId.value, { onEvent: onRoomLiveEvent })

const projectName = ref('…')
const storyType = ref('')
const input = ref('')

// ==================== 主编模型选择（原型顶栏「主编模型 ▾」） ====================

const providerConfigs = ref<Array<Record<string, any>>>([])
const modelSel = ref('')
/** 非对话模型（嵌入/重排/多模态生成）不能当主编——按 id/name 过滤 */
function isChatModel(m: { id?: string; name?: string; features?: string[] }): boolean {
  const blob = `${m.id || ''} ${m.name || ''}`.toLowerCase()
  if (/embed|rerank|whisper|tts|asr|video|image|audio|flux|ocr|dall|seedream|seedance|kling|wan\d|-wan/.test(blob)) return false
  if (Array.isArray(m.features) && m.features.length > 0 && !m.features.some((f) => /chat|text|completion|reason/i.test(f))) return false
  return true
}

/** 正向偏好：知名对话模型家族优先（provider 列表鱼龙混杂，负向过滤堵不完——seedream 教训） */
const KNOWN_CHAT_RE = /deepseek|qwen\d|qwen-text|glm|gpt|claude|kimi|minimax|moonshot|doubao-pro|ernie|hunyuan|step-|llama/i

function chatScore(m: { id?: string; name?: string }): number {
  return KNOWN_CHAT_RE.test(`${m.id || ''} ${m.name || ''}`) ? 1 : 0
}

const modelOptions = computed(() => {
  const out: Array<{ value: string; label: string }> = []
  for (const c of providerConfigs.value) {
    for (const m of Array.isArray(c.models) ? c.models : []) {
      if (!isChatModel(m)) continue
      out.push({ value: `${c.id}|${m.id}`, label: `${c.name} / ${m.name || m.id}`, _s: chatScore(m) } as never)
    }
  }
  // 对话模型家族排前，兜底永不落到文生图/文生视频
  return (out as Array<{ value: string; label: string; _s?: number }>)
    .sort((a, b) => (b._s ?? 0) - (a._s ?? 0))
    .map(({ value, label }) => ({ value, label }))
})
const modelLabel = computed(() => {
  const hit = modelOptions.value.find((o) => o.value === modelSel.value)
  if (hit) return hit.label.split(' / ')[1] || hit.label
  return modelSel.value ? '已选' : '未配置'
})

function onPickModel(v: string): void {
  modelSel.value = v
  applyModelOpts()
  const [providerConfigId, modelId] = v.split('|')
  window.electronAPI.longwriting
    .setStageModelConfig(projectId.value, 'story-room', providerConfigId, modelId)
    .catch(() => undefined)
}

function applyModelOpts(): void {
  const [providerConfigId, modelId] = modelSel.value.split('|')
  store.setModelOpts(modelSel.value ? { providerConfigId, modelId } : {})
}

async function loadModels(): Promise<void> {
  try {
    const [cfgRes, listRes] = await Promise.all([
      window.electronAPI.longwriting.getStageModelConfigs(projectId.value),
      window.electronAPI.providerConfig.list(),
    ])
    if (listRes.success && listRes.data) {
      providerConfigs.value = (listRes.data as Array<Record<string, any>>).filter((c) => c.runtimeUsable ?? c.isEnabled)
    }
    // 兜底链：story-room 专属配置 → 复用既有写作阶段配置（overview/chapter——用户配过的
    // 一定是可用对话模型）→ 第一个过滤后的模型
    if (cfgRes.success && Array.isArray(cfgRes.data)) {
      const cfgs = cfgRes.data as Array<Record<string, any>>
      const pick = (stage: string) => {
        const hit = cfgs.find((c) => c.stage === stage)
        const v = hit ? `${hit.providerConfigId}|${hit.modelId}` : ''
        return modelOptions.value.some((o) => o.value === v) ? v : ''
      }
      modelSel.value = pick('story-room') || pick('overview') || pick('chapter') || ''
    }
    if (!modelSel.value && modelOptions.value.length > 0) {
      modelSel.value = modelOptions.value[0].value
    }
    applyModelOpts()
  } catch {
    applyModelOpts()
  }
}

const reviseVisible = ref(false)
const reviseEntry = ref<ConsensusEntry | null>(null)
const reviseTitle = ref('')
const revisePoints = ref<string[]>([])

// ==================== 设计包确认（46 号：长程任务整体确认制，面板内卡片而非弹窗） ====================
const taskLogOpen = ref(false)
const checkedIds = ref(new Set<string>())

// 实跑修复：设计确认弹窗只在 design:ready 事件瞬间弹出，错过（切标签/刷新）后无入口——
// 有草稿包时常驻「审核设计包」按钮，点开即复用同一确认面板
const draftPackage = computed(() => store.state.value?.designPackages?.find((p) => p.status === 'draft') ?? null)

function reviewDraftPackage(): void {
  if (!draftPackage.value) return
  store.designReady.value = draftPackage.value
  sideTab.value = 'live'
}

const designItems = computed(() => store.designReady.value?.items ?? [])

// 打开审核卡片（design:ready / 手动入口）→ 默认全选；用户可逐项取消
watch(
  () => store.designReady.value,
  (pkg) => {
    if (!pkg) return
    checkedIds.value = new Set(pkg.items.map((i) => i.id))
    sideTab.value = 'live'
  },
)

/** 收起审核卡片（草稿仍在，可从对话区「审核设计包」再打开） */
function closeDesignReview(): void {
  store.designReady.value = null
}

function toggleItem(id: string): void {
  const next = new Set(checkedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  checkedIds.value = next
}

interface PlanOption { action: string; label: string; detail: string; editText?: { chapterName?: string; chapterNumber?: number; text: string }; applyPayload?: Record<string, unknown> }
interface ConflictPlanView { plan?: { diagnosis: string; options: PlanOption[]; recommended?: number }; error?: string; loading?: boolean }
const plans = ref<Record<number, ConflictPlanView>>({})
const execResults = ref<Record<string, string>>({})

/** 交主编修正（分级）：有 exact loc 走精确锚点；否则让主编读章自定位 */
async function askAgentFix(i: number): Promise<void> {
  const c: any = store.conflicts.value[i]
  if (!c) return
  if (store.busy.value) {
    ElMessage.warning('主编正在发言，等本轮结束后再交')
    return
  }
  await store.send(buildConflictFixMessage(c))
  conflictDrawer.value = false
}

async function solveConflict(i: number): Promise<void> {  const c: any = store.conflicts.value[i]
  if (!c) return
  plans.value[i] = { loading: true }
  try {
    const mo: any = store.modelOpts.value || {}
    const res = await window.electronAPI.longwriting.conflictPlan(
      projectId.value,
      { rule: c.rule, message: c.description || c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber },
      // IPC 结构化克隆不接受 Vue 响应式 Proxy——拆成纯值
      { providerConfigId: mo.providerConfigId, modelId: mo.modelId },
    )
    if (res.success) plans.value[i] = { plan: res.data }
    else plans.value[i] = { error: res.error || '解题失败' }
  } catch (e: any) {
    plans.value[i] = { error: e.message }
  }
}

async function keepConflict(i: number): Promise<void> {
  const c: any = store.conflicts.value[i]
  if (!c) return
  const res = await window.electronAPI.longwriting.conflictExecute(projectId.value, 'acknowledge_conflict', {
    conflict: { rule: c.rule, message: c.description || c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber, beatText: c.beatText },
    note: '作者知情保留',
  })
  if (res.success) {
    ElMessage.success('已知情保留')
    await store.loadConflictsIfWriting()
  } else {
    ElMessage.warning(res.error || '保留失败')
  }
}

/** 撤销保留：误保留的疑点恢复拦截（保留记录此前只进不出） */
async function unkeepConflict(i: number): Promise<void> {
  const c: any = store.keptConflicts.value[i]
  if (!c) return
  const res = await window.electronAPI.longwriting.conflictExecute(projectId.value, 'unacknowledge_conflict', {
    conflict: { rule: c.rule, message: c.description || c.message, entityName: c.entityName, entityType: c.entityType, chapterNumber: c.chapterNumber, beatText: c.beatText },
  })
  const msg = (res.data && res.data.message) || res.error || (res.success ? '已撤销保留' : '撤销失败')
  ElMessage[res.success ? 'success' : 'warning'](msg)
  if (res.success) await store.loadConflictsIfWriting()
}

// ==================== §3 疑点批量处置 + R9 名册白名单 ====================

const conflictRuleFilter = ref('')
const selectedKeys = ref(new Set<string>())

/** 规则筛选 chips：全部 + 当前疑点中出现过的规则 */
const conflictRuleChips = computed(() => ['', ...new Set(store.conflicts.value.map((c) => c.rule || ''))])
/** 应用筛选后的待处理疑点 */
const filteredConflicts = computed(() => {
  const f = conflictRuleFilter.value
  return f ? store.conflicts.value.filter((c) => c.rule === f) : store.conflicts.value
})

function conflictKeyOf(c: { key?: string }): string {
  // 扫描回执自带 annotateConflicts 回填的稳定 key；缺 key 的条目不可选中（无法精确登记）
  return c.key || ''
}

function toggleSelect(key: string): void {
  if (!key) return
  const next = new Set(selectedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedKeys.value = next
}

function selectAllFiltered(): void {
  const next = new Set(selectedKeys.value)
  for (const c of filteredConflicts.value) {
    const k = conflictKeyOf(c)
    if (k) next.add(k)
  }
  selectedKeys.value = next
}

async function batchKeepSelected(): Promise<void> {
  const keys = [...selectedKeys.value]
  if (!keys.length) return
  const n = await store.batchAcknowledge(keys, `批量知情保留（${conflictRuleFilter.value || '全部'}）`)
  if (n > 0) selectedKeys.value = new Set()
}

async function whitelistName(name: string): Promise<void> {
  try {
    const res = await ElMessageBox.prompt(
      `将「${name}」加入 R9 名册白名单？加入后连续性扫描不再上报该人名。`,
      '加入白名单',
      {
        confirmButtonText: '加入',
        cancelButtonText: '取消',
        inputPlaceholder: '备注（可选）：如「单元案死者，无需入册」',
      },
    )
    const note = (res as unknown as { value?: string }).value
    await store.addRosterWhitelist(name, note?.trim() || undefined)
  } catch {
    /* 取消 */
  }
}

function onConflictDrawerOpen(): void {
  selectedKeys.value = new Set()
  conflictRuleFilter.value = ''
  void store.loadConflictsIfWriting()
}

/** §D 伏笔回收：标记 paid（章号可留空=后端取已写最大章号） */
async function payForeshadow(foreshadowId: string): Promise<void> {
  try {
    const res = await ElMessageBox.prompt(
      '在第几章回收这条伏笔？留空 = 按当前已写最大章号。',
      '标记伏笔回收',
      {
        confirmButtonText: '已回收',
        cancelButtonText: '取消',
        inputPlaceholder: '章号（可留空）',
        inputPattern: /^\d*$/,
        inputErrorMessage: '章号需为数字',
      },
    )
    const value = (res as unknown as { value?: string }).value
    const chapter = value && value.trim() ? Number(value.trim()) : undefined
    if (await store.setForeshadowStatus(foreshadowId, 'paid', chapter)) {
      ElMessage.success('伏笔已标记回收')
    }
  } catch {
    /* 取消 */
  }
}

/** §D 伏笔弃置：标记 dropped（该伏笔不再参与 R8 超期提醒） */
async function dropForeshadow(foreshadowId: string): Promise<void> {
  try {
    await ElMessageBox.confirm('确认弃置这条伏笔？弃置后不再参与超期提醒，且可在台账中回看。', '弃置伏笔', {
      confirmButtonText: '弃置',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  if (await store.setForeshadowStatus(foreshadowId, 'dropped')) {
    ElMessage.success('伏笔已弃置')
  }
}

async function execOption(i: number, oi: number, opt: PlanOption): Promise<void> {
  const c: any = store.conflicts.value[i]
  const payload = { ...(opt.applyPayload || {}), name: c.entityName || opt.editText?.chapterName, chapterNumber: c.chapterNumber }
  const res = await window.electronAPI.longwriting.conflictExecute(projectId.value, opt.action, payload)
  const msg = (res.data && res.data.message) || res.error || (res.success ? '已执行' : '执行失败')
  execResults.value[i + '-' + oi] = msg
  ElMessage[res.success ? 'success' : 'warning'](msg)
  if (res.success) {
    plans.value[i] = { ...plans.value[i] }
    await store.loadConflictsIfWriting()
  }
}

function copyEdit(opt: PlanOption): void {
  const t = opt.editText?.text || opt.detail
  navigator.clipboard?.writeText(t).then(
    () => ElMessage.success('建议文本已复制'),
    () => ElMessage.warning('复制失败，请手动选择文本'),
  )
}

function recommendedTag(rec: boolean): string {
  return rec ? '★ ' : ''
}

function ruleLabel(rule?: string): string {
  const map: Record<string, string> = {
    R1: '死亡后出场', R2: '关系失效', R3: '物品易主', R4: '技能时间线', R5: '回忆冲突',
    R6: '状态回退', R7: '钩子节拍', R8: '伏笔超期', R9: '名册外人名', R10: '大纲承诺落点',
  }
  return rule && map[rule] ? `${rule} ${map[rule]}` : (rule || '疑点')
}
function phaseIndex(phase?: string): number {
  const i = ROOM_PHASE_META.findIndex(p => p.id === phase)
  return i < 0 ? 1 : i + 1
}
function kindLabel(kind: string): string {
  switch (kind) {
    case 'card': return '卡片'
    case 'event': return '事件'
    case 'relation': return '关系'
    case 'design_doc': return '设计文档'
    default: return kind
  }
}

async function onConfirmDesign(): Promise<void> {
  const ready = store.designReady.value
  if (!ready || checkedIds.value.size === 0) return
  // 防过期快照（实跑修复）：面板持有的包可能已被确认/驳回——按 id 从最新 state 重新解析，
  // 校验通过才提交，避免"确认所选"静默无效且面板卡在旧批次上
  const latest = store.state.value?.designPackages?.find((p) => p.id === ready.id)
  if (!latest || latest.status !== 'draft') {
    ElMessage.warning('该设计包已处理过，请从「审核设计包」重新打开')
    store.designReady.value = null
    return
  }
  const validIds = latest.items.filter((i) => checkedIds.value.has(i.id)).map((i) => i.id)
  if (!validIds.length) {
    store.designReady.value = latest
    checkedIds.value = new Set(latest.items.map((i) => i.id))
    ElMessage.info('草稿内容已更新，已重新勾选，请确认')
    return
  }
  checkedIds.value = new Set(validIds)
  const ok = await store.confirmDesign(ready.id, validIds)
  if (ok) {
    // 确认落库 → 内容面板直出完整档案（设计成果从「确认列表」变成可审阅的设定全文）
    bibleRefresh.value++
    for (const item of ready.items) {
      if (item.kind !== 'card') continue
      const card = item.payload as ArtifactCard
      if (!card || (card as { status?: string }).status === 'ignored') continue
      const persisted = await resolveCardPersistedProfile(projectId.value, card)
      pushLivePersisted(persisted ?? cardToProfile(card, 'saved'))
    }
  }
}

async function onDiscardDesign(): Promise<void> {
  const ready = store.designReady.value
  if (!ready) return
  const yes = await ElMessageBox.confirm('整包驳回后草稿不落库（保留回看记录），确定？', '驳回设计包', { type: 'warning' }).catch(() => false)
  if (!yes) return
  // 同上：按最新 state 校验包仍是 draft，避免驳回过期快照
  const latest = store.state.value?.designPackages?.find((p) => p.id === ready.id)
  if (!latest || latest.status !== 'draft') {
    ElMessage.warning('该设计包已处理过，面板已刷新')
    store.designReady.value = null
    return
  }
  await store.discardDesign(ready.id)
}

onMounted(async () => {
  await store.load()
  store.loadConflictsIfWriting()
  // 章节目录（@ 引用/自由浏览共用）与设定引用源
  void loadOutlineTree()
  void loadBibleGroups()
  // 写作阶段入场：最近有正文的章节挂上内容面板（回访即见最新成品）
  if (store.state.value?.phase === 'writing') void seedLatestChapter()
  await loadModels()
  try {
    const res = await window.electronAPI.longwriting.getProject(projectId.value)
    if (res.success && res.data) {
      projectName.value = res.data.name
      storyType.value = (res.data as any).overview?.storyType || ''
    }
  } catch { /* 标题兜底 */ }
})

/** 发送后：被 @ 的要素自动在右侧「内容」打开（改哪看哪；按提及顺序最后聚焦最后一个） */
async function openMentionedItems(text: string): Promise<void> {
  const hits = mentionSources.value.filter((m) => text.includes(`@${m.insert}`))
  if (hits.length === 0) return
  sideTab.value = 'live'
  for (const m of hits) {
    if (m.chapterId) {
      const meta = chapterList.value.find((c) => c.id === m.chapterId)
      await pushChapterLive(m.chapterId, { chapterNo: meta?.no ?? null, title: meta?.name || '', wordCount: 0, patched: false })
    } else if (m.bibleKind && m.bibleEntryId) {
      const item = await resolveBibleProfile(projectId.value, m.bibleKind, { id: m.bibleEntryId })
      if (item) pushLive(item)
    } else if (m.cardId) {
      const card = (store.state.value?.pendingCards || []).find((c) => c.id === m.cardId)
      if (card && card.status !== 'ignored' && card.status !== 'failed') pushLive(cardToProfile(card))
    }
  }
}

function doSend(): void {
  if (store.busy.value) return
  if (!modelSel.value) {
    ElMessage.warning('请先在顶栏选择主编模型（设置里可配置 AI 提供商）')
    return
  }
  const text = input.value
  input.value = ''
  closeMention()
  void openMentionedItems(text)
  store.send(text)
}


function askAbout(text: string): void {
  input.value = `${text} `
  ;(document.querySelector('.input-box') as HTMLTextAreaElement | null)?.focus()
}

function openRevise(entry: ConsensusEntry): void {
  reviseEntry.value = entry
  reviseTitle.value = entry.title
  revisePoints.value = entry.points.length > 0 ? [...entry.points] : ['']
  reviseVisible.value = true
}

function saveRevise(): void {
  if (!reviseEntry.value) return
  store.ledgerOp({
    action: 'revise',
    entryId: reviseEntry.value.id,
    title: reviseTitle.value,
    points: revisePoints.value.filter((p) => p.trim()),
  })
  reviseVisible.value = false
}

// ==================== 右栏内容面板（agent 产出实时平铺：完整设定 + 整章正文） ====================

const sideTab = ref<'live' | 'bible'>('live')
const liveItems = ref<LiveItem[]>([])
const liveActiveId = ref<string | null>(null)

/** 推送内容条目：同槽位覆盖，最新在前并自动聚焦（右侧实时显示、免翻菜单） */
function pushLive(item: LiveItem): void {
  const idx = liveItems.value.findIndex((i) => i.id === item.id)
  if (idx >= 0) liveItems.value.splice(idx, 1)
  liveItems.value.unshift(item)
  if (liveItems.value.length > 30) liveItems.value.pop()
  liveActiveId.value = item.id
  sideTab.value = 'live'
}

/** 落库档案推送：顺手撤下同名的草稿预览槽位，避免页签里同名双条 */
function pushLivePersisted(item: LiveProfileItem): void {
  for (const it of [...liveItems.value]) {
    if (it.type === 'profile' && it.status === 'draft' && it.title === item.title && it.id !== item.id) {
      removeLive(it.id)
    }
  }
  pushLive(item)
}

function removeLive(id: string): void {
  const idx = liveItems.value.findIndex((i) => i.id === id)
  if (idx < 0) return
  liveItems.value.splice(idx, 1)
  if (liveActiveId.value === id) liveActiveId.value = liveItems.value[0]?.id ?? null
}

/** 房间事件 → 内容面板推送：卡片产出/更新即渲染完整档案；章节落库即上整章正文 */
function onRoomLiveEvent(event: RoomEvent): void {
  switch (event.type) {
    case 'card:ready':
      for (const c of event.cards) pushLive(cardToProfile(c))
      break
    case 'card:update':
      void onCardUpdated(event.card)
      break
    case 'chapter:saved':
      void pushChapterLive(event.outlineId, {
        chapterNo: event.chapterNo,
        title: event.title,
        wordCount: event.wordCount,
        patched: event.patched === true,
      })
      break
  }
}

/** 卡片更新：采纳→回查落库档案（全字段+关系网）；重提→刷新预览；忽略→撤下 */
async function onCardUpdated(card: ArtifactCard): Promise<void> {
  if (card.status === 'ignored' || card.status === 'failed') {
    removeLive(cardProfileId(card))
    return
  }
  if (card.status === 'adopted') {
    const persisted = await resolveCardPersistedProfile(projectId.value, card)
    pushLivePersisted(persisted ?? cardToProfile(card, 'saved'))
    return
  }
  pushLive(cardToProfile(card))
}

/** 章节正文落库 → 拉整章上内容面板（读失败静默，不打断研讨） */
async function pushChapterLive(
  outlineId: string,
  hint: { chapterNo: number | null; title: string; wordCount: number; patched: boolean },
): Promise<void> {
  try {
    const res = await window.electronAPI.longwriting.getChapter(outlineId)
    const ch = res.success ? res.data : null
    const content = String(ch?.content || '')
    if (!content.trim()) return
    const meta = chapterList.value.find((c) => c.id === outlineId)
    pushLive({
      id: `chapter:${outlineId}`,
      type: 'chapter',
      outlineId,
      chapterNo: hint.chapterNo ?? meta?.no ?? null,
      title: hint.title || meta?.name || '未命名章节',
      content,
      wordCount: Number(ch?.wordCount) || hint.wordCount || content.replace(/\s/g, '').length,
      patched: hint.patched,
      updatedAt: Date.now(),
    })
  } catch { /* 忽略 */ }
}

/** 设定集（停靠页签）点条目 → 内容面板直出完整档案（替代 380px 抽屉） */
async function onBibleView(group: BibleGroupWire, entryId: string): Promise<void> {
  const item = await resolveBibleProfile(projectId.value, group.kindKey, { id: entryId })
  if (item) {
    pushLive(item)
    return
  }
  const entry = group.entries.find((e) => e.id === entryId)
  if (!entry) return
  pushLive({
    id: `profile:${group.kindKey}:${entry.name}`,
    type: 'profile',
    icon: group.icon || '🧩',
    title: entry.name,
    kindLabel: group.label,
    accentVar: 'var(--ka-overview)',
    fields: [{ k: '简介', v: entry.sub || '（详情加载失败，可重试）' }],
    relations: [],
    status: 'saved',
    askText: `关于「${entry.name}」（${group.label}）：`,
    updatedAt: Date.now(),
  })
}

// ==================== 章节目录与自由浏览（非对话时也能翻任意内容） ====================

/** 大纲树（章节标题/目录/序号来源；入场即拉，@ 引用与播种共用） */
const outlineTree = ref<Array<Record<string, any>>>([])

async function loadOutlineTree(): Promise<void> {
  try {
    const res = await window.electronAPI.longwriting.getOutlineTree(projectId.value)
    if (res.success && Array.isArray(res.data)) outlineTree.value = res.data
  } catch { /* 目录加载失败不阻断 */ }
}

/** 按书中顺序展平章节（卷序→卷内序→散章），no 为全书章号 */
const chapterList = computed<Array<{ id: string; no: number | null; name: string }>>(() => {
  const nodes = outlineTree.value
  const chapterNodes = nodes.filter((n) => n.nodeType === 'chapter')
  if (chapterNodes.length === 0) return []
  const volumes = nodes
    .filter((n) => n.nodeType === 'volume')
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  const ordered: Array<Record<string, any>> = []
  const byParent = (pid: string) =>
    chapterNodes.filter((n) => (n.parentId || '') === pid).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  for (const v of volumes) ordered.push(...byParent(String(v.id)))
  const volumeIds = new Set(volumes.map((v) => String(v.id)))
  ordered.push(...chapterNodes.filter((n) => !n.parentId || !volumeIds.has(String(n.parentId))))
  return ordered.map((n, i) => ({ id: String(n.id), no: i + 1, name: String(n.name || '') }))
})

/** 目录点开任意章（还没有正文时提示去让主编写，不推空条目） */
async function onOpenChapter(outlineId: string): Promise<void> {
  const meta = chapterList.value.find((c) => c.id === outlineId)
  await pushChapterLive(outlineId, { chapterNo: meta?.no ?? null, title: meta?.name || '', wordCount: 0, patched: false })
  const exists = liveItems.value.some((i) => i.id === `chapter:${outlineId}`)
  if (!exists) ElMessage.info('该章还没有正文——可在左侧输入「@章节名 开始写作」让主编开写')
}

/** 入场播种：写作阶段把最近有正文的章节挂上面板（回访即见最新成品） */
async function seedLatestChapter(): Promise<void> {
  try {
    if (outlineTree.value.length === 0) await loadOutlineTree()
    const chapters = chapterList.value
    for (const c of chapters.slice(-3).reverse()) {
      const before = liveItems.value.length
      await pushChapterLive(c.id, { chapterNo: c.no, title: c.name, wordCount: 0, patched: false })
      if (liveItems.value.length > before) break
    }
  } catch { /* 播种失败不影响研讨室 */ }
}

// ==================== 面板审改：提意见 / 让主编改 / 编辑后采纳 / 认可标记 ====================

/** 面板动作统一发送口（busy 时拦截并提示，不静默丢指令） */
function sendInstruction(text: string): void {
  if (store.busy.value) {
    ElMessage.warning('主编正在发言，等本轮结束后再交')
    return
  }
  store.send(text)
}

/** 章节提修改意见 → 组装指令交主编（局部修正/重写，落库后 chapter:saved 自动刷新面板） */
async function onFeedbackChapter(item: Extract<LiveItem, { type: 'chapter' }>): Promise<void> {
  const label = `${item.chapterNo ? `第${item.chapterNo}章` : ''}《${item.title}》`
  const res = await ElMessageBox.prompt('', `提修改意见 · ${label}`, {
    confirmButtonText: '交给主编',
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputPlaceholder: '例如：开头钩子太弱，前三段直接进入冲突；结尾卡点换成主角视角',
  }).catch(() => null)
  const v = (res as unknown as { value?: string } | null)?.value?.trim()
  if (!v) return
  sendInstruction(`请修改${label}：${v}`)
}

/** 档案「让主编改」→ 填空式指令（主编走设计工具，产出再进设计包确认） */
async function onReviseProfile(item: Extract<LiveItem, { type: 'profile' }>): Promise<void> {
  const res = await ElMessageBox.prompt('', `让主编改 · ${item.title}`, {
    confirmButtonText: '交给主编',
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputPlaceholder: '例如：把动机从复仇改成赎罪；背景补一段与师门决裂的往事',
  }).catch(() => null)
  const v = (res as unknown as { value?: string } | null)?.value?.trim()
  if (!v) return
  sendInstruction(`请修改「${item.title}」（${item.kindLabel}）的设定：${v}`)
}

/** 草稿卡「编辑后采纳」：复用对话区的字段编辑对话框（保存即采纳→面板原地升级） */
function onEditCard(cardId: string): void {
  const card = (store.state.value?.pendingCards || []).find((c) => c.id === cardId)
  if (!card) {
    ElMessage.warning('该草稿已不在待定列表（可能已被处理）')
    return
  }
  openEdit(card)
}

/** 「认可这版」：会话内轻量标记（不落库），便于回头核对哪些章已过目 */
function toggleReviewed(itemId: string): void {
  const it = liveItems.value.find((i) => i.id === itemId)
  if (it && it.type === 'chapter') it.reviewed = !it.reviewed
}

/** 就地编辑保存回调（LiveStage 已走与写作台同一 saveChapter 通道，这里同步条目） */
function onChapterUpdated(p: { outlineId: string; content: string; wordCount: number }): void {
  const it = liveItems.value.find((i) => i.id === `chapter:${p.outlineId}`)
  if (it && it.type === 'chapter') {
    it.content = p.content
    it.wordCount = p.wordCount
    it.updatedAt = Date.now()
  }
}

// ==================== 输入框 @ 引用（章节/人物/设定项） ====================

interface MentionItem {
  key: string
  insert: string
  label: string
  sub: string
  icon: string
  /** 发送后自动打开用：章节/设定/卡片三选其一 */
  chapterId?: string
  bibleKind?: string
  bibleEntryId?: string
  cardId?: string
}
const inputBoxEl = ref<HTMLTextAreaElement | null>(null)
const mentionPopEl = ref<HTMLElement | null>(null)
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionIndex = ref(0)
/** 弹层页签：设定 / 章节（默认设定——章节另有全量「📑 目录」） */
const mentionTab = ref<'settings' | 'chapters'>('settings')
/** 当前 @token 在输入框中的起点（@ 符号处） */
let mentionStart = -1

/** 设定项引用源：bible 全分组（挂载、设定集刷新、@ 弹层打开时兜底重拉） */
const bibleGroups = ref<BibleGroupWire[]>([])
async function loadBibleGroups(): Promise<void> {
  try {
    const res = await window.electronAPI.longwriting.bibleList(projectId.value)
    if (res.success && Array.isArray(res.data)) bibleGroups.value = res.data
    else console.warn('[StoryRoom] @ 引用源(bible:list)返回异常:', res?.error)
  } catch (e) {
    console.warn('[StoryRoom] @ 引用源(bible:list)加载失败:', e)
  }
}

const mentionSources = computed<MentionItem[]>(() => {
  const out: MentionItem[] = []
  // ① 章节（目录序）
  for (const c of chapterList.value) {
    const name = String(c.name || '')
    const insert = /^第\s*\d+\s*[章集]/.test(name) ? name : c.no ? `第${c.no}章 ${name}` : name
    out.push({ key: `ch:${c.id}`, insert, label: insert, sub: '章节', icon: '📄', chapterId: c.id })
  }
  // ② 设定集条目（已落库档案）
  const seen = new Set<string>()
  for (const g of bibleGroups.value) {
    for (const e of g.entries) {
      if (!e.name || seen.has(e.name)) continue
      seen.add(e.name)
      out.push({ key: `${g.kindKey}:${e.id}`, insert: e.name, label: e.name, sub: g.label, icon: g.icon || '🧩', bibleKind: g.kindKey, bibleEntryId: e.id })
    }
  }
  // ③ 讨论中的卡片（新设计的人物/势力等尚未落库——设定集里还没有，也要能 @）
  for (const c of store.state.value?.pendingCards || []) {
    if (c.status === 'ignored' || c.status === 'failed') continue
    const d = (c.data || {}) as Record<string, any>
    const name = String(d.name || d.title || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const meta = KIND_META[c.kind] || KIND_META.custom
    out.push({ key: `card:${c.id}`, insert: name, label: name, sub: `${meta.label}卡`, icon: meta.ico, cardId: c.id })
  }
  return out
})

/** @ 弹层的匹配口径（标签含关键词或分类名含关键词） */
function mentionHit(m: MentionItem, raw: string): boolean {
  if (!raw) return true
  const q = raw.toLowerCase()
  return m.label.toLowerCase().includes(q) || m.sub.includes(raw)
}

const mentionFiltered = computed<MentionItem[]>(() => {
  const raw = mentionQuery.value.trim()
  const pool = mentionSources.value.filter((m) => (mentionTab.value === 'chapters' ? m.sub === '章节' : m.sub !== '章节'))
  const list = pool.filter((m) => mentionHit(m, raw))
  if (raw) list.sort((a, b) => Number(b.label.toLowerCase().startsWith(raw.toLowerCase())) - Number(a.label.toLowerCase().startsWith(raw.toLowerCase())))
  return list.slice(0, 50)
})

// 打了关键词但当前页签无匹配、另一页签有 → 自动切过去（搜索不在空列表上终结）
watch([mentionQuery, mentionSources], () => {
  const raw = mentionQuery.value.trim()
  if (!raw) return
  const inTab = (tab: 'settings' | 'chapters') =>
    mentionSources.value.some((m) => (tab === 'chapters' ? m.sub === '章节' : m.sub !== '章节') && mentionHit(m, raw))
  if (!inTab(mentionTab.value)) {
    const other = mentionTab.value === 'chapters' ? 'settings' : 'chapters'
    if (inTab(other)) mentionTab.value = other
  }
})

watch(mentionFiltered, () => {
  mentionIndex.value = 0
})
watch(mentionIndex, async () => {
  await nextTick()
  mentionPopEl.value?.querySelector('.mention-item.on')?.scrollIntoView({ block: 'nearest' })
})

function closeMention(): void {
  mentionOpen.value = false
  mentionQuery.value = ''
  mentionStart = -1
}

/** 失焦延迟关：给「mousedown 插入」留一拍（mousedown.prevent 已保住焦点，这里只兜底） */
function closeMentionSoon(): void {
  setTimeout(() => {
    if (!inputBoxEl.value || document.activeElement !== inputBoxEl.value) closeMention()
  }, 120)
}

/** 输入变化 → 检测光标前的 @token，决定弹层开关与过滤词 */
function updateMention(): void {
  const ta = inputBoxEl.value
  if (!ta) return
  const pos = ta.selectionStart ?? input.value.length
  const before = input.value.slice(0, pos)
  const m = before.match(/(^|\s)@([^\s@]*)$/)
  if (!m) {
    closeMention()
    return
  }
  // 引用源兜底重拉：挂载期加载失败/竞态时，第一次打 @ 也能拿到设定项
  if (bibleGroups.value.length === 0) void loadBibleGroups()
  if (outlineTree.value.length === 0) void loadOutlineTree()
  mentionStart = pos - m[2].length - 1
  mentionQuery.value = m[2]
  mentionOpen.value = true
  mentionIndex.value = 0
}

/** 插入 @引用：可见文本即规范名（写章工具/查设定工具都能按名称解析，零后端改动） */
function selectMention(item: MentionItem): void {
  if (mentionStart < 0) return
  const ta = inputBoxEl.value
  const pos = ta?.selectionStart ?? input.value.length
  const next = input.value.slice(0, mentionStart) + '@' + item.insert + ' ' + input.value.slice(pos)
  const caret = mentionStart + item.insert.length + 2
  input.value = next
  closeMention()
  nextTick(() => {
    ta?.focus()
    ta?.setSelectionRange(caret, caret)
  })
}

function onInputKeydown(e: KeyboardEvent): void {
  // 中文输入法组词中的回车是"确认候选"，不是发送/选择
  if (e.isComposing || e.keyCode === 229) return
  if (mentionOpen.value && mentionFiltered.value.length > 0) {
    const len = mentionFiltered.value.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionIndex.value = (mentionIndex.value + 1) % len
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionIndex.value = (mentionIndex.value - 1 + len) % len
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const pick = mentionFiltered.value[mentionIndex.value]
      if (pick) selectMention(pick)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMention()
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    doSend()
  }
}

// ==================== 右栏宽度拖拽（看正文与下指令并排，宽度可调） ====================

const SIDE_WIDTH_KEY = 'story-room.side-width'
const SIDE_MIN = 380

function loadSideWidth(): number {
  const v = Number(localStorage.getItem(SIDE_WIDTH_KEY))
  const max = Math.max(SIDE_MIN + 40, Math.round(window.innerWidth * 0.66))
  if (Number.isFinite(v) && v >= SIDE_MIN) return Math.min(v, max)
  return 500
}
const sideWidth = ref(loadSideWidth())

function startSideResize(e: MouseEvent): void {
  e.preventDefault()
  document.body.classList.add('side-resizing')
  const move = (ev: MouseEvent): void => {
    const max = Math.max(SIDE_MIN + 40, Math.round(window.innerWidth * 0.66))
    sideWidth.value = Math.min(max, Math.max(SIDE_MIN, window.innerWidth - ev.clientX))
  }
  const up = (): void => {
    document.body.classList.remove('side-resizing')
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    localStorage.setItem(SIDE_WIDTH_KEY, String(sideWidth.value))
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// ==================== 阶段门 / 内容目标 / 转短剧桥 ====================

import { ROOM_PHASE_META, KIND_META } from '@/components/longwriting/room/roomKinds'

function phaseLabel(id: string): string {
  return ROOM_PHASE_META.find((p) => p.id === id)?.label || id
}

function dismissGate(): void {
  store.gateSuggestion.value = null
}

const targetMenuVisible = ref(false)
function toggleTargetMenu(): void {
  targetMenuVisible.value = !targetMenuVisible.value
  if (!targetMenuVisible.value) return
  const next = store.state.value?.contentTarget === 'script' ? 'novel' : 'script'
  ElMessageBox.confirm(`内容目标将切换为「${next === 'script' ? '短剧剧本' : '长篇小说'}」，大纲阶段策略随之改变。确认？`, '切换内容目标', {
    confirmButtonText: '切换', cancelButtonText: '取消', type: 'info',
  })
    .then(() => store.setTarget(next as 'novel' | 'script'))
    .catch(() => undefined)
    .finally(() => { targetMenuVisible.value = false })
}

/** 转短剧桥（设计文档 §6.2 v2.1 定案：渲染层编排，零后端改动） */
const canExportScript = computed(
  () => store.state.value?.contentTarget === 'script'
    && (store.state.value?.pendingCards || []).some((c) => c.kind === 'outline' && c.status === 'adopted'),
)

async function exportToEp(): Promise<void> {
  try {
    const epApi = window.electronAPI.episodeProduction
    // 0) 先校验分集卡（评审 P2-16：空时不要先建出孤儿剧集项目）
    const adoptedEpisodes = (store.state.value?.pendingCards || [])
      .filter((c) => c.kind === 'outline' && c.status === 'adopted' && c.data?.index)
      .sort((a, b) => Number(a.data.index) - Number(b.data.index))
    if (adoptedEpisodes.length === 0) {
      ElMessage.warning('没有已定稿的分集大纲卡——先逐集提炼并采纳')
      return
    }
    const overviewRes = await window.electronAPI.longwriting.getStoryOverview(projectId.value)
    const overview = overviewRes.success ? overviewRes.data : null

    // 1) 建剧集项目（回链长文项目）
    // 查重：该项目已转过短剧则不再重复建（评审 A4）
    const existingList = await epApi.listProjectsSummary?.()
    const dup = existingList?.success && Array.isArray(existingList.data)
      ? (existingList.data as Array<Record<string, any>>).find((x) => x.longWritingProjectId === projectId.value)
      : null
    if (dup) {
      ElMessageBox.confirm(`该项目已转过短剧《${dup.name}》，是否前往？`, '已存在', { confirmButtonText: '前往', cancelButtonText: '取消', type: 'info' })
        .then(() => router.push(`/episode-production/${dup.id}`))
        .catch(() => undefined)
      return
    }

    const created = await epApi.createProject(projectName.value, projectId.value, {
      styleAnchors: storyType.value ? [storyType.value] : [],
    })
    if (!created.success) throw new Error(created.error || '创建剧集项目失败')
    const epProjectId = created.data?.id ?? (created.data as any)

    // 2) 每集种子：概要+人物小传+故事线+该集大纲（uploaded 模式，单集 ≤15000 字）
    const episodes = adoptedEpisodes.map((c) => {
      const d = c.data as Record<string, any>
      const parts = [
        `【作品概要】${overview?.summary || ''}`,
        `【人物】${(d.characters || []).join('、')}`,
        `【本集钩子】${d.hook || ''}`,
        `【本集反转/卡点】${d.reversal || ''}`,
        `【场景】${(d.scenes || []).map((sc: any) => `${sc.name}（${sc.timeOfDay || ''}）：${sc.summary || ''}`).join('；')}`,
      ]
      return { title: `第${d.index}集 ${d.title || ''}`.trim(), content: parts.filter(Boolean).join('\n').slice(0, 15000) }
    })
    const batch = await epApi.batchCreateEpisodes({ projectId: epProjectId, episodes })
    if (!batch.success) {
      // 失败回删刚建的空 EP 项目（评审 A4：不留孤儿）
      await epApi.deleteProject?.(epProjectId)?.catch?.(() => undefined)
      throw new Error(batch.error || '创建分集失败')
    }

    ElMessageBox.confirm(`已创建剧集项目《${projectName.value}》与 ${episodes.length} 个分集（种子文本就绪）。现在去 EpisodeStudio 逐集生成剧本？`, '转短剧成功', {
      confirmButtonText: '前往 EpisodeStudio', cancelButtonText: '留在研讨室', type: 'success',
    })
      .then(() => router.push(`/episode-production/${epProjectId}`))
      .catch(() => undefined)
  } catch (e: any) {
    ElMessage.error(e?.message || '转短剧失败')
  }
}

// ==================== 提炼与卡片闭环 ====================

const pendingCards = computed(() => store.state.value?.pendingCards || [])
const distilling = ref(false)

async function onDistill(scope?: string): Promise<void> {
  if (distilling.value) return
  distilling.value = true
  try {
    await store.distill((scope || undefined) as never)
  } finally {
    distilling.value = false
  }
}

const bibleRefresh = ref(0)
const conflictDrawer = ref(false)
const showGraph = ref(false)
const showSettings = ref(false)

// 设定集数据变化（采纳/确认/伏笔操作）→ @ 引用源同步刷新
watch(bibleRefresh, () => {
  void loadBibleGroups()
})
const GraphView = defineAsyncComponent(() => import('@/components/longwriting/graph/GraphView.vue'))

async function onForeshadowStatus(id: string, status: 'paid' | 'dropped', payoff?: number | null): Promise<void> {
  const res = await window.electronAPI.longwriting.bibleForeshadowStatus(projectId.value, id, status, payoff ?? null)
  if (res.success) {
    ElMessage.success(status === 'paid' ? '伏笔已回收' : '伏笔已弃置')
    bibleRefresh.value++
  } else {
    ElMessage.error(res.error || '操作失败')
  }
}
/** 溯源跳转：{turn, n} 变化触发 ChatCanvas 滚动定位 */
const locateReq = ref<{ turn: number; n: number } | null>(null)
let locateSeq = 0
function locateTurn(turn: number): void {
  locateReq.value = { turn, n: ++locateSeq }
}

async function onAdopt(card: ArtifactCard): Promise<void> {
  const ok = await store.adoptCard(card)
  if (ok) {
    bibleRefresh.value++ // 圣经面板重拉（评审 P2-18：采纳后面板刷新）
    if (card.kind === 'chapter') goEditorChapters()
  }
}

function goEditorChapters(): void {
  router.push({ path: `/story-editor/${projectId.value}`, query: { stage: 'chapters' } })
}

const editVisible = ref(false)
const editCard = ref<ArtifactCard | null>(null)
const editFields = ref<Array<{ field: string; label: string; value: string }>>([])

function openEdit(card: ArtifactCard): void {
  editCard.value = card
  const data = (card.data || {}) as Record<string, unknown>
  editFields.value = Object.entries(data)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([field, v]) => ({ field, label: field, value: String(v ?? '') }))
  editVisible.value = true
}

async function saveEditAndAdopt(): Promise<void> {
  if (!editCard.value) return
  const patch: Record<string, unknown> = {}
  for (const f of editFields.value) {
    const origin = (editCard.value.data as Record<string, unknown>)[f.field]
    if (typeof origin === 'number') {
      const n = Number(f.value)
      if (!Number.isNaN(n)) patch[f.field] = n
    } else {
      patch[f.field] = f.value
    }
  }
  const ok = await store.adoptCard(editCard.value, patch)
  if (ok) {
    editVisible.value = false
    bibleRefresh.value++
  }
}

async function openFeedback(card: ArtifactCard): Promise<void> {
  try {
    const res = await ElMessageBox.prompt('按什么方向重新提炼这张卡片？', '换一版', {
      confirmButtonText: '重新提炼',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：动机改成"赎罪"而不是"复仇"',
    })
    const value = (res as unknown as { value?: string }).value
    if (value?.trim()) await store.regenerateCard(card, value.trim())
  } catch {
    /* 取消 */
  }
}

// ==================== 待审批界面（章法产物 → 用户确认 → 继续） ====================

const approvalVisible = ref(false)
const approvalContent = ref('')
const approvalNote = ref('')
const deciding = ref(false)

/** 打开审批界面：拉审批单 + 现取本章正文（正文不进状态 JSON，按 outlineId 现读） */
async function openApproval(id: string): Promise<void> {
  const ap = (store.state.value?.approvals ?? []).find((a) => a.id === id)
  if (!ap) {
    ElMessage.warning('审批单不存在或已删除')
    return
  }
  store.approvalOpen.value = ap
  approvalNote.value = ap.note || ''
  approvalContent.value = ''
  approvalVisible.value = true
  const oid = ap.payload?.outlineId
  if (oid) {
    try {
      const res = await window.electronAPI.longwriting.getChapter(oid)
      approvalContent.value = res?.data?.content || ''
    } catch {
      approvalContent.value = '（正文读取失败，可去写作台查看）'
    }
  }
}

/** 通过：落审批终态 + 以用户身份把通过结论发进研讨室，主编据此继续下一章 */
async function onApproveApproval(): Promise<void> {
  const ap = store.approvalOpen.value
  if (!ap || deciding.value) return
  deciding.value = true
  try {
    const decided = await store.decideApproval(ap.id, 'approve', approvalNote.value || undefined)
    if (decided) {
      approvalVisible.value = false
      const title = ap.payload?.chapterTitle || ap.title
      const note = approvalNote.value.trim()
      await store.send(
        `【评审通过】《${title}》已确认。${note ? `评审意见：${note}。` : ''}请继续执行既定流程：写下一章，写完自动出审批单等我确认。`,
      )
    }
  } finally {
    deciding.value = false
  }
}

/** 驳回：落审批终态 + 把驳回意见发进研讨室，主编据此修改或与用户确认方向 */
async function onRejectApproval(): Promise<void> {
  const ap = store.approvalOpen.value
  if (!ap || deciding.value) return
  deciding.value = true
  try {
    const decided = await store.decideApproval(ap.id, 'reject', approvalNote.value || undefined)
    if (decided) {
      approvalVisible.value = false
      const title = ap.payload?.chapterTitle || ap.title
      const note = approvalNote.value.trim()
      await store.send(
        `【评审驳回】《${title}》未通过。${note ? `修改方向：${note}。` : '请给出你的修改建议，与我确认方向后重写。'}`,
      )
    }
  } finally {
    deciding.value = false
  }
}

function goBack(): void {
  router.push('/longwriting')
}

function goEditor(): void {
  router.push(`/story-editor/${projectId.value}`)
}
</script>

<style scoped>
.story-room {
  display: flex; flex-direction: column; height: calc(100vh - var(--header-height, 56px));
  --ka-overview: #7a8ba3; --ka-character: #cf8f3f; --ka-plot: #c66a95; --ka-faction: #7b6cc9;
  --ka-skill: #c96a6a; --ka-item: #3fa9a9; --ka-location: #5f9f62; --ka-nation: #a08050;
  --ka-camp: #b06060; --ka-outline: #5580b8;
  --sr-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.03);
  background:
    radial-gradient(820px 400px at 16% -12%, color-mix(in srgb, var(--el-color-primary) 5.5%, transparent), transparent 58%),
    var(--el-bg-color-page);
}
html.dark .story-room { --sr-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.25); }

/* 顶栏 */
.topbar {
  height: 54px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 18px;
  background: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
  backdrop-filter: blur(16px) saturate(170%); border-bottom: 1px solid var(--el-border-color-lighter);
}
.back { color: var(--el-text-color-secondary); cursor: pointer; font-size: 17px; }
.back:hover { color: var(--el-color-primary); }
.title { font-weight: 600; font-size: 15px; letter-spacing: 0.3px; }
.tag {
  font-size: 11px; padding: 2.5px 9px; border-radius: 999px; color: var(--el-color-primary);
  background: var(--el-color-primary-light-9); border: 1px solid var(--el-color-primary-light-8);
}
.spacer { flex: 1; }
.tb-btn {
  font-size: 12.5px; color: var(--el-text-color-regular); border: 1px solid var(--el-border-color);
  padding: 5px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
}
.phase-btn { cursor: pointer; user-select: none; }
.phase-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.phase-on { color: var(--el-color-primary); font-weight: 600; }
.model-btn { cursor: pointer; user-select: none; }
.model-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.model-on { color: var(--el-color-primary); font-weight: 600; }
.tb-btn.accent {
  color: #fff; border-color: transparent;
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
}

/* 主体 */
.main { flex: 1; display: flex; min-height: 0; }
.chat-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }

/* 输入区 */
.composer {
  border-top: 1px solid var(--el-border-color-lighter); padding: 12px 28px 14px; flex-shrink: 0;
  background: color-mix(in srgb, var(--el-bg-color) 82%, transparent);
  backdrop-filter: blur(16px) saturate(170%);
}
.composer-inner { max-width: 820px; margin: 0 auto; }
.chips { display: flex; gap: 8px; margin-bottom: 7px; flex-wrap: wrap; }
.chip {
  font-size: 12px; color: var(--el-color-primary); background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8); border-radius: 999px; padding: 3.5px 13px;
  cursor: pointer; user-select: none; transition: all 0.15s;
}
.chip:hover { background: var(--el-color-primary-light-8); transform: translateY(-1px); }
.input-row {
  position: relative;
  display: flex; gap: 10px; align-items: flex-end; border: 1.5px solid var(--el-border-color);
  border-radius: 14px; padding: 8px 8px 8px 16px; background: var(--el-bg-color);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-row:focus-within { border-color: var(--el-color-primary); box-shadow: 0 0 0 3px var(--el-color-primary-light-8); }
.input-box {
  flex: 1; border: none; outline: none; resize: none; height: 64px; line-height: 24px;
  font-size: 14px; font-family: inherit; background: transparent; color: var(--el-text-color-primary);
}
.input-box::placeholder { color: var(--el-text-color-placeholder); }
.send-btn {
  height: 48px; padding: 0 26px; border: none; border-radius: 12px; color: #fff; font-size: 14px;
  cursor: pointer; background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-dark-2));
  transition: all 0.18s;
}
.send-btn:hover { filter: brightness(1.06); }
.send-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.send-btn.stop { background: var(--el-color-danger); }

/* 右栏：宽度可拖（默认 500px， localStorage 记忆），内容/设定集双页签 */
.side {
  flex-shrink: 0; border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color); display: flex; flex-direction: column; min-height: 0; min-width: 0;
}
.side-resizer {
  width: 5px; flex-shrink: 0; cursor: col-resize; background: transparent;
  transition: background 0.15s; margin-left: -2px; z-index: 5;
}
.side-resizer:hover, body.side-resizing .side-resizer { background: var(--el-color-primary-light-7); }
body.side-resizing { cursor: col-resize; user-select: none; }
.side-tabs {
  display: flex; flex-shrink: 0; border-bottom: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-fill-color-lighter) 55%, transparent);
}
.s-tab {
  flex: 1; text-align: center; font-size: 12.5px; padding: 9px 4px; cursor: pointer;
  color: var(--el-text-color-secondary); border-bottom: 2px solid transparent;
  transition: all 0.15s; user-select: none; display: inline-flex; align-items: center;
  justify-content: center; gap: 5px;
}
.s-tab:hover { color: var(--el-text-color-primary); }
.s-tab.on {
  color: var(--el-color-primary); font-weight: 600; border-bottom-color: var(--el-color-primary);
  background: var(--el-bg-color);
}
.s-cnt {
  font-size: 10.5px; min-width: 16px; line-height: 16px; border-radius: 999px; padding: 0 4px;
  background: var(--el-color-primary); color: #fff; font-weight: 600;
}

.gate-banner {
  display: flex; align-items: center; gap: 12px; padding: 9px 16px; flex-shrink: 0;
  background: var(--el-color-warning-light-9, #faf4ec); border-bottom: 1px solid var(--el-border-color-lighter);
}
.conflict-banner { flex-shrink: 0; border-radius: 0; }
.conflict-list { margin: 4px 0 0; padding-left: 18px; font-size: 12.5px; line-height: 1.7; }

/* 设计任务流水（46 号） */
.task-log {
  flex-shrink: 0; border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter); font-size: 12px;
}
.task-log-summary {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 16px; cursor: pointer; color: var(--el-text-color-secondary);
}
.task-log-review-row {
  margin: 4px 0 6px;
  display: flex;
  justify-content: flex-end;
}

.task-log-summary:hover { color: var(--el-text-color-primary); }
.task-log-caret { flex-shrink: 0; }
.task-log-items { max-height: 150px; overflow-y: auto; padding: 0 16px 8px; }
.task-log-item { display: flex; gap: 8px; padding: 2px 0; line-height: 1.6; }
.tl-tool { flex-shrink: 0; color: var(--el-color-primary); font-size: 11px; }
.tl-msg { color: var(--el-text-color-regular); min-width: 0; }

/* 设计包审核卡条目（di-* 沿用原确认面板样式） */
.design-item {
  display: flex; align-items: baseline; gap: 8px; padding: 7px 10px;
  border: 1px solid var(--el-border-color-lighter); border-radius: 8px; cursor: pointer;
}
.design-item.on { border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
.di-kind { flex-shrink: 0; font-size: 11px; color: var(--el-color-primary); }
.di-label { font-size: 13px; color: var(--el-text-color-primary); min-width: 0; }
.di-note { font-size: 11.5px; color: var(--el-text-color-secondary); margin-left: auto; text-align: right; }
.gate-text { font-size: 13px; color: var(--el-text-color-primary); flex: 1; min-width: 0; }
.gate-ops { display: flex; gap: 6px; flex-shrink: 0; }
.tag.target { cursor: pointer; }
.revise-points { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.edit-rows { display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto; }
.edit-row { display: flex; gap: 10px; align-items: flex-start; }
.edit-label { width: 90px; flex-shrink: 0; font-size: 12.5px; color: var(--el-text-color-secondary); padding-top: 7px; text-align: right; }
</style>
<style scoped>
.graph-dialog :deep(.el-dialog__body) {
  height: 82vh;
  overflow: hidden;
}
.graph-dialog :deep(.el-dialog__body) > * {
  height: 100%;
}

.conflict-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  margin-bottom: 6px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-color-warning-dark-2);
}
.conflict-bar:hover { border-color: var(--el-color-warning); }
.conflict-bar-more { font-size: 12px; opacity: 0.8; }

.composer-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 8px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.ct-btn {
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
}
.ct-btn:hover { color: var(--el-color-primary); border-color: var(--el-color-primary-light-5); }
.phase-ct { font-weight: 600; }
.phase-live { color: var(--el-color-success); border-color: var(--el-color-success-light-5); }
.ct-sub { font-size: 11px; opacity: 0.65; margin-left: 2px; }
.conflict-ct { color: var(--el-color-warning-dark-2); border-color: var(--el-color-warning-light-5); }
.approval-ct { color: var(--el-color-danger); border-color: var(--el-color-danger-light-5); }
.ct-hint { font-size: 11px; color: var(--el-text-color-placeholder); }

/* 待审批界面 */
.approval-body { display: flex; flex-direction: column; gap: 12px; }
.ap-meta { display: flex; gap: 14px; font-size: 12.5px; color: var(--el-text-color-secondary); }
.ap-run { user-select: all; }
.ap-checks { display: flex; flex-direction: column; gap: 8px; }
.ap-check { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 12px; font-size: 12.5px; }
.ap-check.ok { border-color: var(--el-color-success-light-5); background: var(--el-color-success-light-9); }
.ap-check.warn { border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); }
.ap-check-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 4px; }
.ap-report { margin: 6px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.6; max-height: 180px; overflow-y: auto; }
.ap-sc-list { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; line-height: 1.6; }
.ap-sc-list b { margin-right: 6px; }
.ap-content { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; }
.ap-content-head { padding: 7px 12px; font-size: 12.5px; font-weight: 600; background: var(--el-fill-color-light); }
.ap-content-text {
  padding: 12px 14px; font-size: 13.5px; line-height: 1.9; white-space: pre-wrap; word-break: break-word;
  max-height: 42vh; overflow-y: auto;
}

.conflict-drawer-list { display: flex; flex-direction: column; gap: 10px; }
.conflict-toolbar { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.ct-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ct-chip {
  font-size: 11.5px; padding: 2px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--el-border-color-lighter); color: var(--el-text-color-secondary);
}
.ct-chip.on { color: var(--el-color-primary); border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
.ct-actions { display: flex; justify-content: flex-end; gap: 8px; }
.conflict-check { flex: none; margin-right: 2px; }
.conflict-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}
.conflict-rule {
  flex: none;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-color-warning-light-8);
  color: var(--el-color-warning-dark-2);
}
.conflict-empty { color: var(--el-text-color-secondary); font-size: 13px; }
.conflict-loc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding-left: 2px;
}
.conflict-kept { margin-top: 6px; }
.conflict-kept-summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 2px;
}
.conflict-kept .conflict-item { opacity: 0.72; }
.conflict-kept .conflict-rule { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.conflict-kept-note { margin-top: 6px; font-size: 12px; color: var(--el-text-color-secondary); }


.composer-toolbar .ct-btn {
  height: 26px;
  line-height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.conflict-item-wrap { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 10px; }
.conflict-item-wrap .conflict-item { display: flex; gap: 8px; align-items: flex-start; border: none; padding: 0; }
.conflict-solve { margin-left: auto; flex: none; }
.conflict-plan { margin-top: 8px; padding: 8px 10px; background: var(--el-fill-color-light); border-radius: 6px; font-size: 13px; line-height: 1.6; }
.plan-diagnosis { margin-bottom: 6px; }
.plan-error { color: var(--el-color-danger); }
.plan-option { padding: 6px 0; border-top: 1px dashed var(--el-border-color-lighter); }
.plan-option.recommended .po-label { color: var(--el-color-warning-dark-2); font-weight: 600; }
.po-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.po-label { font-weight: 600; }
.po-detail { color: var(--el-text-color-regular); }
.po-edit { margin-top: 4px; padding: 6px 8px; background: var(--el-fill-color); border-radius: 4px; color: var(--el-text-color-secondary); }
.po-result { margin-top: 4px; color: var(--el-color-success); }

/* 输入框 @ 引用弹层（锚在输入框上方，设定/章节分页签） */
.mention-pop {
  position: absolute; bottom: calc(100% + 8px); left: 8px; width: min(420px, 90%);
  z-index: 30; display: flex; flex-direction: column;
  background: var(--el-bg-color-overlay); border: 1px solid var(--el-border-color-light);
  border-radius: 10px; box-shadow: var(--el-box-shadow-light); padding: 4px;
}
.mention-tabs {
  display: flex; align-items: center; gap: 4px; padding: 4px 6px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.mt-tab {
  font-size: 12px; padding: 3px 10px; border-radius: 999px; cursor: pointer;
  color: var(--el-text-color-secondary); user-select: none;
}
.mt-tab:hover { color: var(--el-text-color-primary); }
.mt-tab.on {
  color: var(--el-color-primary); background: var(--el-color-primary-light-9); font-weight: 600;
}
.mt-hint { margin-left: auto; font-size: 10.5px; color: var(--el-text-color-placeholder); }
.mention-list { max-height: 240px; overflow-y: auto; padding-top: 4px; }
.mention-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px;
  cursor: pointer; font-size: 13px;
}
.mention-item.on { background: var(--el-color-primary-light-9); }
.m-ico { flex-shrink: 0; font-size: 13px; }
.m-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--el-text-color-primary); }
.mention-item.on .m-label { color: var(--el-color-primary); font-weight: 600; }
.m-sub { flex-shrink: 0; font-size: 11px; color: var(--el-text-color-secondary); }
.mention-none { text-align: center; font-size: 12px; color: var(--el-text-color-placeholder); padding: 16px 8px; }

/* 设计包审核卡（面板内，替代弹窗） */
.design-review {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color);
}
.dr-head {
  display: flex; align-items: center; gap: 8px; padding: 11px 14px 4px;
}
.dr-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dr-close { font-size: 12px; color: var(--el-text-color-secondary); cursor: pointer; flex-shrink: 0; }
.dr-close:hover { color: var(--el-color-primary); }
.dr-hint { font-size: 12px; color: var(--el-text-color-secondary); padding: 2px 14px 8px; }
.dr-items { flex: 1; min-height: 0; overflow-y: auto; padding: 0 14px; display: flex; flex-direction: column; gap: 6px; }
.dr-ops { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px dashed var(--el-border-color-lighter); }
.dr-ops .el-button + .el-button { margin-left: 0; }

</style>
<style>
/* 右栏拖宽进行中：全局光标 + 禁选中（scoped 选择器带不到 body） */
body.side-resizing,
body.side-resizing * { cursor: col-resize !important; user-select: none !important; }
</style>
