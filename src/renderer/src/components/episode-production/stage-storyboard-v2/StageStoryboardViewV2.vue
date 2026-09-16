<template>
  <!--
    StageStoryboardViewV2 · ④ 分镜（FU5-E1 / 原型 §7）

    严格按对照表 §7 cell 表 10 条差异 + spec §4.5 实施：
    ✓ StageMainHeader 副标题（场景数 / 分镜数 / 累计时长）
    ✓ 双栏：左 220px scene-tree（场景父项 + N.M 子项 + 状态色点） / 1fr 主区域
    ✓ 场景概览 banner（@地点 / 出场 @人物 / 原文摘要）— §7.D-3 P0
    ✓ 分镜网格：分镜卡 + 大缩略图（emoji） + 状态徽章三态（done/gen/todo） + 时长
    ✓ inline 编辑面板：
      - 镜头语言 toolbar（景别 / 角度 / 运镜 / 时长）
      - 关键帧数 1-9 visual 按钮组（推荐值高亮 §7.D-5 P0）
      - "参考链顺序" 提示文案
      - 画面描述 textarea
      - 镜头内角色 5 列 grid inline 编辑（spec §4.5.3）— §7.D-6 P1
      - 进入 ⑤ 画面+音频 跳转按钮
  -->
  <div class="stage-storyboard-v2">
    <StageMainHeader title="④ 分镜阶段" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          v-if="selectedSceneId"
          :loading="generating"
          @click="onGenerateForScene"
        >
          <el-icon><MagicStick /></el-icon>
          {{ generating && genProgress
            ? `生成中 ${genProgress.shotNumber}/${genProgress.total || '?'}`
            : '为本场景生成分镜' }}
        </el-button>
        <el-button
          type="primary"
          :loading="generatingAll"
          :disabled="scenes.length === 0"
          @click="onGenerateAllScenes"
        >
          <el-icon><MagicStick /></el-icon>
          {{ generatingAll && genProgress
            ? `批量生成 ${genProgress.shotNumber}/${genProgress.total || '?'}`
            : '✨ AI 一键拆所有场景' }}
        </el-button>
        <el-button
          type="success"
          :disabled="!canComplete"
          @click="onComplete"
        >
          完成本阶段 → ⑤ 制作
        </el-button>
        <el-button
          :type="prototypeMode ? 'warning' : 'default'"
          @click="prototypeMode = !prototypeMode"
        >
          {{ prototypeMode ? '退出原型' : '原型预览' }}
        </el-button>
      </template>
    </StageMainHeader>

    <!-- 简化原型模式（隐藏参数表单，PromptEditor + 关键帧 + 视频预览） -->
    <StageStoryboardPrototype
      v-if="prototypeMode"
      :edit-draft="editDraft"
      :entity-list="entityList"
      :selected-storyboard="selectedStoryboard"
      :selected-scene="selectedScene"
      :selected-scene-index="selectedSceneIndex"
      :provider-config-id="videoModelConfig?.providerConfigId ?? null"
      :model-id="videoModelConfig?.modelId ?? null"
      :submitting-video="submittingVideo"
      @edit-change="onProtoEditChange"
      @save="onSaveEdit"
      @select-storyboard="onProtoSelectStoryboard"
      @submit="onProtoSubmit"
    />

    <div v-else-if="scenes.length === 0" class="empty-state">
      <el-empty description="该剧集还没有场景。请先在 ③ 剧本 stage 生成场景剧本" />
    </div>

    <div v-else class="content-grid">
      <!-- 左：scene-tree -->
      <aside class="scene-tree">
        <h4 class="tree-title">场景</h4>
        <div
          v-for="(scene, idx) in scenes"
          :key="scene.id"
          class="tree-scene"
        >
          <div
            class="tree-scene-head"
            :class="{ active: selectedSceneId === scene.id }"
            @click="selectScene(scene.id)"
          >
            <span class="scene-icon">📁</span>
            <span class="scene-num">场景 {{ idx + 1 }}</span>
            <span class="scene-loc">{{ scene.location ?? '?' }}</span>
            <span class="scene-tod">·{{ getTimeOfDayLabel(scene.timeOfDay) ?? '?' }}</span>
            <span class="scene-cnt">({{ countSceneStoryboards(scene.id) }})</span>
          </div>
          <ul
            v-if="selectedSceneId === scene.id && storyboards.length > 0"
            class="tree-shots"
          >
            <li
              v-for="sb in storyboards"
              :key="sb.id"
              class="tree-shot"
              :class="{ active: selectedStoryboardId === sb.id }"
              @click="selectedStoryboardId = sb.id"
            >
              <span class="shot-status-dot" :class="getStatusClass(sb)">●</span>
              <span class="shot-num">分镜 {{ sb.shotNumber }}</span>
              <span class="shot-dur">{{ sb.duration }}s</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 中 + 右：主区域 -->
      <main class="main-area">
        <!-- 场景概览：保留场景基础信息；剧情内容默认折叠 -->
        <section v-if="selectedScene" class="scene-overview">
          <el-collapse class="scene-context-collapse compact-scene-context">
            <el-collapse-item name="ctx">
              <template #title>
                <div class="overview-line">
                  <strong>场景 {{ selectedSceneIndex + 1 }}</strong>
                  <span class="meta-sep">·</span>
                  <EntityRefRenderer
                    :text="`📍 @${selectedScene.location ?? '?'}`"
                    :entities="entityList"
                  />
                  <span class="meta-sep">·</span>
                  <span>{{ getTimeOfDayLabel(selectedScene.timeOfDay) ?? '?' }} · {{ getWeatherLabel(selectedScene.weather) ?? '?' }}</span>
                  <span class="meta-sep">·</span>
                  <span class="cast-label">出场:</span>
                  <EntityRefRenderer
                    v-if="sceneCastNames(selectedScene).length > 0"
                    :text="sceneCastNames(selectedScene).map(n => `@${n}`).join(' ')"
                    :entities="entityList"
                  />
                  <span v-else class="hint-tertiary">未识别</span>
                </div>
              </template>
              <div class="scene-ctx-body">
                <div v-if="selectedScene.sceneDescription" class="ctx-row">
                  <span class="ctx-label">描述</span>
                  <span class="ctx-text muted">{{ selectedScene.sceneDescription }}</span>
                </div>
                <div v-if="selectedScene.originalText" class="ctx-row">
                  <span class="ctx-label">原文</span>
                  <span class="ctx-text muted">{{ selectedScene.originalText }}</span>
                </div>
                <div v-if="selectedScene.narration" class="ctx-row">
                  <span class="ctx-label">旁白</span>
                  <span class="ctx-text">
                    <EntityRefRenderer :text="selectedScene.narration" :entities="entityList" />
                  </span>
                </div>
                <div
                  v-for="(d, di) in sceneDialoguesOf(selectedScene)"
                  :key="`ctx-d-${di}`"
                  class="ctx-row"
                >
                  <span class="ctx-label">对话</span>
                  <span class="ctx-text">
                    <strong>
                      <EntityRefRenderer
                        :text="`@${d.characterName ?? '?'}`"
                        :entities="entityList"
                      />
                    </strong>
                    <span v-if="d.emotion" class="ctx-attr">· {{ d.emotion }}</span>
                    <span class="ctx-dlg">· "{{ d.text }}"</span>
                  </span>
                </div>
                <div
                  v-for="(a, ai) in sceneActionsOf(selectedScene)"
                  :key="`ctx-a-${ai}`"
                  class="ctx-row"
                >
                  <span class="ctx-label">动作</span>
                  <span class="ctx-text">
                    <EntityRefRenderer :text="a.description ?? a.text ?? ''" :entities="entityList" />
                  </span>
                </div>
                <div
                  v-if="
                    !selectedScene.sceneDescription &&
                    !selectedScene.originalText &&
                    !selectedScene.narration &&
                    sceneDialoguesOf(selectedScene).length === 0 &&
                    sceneActionsOf(selectedScene).length === 0
                  "
                  class="ctx-empty"
                >
                  该场景没有描述 / 原文 / 旁白 / 对话 / 动作信息
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </section>

        <!-- 分镜网格 -->
        <section class="storyboard-grid">
          <div v-if="loadingStoryboards" class="loading-hint">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>加载分镜...</span>
          </div>
          <div v-else-if="storyboards.length === 0" class="empty-hint">
            该场景还没生成分镜，点上方"为本场景生成分镜"。
          </div>
          <div v-else class="grid-cards">
            <article
              v-for="sb in storyboards"
              :key="sb.id"
              class="shot-card-v2"
              :class="{ active: selectedStoryboardId === sb.id }"
              :title="'双击进入 ⑤ 画面+音频'"
              @click="selectedStoryboardId = sb.id"
              @dblclick="emit('jump-to-production', sb)"
            >
              <div class="shot-thumb" :class="getStatusClass(sb)">
                <span class="shot-no-badge" :title="formatGlobalShotId({ episodeNumber: episodeStore.currentEpisode?.episodeNumber, sceneIndex: selectedSceneIndex, shotNumber: sb.shotNumber })">
                  {{ formatGlobalShotId({ episodeNumber: episodeStore.currentEpisode?.episodeNumber, sceneIndex: selectedSceneIndex, shotNumber: sb.shotNumber }) }}
                </span>
                <!--
                  缩略图规则：
                    - 已生成视频（videoPath）→ <video> preload metadata，自动呈现首帧
                    - 未生成 → emoji + "未生成"文字标签
                -->
                <video
                  v-if="sb.videoPath"
                  :src="sb.videoPath"
                  class="thumb-img"
                  preload="metadata"
                  muted
                  playsinline
                />
                <template v-else>
                  <span class="thumb-emoji">{{ shotTypeEmoji(sb.shotType) }}</span>
                  <span class="thumb-empty-label">未生成</span>
                </template>
                <span class="duration-badge">{{ sb.duration }}s</span>
              </div>
              <div class="shot-body">
                <div class="shot-title">
                  {{ shotTypeLabel(sb.shotType) }} · {{ cameraAngleLabel(sb.cameraAngle) }} · {{ cameraMovementLabel(sb.cameraMovement) }}
                </div>
              </div>
            </article>
          </div>
        </section>

        <!-- inline 编辑面板（选中分镜后展开）— §7.D-5/D-6 P0/P1 -->
        <section v-if="selectedStoryboard" class="edit-panel">
          <header class="edit-header">
            <h4 class="edit-title">
              分镜 {{ selectedSceneIndex + 1 }}.{{ selectedStoryboard.shotNumber }} 编辑
            </h4>
            <span class="edit-status" :class="getStatusClass(selectedStoryboard)">
              {{ getStatusLabel(selectedStoryboard) }}
            </span>
            <label class="header-mode">
              <span class="header-mode-label">生成模式</span>
              <el-radio-group
                v-model="editDraft.generationMode"
                size="small"
                @change="onGenerationModeChange"
              >
                <el-radio-button value="text2image">文生图</el-radio-button>
                <el-radio-button value="keyframes">关键帧</el-radio-button>
              </el-radio-group>
            </label>
            <span class="header-spacer" />
            <el-button
              type="primary"
              size="small"
              :disabled="!hasUnsavedEditChanges"
              :loading="savingEdit"
              @click="onSaveEdit"
            >
              保存修改
            </el-button>
            <el-button
              size="small"
              :loading="aiFilling"
              @click="onAIFillStoryboard"
            >
              <el-icon><MagicStick /></el-icon>
              {{ aiFilling ? 'AI 填充中...' : '✨ AI 填充' }}
            </el-button>
            <el-button
              type="danger"
              size="small"
              plain
              :loading="deleting"
              @click="onDeleteStoryboard"
            >
              <el-icon><Delete /></el-icon>
              删除分镜
            </el-button>
            <el-button
              type="primary"
              size="small"
              @click="emit('jump-to-production', selectedStoryboard)"
            >
              <el-icon><ArrowRight /></el-icon>
              进入 ⑤ 画面+音频
            </el-button>
          </header>

          <div class="edit-layout">
            <div class="edit-left-column">
                <!-- 画面描述（自动汇总右侧表单参数，作为 AI 生成关键帧提示词） -->
                <div class="desc-section prompt-focus-section">
              <div class="desc-label">画面描述 / 自由提示词（右侧表单参数会自动汇总到这里，可用 @资产名 引用）</div>
              <ShotDescriptionTemplate
                v-model="editDraft.frameDescription"
                :entities="entityList"
                @update:model-value="onEditChange('frameDescription', $event)"
              />
            </div>
            <!-- 镜头内角色站位 / 表情 / 朝向 / 动作 inline 5 列 grid（§7.D-6 P1 / spec §4.5.3） -->
            <div class="characters-section">
              <div class="char-label">
                <span>镜头内角色</span>
                <span class="header-spacer" />
                <el-dropdown
                  v-if="availableBindingsForAdd.length > 0"
                  trigger="click"
                  @command="addStoryboardCharacter"
                >
                  <el-button size="small" type="primary" plain>
                    <el-icon><Plus /></el-icon>
                    添加角色
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="b in availableBindingsForAdd"
                        :key="b.id"
                        :command="b.id"
                      >
                        @{{ bindingDisplayName(b) }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button
                  v-else
                  size="small"
                  type="primary"
                  plain
                  disabled
                  title="没有可添加的角色 — 项目已无未占用的角色形象"
                >
                  <el-icon><Plus /></el-icon>
                  添加角色
                </el-button>
              </div>
              <div v-if="editDraft.characters.length === 0" class="empty-hint-inline">
                未配置分镜级独立角色 → 关键帧生成回退到场景级
                <code>scene.characters</code>
              </div>
              <div v-else class="characters-grid">
                <div class="char-grid-header">
                  <span>角色</span>
                  <span>位置</span>
                  <span>表情</span>
                  <span>朝向</span>
                  <span>动作</span>
                  <span />
                </div>
                <div
                  v-for="(c, i) in editDraft.characters"
                  :key="i"
                  class="char-grid-row"
                >
                  <span class="cg-name">
                    <!--
                      通过 characterId 反查 binding 取真名（resolveCharName 含 3 层 fallback）。
                    -->
                    <EntityRefRenderer
                      :text="`@${resolveCharName(c) ?? '(未绑定)'}`"
                      :entities="entityList"
                    />
                  </span>
                  <el-select
                    v-model="c.position"
                    size="small"
                    placeholder="位置"
                    @change="onCharacterFieldEdit"
                  >
                    <el-option label="左" value="left" />
                    <el-option label="中" value="center" />
                    <el-option label="右" value="right" />
                    <el-option label="前" value="front" />
                    <el-option label="后" value="back" />
                  </el-select>
                  <el-select
                    v-model="c.expression"
                    size="small"
                    placeholder="表情"
                    @change="onCharacterFieldEdit"
                  >
                    <el-option label="neutral" value="neutral" />
                    <el-option label="angry" value="angry" />
                    <el-option label="happy" value="happy" />
                    <el-option label="sad" value="sad" />
                    <el-option label="surprised" value="surprised" />
                    <el-option label="confused" value="confused" />
                  </el-select>
                  <el-select
                    v-model="c.facing"
                    size="small"
                    placeholder="朝向"
                    @change="onCharacterFieldEdit"
                  >
                    <el-option label="正面" value="front" />
                    <el-option label="左前侧" value="3q_left" />
                    <el-option label="右前侧" value="3q_right" />
                    <el-option label="左侧" value="side_l" />
                    <el-option label="右侧" value="side_r" />
                    <el-option label="背面" value="back" />
                  </el-select>
                  <el-input
                    v-model="c.action"
                    size="small"
                    placeholder="如：持折扇 / 站立"
                    @input="onCharacterFieldEdit"
                  />
                  <el-button
                    text
                    size="small"
                    class="cg-remove"
                    title="移除该角色"
                    @click="removeStoryboardCharacter(i)"
                  >
                    <el-icon><Close /></el-icon>
                  </el-button>
                </div>
              </div>
            </div>
            <div class="binding-row-sections">
            <!-- 地点（spec 2026-05-09）— 分镜级覆盖；空则继承 scene.locationBindingId -->
            <div class="characters-section bindings-section">
              <div class="char-label">
                <span>镜头内地点</span>
              </div>
              <div class="bindings-chips">
                <template v-if="editDraft.locationBindingIds.length > 0">
                  <el-tag
                    v-for="(id, i) in editDraft.locationBindingIds"
                    :key="`loc-${i}-${id}`"
                    type="success"
                    effect="light"
                    closable
                    class="binding-chip"
                    @close="removeLocationAt(i)"
                  >📍 {{ resolveBindingName('location', id) }}</el-tag>
                </template>
                <template v-else-if="inheritedLocationIds.length > 0">
                  <el-tag
                    v-for="id in inheritedLocationIds"
                    :key="`loc-inh-${id}`"
                    type="success"
                    effect="plain"
                    class="binding-chip inherited-chip"
                    title="继承自场景；点击加号会创建独立配置覆盖场景级"
                  >
                    📍 {{ resolveBindingName('location', id) }}
                    <span class="inherited-tag">继承</span>
                  </el-tag>
                </template>
                <span v-else class="empty-hint-inline compact-empty">未配置地点</span>
                <el-dropdown
                  v-if="availableLocationsForAdd.length > 0"
                  trigger="click"
                  @command="addStoryboardLocation"
                >
                  <el-button size="small" type="primary" plain circle class="binding-add-btn" title="添加地点">
                    <el-icon><Plus /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="b in availableLocationsForAdd"
                        :key="b.id"
                        :command="b.id"
                      >
                        📍 {{ bindingDisplayName(b) }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button
                  v-else
                  size="small"
                  type="primary"
                  plain
                  circle
                  disabled
                  class="binding-add-btn"
                  title="项目内没有可添加的地点形象"
                >
                  <el-icon><Plus /></el-icon>
                </el-button>
              </div>
            </div>

            <!-- 物品（spec 2026-05-09）— 分镜级覆盖；空则继承 scene.characters[*].props -->
            <div class="characters-section bindings-section">
              <div class="char-label">
                <span>镜头内物品</span>
              </div>
              <div class="bindings-chips">
                <template v-if="editDraft.itemBindingIds.length > 0">
                  <el-tag
                    v-for="(id, i) in editDraft.itemBindingIds"
                    :key="`it-${i}-${id}`"
                    type="warning"
                    effect="light"
                    closable
                    class="binding-chip"
                    @close="removeItemAt(i)"
                  >⚔️ {{ resolveBindingName('item', id) }}</el-tag>
                </template>
                <template v-else-if="inheritedItemIds.length > 0">
                  <el-tag
                    v-for="id in inheritedItemIds"
                    :key="`it-inh-${id}`"
                    type="warning"
                    effect="plain"
                    class="binding-chip inherited-chip"
                    title="继承自场景 props；点击加号会创建独立配置覆盖场景级"
                  >
                    ⚔️ {{ resolveBindingName('item', id) }}
                    <span class="inherited-tag">继承</span>
                  </el-tag>
                </template>
                <span v-else class="empty-hint-inline compact-empty">未配置物品</span>
                <el-dropdown
                  v-if="availableItemsForAdd.length > 0"
                  trigger="click"
                  @command="addStoryboardItem"
                >
                  <el-button size="small" type="primary" plain circle class="binding-add-btn" title="添加物品">
                    <el-icon><Plus /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="b in availableItemsForAdd"
                        :key="b.id"
                        :command="b.id"
                      >
                        ⚔️ {{ bindingDisplayName(b) }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button
                  v-else
                  size="small"
                  type="primary"
                  plain
                  circle
                  disabled
                  class="binding-add-btn"
                  title="项目内没有可添加的物品形象"
                >
                  <el-icon><Plus /></el-icon>
                </el-button>
              </div>
            </div>

            </div>
            </div>

            <aside class="edit-right-column">
              <div class="edit-side-card">
                <div class="edit-side-title">镜头参数</div>
                <!-- 镜头语言 toolbar：分镜头组 + 转场组，组前各加分组标签 -->
                <div class="lang-toolbar side-toolbar">
                  <label class="tool-item">
                    <span class="tool-label">景别</span>
                    <el-select
                      v-model="editDraft.shotType"
                      size="small"
                      placeholder="选择景别"
                      @change="onEditChange('shotType', $event)"
                    >
                      <el-option label="大远景" value="extreme_long" />
                      <el-option label="远景" value="long" />
                      <el-option label="全景" value="full" />
                      <el-option label="中景" value="medium" />
                      <el-option label="中近景" value="medium_close" />
                      <el-option label="近景" value="close" />
                      <el-option label="特写" value="extreme_close" />
                      <el-option label="细节特写" value="detail" />
                    </el-select>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">角度</span>
                    <el-select
                      v-model="editDraft.cameraAngle"
                      size="small"
                      @change="onEditChange('cameraAngle', $event)"
                    >
                      <el-option label="平视" value="eye_level" />
                      <el-option label="俯拍" value="high" />
                      <el-option label="仰拍" value="low" />
                      <el-option label="鸟瞰" value="birds_eye" />
                      <el-option label="蚁视" value="worms_eye" />
                      <el-option label="斜角" value="dutch" />
                    </el-select>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">运镜</span>
                    <!-- spec 2026-05-09 ep-redesign §3.2 B5 · 25 命名预设 4 大类 -->
                    <el-select
                      v-model="editDraft.cameraMovement"
                      size="small"
                      filterable
                      placeholder="选择或搜索"
                      @change="onEditChange('cameraMovement', $event)"
                    >
                      <el-option-group
                        v-for="group in CAMERA_MOVEMENT_GROUPS"
                        :key="group.key"
                        :label="group.label"
                      >
                        <el-option
                          v-for="m in group.items"
                          :key="m.value"
                          :label="m.label"
                          :value="m.value"
                        >
                          <el-tooltip :content="m.description" placement="right">
                            <span>{{ m.label }}</span>
                          </el-tooltip>
                        </el-option>
                      </el-option-group>
                    </el-select>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">时长</span>
                    <el-input-number
                      v-model="editDraft.duration"
                      :min="0.5"
                      :max="60"
                      :step="0.1"
                      :precision="1"
                      size="small"
                      controls-position="right"
                      @change="onEditChange('duration', $event)"
                    />
                    <span class="suffix-x">s</span>
                  </label>

                  <!-- 摄像机参数（spec 2026-05-09 ep-redesign §3.2 B5）— 写到 metadata JSON -->
                  <label class="tool-item">
                    <span class="tool-label">焦距</span>
                    <el-select
                      :model-value="lensFocalMmRef"
                      @update:model-value="(v) => updateMetadataField('lensFocalMm', v)"
                      size="small"
                      clearable
                      placeholder="—"
                    >
                      <el-option v-for="p in LENS_FOCAL_PRESETS" :key="p.value" :label="p.label" :value="p.value">
                        <el-tooltip :content="p.visualEffect" placement="right">
                          <span>{{ p.label }}</span>
                        </el-tooltip>
                      </el-option>
                    </el-select>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">光圈</span>
                    <el-select
                      :model-value="apertureRef"
                      @update:model-value="(v) => updateMetadataField('aperture', v)"
                      size="small"
                      clearable
                      placeholder="—"
                    >
                      <el-option v-for="p in APERTURE_PRESETS" :key="p.value" :label="p.label" :value="p.value">
                        <el-tooltip :content="p.visualEffect" placement="right">
                          <span>{{ p.label }}</span>
                        </el-tooltip>
                      </el-option>
                    </el-select>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">相机风格</span>
                    <el-select
                      :model-value="cameraStyleRef"
                      @update:model-value="(v) => updateMetadataField('cameraStyle', v)"
                      size="small"
                      clearable
                      placeholder="—"
                    >
                      <el-option v-for="p in CAMERA_STYLE_PRESETS" :key="p.value" :label="p.label" :value="p.value">
                        <el-tooltip :content="p.visualEffect" placement="right">
                          <span>{{ p.label }}</span>
                        </el-tooltip>
                      </el-option>
                    </el-select>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">打光</span>
                    <el-select
                      :model-value="lightingRef"
                      @update:model-value="(v) => updateMetadataField('lighting', v)"
                      size="small"
                      clearable
                      filterable
                      placeholder="—"
                    >
                      <el-option v-for="p in LIGHTING_PRESETS" :key="p.value" :label="p.label" :value="p.value">
                        <el-tooltip :content="p.description" placement="right">
                          <span>{{ p.label }}</span>
                        </el-tooltip>
                      </el-option>
                    </el-select>
                  </label>
                </div>
              </div>

              <div class="edit-side-card">
                <div class="edit-side-title">转场与关键帧</div>
                <!-- 转场 toolbar：另起一行 -->
                <div class="lang-toolbar transition-toolbar side-toolbar">
                  <label class="tool-item">
                    <span class="tool-label">类型</span>
                    <el-select
                      v-model="editDraft.transitionType"
                      size="small"
                      @change="onEditChange('transitionType', $event)"
                    >
                      <el-option label="硬切" value="cut" />
                      <el-option label="淡入淡出" value="fade" />
                      <el-option label="溶解" value="dissolve" />
                      <el-option label="擦除" value="wipe" />
                      <el-option label="滑动" value="slide" />
                      <el-option label="缩放" value="zoom" />
                      <el-option label="光圈" value="iris" />
                      <el-option label="甩镜" value="whip" />
                    </el-select>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">时长</span>
                    <el-input-number
                      v-model="editDraft.transitionDuration"
                      :min="0"
                      :max="3000"
                      :step="100"
                      size="small"
                      controls-position="right"
                      @change="onEditChange('transitionDuration', $event)"
                    />
                    <span class="suffix-x">ms</span>
                  </label>
                  <label class="tool-item">
                    <span class="tool-label">方向</span>
                    <el-select
                      v-model="editDraft.transitionDirection"
                      size="small"
                      placeholder="—"
                      clearable
                      @change="onEditChange('transitionDirection', $event)"
                    >
                      <el-option label="向左" value="left" />
                      <el-option label="向右" value="right" />
                      <el-option label="向上" value="up" />
                      <el-option label="向下" value="down" />
                    </el-select>
                  </label>
                  <label v-if="editDraft.generationMode === 'keyframes'" class="tool-item keyframe-tool-item">
                    <span class="tool-label">关键帧</span>
                    <div class="kf-buttons inline-kf-buttons">
                      <button
                        v-for="n in 9"
                        :key="n"
                        class="kf-btn"
                        :class="{ active: editDraft.keyframeCount === n }"
                        @click="setKeyframeCount(n)"
                      >
                        {{ n }}
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              <!-- 本分镜音频（旁白 + 对白）— 按 storyboard.dialogueIds / narrationId 过滤 -->
              <AudioPanel
                v-if="selectedScene && selectedStoryboard"
                :key="`audio-${selectedStoryboard.id}`"
                :scene-id="selectedScene.id"
                :scene="selectedScene"
                :storyboard="{
                  id: selectedStoryboard.id,
                  dialogueIds: selectedStoryboard.dialogueIds,
                  narrationId: selectedStoryboard.narrationId,
                }"
              />
            </aside>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowRight,
  Close,
  Delete,
  Loading,
  MagicStick,
  Plus,
} from '@element-plus/icons-vue'
import StageMainHeader from '../shared/StageMainHeader.vue'
import EntityRefRenderer from '../shared/EntityRefRenderer.vue'
import AudioPanel from '../stage-production/AudioPanel.vue'
import type { EntityRefMeta } from '../shared/entity-ref-parser'
import {
  useEpEpisodeStore,
  useEpScriptStore,
  useEpStoryboardStore,
  useEpProjectStore,
  useEpAssetStore,
} from '@/stores/episode-production'
import { formatGlobalShotId } from '@/utils/storyboard-id'
// spec 2026-05-09 ep-redesign §3.2 B4 双模板画面描述
import ShotDescriptionTemplate from './ShotDescriptionTemplate.vue'
import StageStoryboardPrototype from './StageStoryboardPrototype.vue'
import {
  type MetadataPromptKey,
  type PromptSyncReason,
  mergeFormPromptDescription,
  shouldMarkSyncedPromptDirty,
  shouldResetStoryboardDraft,
} from './storyboard-prompt-draft'
// spec 2026-05-09 ep-redesign §3.2 B5 镜头语言层（焦距 / 光圈 / 相机风格 / 25 运镜 / 12 打光）
import {
  CAMERA_MOVEMENT_GROUPS,
  findCameraMovementPreset,
} from '@core/platform/episode-production/assets/constants/camera-movements'
import {
  LENS_FOCAL_PRESETS,
  APERTURE_PRESETS,
  CAMERA_STYLE_PRESETS,
} from '@core/platform/episode-production/assets/constants/lens-presets'
import { LIGHTING_PRESETS } from '@core/platform/episode-production/assets/constants/lighting-presets'
import {
  getTimeOfDayLabel,
  getWeatherLabel,
  getShotTypeLabel,
  getCameraAngleLabel,
  getCameraMovementLabel,
  shotTypeLabels,
  cameraAngleLabels,
} from '../shared/shot-labels'

const props = defineProps<{
  episodeScriptId: string | null
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'jump-to-production', sb: any): void
  (e: 'edit-storyboard-characters', sb: any): void
  (e: 'complete'): void
}>()

const episodeStore = useEpEpisodeStore()
const scriptStore = useEpScriptStore()
const storyboardStore = useEpStoryboardStore()
const projectStore = useEpProjectStore()
const assetStore = useEpAssetStore()

const generating = ref(false)
const generatingAll = ref(false)
// 简化原型模式开关：切换到 StageStoryboardPrototype（隐藏参数表单 + 合并关键帧/视频预览）
const prototypeMode = ref(false)
/** 视频生成模型配置（传给原型 VideoSegmentPanel） */
const videoModelConfig = computed<any>(
  () => projectStore.currentProject?.config?.videoModel ?? null,
)
/** 分镜生成进度（来自 ep:storyboard-progress 事件，逐个分镜推送） */
const genProgress = ref<{ shotNumber: number; total: number } | null>(null)
let unsubStoryboardProgress: (() => void) | null = null
const savingEdit = ref(false)
const deleting = ref(false)
const aiFilling = ref(false)
const loadingStoryboards = ref(false)

const selectedSceneId = ref<string | null>(null)
const selectedStoryboardId = ref<string | null>(null)

const scenes = computed(() => scriptStore.scenes ?? [])
const storyboards = computed(() => storyboardStore.storyboards ?? [])

const selectedScene = computed(() =>
  scenes.value.find((s) => s.id === selectedSceneId.value) ?? null,
)
const selectedSceneIndex = computed(() =>
  selectedScene.value
    ? scenes.value.findIndex((s) => s.id === selectedSceneId.value)
    : 0,
)
const selectedStoryboard = computed(() =>
  storyboards.value.find((s) => s.id === selectedStoryboardId.value) ?? null,
)

const editDraft = reactive<any>({
  shotType: '',
  cameraAngle: '',
  cameraMovement: '',
  duration: 5,
  keyframeCount: 5,
  frameDescription: '',
  // 生成模式：text2image（不走关键帧 → useKeyframes=false）/ keyframes（走首尾帧 → useKeyframes=true）
  generationMode: 'keyframes' as 'text2image' | 'keyframes',
  transitionType: 'cut' as string,
  transitionDuration: 500 as number,
  transitionDirection: undefined as 'left' | 'right' | 'up' | 'down' | undefined,
  /**
   * 分镜内角色草稿：深拷贝自 selectedStoryboard.characters，避免直接 mutate store；
   * 含修复历史 bug — 旧实现 v-model 直接挂在 store 引用上，
   * 但 onSaveEdit 又不传 characters 给 update API，最终 UI 改完根本不持久化。
   */
  characters: [] as any[],
  /** 分镜级地点 binding 列表（spec 2026-05-09） */
  locationBindingIds: [] as string[],
  /** 分镜级物品 binding 列表（spec 2026-05-09） */
  itemBindingIds: [] as string[],
  /**
   * 镜头扩展元数据 JSON（spec 2026-05-09 ep-redesign §3.2 B5）：
   * { lensFocalMm, aperture, cameraStyle, lighting }
   * UI 用 metadata helper computed 读写；落库时序列化。
   */
  metadata: '' as string,
})

const editDirty = ref<Set<string>>(new Set())
const hasUnsavedEditChanges = computed(() => editDirty.value.size > 0)
let lastSyncedStoryboardId: string | null = null
let lastSyncedFormPrompt = ''

watch(
  () => selectedStoryboard.value,
  (sb) => {
    if (!sb) return
    if (!shouldResetStoryboardDraft({
      currentStoryboardId: lastSyncedStoryboardId,
      nextStoryboardId: sb.id,
      dirtyFieldCount: editDirty.value.size,
    })) {
      return
    }
    lastSyncedStoryboardId = sb.id
    editDraft.shotType = sb.shotType
    editDraft.cameraAngle = sb.cameraAngle
    editDraft.cameraMovement = sb.cameraMovement
    editDraft.duration = sb.duration
    editDraft.keyframeCount = sb.keyframeCount ?? 3
    editDraft.frameDescription = sb.frameDescription ?? ''
    editDraft.generationMode = sb.useKeyframes ? 'keyframes' : 'text2image'
    editDraft.transitionType = sb.transition?.type ?? 'cut'
    editDraft.transitionDuration = sb.transition?.duration ?? 500
    editDraft.transitionDirection = sb.transition?.direction
    // 深拷贝避免改回 store；JSON parse/stringify 对纯 JSON 数据足够
    editDraft.characters = Array.isArray(sb.characters)
      ? JSON.parse(JSON.stringify(sb.characters))
      : []
    editDraft.locationBindingIds = Array.isArray((sb as any).locationBindingIds)
      ? [...(sb as any).locationBindingIds]
      : []
    editDraft.itemBindingIds = Array.isArray((sb as any).itemBindingIds)
      ? [...(sb as any).itemBindingIds]
      : []
    // spec 2026-05-09 ep-redesign §3.2 B5 镜头扩展 metadata（JSON 字符串）
    editDraft.metadata = (sb as any).metadata ?? ''
    // 直接更新 ref，确保 UI 显示
    const meta = safeParseMeta(editDraft.metadata)
    lensFocalMmRef.value = meta.lensFocalMm ?? undefined
    apertureRef.value = meta.aperture ?? undefined
    cameraStyleRef.value = meta.cameraStyle ?? undefined
    lightingRef.value = meta.lighting ?? undefined
    editDirty.value = new Set()
    lastSyncedFormPrompt = ''
    void nextTick(() => {
      if (selectedStoryboard.value?.id !== sb.id) return
      syncFrameDescriptionFromForm('initialize', sb.frameDescription ?? '')
    })
  },
  { immediate: true },
)

function onGenerationModeChange(mode: 'text2image' | 'keyframes'): void {
  onEditChange('generationMode', mode)
}

// ===== 镜头扩展 metadata（spec 2026-05-09 ep-redesign §3.2 B5）=====
// editDraft.metadata 是 JSON 字符串；使用 ref + watcher 确保 UI 响应式更新
// 直接在 watcher 中更新 ref，避免 computed 的依赖追踪问题

// 安全解析 metadata JSON
function safeParseMeta(raw: string): Record<string, any> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

// 使用 ref 存储 metadata 字段值，直接在 watcher 中更新
const lensFocalMmRef = ref<string | undefined>(undefined)
const apertureRef = ref<string | undefined>(undefined)
const cameraStyleRef = ref<string | undefined>(undefined)
const lightingRef = ref<string | undefined>(undefined)

// 更新 metadata 到 editDraft 和数据库
function updateMetadataField(key: MetadataPromptKey, value: string | null | undefined): void {
  const normalizedValue = value == null || value === '' ? undefined : value
  if (key === 'lensFocalMm') lensFocalMmRef.value = normalizedValue
  if (key === 'aperture') apertureRef.value = normalizedValue
  if (key === 'cameraStyle') cameraStyleRef.value = normalizedValue
  if (key === 'lighting') lightingRef.value = normalizedValue

  const meta = safeParseMeta(editDraft.metadata)
  if (normalizedValue == null) {
    delete meta[key]
  } else {
    meta[key] = normalizedValue
  }
  editDraft.metadata = Object.keys(meta).length > 0 ? JSON.stringify(meta) : ''
  onEditChange('metadata', editDraft.metadata)
}

/**
 * 把行里的 characterId 解析回真 binding.id：
 *   1. 直接 id 命中 → 返回原 id
 *   2. 把 id 当作角色名（standaloneName / overrideName）模糊匹配 → 返回命中的 binding.id
 *   3. 都不命中 → 返回 null（视作未绑定，不参与去重）
 *
 * 必要原因：AI 生成 storyboard 时常常把 characterId 写成"少年"/"elder_01"
 * 这种自创短名，跟真实 binding.id 不一致 — 不解析就无法做去重。
 */
function resolveBindingId(c: any): string | null {
  const id: string | undefined = c?.characterId ?? c?.characterBindingId
  if (!id) return null
  const all = assetStore.epAssetCharacters ?? []
  if (all.some((x: any) => x.id === id)) return id
  const idStr = String(id).trim().toLowerCase()
  const byName = all.find((x: any) => {
    const a = String(x.standaloneName ?? '').trim().toLowerCase()
    const b = String(x.overrideName ?? '').trim().toLowerCase()
    return (a && a === idStr) || (b && b === idStr)
  })
  return byName ? byName.id : null
}

/** 已添加到分镜的 binding id 集合（用于过滤"添加角色"下拉中可选项） */
const addedBindingIds = computed(() => {
  const ids = new Set<string>()
  for (const c of editDraft.characters) {
    const resolved = resolveBindingId(c)
    if (resolved) ids.add(resolved)
  }
  return ids
})

/**
 * 优先列出"本场景出场过的角色"，再列出项目内其他角色。
 * 已经被这个分镜引用过的 binding 不再列出。
 */
const availableBindingsForAdd = computed(() => {
  const all = assetStore.epAssetCharacters ?? []
  const inScene = new Set(
    (selectedScene.value?.characters ?? [])
      .map((c: any) => c.characterBindingId ?? c.characterId)
      .filter((x: any) => !!x),
  )
  const added = addedBindingIds.value
  const free = all.filter((b: any) => !added.has(b.id))
  // scene 出场过的优先排前面
  return free.sort((a: any, b: any) => {
    const ai = inScene.has(a.id) ? 0 : 1
    const bi = inScene.has(b.id) ? 0 : 1
    return ai - bi
  })
})

function bindingDisplayName(b: any): string {
  return b?.standaloneName ?? b?.overrideName ?? '(未命名)'
}

function addStoryboardCharacter(bindingId: string): void {
  if (!bindingId) return
  if (addedBindingIds.value.has(bindingId)) {
    ElMessage.warning('该角色已在镜头中，无法重复添加')
    return
  }
  editDraft.characters.push({
    characterId: bindingId,
    position: 'center',
    expression: 'neutral',
    facing: 'front',
    action: '',
  })
  onEditChange('characters', null)
}

function removeStoryboardCharacter(idx: number | string): void {
  // editDraft 整体声明为 any，模板里 v-for 的 index 类型推不出 number；显式 Number() 收口
  editDraft.characters.splice(Number(idx), 1)
  onEditChange('characters', null)
}

function onCharacterFieldEdit(): void {
  onEditChange('characters', null)
}

// ===== 分镜级地点 / 物品 binding（spec 2026-05-09）=====

/**
 * 场景级 location 继承：当 editDraft.locationBindingIds 为空时，
 * 把 selectedScene.locationBindingId 投影成"继承"chip 显示，让用户看到当前生效的地点。
 */
const inheritedLocationIds = computed<string[]>(() => {
  const id = (selectedScene.value as any)?.locationBindingId as string | null | undefined
  return id ? [id] : []
})

/**
 * 场景级 items 继承：从 selectedScene.characters[*].props 收集 itemBindingId（去重，过滤老格式 string）。
 * 与 keyframe-generation.service.resolveSceneAssets 的 fallback 路径口径一致。
 */
const inheritedItemIds = computed<string[]>(() => {
  const scene = selectedScene.value as any
  if (!scene || !Array.isArray(scene.characters)) return []
  const seen = new Set<string>()
  for (const sc of scene.characters) {
    if (!Array.isArray(sc?.props)) continue
    for (const p of sc.props) {
      if (typeof p === 'string') continue
      const itemBindingId: string | null = p?.itemBindingId ?? null
      if (itemBindingId) seen.add(itemBindingId)
    }
  }
  return Array.from(seen)
})

/** 可添加到本分镜的地点（项目级 binding 减去已在分镜里的） */
const availableLocationsForAdd = computed(() => {
  const all = (assetStore.epAssetLocations as any[]) ?? []
  const taken = new Set(editDraft.locationBindingIds)
  return all.filter((b) => !taken.has(b.id))
})

/** 可添加到本分镜的物品（项目级 binding 减去已在分镜里的） */
const availableItemsForAdd = computed(() => {
  const all = (assetStore.epAssetItems as any[]) ?? []
  const taken = new Set(editDraft.itemBindingIds)
  return all.filter((b) => !taken.has(b.id))
})

/** 通用 binding 名解析 — kind=character/location/item */
function resolveBindingName(
  kind: 'character' | 'location' | 'item',
  bindingId: string,
): string {
  const list =
    kind === 'character'
      ? (assetStore.epAssetCharacters as any[])
      : kind === 'location'
        ? (assetStore.epAssetLocations as any[])
        : (assetStore.epAssetItems as any[])
  const b = (list ?? []).find((x: any) => x.id === bindingId)
  if (!b) return '(已删除)'
  return (
    b.standaloneName ??
    b.overrideName ??
    b.locationName ??
    b.itemName ??
    '(未命名)'
  )
}

function addStoryboardLocation(bindingId: string): void {
  if (!bindingId) return
  if (editDraft.locationBindingIds.includes(bindingId)) {
    ElMessage.warning('该地点已在镜头中')
    return
  }
  editDraft.locationBindingIds.push(bindingId)
  onEditChange('locationBindingIds', null)
}

function removeLocationAt(idx: number | string): void {
  editDraft.locationBindingIds.splice(Number(idx), 1)
  onEditChange('locationBindingIds', null)
}

function addStoryboardItem(bindingId: string): void {
  if (!bindingId) return
  if (editDraft.itemBindingIds.includes(bindingId)) {
    ElMessage.warning('该物品已在镜头中')
    return
  }
  editDraft.itemBindingIds.push(bindingId)
  onEditChange('itemBindingIds', null)
}

function removeItemAt(idx: number | string): void {
  editDraft.itemBindingIds.splice(Number(idx), 1)
  onEditChange('itemBindingIds', null)
}

/*
 * 通过 characterId 反查 binding 拿真名。
 *
 * 三层 fallback：
 *   1. c.characterName 直接是字符串就用（兼容老结构）
 *   2. c.characterId / c.characterBindingId === binding.id 严格匹配（理想契约）
 *   3. LLM 生成 storyboard 时常把 characterId 填成"角色名字"或自创短 id（如 "elder_01" / "少年"），
 *      字面 id 不在 binding.id 集合里 → 这里再按 standaloneName / overrideName 模糊匹配回真 binding，
 *      让 UI 显示正确名字（避免"未绑定"假象）。匹配不到才返 null。
 */
function resolveCharName(c: any): string | null {
  if (typeof c?.characterName === 'string' && c.characterName.trim()) return c.characterName
  const id: string | undefined = c?.characterId ?? c?.characterBindingId
  if (!id) return null
  const all = assetStore.epAssetCharacters ?? []
  // 2. 严格 id 匹配
  const byId = all.find((x: any) => x.id === id)
  if (byId) {
    return (byId as any).standaloneName ?? (byId as any).overrideName ?? null
  }
  // 3. 兜底：把 id 当作"名字"按 standaloneName / overrideName 匹配
  const idStr = String(id).trim().toLowerCase()
  const byName = all.find((x: any) => {
    const a = String((x as any).standaloneName ?? '').trim().toLowerCase()
    const b = String((x as any).overrideName ?? '').trim().toLowerCase()
    return (a && a === idStr) || (b && b === idStr)
  })
  if (byName) {
    return (byName as any).standaloneName ?? (byName as any).overrideName ?? null
  }
  return null
}

const entityList = computed<EntityRefMeta[]>(() => {
  const list: EntityRefMeta[] = []
  for (const b of assetStore.epAssetCharacters ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  for (const b of assetStore.epAssetLocations ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? (b as any).locationName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  for (const b of assetStore.epAssetItems ?? []) {
    const name = (b as any).standaloneName ?? (b as any).overrideName ?? (b as any).itemName ?? ''
    if (name) list.push({ name, sourceType: (b as any).sourceType ?? 'standalone', id: b.id })
  }
  return list
})

const headerSubtitle = computed(() => {
  const sceneCount = scenes.value.length
  let totalSb = 0
  // FU8-H2 真实总分镜数取自 sceneCounts；时长估算仅当前场景已加载（不强求全集时长聚合，
  // 时长由 ⑤/⑥ stage 落到 storyboard.duration 字段后才准）
  totalSb = totalStoryboardsAcrossScenes.value
  const curDur = storyboards.value.reduce((acc, sb) => acc + (sb.duration ?? 0), 0)
  return `${sceneCount} 个场景 · 共 ${totalSb} 个分镜 · 当前场景预估 ${curDur.toFixed(1)}s`
})

/*
 * FU8-H2 跨场景 canComplete + countSceneStoryboards 真实数据：
 *   设计要求每场至少 1 个 Storyboard 才能进 ⑤。旧实现只看当前选中场景分镜数。
 *   新实现：scenes 加载完毕后，并发拉每个场景的分镜，缓存到 sceneCounts。
 *   - canComplete: 所有 scene 在 sceneCounts 中都 ≥1
 *   - countSceneStoryboards: 显示真实数量，未加载完显示 "..."
 */
const sceneCounts = ref<Record<string, number>>({})
const sceneCountsLoading = ref(false)

async function reloadSceneCounts(): Promise<void> {
  const list = scenes.value
  if (!list || list.length === 0) {
    sceneCounts.value = {}
    return
  }
  sceneCountsLoading.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.listStoryboards) return
    const results = await Promise.all(
      list.map(async (s: any) => {
        try {
          const resp = await api.listStoryboards(s.id)
          if (resp?.success && Array.isArray(resp.data)) return [s.id, resp.data.length] as const
        } catch {
          /* 单条失败不影响其他场景计数 */
        }
        return [s.id, 0] as const
      }),
    )
    const next: Record<string, number> = {}
    for (const [id, cnt] of results) next[id] = cnt
    sceneCounts.value = next
  } finally {
    sceneCountsLoading.value = false
  }
}

watch(
  () => scenes.value.map((s: any) => s.id).join('|'),
  () => { void reloadSceneCounts() },
  { immediate: true },
)

const totalStoryboardsAcrossScenes = computed(() =>
  Object.values(sceneCounts.value).reduce((acc, n) => acc + n, 0),
)

const canComplete = computed(() => {
  if (scenes.value.length === 0) return false
  return scenes.value.every((s: any) => (sceneCounts.value[s.id] ?? 0) > 0)
})

function selectScene(id: string): void {
  selectedSceneId.value = id
  void loadStoryboardsForSelected()
}

async function loadStoryboardsForSelected(): Promise<void> {
  if (!selectedScene.value) return
  loadingStoryboards.value = true
  try {
    await storyboardStore.loadStoryboards(selectedScene.value.id)
    if (storyboards.value.length > 0) {
      selectedStoryboardId.value = storyboards.value[0].id
    } else {
      selectedStoryboardId.value = null
    }
  } finally {
    loadingStoryboards.value = false
  }
}

function countSceneStoryboards(sceneId: string): string {
  // FU8-H2 真实数据：选中场景以 store 实时计为准（含刚生成未刷的）
  if (selectedSceneId.value === sceneId) return `${storyboards.value.length} 镜`
  const n = sceneCounts.value[sceneId]
  if (n === undefined) return sceneCountsLoading.value ? '...' : '0 镜'
  return `${n} 镜`
}

function getStatusClass(sb: any): string {
  if (sb.videoPath) return 'status-done'
  if (sb.status === 'generating') return 'status-gen'
  return 'status-todo'
}

function getStatusLabel(sb: any): string {
  if (sb.videoPath) return '已出片'
  if (sb.status === 'generating') return '生成中'
  return '待出片'
}

function shotTypeLabel(t: string): string {
  return getShotTypeLabel(t)
}

function shotTypeEmoji(t: string): string {
  return ({
    extreme_long: '🏞',
    long: '🏞',
    full: '🧍',
    medium: '🚶',
    medium_close: '👤',
    close: '👁',
    extreme_close: '👁',
    detail: '🔍',
  } as any)[t] ?? '🎬'
}

function cameraAngleLabel(a: string): string {
  return getCameraAngleLabel(a)
}

function cameraMovementLabel(m: string): string {
  return getCameraMovementLabel(m)
}

/** 当前选中场景的对白 / 动作列表 helper（与剧本视图逻辑一致） */
function sceneDialoguesOf(scene: any): any[] {
  return Array.isArray(scene?.dialogues) ? scene.dialogues : []
}

function sceneActionsOf(scene: any): any[] {
  return Array.isArray(scene?.actions) ? scene.actions : []
}

function sceneCastNames(scene: any): string[] {
  const cs = scene.characters
  if (!Array.isArray(cs)) return []
  return Array.from(
    new Set(cs.map((c: any) => c.characterName).filter((n: any): n is string => !!n)),
  )
}

function setKeyframeCount(n: number): void {
  editDraft.keyframeCount = n
  onEditChange('keyframeCount', n)
}

function onEditChange(key: string, _value: any): void {
  editDirty.value = new Set([...editDirty.value, key])
  if (key !== 'frameDescription') syncFrameDescriptionFromForm()
}

/**
 * 原型模式字段变更：mutate editDraft + 标 dirty，但不调 syncFrameDescriptionFromForm
 *（原型模式 frameDescription 是用户自由文本，不应被参数表单覆盖）。
 */
function onProtoEditChange(key: string, value: any): void {
  editDraft[key] = value
  editDirty.value = new Set([...editDirty.value, key])
}

/** 原型分镜规划列表点击分镜 -> 切换选中分镜（清空 dirty 强制 watch 重建 editDraft） */
function onProtoSelectStoryboard(id: string): void {
  if (!id || id === selectedStoryboardId.value) return
  editDirty.value = new Set()
  selectedStoryboardId.value = id
}

/** 原型提交按钮 loading 状态（保存 + 生成视频期间） */
const submittingVideo = ref(false)

/**
 * 原型「提交」按钮：保存 editDraft（不调 syncFrameDescriptionFromForm，保留自由文本 frameDescription）
 * -> 调 generateVideoSegment 生成视频 -> 刷新分镜列表拿新 videoPath。
 */
async function onProtoSubmit(): Promise<void> {
  const sb = selectedStoryboard.value
  const scene = selectedScene.value
  const config = videoModelConfig.value
  if (!sb) {
    ElMessage.warning('请先选择分镜')
    return
  }
  if (!config?.providerConfigId || !config?.modelId) {
    ElMessage.warning('请先在项目配置里设置视频模型')
    return
  }
  submittingVideo.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    // 1. 保存 editDraft（保留自由文本 frameDescription，不走 syncFrameDescriptionFromForm）
    await api?.updateStoryboard?.(sb.id, {
      shotType: editDraft.shotType,
      cameraAngle: editDraft.cameraAngle,
      cameraMovement: editDraft.cameraMovement,
      duration: editDraft.duration,
      keyframeCount: editDraft.keyframeCount,
      frameDescription: editDraft.frameDescription,
      useKeyframes: editDraft.generationMode === 'keyframes',
      transition: {
        type: editDraft.transitionType,
        duration: editDraft.transitionDuration,
        direction: editDraft.transitionDirection,
      },
      characters: editDraft.characters,
      locationBindingIds: editDraft.locationBindingIds,
      itemBindingIds: editDraft.itemBindingIds,
      metadata: editDraft.metadata || null,
    })
    editDirty.value = new Set()
    // 2. 生成视频片段（基于分镜记录）
    const resp = await api?.generateVideoSegment?.(sb.id, {
      providerConfigId: config.providerConfigId,
      modelId: config.modelId,
    })
    if (resp?.success) {
      ElMessage.success('视频已生成')
    } else {
      ElMessage.error(resp?.error || '视频生成失败')
    }
    // 3. 刷新分镜列表拿到新 videoPath
    if (scene) {
      await storyboardStore.loadStoryboards(scene.id)
    }
  } catch (err) {
    console.error('[onProtoSubmit] 生成视频失败:', err)
    ElMessage.error('视频生成失败')
  } finally {
    submittingVideo.value = false
  }
}

function labelFromOptions<T extends Record<string, string>>(options: T, value: string | null | undefined): string {
  if (!value) return ''
  return options[value] ?? value
}

function metadataLabel(presets: Array<{ value: string; label: string }>, value: any): string {
  if (value == null || value === '') return ''
  const text = String(value)
  return presets.find((p) => p.value === text)?.label ?? text
}

function selectedStoryboardCharacterNames(): string[] {
  return editDraft.characters
    .map((c: any) => resolveCharName(c) ?? c?.characterName ?? c?.characterId ?? '')
    .filter((v: string) => !!String(v).trim())
}

function buildFormPromptDescription(): string {
  const meta = safeParseMeta(editDraft.metadata)
  const parts: string[] = []
  const shotId = selectedStoryboard.value
    ? `分镜 ${selectedSceneIndex.value + 1}.${selectedStoryboard.value.shotNumber}`
    : '当前分镜'

  const shotLine = [
    `【${shotId}】`,
    `景别：${labelFromOptions(shotTypeLabels, editDraft.shotType) || '未设置'}`,
    `角度：${labelFromOptions(cameraAngleLabels, editDraft.cameraAngle) || '未设置'}`,
    `运镜：${findCameraMovementPreset(editDraft.cameraMovement)?.label ?? getCameraMovementLabel(editDraft.cameraMovement) ?? '未设置'}`,
    `时长：${editDraft.duration ?? '未设置'}秒`,
  ]
  parts.push(shotLine.join('｜'))

  const lens = metadataLabel(LENS_FOCAL_PRESETS, meta.lensFocalMm)
  const aperture = metadataLabel(APERTURE_PRESETS, meta.aperture)
  const cameraStyle = metadataLabel(CAMERA_STYLE_PRESETS, meta.cameraStyle)
  const lighting = metadataLabel(LIGHTING_PRESETS, meta.lighting)
  const cameraParams = [lens && `焦距：${lens}`, aperture && `光圈：${aperture}`, cameraStyle && `相机风格：${cameraStyle}`, lighting && `打光：${lighting}`].filter(Boolean)
  if (cameraParams.length > 0) parts.push(cameraParams.join('｜'))

  const generationParams = [
    `生成模式：${editDraft.generationMode === 'keyframes' ? '关键帧' : '文生图'}`,
    editDraft.generationMode === 'keyframes' ? `关键帧数：${editDraft.keyframeCount}` : '',
    `转场：${editDraft.transitionType || '未设置'}，${editDraft.transitionDuration ?? 0}ms${editDraft.transitionDirection ? `，方向 ${editDraft.transitionDirection}` : ''}`,
  ].filter(Boolean)
  parts.push(generationParams.join('｜'))

  const entityParams: string[] = []
  const characterNames = selectedStoryboardCharacterNames()
  if (characterNames.length > 0) entityParams.push(`镜头内角色：${characterNames.map((n) => `@${n}`).join('、')}`)
  const locationIds = editDraft.locationBindingIds.length > 0 ? editDraft.locationBindingIds : inheritedLocationIds.value
  if (locationIds.length > 0) entityParams.push(`镜头内地点：${locationIds.map((id) => `@${resolveBindingName('location', id)}`).join('、')}`)
  const itemIds = editDraft.itemBindingIds.length > 0 ? editDraft.itemBindingIds : inheritedItemIds.value
  if (itemIds.length > 0) entityParams.push(`镜头内物品：${itemIds.map((id) => `@${resolveBindingName('item', id)}`).join('、')}`)
  if (entityParams.length > 0) parts.push(entityParams.join('｜'))

  const charActions = editDraft.characters
    .map((c: any) => {
      const name = resolveCharName(c) ?? c?.characterName ?? c?.characterId ?? ''
      const details = [c?.position && `位置${c.position}`, c?.expression && `表情${c.expression}`, c?.facing && `朝向${c.facing}`, c?.action && `动作${c.action}`]
        .filter(Boolean)
        .join('，')
      return name && details ? `@${name}（${details}）` : ''
    })
    .filter(Boolean)
  if (charActions.length > 0) parts.push(`角色调度：${charActions.join('；')}`)

  return parts.join('\n')
}

function syncFrameDescriptionFromForm(
  reason: PromptSyncReason = 'user-edit',
  savedText = selectedStoryboard.value?.frameDescription ?? '',
): void {
  const nextFormPrompt = buildFormPromptDescription()
  editDraft.frameDescription = mergeFormPromptDescription({
    currentText: String(editDraft.frameDescription ?? ''),
    nextFormPrompt,
    previousFormPrompt: lastSyncedFormPrompt,
  })
  lastSyncedFormPrompt = nextFormPrompt
  if (shouldMarkSyncedPromptDirty({
    syncReason: reason,
    syncedText: editDraft.frameDescription,
    savedText,
  })) {
    editDirty.value = new Set([...editDirty.value, 'frameDescription'])
  }
}

async function onSaveEdit(): Promise<void> {
  if (!selectedStoryboard.value) return
  syncFrameDescriptionFromForm('save')
  savingEdit.value = true
  try {
    const api = (window as any).electronAPI?.episodeProduction
    const resp = await api?.updateStoryboard?.(selectedStoryboard.value.id, {
      shotType: editDraft.shotType,
      cameraAngle: editDraft.cameraAngle,
      cameraMovement: editDraft.cameraMovement,
      duration: editDraft.duration,
      keyframeCount: editDraft.keyframeCount,
      frameDescription: editDraft.frameDescription,
      useKeyframes: editDraft.generationMode === 'keyframes',
      transition: {
        type: editDraft.transitionType,
        duration: editDraft.transitionDuration,
        direction: editDraft.transitionDirection,
      },
      characters: editDraft.characters,
      locationBindingIds: editDraft.locationBindingIds,
      itemBindingIds: editDraft.itemBindingIds,
      // spec 2026-05-09 ep-redesign §3.2 B5 镜头扩展元数据（焦距/光圈/相机风格/打光）
      metadata: editDraft.metadata || null,
    })
    if (resp?.success) {
      ElMessage.success('已保存')
      editDirty.value = new Set()
      await storyboardStore.loadStoryboards(selectedScene.value!.id)
    } else {
      ElMessage.error(resp?.error || '保存失败')
    }
  } finally {
    savingEdit.value = false
  }
}

async function onDeleteStoryboard(): Promise<void> {
  const sb = selectedStoryboard.value
  if (!sb) return
  try {
    await ElMessageBox.confirm(
      `确认删除分镜 ${selectedSceneIndex.value + 1}.${sb.shotNumber}？关联关键帧、独立角色配置、首帧图都将一并清除，无法恢复。`,
      '删除分镜',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deleting.value = true
  try {
    const result = await storyboardStore.deleteStoryboard(sb.id)
    if (!result.ok) {
      ElMessage.error(result.error || '删除分镜失败')
      return
    }
    selectedStoryboardId.value = storyboards.value[0]?.id ?? null
    void reloadSceneCounts()
    ElMessage.success('已删除分镜')
  } finally {
    deleting.value = false
  }
}

/**
 * 有效性检查：检查 shotType / cameraAngle 是否在有效值列表中
 * 无效值（不在下拉选项中的值）视为空，需要 AI 填充
 */
const VALID_SHOT_TYPES = Object.keys(shotTypeLabels)
const VALID_CAMERA_ANGLES = Object.keys(cameraAngleLabels)
const VALID_CAMERA_MOVEMENTS = CAMERA_MOVEMENT_GROUPS.flatMap((g) => g.items.map((i) => i.value))

function isValidShotType(v: string | null | undefined): boolean {
  return v != null && v !== '' && VALID_SHOT_TYPES.includes(v)
}
function isValidCameraAngle(v: string | null | undefined): boolean {
  return v != null && v !== '' && VALID_CAMERA_ANGLES.includes(v)
}
function isValidCameraMovement(v: string | null | undefined): boolean {
  return v != null && v !== '' && VALID_CAMERA_MOVEMENTS.includes(v)
}

/**
 * AI 填充分镜空字段（spec 2026-05-28 扩展版）
 * 调 AI 推荐所有镜头参数，一键填充所有空白字段
 * 覆盖：镜头核心参数 + metadata参数 + 转场参数 + 关键帧数
 */
async function onAIFillStoryboard(): Promise<void> {
  if (!selectedStoryboard.value || !selectedScene.value) {
    return
  }
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先配置剧本生成模型')
    return
  }

  aiFilling.value = true
  try {
    // 构建 AI 输入：场景上下文 + 当前分镜 shotNumber + 已有信息
    const scene = selectedScene.value
    const shotNumber = selectedStoryboard.value.shotNumber

    // 构建上下文信息
    const contextParts: string[] = []
    if (scene.originalText) contextParts.push(`原文：${scene.originalText}`)
    if (scene.narration) contextParts.push(`旁白：${scene.narration}`)
    if (scene.dialogues?.length > 0) {
      contextParts.push(`对话：${scene.dialogues.map((d: any) => `${d.characterName ?? '?'}：${d.text ?? ''}`).join(' | ')}`)
    }
    if (scene.actions?.length > 0) {
      contextParts.push(`动作：${scene.actions.map((a: any) => a.description ?? a.text ?? '').join(' | ')}`)
    }

    // 获取 metadata 字段当前值
    const meta = safeParseMeta(editDraft.metadata)

    // 调 IPC：ep:fill-storyboard（单分镜 AI 填充）
    const result = await storyboardStore.aiFillStoryboard(
      selectedStoryboard.value.id,
      {
        shotNumber,
        sceneContext: contextParts.join('\n'),
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        mood: scene.mood,
        // 使用有效性检查：无效值视为空，需要 AI 填充
        existingFields: {
          // 镜头核心参数
          shotType: isValidShotType(editDraft.shotType) ? editDraft.shotType : null,
          cameraAngle: isValidCameraAngle(editDraft.cameraAngle) ? editDraft.cameraAngle : null,
          cameraMovement: isValidCameraMovement(editDraft.cameraMovement) ? editDraft.cameraMovement : null,
          duration: editDraft.duration || null,
          frameDescription: editDraft.frameDescription || null,
          // metadata参数（焦距/光圈/相机风格/打光）
          lensFocalMm: meta.lensFocalMm || null,
          aperture: meta.aperture || null,
          cameraStyle: meta.cameraStyle || null,
          lighting: meta.lighting || null,
          // 转场参数
          transitionType: editDraft.transitionType || null,
          transitionDuration: editDraft.transitionDuration || null,
          transitionDirection: editDraft.transitionDirection || null,
          // 关键帧数
          keyframeCount: editDraft.keyframeCount || null,
        },
      },
      sm.providerConfigId,
      sm.modelId,
    )

    if (!result.ok) {
      ElMessage.error(result.error || 'AI 填充失败')
      return
    }

    const aiData = result.data

    // 镜头核心参数（仅填充空字段）
    if (aiData.shotType && !isValidShotType(editDraft.shotType)) editDraft.shotType = aiData.shotType
    if (aiData.cameraAngle && !isValidCameraAngle(editDraft.cameraAngle)) editDraft.cameraAngle = aiData.cameraAngle
    if (aiData.cameraMovement && !isValidCameraMovement(editDraft.cameraMovement)) editDraft.cameraMovement = aiData.cameraMovement
    if (aiData.duration && !editDraft.duration) editDraft.duration = aiData.duration
    if (aiData.frameDescription && !editDraft.frameDescription) editDraft.frameDescription = aiData.frameDescription

    // metadata参数（仅填充空字段）
    if (aiData.lensFocalMm && !meta.lensFocalMm) {
      updateMetadataField('lensFocalMm', aiData.lensFocalMm)
    }
    if (aiData.aperture && !meta.aperture) {
      updateMetadataField('aperture', aiData.aperture)
    }
    if (aiData.cameraStyle && !meta.cameraStyle) {
      updateMetadataField('cameraStyle', aiData.cameraStyle)
    }
    if (aiData.lighting && !meta.lighting) {
      updateMetadataField('lighting', aiData.lighting)
    }

    // 转场参数
    if (aiData.transitionType && !editDraft.transitionType) editDraft.transitionType = aiData.transitionType
    if (aiData.transitionDuration && !editDraft.transitionDuration) editDraft.transitionDuration = aiData.transitionDuration
    if (aiData.transitionDirection && !editDraft.transitionDirection) editDraft.transitionDirection = aiData.transitionDirection

    // 关键帧数
    if (aiData.keyframeCount && !editDraft.keyframeCount) editDraft.keyframeCount = aiData.keyframeCount

    // 重新按当前表单参数生成最终自由提示词，保证保存内容与界面一致
    syncFrameDescriptionFromForm('save')

    // 同步更新到数据库
    await storyboardStore.updateStoryboard(selectedStoryboard.value.id, {
      shotType: editDraft.shotType,
      cameraAngle: editDraft.cameraAngle,
      cameraMovement: editDraft.cameraMovement,
      duration: editDraft.duration,
      frameDescription: editDraft.frameDescription,
      transitionType: editDraft.transitionType,
      transition: {
        type: editDraft.transitionType,
        duration: editDraft.transitionDuration,
        direction: editDraft.transitionDirection,
      },
      keyframeCount: editDraft.keyframeCount,
      // metadata 需要同步更新
      metadata: editDraft.metadata || null,
    })

    // updateStoryboard刷新了storyboards数组，watcher会自动更新editDraft
    // computed getter会自动从editDraft.metadata读取最新值，无需手动同步
    // 复核修复：AI 填充已落库但 dirty 未清，shouldResetStoryboardDraft 因
    // dirtyFieldCount>0 恒返回 false，watcher 永远不重建草稿 → 界面一直显示
    // "有未保存的修改"。保存成功即清 dirty，强制草稿按已保存数据重建。
    editDirty.value = new Set()

    ElMessage.success('AI 已填充所有空字段')
  } catch (e: any) {
    ElMessage.error(e?.message || 'AI 填充失败')
  } finally {
    aiFilling.value = false
  }
}

/*
 * FU8-C1 单场景 AI 拆分镜：调 ep:generate-storyboard(sceneId)
 * 后端 handler 内部走 generateStoryboardsIncremental + 落库 + 推送 ep:storyboard-progress
 * 完成后 reload storyboards 让本场景的分镜列表立即出现。
 */
async function onGenerateForScene(): Promise<void> {
  if (!selectedScene.value) return
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型（用于 AI 分镜）')
    return
  }
  generating.value = true
  genProgress.value = { shotNumber: 0, total: 0 }
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateStoryboard) {
      ElMessage.error('分镜生成 IPC 不可用')
      return
    }
    const resp = await api.generateStoryboard(
      selectedScene.value.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (!resp?.success) {
      ElMessage.error(resp?.error || '生成分镜失败')
      return
    }
    const cnt = Array.isArray(resp.data) ? resp.data.length : 0
    ElMessage.success(`已为本场景生成 ${cnt} 个分镜`)
    await storyboardStore.loadStoryboards(selectedScene.value.id)
  } catch (e: any) {
    ElMessage.error(e?.message || '生成分镜失败')
  } finally {
    generating.value = false
    genProgress.value = null
  }
}

/*
 * FU8-C2 全剧本批量拆分镜：调 ep:generate-storyboards(scriptId)
 * 后端 handler 顺序遍历所有 scene 调 generateStoryboards + 推送 ep:storyboards-progress
 * 完成后 reload 当前选中场景的分镜列表（其他场景待选中时按需加载）
 */
async function onGenerateAllScenes(): Promise<void> {
  if (!scriptStore.currentScript?.id) {
    ElMessage.warning('请先生成剧本')
    return
  }
  if (scenes.value.length === 0) {
    ElMessage.warning('剧本没有场景，请先 ✨ AI 重新生成剧本')
    return
  }
  const sm = projectStore.currentProject?.config?.scriptModel
  if (!sm?.providerConfigId || !sm?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型（用于 AI 分镜）')
    return
  }
  generatingAll.value = true
  genProgress.value = { shotNumber: 0, total: 0 }
  try {
    const api = (window as any).electronAPI?.episodeProduction
    if (!api?.generateStoryboards) {
      ElMessage.error('分镜批量生成 IPC 不可用')
      return
    }
    const resp = await api.generateStoryboards(
      scriptStore.currentScript.id,
      sm.providerConfigId,
      sm.modelId,
    )
    if (!resp?.success) {
      ElMessage.error(resp?.error || '批量生成分镜失败')
      return
    }
    // H10：handler 返回 { storyboards, unboundCharacters, unboundCount }（旧版直接返回数组，做兼容）
    const shots = Array.isArray(resp.data)
      ? resp.data
      : (Array.isArray(resp.data?.storyboards) ? resp.data.storyboards : [])
    ElMessage.success(`已为 ${scenes.value.length} 个场景生成共 ${shots.length} 个分镜`)
    const unbound: string[] = Array.isArray(resp.data?.unboundCharacters) ? resp.data.unboundCharacters : []
    const unboundCount = typeof resp.data?.unboundCount === 'number' ? resp.data.unboundCount : 0
    if (unbound.length > 0) {
      ElMessage.warning(`⚠️ ${unbound.length} 个角色未绑定资产：${unbound.join('、')}，将影响画面一致性`)
    } else if (unboundCount > 0) {
      ElMessage.warning(`⚠️ ${unboundCount} 处分镜角色未绑定资产（无法反查角色名），将影响画面一致性`)
    }
    if (selectedScene.value) {
      await storyboardStore.loadStoryboards(selectedScene.value.id)
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '批量生成分镜失败')
  } finally {
    generatingAll.value = false
    genProgress.value = null
  }
}

function onComplete(): void {
  emit('complete')
}

watch(
  () => scenes.value,
  (list) => {
    if (list.length > 0 && !selectedSceneId.value) {
      selectScene(list[0].id)
    }
  },
  { immediate: true },
)

watch(
  () => props.projectId,
  () => {
    if (props.projectId) void assetStore.loadAssetsByProject(props.projectId)
  },
  { immediate: true },
)

// 监听后端逐个分镜的进度推送（generateStoryboardsIncremental 内部 send）
onMounted(() => {
  const api = (window as any).electronAPI?.episodeProduction
  if (!api?.onStoryboardProgress) return
  unsubStoryboardProgress = api.onStoryboardProgress(
    (_event: any, data: { sceneId: string; shotNumber: number; total: number; storyboard: any }) => {
      genProgress.value = {
        shotNumber: data.shotNumber ?? 0,
        total: data.total ?? 0,
      }
      // 当前选中场景命中时立即追加新分镜，免等整批完
      if (selectedScene.value && data.sceneId === selectedScene.value.id) {
        void storyboardStore.loadStoryboards(selectedScene.value.id)
      }
    },
  )
})

onBeforeUnmount(() => {
  if (unsubStoryboardProgress) unsubStoryboardProgress()
  unsubStoryboardProgress = null
})
</script>

<style scoped lang="scss">
.stage-storyboard-v2 {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 6px;
  padding: 6px 12px 12px;
  overflow: hidden;
  min-height: 0;
}

/* ── scene-tree ── */
.scene-tree {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 8px;
  overflow-y: auto;
}

.tree-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  letter-spacing: 0.05em;
}

.tree-scene {
  margin-bottom: 6px;
}

.tree-scene-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  transition: background 0.15s;
}

.tree-scene-head:hover {
  background: var(--el-fill-color-light);
}

.tree-scene-head.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}

.scene-icon {
  font-size: 12px;
}

.scene-cnt {
  margin-left: auto;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.tree-shots {
  list-style: none;
  margin: 4px 0 0;
  padding: 0 0 0 14px;
}

.tree-shot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}

.tree-shot:hover {
  background: var(--el-fill-color-light);
}

.tree-shot.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}

.shot-status-dot {
  font-size: 8px;
}

.shot-status-dot.status-done {
  color: var(--el-color-success);
}
.shot-status-dot.status-gen {
  color: var(--el-color-warning);
}
.shot-status-dot.status-todo {
  color: var(--el-text-color-placeholder);
}

.shot-dur {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}

/* ── 主区域 ── */
.main-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
}

.hint-tertiary {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

/* 顶部场景概览 */
.scene-overview {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 0 4px 4px 0;
  padding: 0;
  font-size: 13px;
}

.overview-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cast-label {
  color: var(--el-text-color-secondary);
}

.meta-sep {
  color: var(--el-text-color-placeholder);
}

.compact-scene-context {
  margin-bottom: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

.compact-scene-context :deep(.el-collapse-item__header) {
  min-height: 0;
  height: auto;
  line-height: normal;
  padding: 10px 14px;
  border-bottom: none;
}

.compact-scene-context :deep(.el-collapse-item__arrow) {
  margin-left: auto;
}

.compact-scene-context :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

.compact-scene-context :deep(.el-collapse-item__content) {
  padding: 0 14px 10px;
}

/* 分镜网格 */
.storyboard-grid {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
}

/*
 * 分镜卡片单行横向滚动：
 * 卡片不换行；多出的部分横向滚动查看，避免占据整页高度。
 */
.grid-cards {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
}

.shot-card-v2 {
  flex: 0 0 220px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}

.shot-card-v2:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.shot-card-v2.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.shot-thumb {
  position: relative;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--el-color-primary-light-7), var(--el-color-primary-light-5));
}

.shot-thumb.status-todo {
  background: linear-gradient(135deg, var(--el-fill-color), var(--el-fill-color-light));
}

.shot-thumb.status-gen {
  background: linear-gradient(135deg, var(--el-color-warning-light-7), var(--el-color-warning-light-5));
}

.shot-thumb.status-done {
  background: linear-gradient(135deg, var(--el-color-success-light-7), var(--el-color-success-light-5));
}

.shot-no-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}

.thumb-emoji {
  font-size: 36px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.15));
}

/* FU6-T5 真实首帧图片占满 thumb 区域 */
.thumb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* FU6-T5 未生成时显式标签：避免 user 把 emoji 当真实"示意图" */
.thumb-empty-label {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  white-space: nowrap;
}

.duration-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.shot-body {
  padding: 8px 10px;
}

.shot-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 3px;
}

.loading-hint,
.empty-hint {
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 24px;
  font-style: italic;
}

/* inline 编辑面板 */
.edit-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.edit-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.edit-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
}

.edit-status.status-done {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.edit-status.status-gen {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.header-mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.header-mode-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.header-spacer {
  flex: 1;
}

/* 所属场景剧情折叠面板 */
.scene-context-collapse {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  margin-bottom: 4px;
  background: var(--el-fill-color-lighter);
}

.scene-context-collapse :deep(.el-collapse-item__header) {
  padding: 0 12px;
  background: transparent;
  border-bottom: none;
  font-size: 13px;
  height: 36px;
  line-height: 36px;
}

.scene-context-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
}

.scene-context-collapse :deep(.el-collapse-item__content) {
  padding: 6px 12px 12px;
}

.scene-ctx-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.scene-ctx-meta {
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
}

.scene-ctx-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
}

.ctx-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.ctx-label {
  flex-shrink: 0;
  width: 36px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  border-radius: 3px;
  padding: 1px 0;
  text-align: center;
}

.ctx-text {
  flex: 1;
  min-width: 0;
}

.ctx-text.muted {
  color: var(--el-text-color-placeholder);
}

.ctx-attr {
  margin-left: 4px;
  color: var(--el-color-primary);
}

.ctx-dlg {
  margin-left: 4px;
}

.ctx-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.lang-toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  overflow-x: auto;
}

.group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

/* 镜头组与转场组之间一根细线分隔 */
.group-divider {
  width: 1px;
  height: 20px;
  background: var(--el-border-color);
  margin: 0 4px;
}

.tool-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.tool-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.group-label {
  font-size: 11px;
}

/* 控件压缩宽度，尽量保持镜头参数一行展示 */
.tool-item :deep(.el-select),
.tool-item :deep(.el-input-number) {
  min-width: 76px;
  width: 76px;
}

.tool-item :deep(.el-select__wrapper),
.tool-item :deep(.el-input__wrapper) {
  padding-left: 6px;
  padding-right: 6px;
}

.tool-item :deep(.el-input-number .el-input__inner) {
  padding-left: 2px;
  padding-right: 18px;
}

.tool-item :deep(.el-input-number__decrease),
.tool-item :deep(.el-input-number__increase) {
  width: 16px;
}

.suffix-x {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-left: -2px;
}

.edit-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
  gap: 10px;
  align-items: start;
}

.edit-left-column,
.edit-right-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-side-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  padding: 8px;
}

.edit-side-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.side-toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  overflow-x: visible;
}

.side-toolbar .tool-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 3px 4px;
  min-width: 0;
  white-space: normal;
}

.side-toolbar .tool-label {
  grid-column: 1 / -1;
}

.side-toolbar .tool-item :deep(.el-select),
.side-toolbar .tool-item :deep(.el-input-number) {
  min-width: 0;
  width: 100%;
}

.side-toolbar .suffix-x {
  margin-left: 0;
  line-height: 24px;
}

.side-toolbar .keyframe-tool-item {
  grid-column: 1 / -1;
}

.side-toolbar .inline-kf-buttons {
  grid-column: 1 / -1;
  flex-wrap: wrap;
}

.audio-side-card {
  background: var(--el-bg-color);
}

.prompt-focus-section {
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  padding: 8px;
  background: linear-gradient(180deg, var(--el-color-primary-light-9), var(--el-bg-color));
}

/* 关键帧数按钮 */
.inline-kf-buttons {
  display: inline-flex;
  gap: 3px;
  flex-wrap: nowrap;
}

.kf-buttons {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.kf-btn {
  position: relative;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.15s;
}

.kf-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.kf-btn.active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.kf-btn.recommended:not(.active) {
  border-color: var(--el-color-primary-light-3);
  color: var(--el-color-primary);
}

.desc-section {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 6px;
}

.desc-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.characters-section {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 6px;
}

.char-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.empty-hint-inline {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
  padding: 6px 0;
}

.empty-hint-inline code {
  background: var(--el-fill-color-light);
  padding: 0 4px;
  border-radius: 2px;
  font-family: monospace;
}

.characters-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-grid-header,
.char-grid-row {
  display: grid;
  /* 角色 / 位置 0.5fr / 表情 0.5fr / 朝向 0.5fr / 动作 2.5fr / 删除
     位置·表情·朝向各砍一半，省下的总共 1.5fr 全部给"动作"列 */
  grid-template-columns: 80px 0.5fr 0.5fr 0.5fr 2.5fr 32px;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}

.cg-remove {
  color: var(--el-text-color-placeholder);
  padding: 4px;
}

.cg-remove:hover {
  color: var(--el-color-danger);
}

.binding-row-sections {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 6px;
}

.binding-row-sections .characters-section {
  border-top: none;
  padding-top: 0;
}

.bindings-section {
  margin-top: 0;
}

@media (max-width: 1100px) {
  .edit-layout {
    grid-template-columns: 1fr;
  }

  .binding-row-sections {
    grid-template-columns: 1fr;
  }
}

.bindings-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.binding-chip {
  font-size: 12px;
}

.binding-add-btn {
  width: 24px;
  height: 24px;
  min-height: 24px;
}

.compact-empty {
  padding: 0;
  line-height: 24px;
}

/* 继承自场景的 chip 用虚线边框区分，避免误以为是分镜级独立配置 */
.inherited-chip {
  border-style: dashed !important;
  opacity: 0.85;
}

.inherited-tag {
  display: inline-block;
  margin-left: 4px;
  padding: 0 4px;
  font-size: 10px;
  border-radius: 2px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.char-grid-header {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.cg-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.char-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
