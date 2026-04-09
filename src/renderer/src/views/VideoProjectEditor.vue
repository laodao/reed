<template>
  <div class="video-project-editor">
    <!-- 顶部导航 -->
    <div class="editor-header">
      <div class="header-left">
        <el-button text @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
      </div>
      <div class="header-center">
        <h2 class="project-title">{{ store.currentProject?.name || '加载中...' }}</h2>
      </div>
      <div class="header-right">
        <el-button @click="showSettingsDialog = true">
          <el-icon><Setting /></el-icon>
          项目设置
        </el-button>
      </div>
    </div>

    <!-- 主要内容区 -->
    <div class="editor-content">
      <!-- 左侧面板 - 剧集列表 -->
      <div class="left-panel">
        <div class="panel-header">
          <h3>剧集列表</h3>
          <el-button type="primary" size="small" @click="openCreateEpisodeDialog" circle>
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>

        <div class="episode-list">
          <div
            v-for="episode in store.episodes"
            :key="episode.id"
            class="episode-item"
            :class="{ active: store.currentEpisode?.id === episode.id }"
            @click="selectEpisode(episode)"
          >
            <div class="episode-number">第{{ episode.episodeNumber }}集</div>
            <div class="episode-title">{{ episode.title }}</div>
            <div class="episode-status">
              <el-tag size="small" :type="getEpisodeStatusType(episode.status)">
                {{ getEpisodeStatusLabel(episode.status) }}
              </el-tag>
            </div>
            <div class="episode-actions" @click.stop>
              <el-button text type="primary" size="small" @click="openEditEpisodeDialog(episode)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button text type="danger" size="small" @click="confirmDeleteEpisode(episode)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>

          <el-empty v-if="store.episodes.length === 0" description="暂无剧集" :image-size="80" />
        </div>
      </div>

      <!-- 中间区域 - 剧本/场景 -->
      <div class="center-panel">
        <template v-if="store.currentEpisode">
          <el-tabs v-model="activeTab" class="editor-tabs">
            <!-- 剧本标签页 -->
            <el-tab-pane label="剧本" name="script">
              <div class="script-editor-new">
                <!-- 左侧场景导航 -->
                <div class="scene-nav-sidebar">
                  <div class="sidebar-header">
                    <h4>场景导航</h4>
                    <el-button
                      size="small"
                      :loading="store.generating"
                      :disabled="store.generating"
                      @click="generateScript"
                    >
                      <el-icon><MagicStick /></el-icon>
                      AI 生成剧本
                    </el-button>
                  </div>
                  <div class="scene-nav-list">
                    <div
                      v-for="(scene, index) in store.scenes"
                      :key="scene.id"
                      class="scene-nav-item"
                      :class="{ active: currentSceneIndex === index }"
                      @click="scrollToScene(index)"
                    >
                      <div class="scene-nav-number">场景 {{ scene.sceneNumber }}</div>
                      <div class="scene-nav-location">{{ scene.location }}</div>
                      <div class="scene-nav-time">
                        <el-tag size="small" type="info">{{ getLocationTypeLabel(scene.locationType) }}</el-tag>
                        <el-tag size="small">{{ getTimeOfDayLabel(scene.timeOfDay) }}</el-tag>
                      </div>
                    </div>
                    <el-empty v-if="store.scenes.length === 0" description="暂无场景" :image-size="60" />
                  </div>
                </div>

                <!-- 右侧剧本正文显示区 -->
                <div class="script-content-area" ref="scriptContentRef">
                  <div class="content-header">
                    <h4>剧本正文</h4>
                    <div class="header-actions">
                      <el-button
                        size="small"
                        :loading="store.generating"
                        :disabled="store.generating"
                        @click="generateScenes"
                        v-if="store.currentScript && !store.currentScript.scriptContent"
                      >
                        <el-icon><MagicStick /></el-icon>
                        拆分场景
                      </el-button>
                    </div>
                  </div>

                  <div class="script-content-body">
                    <template v-if="store.currentScript?.scriptContent">
                      <div
                        v-for="(scene, index) in store.scenes"
                        :key="scene.id"
                        :id="`scene-${index}`"
                        class="scene-block"
                        :class="{ active: currentSceneIndex === index }"
                      >
                        <div class="scene-header-line">
                          {{ formatSceneHeader(scene) }}
                        </div>
                        <div
                          class="scene-script-content"
                          v-html="formatSceneScriptContent(scene, index)"
                        ></div>
                      </div>
                    </template>
                    <template v-else-if="store.currentScript">
                      <div class="no-script-content">
                        <el-empty description="剧本正文尚未生成" :image-size="120">
                          <el-button type="primary" @click="generateScript" :loading="store.generating">
                            生成完整剧本
                          </el-button>
                        </el-empty>
                      </div>
                    </template>
                    <template v-else>
                      <div class="no-script-content">
                        <el-empty description="请先生成剧本" :image-size="120">
                          <el-button type="primary" @click="generateScript" :loading="store.generating">
                            AI 生成剧本
                          </el-button>
                        </el-empty>
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <!-- 底部折叠：章节梗概 -->
              <el-collapse class="script-synopsis-collapse">
                <el-collapse-item title="章节梗概" name="synopsis">
                  <el-input
                    v-model="scriptSynopsis"
                    type="textarea"
                    :rows="3"
                    placeholder="输入或生成剧本概要..."
                    @blur="saveScriptSynopsis"
                  />
                </el-collapse-item>
              </el-collapse>
            </el-tab-pane>

            <!-- 角色绑定标签页 -->
            <el-tab-pane label="角色绑定" name="characters">
              <div class="character-bindings">
                <div class="bindings-header">
                  <h4>角色绑定配置</h4>
                  <el-button size="small" @click="showBindCharacterDialog = true">
                    <el-icon><Plus /></el-icon>
                    绑定角色
                  </el-button>
                </div>

                <div class="bindings-list">
                  <div
                    v-for="binding in store.characterBindings"
                    :key="binding.id"
                    class="binding-card character-card"
                    @click="showCharacterDetail(binding.longWritingCharacterId)"
                  >
                    <div class="card-header">
                      <div class="card-icon character-icon">
                        <el-icon size="24"><User /></el-icon>
                      </div>
                      <div class="card-title">
                        <div class="binding-name">{{ getCharacterName(binding.longWritingCharacterId) }}</div>
                        <el-tag size="small" type="primary" v-if="getCharacterRolePosition(binding.longWritingCharacterId)">
                          {{ getRolePositionLabel(getCharacterRolePosition(binding.longWritingCharacterId)) }}
                        </el-tag>
                      </div>
                    </div>
                    <div class="card-body">
                      <div class="binding-status">
                        <el-tag v-if="binding.portraitId" size="small" type="success">
                          <el-icon><Check /></el-icon>
                          已绑定人像
                        </el-tag>
                        <el-tag v-else size="small" type="warning">
                          <el-icon><Warning /></el-icon>
                          未绑定人像
                        </el-tag>
                      </div>
                    </div>
                    <div class="card-footer">
                      <el-button text size="small" @click.stop="editBinding(binding)">
                        <el-icon><Edit /></el-icon>
                        编辑
                      </el-button>
                      <el-button text size="small" type="danger" @click.stop="removeBinding(binding)">
                        <el-icon><Delete /></el-icon>
                        移除
                      </el-button>
                    </div>
                  </div>

                  <el-empty v-if="store.characterBindings.length === 0" description="暂无角色绑定" :image-size="60" />
                </div>
              </div>
            </el-tab-pane>

            <!-- 物品绑定标签页 -->
            <el-tab-pane label="物品绑定" name="items">
              <div class="item-bindings">
                <div class="bindings-header">
                  <h4>物品绑定配置</h4>
                  <el-button size="small" @click="showBindItemDialog = true">
                    <el-icon><Plus /></el-icon>
                    绑定物品
                  </el-button>
                </div>

                <div class="bindings-list">
                  <div
                    v-for="binding in store.itemBindings"
                    :key="binding.id"
                    class="binding-card item-card"
                    @click="showItemDetail(binding.longWritingItemId)"
                  >
                    <div class="card-header">
                      <div class="card-icon item-icon">
                        <el-icon size="24"><Box /></el-icon>
                      </div>
                      <div class="card-title">
                        <div class="binding-name">{{ binding.itemName }}</div>
                        <el-tag size="small" type="warning" v-if="getItemImportance(binding.longWritingItemId)">
                          {{ getEntityImportanceLabel(getItemImportance(binding.longWritingItemId)) }}
                        </el-tag>
                      </div>
                    </div>
                    <div class="card-body">
                      <div class="binding-status">
                        <el-tag v-if="binding.imagePaths && binding.imagePaths.length > 0" size="small" type="success">
                          <el-icon><Picture /></el-icon>
                          {{ binding.imagePaths.length }} 张图片
                        </el-tag>
                        <el-tag v-else size="small" type="warning">
                          <el-icon><Warning /></el-icon>
                          未绑定图片
                        </el-tag>
                      </div>
                    </div>
                    <div class="card-footer">
                      <el-button text size="small" @click.stop="editItemBinding(binding)">
                        <el-icon><Edit /></el-icon>
                        编辑
                      </el-button>
                      <el-button text size="small" type="danger" @click.stop="removeItemBinding(binding)">
                        <el-icon><Delete /></el-icon>
                        移除
                      </el-button>
                    </div>
                  </div>

                  <el-empty v-if="store.itemBindings.length === 0" description="暂无物品绑定" :image-size="60" />
                </div>
              </div>
            </el-tab-pane>

            <!-- 地点绑定标签页 -->
            <el-tab-pane label="地点绑定" name="locations">
              <div class="location-bindings">
                <div class="bindings-header">
                  <h4>地点绑定配置</h4>
                  <el-button size="small" @click="showBindLocationDialog = true">
                    <el-icon><Plus /></el-icon>
                    绑定地点
                  </el-button>
                </div>

                <div class="bindings-list">
                  <div
                    v-for="binding in store.locationBindings"
                    :key="binding.id"
                    class="binding-card location-card"
                    @click="showLocationDetail(binding.longWritingLocationId)"
                  >
                    <div class="card-header">
                      <div class="card-icon location-icon">
                        <el-icon size="24"><Location /></el-icon>
                      </div>
                      <div class="card-title">
                        <div class="binding-name">{{ binding.locationName }}</div>
                        <el-tag size="small" type="info" v-if="getLocationImportance(binding.longWritingLocationId)">
                          {{ getEntityImportanceLabel(getLocationImportance(binding.longWritingLocationId)) }}
                        </el-tag>
                      </div>
                    </div>
                    <div class="card-body">
                      <div class="binding-status">
                        <el-tag v-if="binding.imagePaths && binding.imagePaths.length > 0" size="small" type="success">
                          <el-icon><Picture /></el-icon>
                          {{ binding.imagePaths.length }} 张图片
                        </el-tag>
                        <el-tag v-else size="small" type="warning">
                          <el-icon><Warning /></el-icon>
                          未绑定图片
                        </el-tag>
                      </div>
                    </div>
                    <div class="card-footer">
                      <el-button text size="small" @click.stop="editLocationBinding(binding)">
                        <el-icon><Edit /></el-icon>
                        编辑
                      </el-button>
                      <el-button text size="small" type="danger" @click.stop="removeLocationBinding(binding)">
                        <el-icon><Delete /></el-icon>
                        移除
                      </el-button>
                    </div>
                  </div>

                  <el-empty v-if="store.locationBindings.length === 0" description="暂无地点绑定" :image-size="60" />
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>

        <el-empty v-else description="请选择或创建剧集" :image-size="120" />
      </div>

      <!-- 右侧面板 - 分镜 -->
      <div class="right-panel">
        <template v-if="store.currentScene">
          <div class="panel-header">
            <h3>分镜列表</h3>
            <div class="panel-actions">
              <el-button
                size="small"
                :loading="store.generating"
                :disabled="store.generating"
                @click="generateStoryboards"
              >
                <el-icon><MagicStick /></el-icon>
                生成分镜
              </el-button>
              <el-button
                v-if="store.storyboards.length > 0"
                size="small"
                type="primary"
                @click="goToVideoProduction"
              >
                <el-icon><VideoPlay /></el-icon>
                视频制作
              </el-button>
            </div>
          </div>

          <div class="storyboard-list">
            <div
              v-for="storyboard in store.storyboards"
              :key="storyboard.id"
              class="storyboard-item"
              :class="{
                'has-image': storyboard.frameImage,
                'selected': selectedStoryboard?.id === storyboard.id
              }"
              @click="selectStoryboard(storyboard)"
              @dblclick="openStoryboardEdit(storyboard)"
            >
              <!-- 画面预览 -->
              <div class="storyboard-item-left">
                <div v-if="storyboard.frameImage" class="storyboard-preview" @click.stop="openImagePreview(storyboard.frameImage.filePath || storyboard.frameImage.url)">
                  <img :src="storyboard.frameImage.filePath || storyboard.frameImage.url" :alt="`镜头${storyboard.shotNumber}`" />
                  <div class="preview-overlay">
                    <el-icon size="20"><ZoomIn /></el-icon>
                  </div>
                </div>
                <div v-else class="storyboard-preview placeholder">
                  <el-icon size="32"><Picture /></el-icon>
                  <span>待生成</span>
                </div>

                <div class="storyboard-info">
                  <div class="storyboard-header">
                    <span class="shot-number">镜头 {{ storyboard.shotNumber }}</span>
                    <el-tag size="small">{{ getShotTypeLabel(storyboard.shotType) }}</el-tag>
                    <el-tag v-if="storyboard.frameImage" size="small" type="success">已生成</el-tag>
                  </div>
                  <div class="storyboard-description">
                    {{ storyboard.frameDescription }}
                  </div>
                  <div class="storyboard-meta">
                    <span>{{ storyboard.duration }}s</span>
                    <span>{{ getCameraAngleLabel(storyboard.cameraAngle) }}</span>
                    <span>{{ getCameraMovementLabel(storyboard.cameraMovement) }}</span>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="storyboard-item-actions" @click.stop>
                <el-tooltip v-if="storyboard.frameImage" content="重新生成" placement="top">
                  <el-button
                    circle
                    size="small"
                    @click="openRegenerateDialog(storyboard)"
                  >
                    <el-icon><RefreshRight /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip v-if="storyboard.frameImage" content="删除画面" placement="top">
                  <el-button
                    circle
                    size="small"
                    type="danger"
                    @click="confirmDeleteStoryboardImage(storyboard)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </div>

          <el-empty v-if="store.storyboards.length === 0" description="暂无分镜" :image-size="80" />
        </template>

        <el-empty v-else description="请选择场景" :image-size="80" />
      </div>
    </div>

    <!-- 生成画面对话框 -->
    <el-dialog
      v-model="showGenerateImagesDialog"
      title="生成分镜画面"
      width="500px"
    >
      <el-form :model="imageGenerateForm" label-width="80px">
        <el-form-item label="选中分镜">
          <div v-if="selectedStoryboard" class="selected-storyboard-info">
            <span class="shot-label">镜头 {{ selectedStoryboard.shotNumber }}</span>
            <span class="shot-type">{{ selectedStoryboard.shotType }}</span>
            <el-tag v-if="selectedStoryboard.frameImage" type="success" size="small">已有画面</el-tag>
            <el-tag v-else type="info" size="small">待生成</el-tag>
          </div>
          <div v-else class="no-selection-hint">请先选择一个分镜</div>
        </el-form-item>
        <el-form-item label="图像风格">
          <el-select v-model="imageGenerateForm.styleName" style="width: 100%">
            <el-option label="电影风格" value="cinematic" />
            <el-option label="动漫风格" value="anime" />
            <el-option label="写实风格" value="realistic" />
            <el-option label="奇幻风格" value="fantasy" />
            <el-option label="古风仙侠" value="ancient_chinese" />
          </el-select>
        </el-form-item>
        <el-form-item label="画面描述">
          <div class="frame-description-preview">
            {{ selectedStoryboard?.frameDescription || '暂无描述' }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateImagesDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="generatingImage"
          @click="generateSingleStoryboardImage"
        >
          开始生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 创建剧集对话框 -->
    <el-dialog
      v-model="showCreateEpisodeDialog"
      title="创建剧集"
      width="700px"
    >
      <el-form :model="episodeForm" label-width="90px">
        <el-form-item label="剧集序号">
          <el-input-number v-model="episodeForm.episodeNumber" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="剧集标题">
          <el-input v-model="episodeForm.title" placeholder="选择章节后自动生成，或手动输入" />
        </el-form-item>
        <el-form-item label="内容来源">
          <el-radio-group v-model="episodeForm.sourceType" @change="handleSourceTypeChange">
            <el-radio value="outline">关联长文章节</el-radio>
            <el-radio v-if="!hasLinkedLongWriting" value="uploaded">上传长文</el-radio>
          </el-radio-group>
          <div v-if="hasLinkedLongWriting" class="form-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>项目已关联长文，只能选择关联长文章节</span>
          </div>
        </el-form-item>

        <!-- 关联章节模式 -->
        <el-form-item v-if="episodeForm.sourceType === 'outline'" label="关联章节">
          <el-cascader
            v-model="episodeForm.outlineId"
            :options="outlineCascaderData"
            :props="outlineCascaderProps"
            placeholder="请选择章节（卷/章/节）"
            filterable
            clearable
            style="width: 100%"
            @change="handleOutlineCascaderChange"
          />
          <div class="outline-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>选择"节"级别的章节创建剧集</span>
          </div>
        </el-form-item>

        <!-- 上传长文模式 -->
        <template v-if="episodeForm.sourceType === 'uploaded'">
          <el-form-item label="长文内容">
            <el-input
              v-model="episodeForm.uploadedContent"
              type="textarea"
              :rows="10"
              placeholder="请粘贴长文内容（500-15000字）"
              style="width: 100%"
            />
            <div class="word-count-hint">
              <span :class="{ 'word-count-warning': uploadedWordCount < 500 || uploadedWordCount > 15000 }">
                当前字数：{{ uploadedWordCount }} 字
              </span>
              <span class="word-count-limit">（限制：500-15000字）</span>
            </div>
          </el-form-item>
          <el-form-item v-if="uploadedWordCount < 500 && uploadedWordCount > 0">
            <div class="form-error">字数不足，至少需要 500 字，当前 {{ uploadedWordCount }} 字</div>
          </el-form-item>
          <el-form-item v-if="uploadedWordCount > 15000">
            <div class="form-error">字数超出限制，最多允许 15000 字，当前 {{ uploadedWordCount }} 字</div>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showCreateEpisodeDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.loading" :disabled="!isEpisodeFormValid" @click="createEpisode">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑剧集对话框 -->
    <el-dialog
      v-model="showEditEpisodeDialog"
      title="编辑剧集"
      width="500px"
    >
      <el-form :model="episodeForm" label-width="80px">
        <el-form-item label="剧集序号">
          <el-input-number v-model="episodeForm.episodeNumber" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="剧集标题">
          <el-input v-model="episodeForm.title" placeholder="请输入剧集标题" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditEpisodeDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.loading" @click="updateEpisode">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 视频合成对话框 -->
    <el-dialog
      v-model="showSynthesisDialog"
      title="合成场景视频"
      width="500px"
    >
      <el-form :model="synthesisForm" label-width="80px">
        <el-form-item label="视频质量">
          <el-select v-model="synthesisForm.quality" style="width: 100%">
            <el-option label="标准 (1080p 30fps)" value="standard" />
            <el-option label="高清 (1080p 高码率)" value="high" />
            <el-option label="流畅 (720p 24fps)" value="low" />
            <el-option label="竖屏 (1080x1920)" value="vertical" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <div class="generate-info">
            将合成 {{ store.storyboards.length }} 个镜头为完整视频
          </div>
        </el-form-item>
        <el-form-item v-if="synthesisProgress.phase" label="进度">
          <div class="synthesis-progress">
            <el-progress
              :percentage="synthesisProgress.progress"
              :status="synthesisProgress.progress === 100 ? 'success' : ''"
            />
            <span class="progress-text">
              {{ getSynthesisPhaseLabel(synthesisProgress.phase) }}
            </span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSynthesisDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="store.loading || synthesisProgress.progress > 0"
          @click="synthesizeVideo"
        >
          开始合成
        </el-button>
      </template>
    </el-dialog>

    <!-- 项目设置对话框 -->
    <el-dialog
      v-model="showSettingsDialog"
      title="项目设置"
      width="700px"
      class="settings-dialog"
    >
      <el-form v-if="store.currentProject" label-width="100px" class="settings-form">
        <el-divider content-position="left">基本设置</el-divider>
        <el-form-item label="项目名称">
          <el-input v-model="projectSettings.name" />
        </el-form-item>
        <el-form-item label="关联长文">
          <el-select
            v-model="projectSettings.longWritingProjectId"
            placeholder="选择关联的长文项目"
            style="width: 100%"
            clearable
            filterable
          >
            <el-option
              v-for="project in allLwProjects"
              :key="project.id"
              :label="project.name"
              :value="project.id"
            />
          </el-select>
          <div class="form-hint">关联长文后，添加剧集时可选择关联长文章节</div>
        </el-form-item>
        <el-form-item label="画幅比例">
          <el-select v-model="projectSettings.config.aspectRatio" style="width: 100%">
            <el-option label="16:9 (横屏)" value="16:9" />
            <el-option label="9:16 (竖屏)" value="9:16" />
            <el-option label="4:3 (标准)" value="4:3" />
            <el-option label="1:1 (方形)" value="1:1" />
          </el-select>
        </el-form-item>
        <el-form-item label="分辨率">
          <el-select v-model="projectSettings.config.resolution" style="width: 100%">
            <el-option label="4K" :value="2160" />
            <el-option label="2K" :value="1440" />
            <el-option label="1080p" :value="1080" />
            <el-option label="720p" :value="720" />
            <el-option label="480p" :value="480" />
          </el-select>
        </el-form-item>
        <el-form-item label="帧率">
          <el-select v-model="projectSettings.config.fps" style="width: 100%">
            <el-option label="24 fps" :value="24" />
            <el-option label="25 fps" :value="25" />
            <el-option label="30 fps" :value="30" />
            <el-option label="60 fps" :value="60" />
          </el-select>
        </el-form-item>

        <el-divider content-position="left">模型设置</el-divider>
        <el-form-item label="剧本生成">
          <el-select
            v-model="projectSettings.config.scriptModel"
            placeholder="选择剧本生成模型"
            style="width: 100%"
            clearable
            filterable
          >
            <el-option-group
              v-for="provider in textProviderModels"
              :key="provider.id"
              :label="provider.name"
            >
              <el-option
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                :label="`${provider.shortId}/${model.name}`"
                :value="`${provider.id}:${model.id}`"
              />
            </el-option-group>
          </el-select>
          <div class="model-hint">用于AI生成剧本和场景拆分</div>
        </el-form-item>
        <el-form-item label="分镜生成">
          <el-select
            v-model="projectSettings.config.storyboardModel"
            placeholder="选择分镜生成模型"
            style="width: 100%"
            clearable
            filterable
          >
            <el-option-group
              v-for="provider in textProviderModels"
              :key="provider.id"
              :label="provider.name"
            >
              <el-option
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                :label="`${provider.shortId}/${model.name}`"
                :value="`${provider.id}:${model.id}`"
              />
            </el-option-group>
          </el-select>
          <div class="model-hint">用于AI生成分镜设计</div>
        </el-form-item>
        <el-form-item label="画面生成">
          <el-select
            v-model="projectSettings.config.imageModel"
            placeholder="选择画面生成模型"
            style="width: 100%"
            clearable
            filterable
          >
            <el-option-group
              v-for="provider in imageProviderModels"
              :key="provider.id"
              :label="provider.name"
            >
              <el-option
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                :label="`${provider.shortId}/${model.name}`"
                :value="`${provider.id}:${model.id}`"
              />
            </el-option-group>
          </el-select>
          <div class="model-hint">用于生成分镜画面图像</div>
        </el-form-item>
        <el-form-item label="视频合成">
          <el-select
            v-model="projectSettings.config.videoModel"
            placeholder="选择视频合成模型"
            style="width: 100%"
            clearable
            filterable
          >
            <el-option-group
              v-for="provider in videoProviderModels"
              :key="provider.id"
              :label="provider.name"
            >
              <el-option
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                :label="`${provider.shortId}/${model.name}`"
                :value="`${provider.id}:${model.id}`"
              />
            </el-option-group>
          </el-select>
          <div class="model-hint">请选择图生视频模型，当前支持阿里百炼、火山方舟平台</div>
        </el-form-item>
        <el-form-item label="音频生成">
          <el-select
            v-model="projectSettings.config.audioModel"
            placeholder="选择音频生成模型"
            style="width: 100%"
            clearable
            filterable
          >
            <el-option-group
              v-for="provider in audioProviderModels"
              :key="provider.id"
              :label="provider.name"
            >
              <el-option
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                :label="`${provider.shortId}/${model.name}`"
                :value="`${provider.id}:${model.id}`"
              />
            </el-option-group>
          </el-select>
          <div class="model-hint">用于生成角色配音（可选）</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSettingsDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.loading" @click="saveProjectSettings">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 分镜编辑对话框 -->
    <el-dialog
      v-model="showStoryboardEditDialog"
      title="编辑分镜"
      width="800px"
      :close-on-click-modal="false"
    >
      <el-form v-if="editingStoryboard" :model="storyboardEditForm" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="镜头号">
              <el-input-number v-model="storyboardEditForm.shotNumber" :min="1" :max="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="时长(秒)">
              <el-input-number v-model="storyboardEditForm.duration" :min="0.5" :max="60" :step="0.5" :precision="1" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">镜头参数</el-divider>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="景别">
              <el-select v-model="storyboardEditForm.shotType" style="width: 100%">
                <el-option label="大远景" value="extreme_long" />
                <el-option label="远景" value="long" />
                <el-option label="全景" value="full" />
                <el-option label="中景" value="medium" />
                <el-option label="中近景" value="medium_close" />
                <el-option label="近景" value="close" />
                <el-option label="特写" value="extreme_close" />
                <el-option label="大特写" value="detail" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="角度">
              <el-select v-model="storyboardEditForm.cameraAngle" style="width: 100%">
                <el-option label="平视" value="eye_level" />
                <el-option label="俯拍" value="high" />
                <el-option label="仰拍" value="low" />
                <el-option label="荷兰角" value="dutch" />
                <el-option label="鸟瞰" value="birds_eye" />
                <el-option label="虫视" value="worms_eye" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="运镜">
              <el-select v-model="storyboardEditForm.cameraMovement" style="width: 100%">
                <el-option label="固定" value="static" />
                <el-option label="左摇" value="pan_left" />
                <el-option label="右摇" value="pan_right" />
                <el-option label="上仰" value="tilt_up" />
                <el-option label="下俯" value="tilt_down" />
                <el-option label="推镜" value="dolly_in" />
                <el-option label="拉镜" value="dolly_out" />
                <el-option label="左移" value="truck_left" />
                <el-option label="右移" value="truck_right" />
                <el-option label="变焦推进" value="zoom_in" />
                <el-option label="变焦拉远" value="zoom_out" />
                <el-option label="升镜" value="crane_up" />
                <el-option label="降镜" value="crane_down" />
                <el-option label="手持" value="handheld" />
                <el-option label="环绕" value="orbit" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="画面描述">
          <el-input
            v-model="storyboardEditForm.frameDescription"
            type="textarea"
            :rows="3"
            placeholder="描述画面内容、构图、角色位置等"
          />
        </el-form-item>

        <el-divider content-position="left">转场设置</el-divider>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="转场类型">
              <el-select v-model="storyboardEditForm.transitionType" style="width: 100%">
                <el-option label="硬切" value="cut" />
                <el-option label="淡入淡出" value="fade" />
                <el-option label="溶解" value="dissolve" />
                <el-option label="擦除" value="wipe" />
                <el-option label="滑动" value="slide" />
                <el-option label="缩放" value="zoom" />
                <el-option label="光圈" value="iris" />
                <el-option label="甩镜" value="whip" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="转场时长">
              <el-input-number v-model="storyboardEditForm.transitionDuration" :min="0" :max="3000" :step="100" />
              <span class="form-hint">ms</span>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="滑动方向">
              <el-select
                v-model="storyboardEditForm.transitionDirection"
                style="width: 100%"
                :disabled="!['slide', 'wipe'].includes(storyboardEditForm.transitionType)"
              >
                <el-option label="向左" value="left" />
                <el-option label="向右" value="right" />
                <el-option label="向上" value="up" />
                <el-option label="向下" value="down" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showStoryboardEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.loading" @click="saveStoryboardEdit">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 绑定角色对话框 -->
    <el-dialog
      v-model="showBindCharacterDialog"
      title="绑定角色"
      width="500px"
    >
      <el-form :model="bindCharacterForm" label-width="100px">
        <el-form-item label="选择角色">
          <el-select v-model="bindCharacterForm.characterId" placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="char in availableCharacters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="声音类型">
          <el-select v-model="bindCharacterForm.voiceType" placeholder="选择声音类型" style="width: 100%">
            <el-option label="男声-沉稳" value="male_calm" />
            <el-option label="男声-活力" value="male_energetic" />
            <el-option label="女声-温柔" value="female_gentle" />
            <el-option label="女声-活泼" value="female_lively" />
            <el-option label="童声" value="child" />
            <el-option label="老年-男" value="elder_male" />
            <el-option label="老年-女" value="elder_female" />
          </el-select>
        </el-form-item>
        <el-form-item label="语速">
          <el-slider v-model="bindCharacterForm.speechRate" :min="0.5" :max="2" :step="0.1" show-stops />
        </el-form-item>
        <el-form-item label="角色描述">
          <el-input
            v-model="bindCharacterForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入角色外貌描述，用于生成人物形象（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBindCharacterDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!bindCharacterForm.characterId"
          :loading="store.loading"
          @click="handleBindCharacter"
        >
          绑定
        </el-button>
      </template>
    </el-dialog>

    <!-- 绑定物品对话框 -->
    <el-dialog
      v-model="showBindItemDialog"
      title="绑定物品"
      width="500px"
    >
      <el-form :model="bindItemForm" label-width="100px">
        <el-form-item label="选择物品">
          <el-select v-model="bindItemForm.itemId" placeholder="请选择物品" style="width: 100%">
            <el-option
              v-for="item in availableItems"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="物品描述">
          <el-input
            v-model="bindItemForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入物品描述，用于生成图片（可选）"
          />
        </el-form-item>
        <el-form-item label="自动生成图片">
          <el-switch v-model="bindItemForm.generateImages" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBindItemDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!bindItemForm.itemId"
          :loading="store.loading"
          @click="handleBindItem"
        >
          绑定
        </el-button>
      </template>
    </el-dialog>

    <!-- 绑定地点对话框 -->
    <el-dialog
      v-model="showBindLocationDialog"
      title="绑定地点"
      width="500px"
    >
      <el-form :model="bindLocationForm" label-width="100px">
        <el-form-item label="选择地点">
          <el-select v-model="bindLocationForm.locationId" placeholder="请选择地点" style="width: 100%">
            <el-option
              v-for="location in availableLocations"
              :key="location.id"
              :label="location.name"
              :value="location.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="地点描述">
          <el-input
            v-model="bindLocationForm.description"
            type="textarea"
            :rows="3"
            placeholder="输入地点描述，用于生成图片（可选）"
          />
        </el-form-item>
        <el-form-item label="自动生成图片">
          <el-switch v-model="bindLocationForm.generateImages" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBindLocationDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!bindLocationForm.locationId"
          :loading="store.loading"
          @click="handleBindLocation"
        >
          绑定
        </el-button>
      </template>
    </el-dialog>

    <!-- 角色详情对话框 -->
    <el-dialog
      v-model="showCharacterDetailDialog"
      title="角色详情"
      width="700px"
      class="entity-detail-dialog"
      destroy-on-close
    >
      <div v-loading="characterDetailLoading" class="detail-content">
        <template v-if="characterDetail">
          <!-- 基本信息 -->
          <div class="detail-section">
            <div class="section-title">基本信息</div>
            <div class="section-content">
              <el-descriptions :column="3" border>
                <el-descriptions-item label="名称">{{ characterDetail.name }}</el-descriptions-item>
                <el-descriptions-item label="性别">{{ getGenderLabel(characterDetail.gender) }}</el-descriptions-item>
                <el-descriptions-item label="年龄">{{ characterDetail.age }} 岁</el-descriptions-item>
                <el-descriptions-item label="身高">{{ characterDetail.height ? `${characterDetail.height} cm` : '-' }}</el-descriptions-item>
                <el-descriptions-item label="体重">{{ characterDetail.weight ? `${characterDetail.weight} kg` : '-' }}</el-descriptions-item>
                <el-descriptions-item label="人种">{{ characterDetail.race ? getRaceLabel(characterDetail.race) : '-' }}</el-descriptions-item>
                <el-descriptions-item label="职业">{{ characterDetail.occupation || '-' }}</el-descriptions-item>
                <el-descriptions-item label="职务">{{ characterDetail.position || '-' }}</el-descriptions-item>
                <el-descriptions-item label="角色定位">
                  <el-tag size="small" type="primary">{{ getRolePositionLabel(characterDetail.rolePosition) }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="重要性">
                  <el-tag size="small" :type="getImportanceType(characterDetail.importance)">
                    {{ getEntityImportanceLabel(characterDetail.importance) }}
                  </el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </div>
          </div>

          <!-- 详细设定 -->
          <div class="detail-section">
            <div class="section-title">详细设定</div>
            <div class="section-content">
              <el-descriptions :column="1" border>
                <el-descriptions-item label="外貌描述">
                  <div class="description-text">{{ characterDetail.appearance || '-' }}</div>
                </el-descriptions-item>
                <el-descriptions-item label="性格特点">
                  <div class="description-text">{{ characterDetail.personality || '-' }}</div>
                </el-descriptions-item>
                <el-descriptions-item label="背景故事">
                  <div class="description-text">{{ characterDetail.background || '-' }}</div>
                </el-descriptions-item>
                <el-descriptions-item label="能力特长">
                  <div class="description-text">{{ characterDetail.abilities || '-' }}</div>
                </el-descriptions-item>
                <el-descriptions-item label="主要事件">
                  <div class="description-text">{{ characterDetail.majorEvents || '-' }}</div>
                </el-descriptions-item>
              </el-descriptions>
            </div>
          </div>

          <!-- AI 可见信息 -->
          <div class="detail-section ai-section">
            <div class="section-title">
              <el-icon><InfoFilled /></el-icon>
              AI 可见信息
            </div>
            <div class="section-content">
              <div class="ai-info-box">
                <div class="ai-info-hint">以下信息将提交给 AI 用于剧本和分镜生成：</div>
                <pre class="ai-info-code">{{ formatCharacterAIInfo(characterDetail) }}</pre>
              </div>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="showCharacterDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 物品详情对话框 -->
    <el-dialog
      v-model="showItemDetailDialog"
      title="物品详情"
      width="600px"
      class="entity-detail-dialog"
      destroy-on-close
    >
      <div v-loading="itemDetailLoading" class="detail-content">
        <template v-if="itemDetail">
          <!-- 基本信息 -->
          <div class="detail-section">
            <div class="section-title">基本信息</div>
            <div class="section-content">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="名称">{{ itemDetail.name }}</el-descriptions-item>
                <el-descriptions-item label="类型">
                  <el-tag size="small">{{ getItemTypeLabel(itemDetail.type) }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="等级">
                  <el-tag size="small" type="warning">{{ getItemLevelLabel(itemDetail.level) }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="重要性">
                  <el-tag size="small" :type="getImportanceType(itemDetail.importance)">
                    {{ getEntityImportanceLabel(itemDetail.importance) }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="持有者" :span="2">
                  {{ itemDetail.ownerId ? getCharacterName(itemDetail.ownerId) : '-' }}
                </el-descriptions-item>
              </el-descriptions>
            </div>
          </div>

          <!-- 详细描述 -->
          <div class="detail-section">
            <div class="section-title">详细描述</div>
            <div class="section-content">
              <div class="description-text">{{ itemDetail.description || '-' }}</div>
            </div>
          </div>

          <!-- AI 可见信息 -->
          <div class="detail-section ai-section">
            <div class="section-title">
              <el-icon><InfoFilled /></el-icon>
              AI 可见信息
            </div>
            <div class="section-content">
              <div class="ai-info-box">
                <div class="ai-info-hint">以下信息将提交给 AI 用于剧本和分镜生成：</div>
                <pre class="ai-info-code">{{ formatItemAIInfo(itemDetail) }}</pre>
              </div>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="showItemDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 地点详情对话框 -->
    <el-dialog
      v-model="showLocationDetailDialog"
      title="地点详情"
      width="600px"
      class="entity-detail-dialog"
      destroy-on-close
    >
      <div v-loading="locationDetailLoading" class="detail-content">
        <template v-if="locationDetail">
          <!-- 基本信息 -->
          <div class="detail-section">
            <div class="section-title">基本信息</div>
            <div class="section-content">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="名称">{{ locationDetail.name }}</el-descriptions-item>
                <el-descriptions-item label="类型">
                  <el-tag size="small" type="info">{{ getLocationTypeLabel(locationDetail.type) }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="重要性">
                  <el-tag size="small" :type="getImportanceType(locationDetail.importance)">
                    {{ getEntityImportanceLabel(locationDetail.importance) }}
                  </el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </div>
          </div>

          <!-- 详细描述 -->
          <div class="detail-section">
            <div class="section-title">详细描述</div>
            <div class="section-content">
              <div class="description-text">{{ locationDetail.description || '-' }}</div>
            </div>
          </div>

          <!-- AI 可见信息 -->
          <div class="detail-section ai-section">
            <div class="section-title">
              <el-icon><InfoFilled /></el-icon>
              AI 可见信息
            </div>
            <div class="section-content">
              <div class="ai-info-box">
                <div class="ai-info-hint">以下信息将提交给 AI 用于剧本和分镜生成：</div>
                <pre class="ai-info-code">{{ formatLocationAIInfo(locationDetail) }}</pre>
              </div>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="showLocationDetailDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 图片预览对话框 -->
    <el-dialog
      v-model="showImagePreview"
      title="画面预览"
      width="90%"
      top="5vh"
      class="image-preview-dialog"
      destroy-on-close
    >
      <div class="preview-container">
        <img :src="previewImageUrl" alt="预览图片" class="preview-image" />
      </div>
    </el-dialog>

    <!-- 重新生成画面对话框 -->
    <el-dialog
      v-model="showRegenerateDialog"
      title="重新生成画面"
      width="500px"
    >
      <el-form label-width="80px">
        <el-form-item label="镜头">
          镜头 {{ regeneratingStoryboard?.shotNumber }}
        </el-form-item>
        <el-form-item label="风格">
          <el-select v-model="regenerateForm.styleName" style="width: 100%">
            <el-option label="电影风格" value="cinematic" />
            <el-option label="动漫风格" value="anime" />
            <el-option label="写实风格" value="realistic" />
            <el-option label="奇幻风格" value="fantasy" />
            <el-option label="古风仙侠" value="ancient_chinese" />
          </el-select>
        </el-form-item>
        <el-form-item label="附加提示">
          <el-input
            v-model="regenerateForm.additionalPrompt"
            type="textarea"
            :rows="3"
            placeholder="输入额外的画面描述，如：更暗的光线、增加细节等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRegenerateDialog = false">取消</el-button>
        <el-button type="primary" @click="regenerateStoryboardImage">开始生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Setting, Plus, MagicStick, Picture, VideoPlay, Delete, InfoFilled, Headset, ZoomIn, RefreshRight, User, Box, Location, Edit, Check, Warning } from '@element-plus/icons-vue'
import { useStoryToVideoStore } from '@/stores/story-to-video'
import { useTabsStore } from '@/stores/tabs'
import type { VideoEpisode, VideoProject, SceneScript, CharacterBinding, ItemBinding, LocationBinding } from '../../../shared/types/story-to-video.types'
import type { UserProviderConfig, ProviderTemplate } from '../../../shared/types'

const route = useRoute()
const router = useRouter()
const store = useStoryToVideoStore()
const tabsStore = useTabsStore()

/**
 * 截断标题（最多 maxLength 个字 + 省略号）
 */
function truncateTitle(title: string, maxLength = 5): string {
  if (!title) return ''
  if (title.length <= maxLength) return title
  return title.substring(0, maxLength) + '...'
}

/**
 * 模型配置转换：对象转字符串
 */
function modelToString(model: { providerConfigId: string; modelId: string } | null | undefined): string {
  if (!model) return ''
  return `${model.providerConfigId}:${model.modelId}`
}

/**
 * 模型配置转换：字符串转对象
 */
function stringToModel(str: string): { providerConfigId: string; modelId: string } | null {
  if (!str) return null
  const parts = str.split(':')
  if (parts.length !== 2) return null
  return { providerConfigId: parts[0], modelId: parts[1] }
}

// 项目ID
const projectId = computed(() => route.params.projectId as string)

// 当前标签页
const activeTab = ref('script')

// 剧本概要
const scriptSynopsis = ref('')

// 当前选中的场景索引（用于场景导航）
const currentSceneIndex = ref(0)

// 剧本内容区域引用
const scriptContentRef = ref<HTMLElement | null>(null)

// 章节列表（用于关联剧集）- 原始数据
const chapters = ref<Array<{ id: string; order: number; title: string }>>([])

// 大纲树形数据
interface OutlineTreeNode {
  id: string
  name: string
  nodeType: 'volume' | 'chapter' | 'section'
  orderIndex: number
  children?: OutlineTreeNode[]
  // 用于生成标题的路径信息（使用位置序号）
  volumeOrder?: number // 卷的位置序号（从1开始）
  volumeName?: string
  volumePosition?: number // 卷的位置序号
  chapterOrder?: number // 章节的位置序号（从1开始）
  chapterName?: string
  chapterPosition?: number // 章节的位置序号
  sectionPosition?: number // 节的位置序号
}

const outlineTreeRef = ref<any>(null)
const outlineSearchText = ref('')
const outlineTreeData = ref<OutlineTreeNode[]>([])
const outlineTreeProps = {
  children: 'children',
  label: 'name'
}

// 级联选择器配置
const outlineCascaderProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  checkStrictly: false, // 只能选择最后一级
  emitPath: false // 只返回最后选中的值
}

// 级联选择器数据（只包含节级别的选项）
const outlineCascaderData = computed(() => {
  // 转换树数据为级联选择器格式
  return outlineTreeData.value.map(volume => ({
    id: volume.id,
    name: volume.name,
    nodeType: volume.nodeType,
    children: volume.children?.map(chapter => ({
      id: chapter.id,
      name: chapter.name,
      nodeType: chapter.nodeType,
      // 只保留节级别的children
      children: chapter.children?.filter(section => section.nodeType === 'section')
        .map(section => ({
          id: section.id,
          name: section.name,
          nodeType: section.nodeType,
          // 保存路径信息用于生成标题
          volumeOrder: section.volumeOrder,
          volumeName: section.volumeName,
          chapterOrder: section.chapterOrder,
          chapterName: section.chapterName,
          sectionPosition: section.sectionPosition
        }))
    }))
  }))
})

// 选中的节点的完整路径信息
const selectedOutlineInfo = ref<{
  id: string
  volumeOrder: number
  volumeName: string
  chapterOrder: number
  chapterName: string
  sectionOrder: number
  sectionName: string
} | null>(null)

// 对话框状态
const showCreateEpisodeDialog = ref(false)
const showEditEpisodeDialog = ref(false)
const editingEpisodeId = ref('')
const showSettingsDialog = ref(false)
const showBindCharacterDialog = ref(false)
const showBindItemDialog = ref(false)
const showBindLocationDialog = ref(false)
const showGenerateImagesDialog = ref(false)
const showSynthesisDialog = ref(false)
const showStoryboardEditDialog = ref(false)

// 详情对话框状态
const showCharacterDetailDialog = ref(false)
const showItemDetailDialog = ref(false)
const showLocationDetailDialog = ref(false)

// 详情数据
const characterDetail = ref<import('../../../shared/types/longwriting.types').StoryCharacter | null>(null)
const itemDetail = ref<import('../../../shared/types/longwriting.types').StoryItem | null>(null)
const locationDetail = ref<import('../../../shared/types/longwriting.types').StoryLocation | null>(null)

// 详情加载状态
const characterDetailLoading = ref(false)
const itemDetailLoading = ref(false)
const locationDetailLoading = ref(false)

// 选中的分镜（用于生成画面）
const selectedStoryboard = ref<import('../../../shared/types/story-to-video.types').Storyboard | null>(null)
// 正在编辑的分镜
const editingStoryboard = ref<import('../../../shared/types/story-to-video.types').Storyboard | null>(null)

// 图片预览
const showImagePreview = ref(false)
const previewImageUrl = ref('')

// 打开图片预览
const openImagePreview = (url: string) => {
  if (url) {
    previewImageUrl.value = url
    showImagePreview.value = true
  }
}

// 中文映射
const shotTypeLabels: Record<string, string> = {
  extreme_long: '大远景',
  long: '远景',
  full: '全景',
  medium: '中景',
  medium_close: '中近景',
  close: '近景',
  extreme_close: '特写',
  detail: '细节特写'
}

const cameraAngleLabels: Record<string, string> = {
  eye_level: '平视',
  high: '俯视',
  low: '仰视',
  dutch: '倾斜',
  birds_eye: '鸟瞰',
  worms_eye: '虫视'
}

const cameraMovementLabels: Record<string, string> = {
  static: '固定',
  pan_left: '左摇',
  pan_right: '右摇',
  tilt_up: '上仰',
  tilt_down: '下俯',
  dolly_in: '推近',
  dolly_out: '拉远',
  zoom_in: '放大',
  zoom_out: '缩小',
  tracking: '跟拍',
  crane: '升降'
}

const statusLabels: Record<string, string> = {
  pending: '待处理',
  generating: '生成中',
  image_ready: '画面已就绪',
  audio_ready: '音频已就绪',
  completed: '已完成',
  error: '错误'
}

function getShotTypeLabel(type: string): string {
  return shotTypeLabels[type] || type
}

function getCameraAngleLabel(angle: string): string {
  return cameraAngleLabels[angle] || angle
}

function getCameraMovementLabel(movement: string): string {
  return cameraMovementLabels[movement] || movement
}

function getStatusLabel(status: string): string {
  return statusLabels[status] || status
}

// 跳转到视频制作页面
function goToVideoProduction() {
  if (!store.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }
  router.push(`/story-to-video/${projectId.value}/production/${store.currentScene.id}`)
}

// 重新生成对话框
const showRegenerateDialog = ref(false)
const regeneratingStoryboard = ref<import('../../../shared/types/story-to-video.types').Storyboard | null>(null)
const regenerateForm = reactive({
  styleName: 'cinematic',
  additionalPrompt: ''
})

function openRegenerateDialog(storyboard: import('../../../shared/types/story-to-video.types').Storyboard) {
  regeneratingStoryboard.value = storyboard
  regenerateForm.styleName = 'cinematic'
  regenerateForm.additionalPrompt = ''
  showRegenerateDialog.value = true
}

async function regenerateStoryboardImage() {
  if (!regeneratingStoryboard.value) return

  try {
    const result = await store.generateStoryboardImage(
      regeneratingStoryboard.value.id,
      regenerateForm.styleName,
      undefined,
      undefined,
      regenerateForm.additionalPrompt
    )
    if (result) {
      ElMessage.success('画面生成成功')
      showRegenerateDialog.value = false
    } else {
      ElMessage.error('画面生成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '画面生成失败')
  }
}

async function confirmDeleteStoryboardImage(storyboard: import('../../../shared/types/story-to-video.types').Storyboard) {
  try {
    await ElMessageBox.confirm('确定要删除这个画面吗？删除后可以重新生成。', '删除画面', {
      type: 'warning'
    })
    // TODO: 实现删除画面逻辑
    ElMessage.success('画面已删除')
  } catch {
    // 用户取消
  }
}

// 分镜编辑表单
const storyboardEditForm = reactive({
  shotNumber: 1,
  shotType: 'medium' as const,
  cameraAngle: 'eye_level' as const,
  cameraMovement: 'static' as const,
  duration: 3,
  frameDescription: '',
  transitionType: 'cut' as const,
  transitionDuration: 500,
  transitionDirection: undefined as 'left' | 'right' | 'up' | 'down' | undefined
})

// 绑定角色表单
const bindCharacterForm = reactive({
  characterId: '',
  voiceType: 'female_gentle',
  speechRate: 1.0,
  description: ''
})

// 物品绑定表单
const bindItemForm = reactive({
  itemId: '',
  description: '',
  generateImages: true
})

// 地点绑定表单
const bindLocationForm = reactive({
  locationId: '',
  description: '',
  generateImages: true
})

// 计算属性：可绑定的角色（排除已绑定的）
const availableCharacters = computed(() => {
  const boundIds = store.characterBindings.map(b => b.longWritingCharacterId)
  return longWritingCharacters.value.filter(c => !boundIds.includes(c.id))
})

// 计算属性：可绑定的物品（排除已绑定的）
const availableItems = computed(() => {
  const boundIds = store.itemBindings.map(b => b.longWritingItemId)
  return longWritingItems.value.filter(item => !boundIds.includes(item.id))
})

// 计算属性：可绑定的地点（排除已绑定的）
const availableLocations = computed(() => {
  const boundIds = store.locationBindings.map(b => b.longWritingLocationId)
  return longWritingLocations.value.filter(loc => !boundIds.includes(loc.id))
})

// 图像生成表单
const imageGenerateForm = reactive({
  styleName: 'cinematic'
})

// 视频合成表单
const synthesisForm = reactive({
  quality: 'standard'
})

// 合成进度
const synthesisProgress = reactive({
  phase: '',
  progress: 0
})

// 音频生成状态
const generatingAudio = ref(false)
const audioProgress = reactive({
  type: '',
  index: 0,
  total: 0
})

// 图像生成状态
const generatingImage = ref(false)

// 创建剧集表单
const episodeForm = reactive({
  episodeNumber: 1,
  title: '',
  sourceType: 'outline' as 'outline' | 'uploaded',
  outlineId: '',
  uploadedContent: ''
})

// 是否关联了长文项目（用于控制添加剧集时的选项）
const hasLinkedLongWriting = computed(() => {
  return !!store.currentProject?.longWritingProjectId
})

// 上传长文字数统计
const uploadedWordCount = computed(() => {
  return episodeForm.uploadedContent.length
})

// 剧集表单验证
const isEpisodeFormValid = computed(() => {
  if (!episodeForm.title.trim()) return false

  if (episodeForm.sourceType === 'outline') {
    return !!episodeForm.outlineId
  } else {
    const wordCount = uploadedWordCount.value
    return wordCount >= 500 && wordCount <= 15000
  }
})

// 项目设置表单
const projectSettings = reactive({
  name: '',
  longWritingProjectId: '',
  config: {
    aspectRatio: '16:9' as const,
    resolution: 1080,
    fps: 30,
    defaultTransition: 'fade' as const,
    stylePrompt: '',
    // 模型配置（使用字符串格式 "providerConfigId:modelId"）
    scriptModel: '' as string,
    storyboardModel: '' as string,
    imageModel: '' as string,
    videoModel: '' as string,
    audioModel: '' as string
  }
})

// 所有长文项目列表（用于项目设置中选择关联长文）
const allLwProjects = ref<Array<{ id: string; name: string }>>([])

// 长文角色列表
const longWritingCharacters = ref<Array<{ id: string; name: string }>>([])
const longWritingItems = ref<Array<{ id: string; name: string }>>([])
const longWritingLocations = ref<Array<{ id: string; name: string }>>([])

// ========== 模型选择相关 ==========
// 提供商配置列表
const providerConfigs = ref<UserProviderConfig[]>([])
// 提供商模板列表
const providerTemplates = ref<ProviderTemplate[]>([])
// 选中的模型键：格式为 "providerConfigId:modelId"
const selectedModelKey = ref<string>('')
// 模型搜索关键词
const modelSearchKeyword = ref('')

// 辅助函数：判断模型是否为文本类型
function isTextModel(type: string | undefined): boolean {
  return type === undefined || type === 'text' || type === 'multimodal'
}

// 提供商模型列表（用于显示）
const providerModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number; type?: string }> }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const models: Array<{ id: string; name: string; contextWindow: number; type?: string }> = []
    const template = providerTemplates.value.find(t => t.id === config.templateId)

    // 使用 models 字段
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
          type: model.type
        })
      }
    }
    // 如果 models 为空，使用模板的默认模型列表
    else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (!isTextModel(model.type)) continue
        models.push({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 8192,
          type: model.type
        })
      }
    }

    if (models.length > 0) {
      const displayShortId = config.shortId || config.name
      result.push({
        id: config.id,
        name: config.name,
        shortId: displayShortId,
        models
      })
    }
  }

  return result
})

// 过滤后的模型列表
const filteredProviderModels = computed(() => {
  if (!modelSearchKeyword.value) {
    return providerModels.value
  }

  const keyword = modelSearchKeyword.value.toLowerCase()
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number; type?: string }> }> = []

  for (const provider of providerModels.value) {
    const filteredModels = provider.models.filter(model =>
      model.name.toLowerCase().includes(keyword) ||
      model.id.toLowerCase().includes(keyword) ||
      provider.name.toLowerCase().includes(keyword) ||
      provider.shortId.toLowerCase().includes(keyword)
    )

    if (filteredModels.length > 0) {
      result.push({
        ...provider,
        models: filteredModels
      })
    }
  }

  return result
})

// 模型搜索过滤方法
function filterModels(keyword: string): void {
  modelSearchKeyword.value = keyword
}

// 格式化上下文窗口大小
function formatContext(contextWindow: number): string {
  if (contextWindow >= 1000000) {
    return `${(contextWindow / 1000000).toFixed(1)}M`
  }
  if (contextWindow >= 1000) {
    return `${Math.round(contextWindow / 1000)}K`
  }
  return `${contextWindow}`
}

// 图像模型列表（用于画面生成）
const imageProviderModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; type?: string }> }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const template = providerTemplates.value.find(t => t.id === config.templateId)

    // 检查 Provider 是否支持图像生成（通过 capabilities 判断）
    const supportsImage = template?.capabilities?.includes('image')
    if (!supportsImage) continue

    const models: Array<{ id: string; name: string; type?: string }> = []

    // 使用 models 字段
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        // 如果模型明确是文本类型，跳过
        if (model.type === 'text' || model.type === 'embedding') continue
        // 包含图像类型、多模态类型，或未指定类型（假设支持图像）
        models.push({
          id: model.id,
          name: model.name,
          type: model.type
        })
      }
    }
    // 如果 models 为空，使用模板的默认模型列表
    else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (model.type === 'text' || model.type === 'embedding') continue
        models.push({
          id: model.id,
          name: model.name || model.id,
          type: model.type
        })
      }
    }
    // 如果模板也没有模型列表，添加一个默认选项
    else {
      models.push({
        id: 'default',
        name: '默认模型',
        type: 'image'
      })
    }

    if (models.length > 0) {
      const displayShortId = config.shortId || config.name
      result.push({
        id: config.id,
        name: config.name,
        shortId: displayShortId,
        models
      })
    }
  }

  return result
})

// 视频模型列表（用于视频合成）
const videoProviderModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; type?: string }> }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const template = providerTemplates.value.find(t => t.id === config.templateId)
    const models: Array<{ id: string; name: string; type?: string }> = []

    // 使用 models 字段筛选视频类型模型
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        // 视频类型或支持视频的多模态模型
        if (model.type === 'video' || model.type === 'multimodal') {
          models.push({
            id: model.id,
            name: model.name,
            type: model.type
          })
        }
      }
    }
    // 如果 models 为空，使用模板的默认模型列表
    else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (model.type === 'video' || model.type === 'multimodal') {
          models.push({
            id: model.id,
            name: model.name || model.id,
            type: model.type
          })
        }
      }
    }

    if (models.length > 0) {
      const displayShortId = config.shortId || config.name
      result.push({
        id: config.id,
        name: config.name,
        shortId: displayShortId,
        models
      })
    }
  }

  // 如果没有专门的视频模型，返回文本模型作为备选
  if (result.length === 0) {
    return textProviderModels.value
  }

  return result
})

// 音频模型列表（用于音频生成）
const audioProviderModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; type?: string }> }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const template = providerTemplates.value.find(t => t.id === config.templateId)
    const models: Array<{ id: string; name: string; type?: string }> = []

    // 使用 models 字段筛选音频类型模型
    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        // 音频类型（TTS、语音合成等）
        if (model.type === 'audio') {
          models.push({
            id: model.id,
            name: model.name,
            type: model.type
          })
        }
      }
    }
    // 如果 models 为空，使用模板的默认模型列表
    else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (model.type === 'audio') {
          models.push({
            id: model.id,
            name: model.name || model.id,
            type: model.type
          })
        }
      }
    }

    if (models.length > 0) {
      const displayShortId = config.shortId || config.name
      result.push({
        id: config.id,
        name: config.name,
        shortId: displayShortId,
        models
      })
    }
  }

  return result
})

// 文本模型列表（用于剧本和分镜生成）
const textProviderModels = computed(() => {
  const result: Array<{ id: string; name: string; shortId: string; models: Array<{ id: string; name: string; contextWindow: number; type?: string }> }> = []

  for (const config of providerConfigs.value) {
    if (!config.isEnabled) continue

    const models: Array<{ id: string; name: string; contextWindow: number; type?: string }> = []
    const template = providerTemplates.value.find(t => t.id === config.templateId)

    if (config.models && config.models.length > 0) {
      for (const model of config.models) {
        if (!model.type || model.type === 'text' || model.type === 'multimodal') {
          models.push({
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow,
            type: model.type
          })
        }
      }
    }
    else if (template && template.models.length > 0) {
      for (const model of template.models) {
        if (!model.type || model.type === 'text' || model.type === 'multimodal') {
          models.push({
            id: model.id,
            name: model.name || model.id,
            contextWindow: model.contextWindow || 8192,
            type: model.type
          })
        }
      }
    }

    if (models.length > 0) {
      const displayShortId = config.shortId || config.name
      result.push({
        id: config.id,
        name: config.name,
        shortId: displayShortId,
        models
      })
    }
  }

  return result
})

// 加载提供商配置
async function loadProviderConfigs(): Promise<void> {
  try {
    // 先加载提供商模板
    const templatesResponse = await window.electronAPI.providerTemplate.list()
    if (templatesResponse.success && templatesResponse.templates) {
      providerTemplates.value = templatesResponse.templates
    }

    // 然后加载提供商配置
    const response = await window.electronAPI.providerConfig.list()
    if (response.success && response.configs) {
      providerConfigs.value = response.configs.filter((c: UserProviderConfig) => c.isEnabled)

      // 设置默认模型
      if (!selectedModelKey.value && providerModels.value.length > 0) {
        const firstProvider = providerModels.value[0]
        const firstModel = firstProvider.models[0]
        selectedModelKey.value = `${firstProvider.id}:${firstModel.id}`
        // 同时更新 store
        store.updateSelectedModel(firstProvider.id, firstModel.id)
      }
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

// 处理模型变更
function handleModelChange(modelKey: string): void {
  if (!modelKey) return

  const parts = modelKey.split(':')
  if (parts.length < 2) return

  const providerConfigId = parts[0]
  const modelId = parts.slice(1).join(':')

  // 更新到 store
  store.updateSelectedModel(providerConfigId, modelId)
}

// ========== 模型选择相关结束 ==========

// 计算属性：检查是否所有分镜都有图片
const hasAllImages = computed(() => {
  return store.storyboards.length > 0 && store.storyboards.every(sb => sb.frameImage)
})

/**
 * 加载项目数据
 */
async function loadProject() {
  // 加载提供商配置（用于模型选择）
  await loadProviderConfigs()

  // 加载所有长文项目列表（用于项目设置中选择关联长文）
  await loadAllLwProjects()

  await store.loadProject(projectId.value)
  if (store.currentProject) {
    // 更新 Tab 标题为项目名称
    const projectName = truncateTitle(store.currentProject.name)
    tabsStore.updateTabTitle(route.path, projectName)

    // 加载剧集列表
    await store.loadEpisodes(projectId.value)
    // 加载角色绑定
    await store.loadCharacterBindings(projectId.value)
    // 加载关联的长文项目数据
    if (store.currentProject.longWritingProjectId) {
      await loadLongWritingData(store.currentProject.longWritingProjectId)
    }
    // 更新项目设置表单
    projectSettings.name = store.currentProject.name
    projectSettings.longWritingProjectId = store.currentProject.longWritingProjectId || ''
    // 转换模型配置格式（对象 -> 字符串）
    const config = store.currentProject.config
    projectSettings.config = {
      ...config,
      scriptModel: modelToString(config.scriptModel),
      storyboardModel: modelToString(config.storyboardModel),
      imageModel: modelToString(config.imageModel),
      videoModel: modelToString(config.videoModel),
      audioModel: modelToString(config.audioModel)
    }

    // 如果只有一个剧集，自动选中
    if (store.episodes.length === 1) {
      console.log('[VideoProjectEditor] 自动选中唯一的剧集')
      await selectEpisode(store.episodes[0])
    }
  }
}

/**
 * 加载所有长文项目列表
 */
async function loadAllLwProjects() {
  try {
    const response = await window.electronAPI.longwriting.getProjects()
    if (response.success && response.data) {
      allLwProjects.value = response.data.map((p: any) => ({
        id: p.id,
        name: p.name
      }))
    }
  } catch (error) {
    console.error('加载长文项目列表失败:', error)
  }
}

/**
 * 加载长文项目数据
 */
async function loadLongWritingData(longWritingProjectId: string) {
  try {
    // 加载章节列表
    const outlineResponse = await window.electronAPI.longwriting.getOutlineTree(longWritingProjectId)
    console.log('章节响应:', outlineResponse)
    if (outlineResponse.success && outlineResponse.data) {
      // 保存原始数据
      chapters.value = outlineResponse.data.map((o: any) => ({
        id: o.id,
        order: o.orderIndex,
        title: o.name
      }))

      // 构建树形结构
      buildOutlineTree(outlineResponse.data)
    }

    // 加载角色列表
    const charResponse = await window.electronAPI.longwriting.getCharacters(longWritingProjectId)
    console.log('角色响应:', charResponse)
    if (charResponse.success && charResponse.data) {
      longWritingCharacters.value = charResponse.data.map((c: any) => ({
        id: c.id,
        name: c.name
      }))
    }

    // 加载物品列表
    const itemResponse = await window.electronAPI.longwriting.getItems(longWritingProjectId)
    console.log('物品响应:', itemResponse)
    if (itemResponse.success && itemResponse.data) {
      longWritingItems.value = itemResponse.data.map((item: any) => ({
        id: item.id,
        name: item.name
      }))
    }

    // 加载地点列表
    const locationResponse = await window.electronAPI.longwriting.getLocations(longWritingProjectId)
    console.log('地点响应:', locationResponse)
    if (locationResponse.success && locationResponse.data) {
      longWritingLocations.value = locationResponse.data.map((loc: any) => ({
        id: loc.id,
        name: loc.name
      }))
    }
  } catch (error) {
    console.error('加载长文数据失败:', error)
  }
}

/**
 * 构建大纲树形结构
 * 使用位置序号（从1开始）而非数据库 orderIndex
 */
function buildOutlineTree(outlines: any[]) {
  // 按层级和排序分组，使用 orderIndex 排序
  const volumes: any[] = outlines.filter(o => o.nodeType === 'volume').sort((a, b) => a.orderIndex - b.orderIndex)
  const chaptersData: any[] = outlines.filter(o => o.nodeType === 'chapter').sort((a, b) => a.orderIndex - b.orderIndex)
  const sections: any[] = outlines.filter(o => o.nodeType === 'section').sort((a, b) => a.orderIndex - b.orderIndex)

  // 构建树
  const tree: OutlineTreeNode[] = []

  // 使用位置序号（从1开始）
  let volumeNumber = 0
  for (const volume of volumes) {
    volumeNumber++
    const volumeNode: OutlineTreeNode = {
      id: volume.id,
      name: volume.name,
      nodeType: 'volume',
      orderIndex: volume.orderIndex,
      volumePosition: volumeNumber, // 位置序号
      children: []
    }

    // 找到该卷下的章节
    const volumeChapters = chaptersData.filter(c => c.parentId === volume.id)
    let chapterNumber = 0
    for (const chapter of volumeChapters) {
      chapterNumber++
      const chapterNode: OutlineTreeNode = {
        id: chapter.id,
        name: chapter.name,
        nodeType: 'chapter',
        orderIndex: chapter.orderIndex,
        volumeOrder: volumeNumber, // 使用卷的位置序号
        volumeName: volume.name,
        chapterPosition: chapterNumber, // 章节位置序号
        children: []
      }

      // 找到该章下的节
      const chapterSections = sections.filter(s => s.parentId === chapter.id)
      let sectionNumber = 0
      for (const section of chapterSections) {
        sectionNumber++
        const sectionNode: OutlineTreeNode = {
          id: section.id,
          name: section.name,
          nodeType: 'section',
          orderIndex: section.orderIndex,
          volumeOrder: volumeNumber, // 使用卷的位置序号
          volumeName: volume.name,
          chapterOrder: chapterNumber, // 使用章节的位置序号
          chapterName: chapter.name,
          sectionPosition: sectionNumber // 节的位置序号
        }
        chapterNode.children!.push(sectionNode)
      }

      volumeNode.children!.push(chapterNode)
    }

    tree.push(volumeNode)
  }

  // 处理没有卷的情况，直接是章节
  if (volumes.length === 0 && chaptersData.length > 0) {
    let chapterNumber = 0
    for (const chapter of chaptersData) {
      chapterNumber++
      const chapterNode: OutlineTreeNode = {
        id: chapter.id,
        name: chapter.name,
        nodeType: 'chapter',
        orderIndex: chapter.orderIndex,
        chapterPosition: chapterNumber,
        children: []
      }

      const chapterSections = sections.filter(s => s.parentId === chapter.id)
      let sectionNumber = 0
      for (const section of chapterSections) {
        sectionNumber++
        const sectionNode: OutlineTreeNode = {
          id: section.id,
          name: section.name,
          nodeType: 'section',
          orderIndex: section.orderIndex,
          chapterOrder: chapterNumber,
          chapterName: chapter.name,
          sectionPosition: sectionNumber
        }
        chapterNode.children!.push(sectionNode)
      }

      tree.push(chapterNode)
    }
  }

  outlineTreeData.value = tree
}

/**
 * 过滤大纲节点
 */
function filterOutlineNode(value: string, data: OutlineTreeNode): boolean {
  if (!value) return true
  return data.name.toLowerCase().includes(value.toLowerCase())
}

/**
 * 处理大纲节点选择
 */
function handleOutlineSelect(data: OutlineTreeNode) {
  // 只有节级别可以选中
  if (data.nodeType !== 'section') {
    ElMessage.warning('请选择"节"级别的章节')
    // 清除选择
    outlineTreeRef.value?.setCurrentKey(null)
    episodeForm.outlineId = ''
    selectedOutlineInfo.value = null
    return
  }

  episodeForm.outlineId = data.id

  // 使用位置序号保存选中的完整信息
  const volumeNum = data.volumeOrder || 0
  const chapterNum = data.chapterOrder || 0
  const sectionNum = data.sectionPosition || 1

  selectedOutlineInfo.value = {
    id: data.id,
    volumeOrder: volumeNum,
    volumeName: data.volumeName || '',
    chapterOrder: chapterNum,
    chapterName: data.chapterName || '',
    sectionOrder: sectionNum,
    sectionName: data.name
  }

  // 自动生成标题：只使用节名称
  episodeForm.title = data.name
}

/**
 * 处理级联选择器选择
 */
function handleOutlineCascaderChange(value: string) {
  if (!value) {
    episodeForm.outlineId = ''
    selectedOutlineInfo.value = null
    episodeForm.title = ''
    return
  }

  // 在树数据中查找选中的节点
  const findNode = (nodes: OutlineTreeNode[], id: string): OutlineTreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNode(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  const selectedNode = findNode(outlineTreeData.value, value)
  if (!selectedNode || selectedNode.nodeType !== 'section') {
    ElMessage.warning('请选择"节"级别的章节')
    episodeForm.outlineId = ''
    return
  }

  episodeForm.outlineId = selectedNode.id

  // 使用位置序号保存选中的完整信息
  const volumeNum = selectedNode.volumeOrder || 0
  const chapterNum = selectedNode.chapterOrder || 0
  const sectionNum = selectedNode.sectionPosition || 1

  selectedOutlineInfo.value = {
    id: selectedNode.id,
    volumeOrder: volumeNum,
    volumeName: selectedNode.volumeName || '',
    chapterOrder: chapterNum,
    chapterName: selectedNode.chapterName || '',
    sectionOrder: sectionNum,
    sectionName: selectedNode.name
  }

  // 自动生成标题：只使用节名称
  episodeForm.title = selectedNode.name
}

/**
 * 返回项目列表
 */
function goBack() {
  router.push('/story-to-video')
}

/**
 * 选择剧集
 */
async function selectEpisode(episode: VideoEpisode) {
  await store.selectEpisode(episode)
  if (store.currentScript) {
    scriptSynopsis.value = store.currentScript.synopsis
  }
  // Tab 标题保持项目名称，不随剧集选择变化
}

/**
 * 确认删除剧集
 */
async function confirmDeleteEpisode(episode: VideoEpisode) {
  try {
    await ElMessageBox.confirm(
      `确定要删除「第${episode.episodeNumber}集：${episode.title}」吗？删除后可在数据库中恢复。`,
      '删除剧集',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const success = await store.deleteEpisode(episode.id)
    if (success) {
      ElMessage.success('删除成功')
    } else {
      ElMessage.error(store.error || '删除失败')
    }
  } catch {
    // 用户取消
  }
}

/**
 * 打开创建剧集对话框
 */
function openCreateEpisodeDialog() {
  // 重置表单
  episodeForm.episodeNumber = store.episodes.length + 1
  episodeForm.title = ''
  episodeForm.sourceType = 'outline'
  episodeForm.outlineId = ''
  episodeForm.uploadedContent = ''
  selectedOutlineInfo.value = null
  outlineSearchText.value = ''
  // 清除树的选择
  outlineTreeRef.value?.setCurrentKey(null)
  showCreateEpisodeDialog.value = true
}

/**
 * 处理内容来源切换
 */
function handleSourceTypeChange() {
  // 切换模式时清空对应字段
  if (episodeForm.sourceType === 'outline') {
    episodeForm.uploadedContent = ''
  } else {
    episodeForm.outlineId = ''
    selectedOutlineInfo.value = null
    outlineTreeRef.value?.setCurrentKey(null)
  }
}

/**
 * 创建剧集
 */
async function createEpisode() {
  if (!episodeForm.title.trim()) {
    ElMessage.warning('请输入剧集标题')
    return
  }

  const episode = await store.createEpisode(
    projectId.value,
    {
      sourceType: episodeForm.sourceType,
      outlineId: episodeForm.sourceType === 'outline' ? episodeForm.outlineId : undefined,
      uploadedContent: episodeForm.sourceType === 'uploaded' ? episodeForm.uploadedContent : undefined,
      episodeNumber: episodeForm.episodeNumber,
      title: episodeForm.title
    }
  )

  if (episode) {
    ElMessage.success('创建成功')
    showCreateEpisodeDialog.value = false
    // 重置表单
    episodeForm.episodeNumber = store.episodes.length + 1
    episodeForm.title = ''
    episodeForm.sourceType = 'outline'
    episodeForm.outlineId = ''
    episodeForm.uploadedContent = ''
    selectedOutlineInfo.value = null
    outlineSearchText.value = ''
    outlineTreeRef.value?.setCurrentKey(null)

    // 刷新绑定数据（主进程已经自动绑定了角色、地点、物品）
    await store.loadCharacterBindings(projectId.value)
    await store.loadLocationBindings(projectId.value)
    await store.loadItemBindings(projectId.value)

    // 选中新创建的剧集
    await selectEpisode(episode)
  } else {
    ElMessage.error(store.error || '创建失败')
  }
}

/**
 * 打开编辑剧集对话框
 */
function openEditEpisodeDialog(episode: VideoEpisode) {
  editingEpisodeId.value = episode.id
  episodeForm.episodeNumber = episode.episodeNumber
  episodeForm.title = episode.title
  showEditEpisodeDialog.value = true
}

/**
 * 更新剧集
 */
async function updateEpisode() {
  if (!episodeForm.title.trim()) {
    ElMessage.warning('请输入剧集标题')
    return
  }

  const episode = await store.updateEpisode(
    editingEpisodeId.value,
    {
      episodeNumber: episodeForm.episodeNumber,
      title: episodeForm.title
    }
  )

  if (episode) {
    ElMessage.success('保存成功')
    showEditEpisodeDialog.value = false
  } else {
    ElMessage.error(store.error || '保存失败')
  }
}

/**
 * 自动绑定章节涉及的角色到视频项目
 */
async function autoBindCharactersFromOutline(outlineId: string) {
  try {
    // 获取大纲节点信息
    const outlineResponse = await window.electronAPI.longwriting.getOutline(outlineId)
    if (!outlineResponse.success || !outlineResponse.data) return

    const outline = outlineResponse.data
    const involvedCharacterIds = outline.involvedCharacters || []

    if (involvedCharacterIds.length === 0) return

    // 绑定这些角色
    let boundCount = 0
    for (const charId of involvedCharacterIds) {
      // 检查是否已绑定
      const existingBinding = store.getBindingByCharacterId(charId)
      if (existingBinding) continue

      // 获取角色信息
      const charInfo = longWritingCharacters.value.find(c => c.id === charId)
      if (!charInfo) continue

      // 绑定角色
      const binding = await store.bindCharacter(
        projectId.value,
        charId,
        'female_gentle', // 默认声音
        1.0, // 默认语速
        '' // 描述
      )

      if (binding) {
        boundCount++
      }
    }

    if (boundCount > 0) {
      ElMessage.success(`已自动绑定 ${boundCount} 个角色`)
    }
  } catch (error) {
    console.error('自动绑定角色失败:', error)
  }
}

/**
 * 选择场景
 */
async function selectScene(scene: SceneScript) {
  await store.selectScene(scene)
}

/**
 * 保存剧本概要
 */
async function saveScriptSynopsis() {
  if (!store.currentScript) return
  await store.updateScript(store.currentScript.id, { synopsis: scriptSynopsis.value })
}

/**
 * 获取地点类型标签
 */
function getLocationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    interior: '内景',
    exterior: '外景',
    mixed: '混合'
  }
  return labels[type] || type
}

/**
 * 获取时间标签
 */
function getTimeOfDayLabel(time: string): string {
  const labels: Record<string, string> = {
    morning: '早晨',
    noon: '中午',
    afternoon: '下午',
    evening: '傍晚',
    night: '夜晚',
    dawn: '黎明',
    dusk: '黄昏'
  }
  return labels[time] || time
}

/**
 * 格式化场景标题
 */
function formatSceneHeader(scene: SceneScript): string {
  const typeLabel = scene.locationType === 'interior' ? 'INT.' : scene.locationType === 'exterior' ? 'EXT.' : 'INT./EXT.'
  const timeLabel = getTimeOfDayLabel(scene.timeOfDay)
  return `${typeLabel} ${scene.location} - ${timeLabel}`
}

/**
 * 构建分镜与剧本元素的映射关系
 */
function buildStoryboardMapping(sceneId: string): Map<string, number> {
  const mapping = new Map<string, number>()
  const sceneStoryboards = store.storyboards.filter(s => s.sceneScriptId === sceneId)

  for (const storyboard of sceneStoryboards) {
    for (const dialogueId of storyboard.dialogueIds) {
      mapping.set(dialogueId, storyboard.shotNumber)
    }
    for (const actionId of storyboard.actionIds) {
      mapping.set(actionId, storyboard.shotNumber)
    }
    if (storyboard.narrationId) {
      mapping.set(storyboard.narrationId, storyboard.shotNumber)
    }
  }

  return mapping
}

/**
 * 渲染分镜标签
 */
function renderStoryboardTag(shotNumber: number | undefined | null): string {
  if (!shotNumber) return ''
  return `<span class="storyboard-tag" data-shot="${shotNumber}">镜头 ${shotNumber}</span>`
}

/**
 * 格式化场景剧本内容（从剧本正文中提取对应场景的内容）
 */
function formatSceneScriptContent(scene: SceneScript, index: number): string {
  if (!store.currentScript?.scriptContent) {
    return `<p class="no-content">场景内容尚未生成</p>`
  }

  // 获取完整剧本内容
  const fullContent = store.currentScript.scriptContent

  // 尝试根据场景标题分割
  const sceneHeader = formatSceneHeader(scene)
  const nextSceneIndex = index + 1
  let nextSceneHeader = ''
  if (nextSceneIndex < store.scenes.length) {
    nextSceneHeader = formatSceneHeader(store.scenes[nextSceneIndex])
  }

  // 查找当前场景的内容
  const headerIndex = fullContent.indexOf(sceneHeader)
  if (headerIndex === -1) {
    // 如果找不到精确匹配，尝试使用备用标题格式
    const altHeader = scene.locationType === 'interior'
      ? `INT. ${scene.location}`
      : scene.locationType === 'exterior'
        ? `EXT. ${scene.location}`
        : `INT./EXT. ${scene.location}`

    const altHeaderIndex = fullContent.indexOf(altHeader)
    if (altHeaderIndex !== -1) {
      // 找到备用格式，提取内容
      let endIndex = fullContent.length
      if (nextSceneIndex < store.scenes.length) {
        const nextAltHeader = store.scenes[nextSceneIndex].locationType === 'interior'
          ? `INT. ${store.scenes[nextSceneIndex].location}`
          : store.scenes[nextSceneIndex].locationType === 'exterior'
            ? `EXT. ${store.scenes[nextSceneIndex].location}`
            : `INT./EXT. ${store.scenes[nextSceneIndex].location}`
        const nextIndex = fullContent.indexOf(nextAltHeader, altHeaderIndex + altHeader.length)
        if (nextIndex !== -1) {
          endIndex = nextIndex
        }
      }
      const content = fullContent.substring(altHeaderIndex, endIndex)
      return formatScriptToHtml(content)
    }

    // 实在找不到，显示旁白作为备用
    // 构建分镜映射
    const storyboardMapping = buildStoryboardMapping(scene.id)

    return `<div class="fallback-content">
      ${scene.narration ? `
        <p class="narration">
          ${scene.narration}
          ${renderStoryboardTag(storyboardMapping.get('narration-' + scene.id))}
        </p>
      ` : ''}
      ${scene.dialogues.map(d => `
        <div class="dialogue" data-dialogue-id="${d.id}">
          <span class="character-name">${d.characterName}</span>
          <span class="parenthetical">${d.emotion || ''}</span>
          <p class="text">${d.text}</p>
          ${renderStoryboardTag(storyboardMapping.get(d.id))}
        </div>
      `).join('')}
      ${scene.actions.map(a => `
        <div class="action" data-action-id="${a.id}">
          <span class="action-character">${a.characterId ? getCharacterName(a.characterId) : '群像'}</span>
          <p class="description">${a.description}</p>
          ${renderStoryboardTag(storyboardMapping.get(a.id))}
        </div>
      `).join('')}
    </div>`
  }

  // 找到了精确匹配，提取内容
  let endIndex = fullContent.length
  if (nextSceneHeader && nextSceneIndex < store.scenes.length) {
    const nextIndex = fullContent.indexOf(nextSceneHeader, headerIndex + sceneHeader.length)
    if (nextIndex !== -1) {
      endIndex = nextIndex
    }
  }

  const content = fullContent.substring(headerIndex, endIndex)
  return formatScriptToHtml(content)
}

/**
 * 将剧本文本格式化为 HTML
 * 功能增强：人名加粗、场景描述词（镜头术语）加粗、对白人名后加冒号
 */
function formatScriptToHtml(text: string): string {
  if (!text) return ''

  // 场景描述词（镜头术语）列表
  const shotTerms = [
    '特写', '远景', '全景', '中景', '近景', '大远景', '大特写',
    '细节特写', '中近景', '主观镜头', '跟拍', '摇镜头', '移镜头',
    '俯拍', '仰拍', '侧拍', '正面镜头', '背面镜头', '过肩镜头',
    '双人镜头', '三人镜头', '群像镜头', '定格', '慢动作', '快切'
  ]

  // 按行处理
  const lines = text.split('\n')
  const htmlLines: string[] = []
  let lastLineWasEmpty = false
  let lastLineWasCharacterName = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 处理空行：连续空行只保留一个
    if (!line) {
      if (!lastLineWasEmpty) {
        htmlLines.push('<div class="empty-line"></div>')
        lastLineWasEmpty = true
      }
      lastLineWasCharacterName = false
      continue
    }

    lastLineWasEmpty = false

    // 场景标题：INT./EXT. 开头
    if (line.match(/^(INT\.|EXT\.|INT\.\/EXT\.)/i)) {
      htmlLines.push(`<div class="scene-header-line">${escapeHtml(line)}</div>`)
      lastLineWasCharacterName = false
      continue
    }

    // 转场标记：CUT TO:, FADE OUT. 等
    if (line.match(/^(CUT TO:|FADE OUT\.|FADE IN:|SMASH CUT TO:|DISSOLVE TO:)/i)) {
      htmlLines.push(`<div class="transition-line">${escapeHtml(line)}</div>`)
      lastLineWasCharacterName = false
      continue
    }

    // 角色名检测（全大写，居中）
    // 前面有多个空格缩进，内容是全大写字母和标点
    if (line.match(/^\s{10,}[A-Z\u4e00-\u9fa5]+/)) {
      // 可能是角色名
      const charMatch = line.match(/^\s+(.+)$/)
      if (charMatch && charMatch[1].length < 20) {
        // 人名加粗并在后面加冒号
        const characterName = charMatch[1]
        htmlLines.push(`<div class="character-name-line"><strong>${escapeHtml(characterName)}</strong>：</div>`)
        lastLineWasCharacterName = true
        continue
      }
    }

    // 括号提示：(xxx) 格式，居中缩进
    if (line.match(/^\s{5,}\([^)]+\)\s*$/)) {
      htmlLines.push(`<div class="parenthetical-line">${escapeHtml(line.trim())}</div>`)
      lastLineWasCharacterName = false
      continue
    }

    // 对白：有缩进的文本
    if (line.match(/^\s{5,}/)) {
      // 检查是否是对白（前面有角色名的情况）
      if (lastLineWasCharacterName) {
        htmlLines.push(`<div class="dialogue-line">${escapeHtml(line.trim())}</div>`)
        continue
      }
    }

    // 动作描述：普通文本，检测并加粗镜头术语
    if (line.length > 0) {
      let processedLine = escapeHtml(line)
      // 加粗镜头术语
      shotTerms.forEach(term => {
        // 使用正则替换，保留原有位置
        const regex = new RegExp(`(${term})`, 'g')
        processedLine = processedLine.replace(regex, '<strong>$1</strong>')
      })
      htmlLines.push(`<p class="action-line">${processedLine}</p>`)
    }

    lastLineWasCharacterName = false
  }

  return htmlLines.join('\n')
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 滚动到指定场景
 */
function scrollToScene(index: number) {
  currentSceneIndex.value = index
  const element = document.getElementById(`scene-${index}`)
  const container = document.querySelector('.script-content-body')
  if (element && container) {
    // 手动滚动容器，避免整页滚动
    container.scrollTo({
      top: element.offsetTop - 16,
      behavior: 'smooth'
    })
  }
  // 同时选择场景，更新右侧分镜面板
  if (store.scenes[index]) {
    store.selectScene(store.scenes[index])
  }
  // 切换场景时清空选中的分镜
  selectedStoryboard.value = null
}

/**
 * 生成剧本（AI）
 */
async function generateScript() {
  if (!store.currentProject) {
    ElMessage.warning('项目数据加载中，请稍候')
    return
  }

  if (!store.currentEpisode) {
    if (store.episodes.length === 0) {
      ElMessage.warning('请先在左侧面板添加剧集')
    } else {
      ElMessage.warning('请在左侧面板选择要生成剧本的剧集')
    }
    return
  }

  // 检查是否有关联的章节
  // 使用项目配置中的模型
  const scriptModel = store.currentProject.config?.scriptModel
  if (!scriptModel?.providerConfigId || !scriptModel?.modelId) {
    ElMessage.warning('请先在项目设置中配置剧本生成模型')
    return
  }

  // 验证内容来源
  if (store.currentEpisode.sourceType === 'outline' && !store.currentEpisode.outlineId) {
    ElMessage.warning('该剧集未关联章节，无法生成剧本')
    return
  }
  if (store.currentEpisode.sourceType === 'uploaded' && !store.currentEpisode.uploadedContent) {
    ElMessage.warning('该剧集没有上传长文内容，无法生成剧本')
    return
  }

  try {
    ElMessage.info('正在生成剧本，请稍候...')

    const result = await store.generateScript(
      store.currentEpisode.id,
      scriptModel.providerConfigId,
      scriptModel.modelId
    )

    if (result) {
      ElMessage.success(`剧本生成成功，共 ${result.scenes.length} 个场景`)
      scriptSynopsis.value = result.script.synopsis

      // 刷新剧集列表以获取更新后的 scriptId
      await store.loadEpisodes(store.currentProject.id)

      // 重新选中当前剧集以更新数据
      const updatedEpisode = store.episodes.find(e => e.id === store.currentEpisode?.id)
      if (updatedEpisode) {
        await store.selectEpisode(updatedEpisode)
      }
    } else {
      ElMessage.error(store.error || '生成剧本失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成剧本失败')
  }
}

/**
 * 拆分场景（AI）
 */
async function generateScenes() {
  if (!store.currentScript) {
    ElMessage.warning('请先生成剧本')
    return
  }

  // 检查是否选择了模型
  if (!store.selectedProviderConfigId || !store.selectedModelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  try {
    ElMessage.info('正在拆分场景，请稍候...')

    const result = await store.generateScenes(
      store.currentScript.id,
      store.selectedProviderConfigId,
      store.selectedModelId
    )

    if (result) {
      ElMessage.success(`场景拆分成功，共 ${result.length} 个场景`)
    } else {
      ElMessage.error(store.error || '拆分场景失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '拆分场景失败')
  }
}

/**
 * 打开分镜编辑对话框
 */
function openStoryboardEdit(storyboard: import('../../../shared/types/story-to-video.types').Storyboard) {
  editingStoryboard.value = storyboard

  // 填充表单
  storyboardEditForm.shotNumber = storyboard.shotNumber
  storyboardEditForm.shotType = storyboard.shotType as any
  storyboardEditForm.cameraAngle = storyboard.cameraAngle as any
  storyboardEditForm.cameraMovement = storyboard.cameraMovement as any
  storyboardEditForm.duration = storyboard.duration
  storyboardEditForm.frameDescription = storyboard.frameDescription
  storyboardEditForm.transitionType = storyboard.transition.type as any
  storyboardEditForm.transitionDuration = storyboard.transition.duration
  storyboardEditForm.transitionDirection = storyboard.transition.direction

  showStoryboardEditDialog.value = true
}

/**
 * 选中分镜（单击选中，双击编辑）
 */
function selectStoryboard(storyboard: import('../../../shared/types/story-to-video.types').Storyboard) {
  // 切换选中状态（点击已选中的则取消选中）
  if (selectedStoryboard.value?.id === storyboard.id) {
    selectedStoryboard.value = null
  } else {
    selectedStoryboard.value = storyboard
  }
}

/**
 * 保存分镜编辑
 */
async function saveStoryboardEdit() {
  if (!editingStoryboard.value) return

  const success = await store.updateStoryboard(editingStoryboard.value.id, {
    shotNumber: storyboardEditForm.shotNumber,
    shotType: storyboardEditForm.shotType as any,
    cameraAngle: storyboardEditForm.cameraAngle as any,
    cameraMovement: storyboardEditForm.cameraMovement as any,
    duration: storyboardEditForm.duration,
    frameDescription: storyboardEditForm.frameDescription,
    transition: {
      type: storyboardEditForm.transitionType,
      duration: storyboardEditForm.transitionDuration,
      direction: storyboardEditForm.transitionDirection,
      easing: 'ease_out'
    }
  })

  if (success) {
    ElMessage.success('分镜已更新')
    showStoryboardEditDialog.value = false
    editingStoryboard.value = null
  } else {
    ElMessage.error(store.error || '保存失败')
  }
}

/**
 * 生成分镜（AI）
 */
async function generateStoryboards() {
  if (!store.currentScript) {
    ElMessage.warning('请先生成剧本')
    return
  }

  if (store.scenes.length === 0) {
    ElMessage.warning('请先拆分场景')
    return
  }

  // 使用项目配置中的模型
  const storyboardModel = store.currentProject?.config?.storyboardModel
  if (!storyboardModel?.providerConfigId || !storyboardModel?.modelId) {
    ElMessage.warning('请先在项目设置中配置分镜生成模型')
    return
  }

  try {
    const confirm = await ElMessageBox.confirm(
      `将为 ${store.scenes.length} 个场景生成分镜，是否继续？`,
      '生成分镜',
      { confirmButtonText: '生成', cancelButtonText: '取消', type: 'info' }
    ).catch(() => false)

    if (!confirm) return

    ElMessage.info('正在生成分镜，请稍候...')

    const result = await store.generateStoryboards(
      store.currentScript.id,
      storyboardModel.providerConfigId,
      storyboardModel.modelId
    )

    if (result) {
      ElMessage.success(`分镜生成成功，共 ${result.length} 个镜头`)
    } else {
      ElMessage.error(store.error || '生成分镜失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成分镜失败')
  }
}

/**
 * 生成单个分镜画面
 */
async function generateSingleStoryboardImage() {
  if (!selectedStoryboard.value) {
    ElMessage.warning('请先选择一个分镜')
    return
  }

  // 使用项目配置中的模型
  const imageModel = store.currentProject?.config?.imageModel
  if (!imageModel?.providerConfigId || !imageModel?.modelId) {
    ElMessage.warning('请先在项目设置中配置画面生成模型')
    return
  }

  console.log('[generateSingleStoryboardImage] 使用模型:', imageModel)

  try {
    generatingImage.value = true
    showGenerateImagesDialog.value = false
    ElMessage.info(`正在生成镜头 ${selectedStoryboard.value.shotNumber} 的画面，请稍候...`)

    const result = await store.generateStoryboardImage(
      selectedStoryboard.value.id,
      imageGenerateForm.styleName,
      imageModel.providerConfigId,
      imageModel.modelId
    )

    if (result) {
      ElMessage.success('画面生成成功')
      // 更新选中的分镜引用
      selectedStoryboard.value = result
    } else {
      // 显示具体错误信息
      const errorMsg = store.error || '生成画面失败'
      console.error('[generateSingleStoryboardImage] 错误:', errorMsg)
      ElMessage.error(errorMsg)
    }
  } catch (error: any) {
    console.error('[generateSingleStoryboardImage] 异常:', error)
    ElMessage.error(error.message || '生成画面失败')
  } finally {
    generatingImage.value = false
  }
}

/**
 * 生成场景画面（批量，保留备用）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateSceneImages() {
  if (!store.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }

  if (store.storyboards.length === 0) {
    ElMessage.warning('请先生成分镜')
    showGenerateImagesDialog.value = false
    return
  }

  try {
    showGenerateImagesDialog.value = false
    ElMessage.info('正在生成分镜画面，请稍候...')

    const result = await store.generateSceneImages(
      store.currentScene.id,
      imageGenerateForm.styleName,
      undefined,
      undefined,
      (index, total) => {
        // 进度回调
        console.log(`生成进度: ${index + 1}/${total}`)
      }
    )

    if (result) {
      ElMessage.success(`画面生成成功，共 ${result.length} 张`)
    } else {
      ElMessage.error(store.error || '生成画面失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成画面失败')
  }
}

/**
 * 生成场景音频（旁白 + 对话）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateAudio() {
  if (!store.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }

  // 检查场景是否有旁白或对话
  const hasNarration = store.currentScene.narration && store.currentScene.narration.trim()
  const hasDialogues = store.currentScene.dialogues && store.currentScene.dialogues.length > 0

  if (!hasNarration && !hasDialogues) {
    ElMessage.warning('当前场景没有旁白或对话内容')
    return
  }

  try {
    generatingAudio.value = true
    audioProgress.type = ''
    audioProgress.index = 0
    audioProgress.total = 0

    ElMessage.info('正在生成音频，请稍候...')

    const result = await store.generateSceneAudio(
      store.currentScene.id,
      (type, index, total) => {
        audioProgress.type = type
        audioProgress.index = index
        audioProgress.total = total
      }
    )

    if (result) {
      const messages: string[] = []
      if (result.narrationPath) {
        messages.push('旁白已生成')
      }
      if (result.dialogueCount > 0) {
        messages.push(`${result.dialogueCount} 段对话已生成`)
      }
      ElMessage.success(messages.join('，') || '音频生成完成')
    } else {
      ElMessage.error(store.error || '生成音频失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '生成音频失败')
  } finally {
    generatingAudio.value = false
  }
}

/**
 * 保存项目设置
 */
async function saveProjectSettings() {
  if (!store.currentProject) return

  // 转换模型配置格式（字符串 -> 对象）
  const configToSave = {
    ...projectSettings.config,
    scriptModel: stringToModel(projectSettings.config.scriptModel),
    storyboardModel: stringToModel(projectSettings.config.storyboardModel),
    imageModel: stringToModel(projectSettings.config.imageModel),
    videoModel: stringToModel(projectSettings.config.videoModel),
    audioModel: stringToModel(projectSettings.config.audioModel)
  }

  // 检查是否修改了关联长文项目
  const oldLwProjectId = store.currentProject.longWritingProjectId
  const newLwProjectId = projectSettings.longWritingProjectId || ''

  const success = await store.updateProject(store.currentProject.id, {
    name: projectSettings.name,
    config: configToSave,
    longWritingProjectId: newLwProjectId
  })

  if (success) {
    // 如果关联的长文项目发生变化，重新加载长文数据
    if (newLwProjectId !== oldLwProjectId) {
      if (newLwProjectId) {
        await loadLongWritingData(newLwProjectId)
      } else {
        // 清空长文数据
        chapters.value = []
        outlineTreeData.value = []
        longWritingCharacters.value = []
        longWritingItems.value = []
        longWritingLocations.value = []
      }
    }
    ElMessage.success('保存成功')
    showSettingsDialog.value = false
  } else {
    ElMessage.error(store.error || '保存失败')
  }
}

/**
 * 获取剧集状态标签
 */
function getEpisodeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    pending: '待处理',
    script_completed: '剧本完成',
    storyboard_completed: '分镜完成',
    production: '制作中',
    completed: '完成'
  }
  return labels[status] || status
}

/**
 * 获取剧集状态类型
 */
function getEpisodeStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    draft: 'info',
    script_completed: 'warning',
    storyboard_completed: '',
    production: '',
    completed: 'success'
  }
  return types[status] || 'info'
}

/**
 * 获取角色名称
 */
function getCharacterName(characterId: string): string {
  const char = longWritingCharacters.value.find(c => c.id === characterId)
  return char?.name || characterId
}

// ==================== 详情显示相关 ====================

/**
 * 显示角色详情
 */
async function showCharacterDetail(characterId: string) {
  characterDetailLoading.value = true
  showCharacterDetailDialog.value = true
  characterDetail.value = null

  try {
    const result = await window.electronAPI.longwriting.getCharacter(characterId)
    if (result.success && result.data) {
      characterDetail.value = result.data
    } else {
      ElMessage.error('获取角色详情失败')
      showCharacterDetailDialog.value = false
    }
  } catch (error) {
    console.error('获取角色详情失败:', error)
    ElMessage.error('获取角色详情失败')
    showCharacterDetailDialog.value = false
  } finally {
    characterDetailLoading.value = false
  }
}

/**
 * 显示物品详情
 */
async function showItemDetail(itemId: string) {
  itemDetailLoading.value = true
  showItemDetailDialog.value = true
  itemDetail.value = null

  try {
    const result = await window.electronAPI.longwriting.getItem(itemId)
    if (result.success && result.data) {
      itemDetail.value = result.data
    } else {
      ElMessage.error('获取物品详情失败')
      showItemDetailDialog.value = false
    }
  } catch (error) {
    console.error('获取物品详情失败:', error)
    ElMessage.error('获取物品详情失败')
    showItemDetailDialog.value = false
  } finally {
    itemDetailLoading.value = false
  }
}

/**
 * 显示地点详情
 */
async function showLocationDetail(locationId: string) {
  locationDetailLoading.value = true
  showLocationDetailDialog.value = true
  locationDetail.value = null

  try {
    const result = await window.electronAPI.longwriting.getLocation(locationId)
    if (result.success && result.data) {
      locationDetail.value = result.data
    } else {
      ElMessage.error('获取地点详情失败')
      showLocationDetailDialog.value = false
    }
  } catch (error) {
    console.error('获取地点详情失败:', error)
    ElMessage.error('获取地点详情失败')
    showLocationDetailDialog.value = false
  } finally {
    locationDetailLoading.value = false
  }
}

// ==================== 辅助方法：标签转换 ====================

/**
 * 获取角色定位标签
 */
function getRolePositionLabel(rolePosition: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    supporting: '配角',
    antagonist: '反派',
    minor: '龙套'
  }
  return labels[rolePosition] || rolePosition
}

/**
 * 获取性别标签
 */
function getGenderLabel(gender: string): string {
  const labels: Record<string, string> = {
    male: '男',
    female: '女',
    other: '其他'
  }
  return labels[gender] || gender
}

/**
 * 获取人种标签
 */
function getRaceLabel(race: string): string {
  const labels: Record<string, string> = {
    asian: '亚洲人',
    european: '欧洲人',
    other: '其他'
  }
  return labels[race] || race
}

/**
 * 获取实体重要性标签
 */
function getEntityImportanceLabel(importance: string): string {
  const labels: Record<string, string> = {
    main: '主要',
    secondary: '次要',
    temporary: '临时'
  }
  return labels[importance] || importance
}

/**
 * 获取重要性类型（用于标签颜色）
 */
function getImportanceType(importance: string): string {
  const types: Record<string, string> = {
    main: 'danger',
    secondary: 'warning',
    temporary: 'info'
  }
  return types[importance] || 'info'
}

/**
 * 获取物品类型标签
 */
function getItemTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    weapon: '武器',
    artifact: '神器',
    medicine: '丹药',
    manual: '秘籍',
    token: '信物',
    other: '其他'
  }
  return labels[type] || type
}

/**
 * 获取物品等级标签
 */
function getItemLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    common: '普通',
    rare: '稀有',
    legendary: '传说',
    divine: '神级'
  }
  return labels[level] || level
}

/**
 * 获取角色角色定位（从缓存中获取）
 */
function getCharacterRolePosition(characterId: string): string | undefined {
  // 这里需要从已加载的角色数据中获取，由于当前缓存只有id和name，返回undefined
  // 实际使用时需要在 showCharacterDetail 中已加载完整数据
  return undefined
}

/**
 * 获取物品重要性（从缓存中获取）
 */
function getItemImportance(itemId: string): string | undefined {
  return undefined
}

/**
 * 获取地点重要性（从缓存中获取）
 */
function getLocationImportance(locationId: string): string | undefined {
  return undefined
}

/**
 * 格式化角色 AI 信息
 */
function formatCharacterAIInfo(character: import('../../../shared/types/longwriting.types').StoryCharacter): string {
  const parts = [
    `【角色】${character.name}`,
    `角色定位：${getRolePositionLabel(character.rolePosition)}`,
    character.personality ? `性格特点：${character.personality}` : null,
    character.appearance ? `外貌描述：${character.appearance}` : null,
    character.abilities ? `能力特长：${character.abilities}` : null
  ].filter(Boolean)
  return parts.join('\n')
}

/**
 * 格式化物品 AI 信息
 */
function formatItemAIInfo(item: import('../../../shared/types/longwriting.types').StoryItem): string {
  const parts = [
    `【物品】${item.name}`,
    `类型：${getItemTypeLabel(item.type)}`,
    `等级：${getItemLevelLabel(item.level)}`,
    item.description ? `描述：${item.description}` : null
  ].filter(Boolean)
  return parts.join('\n')
}

/**
 * 格式化地点 AI 信息
 */
function formatLocationAIInfo(location: import('../../../shared/types/longwriting.types').StoryLocation): string {
  const parts = [
    `【地点】${location.name}`,
    `类型：${getLocationTypeLabel(location.type)}`,
    location.description ? `描述：${location.description}` : null
  ].filter(Boolean)
  return parts.join('\n')
}

/**
 * 绑定角色
 */
async function handleBindCharacter() {
  if (!bindCharacterForm.characterId || !store.currentProject) {
    ElMessage.warning('请选择角色')
    return
  }

  const result = await store.bindCharacter(
    store.currentProject.id,
    bindCharacterForm.characterId,
    undefined, // portraitId 暂时不绑定
    {
      voiceId: bindCharacterForm.voiceType,
      speed: bindCharacterForm.speechRate,
      pitch: 1.0
    },
    bindCharacterForm.description ? {
      baseDescription: bindCharacterForm.description
    } : undefined
  )

  if (result) {
    ElMessage.success('角色绑定成功')
    showBindCharacterDialog.value = false
    // 重置表单
    bindCharacterForm.characterId = ''
    bindCharacterForm.voiceType = 'female_gentle'
    bindCharacterForm.speechRate = 1.0
    bindCharacterForm.description = ''
  } else {
    ElMessage.error(store.error || '绑定失败')
  }
}

// ==================== 物品绑定相关 ====================

async function handleBindItem() {
  if (!bindItemForm.itemId || !store.currentProject) {
    ElMessage.warning('请选择物品')
    return
  }

  const item = longWritingItems.value.find(i => i.id === bindItemForm.itemId)
  if (!item) {
    ElMessage.warning('物品不存在')
    return
  }

  const result = await store.bindItem(
    store.currentProject.id,
    bindItemForm.itemId,
    item.name,
    [],
    bindItemForm.description ? {
      baseDescription: bindItemForm.description
    } : undefined,
    bindItemForm.generateImages
  )

  if (result) {
    ElMessage.success('物品绑定成功')
    showBindItemDialog.value = false
    // 重置表单
    bindItemForm.itemId = ''
    bindItemForm.description = ''
    bindItemForm.generateImages = true
  } else {
    ElMessage.error(store.error || '绑定失败')
  }
}

function editItemBinding(_binding: ItemBinding) {
  ElMessage.info('编辑物品绑定功能开发中...')
}

async function removeItemBinding(binding: ItemBinding) {
  try {
    await ElMessageBox.confirm('确定要移除该物品绑定吗？', '确认', {
      type: 'warning'
    })
    await store.deleteItemBinding(binding.id)
    ElMessage.success('移除成功')
  } catch {
    // 用户取消
  }
}

// ==================== 地点绑定相关 ====================

async function handleBindLocation() {
  if (!bindLocationForm.locationId || !store.currentProject) {
    ElMessage.warning('请选择地点')
    return
  }

  const location = longWritingLocations.value.find(l => l.id === bindLocationForm.locationId)
  if (!location) {
    ElMessage.warning('地点不存在')
    return
  }

  const result = await store.bindLocation(
    store.currentProject.id,
    bindLocationForm.locationId,
    location.name,
    [],
    bindLocationForm.description ? {
      baseDescription: bindLocationForm.description
    } : undefined,
    bindLocationForm.generateImages
  )

  if (result) {
    ElMessage.success('地点绑定成功')
    showBindLocationDialog.value = false
    // 重置表单
    bindLocationForm.locationId = ''
    bindLocationForm.description = ''
    bindLocationForm.generateImages = true
  } else {
    ElMessage.error(store.error || '绑定失败')
  }
}

function editLocationBinding(_binding: LocationBinding) {
  ElMessage.info('编辑地点绑定功能开发中...')
}

async function removeLocationBinding(binding: LocationBinding) {
  try {
    await ElMessageBox.confirm('确定要移除该地点绑定吗？', '确认', {
      type: 'warning'
    })
    await store.deleteLocationBinding(binding.id)
    ElMessage.success('移除成功')
  } catch {
    // 用户取消
  }
}

/**
 * 编辑绑定
 */
function editBinding(_binding: CharacterBinding) {
  ElMessage.info('编辑角色绑定功能开发中...')
}

/**
 * 移除绑定
 */
async function removeBinding(binding: CharacterBinding) {
  try {
    await ElMessageBox.confirm('确定要移除该角色绑定吗？', '确认', {
      type: 'warning'
    })
    await store.deleteCharacterBinding(binding.id)
    ElMessage.success('移除成功')
  } catch {
    // 用户取消
  }
}

/**
 * 合成视频
 */
async function synthesizeVideo() {
  if (!store.currentScene) {
    ElMessage.warning('请先选择场景')
    return
  }

  try {
    synthesisProgress.phase = 'shots'
    synthesisProgress.progress = 0

    const result = await store.synthesizeSceneVideo(
      store.currentScene.id,
      synthesisForm.quality,
      (phase, progress) => {
        synthesisProgress.phase = phase
        synthesisProgress.progress = Math.round(progress)
      }
    )

    if (result) {
      ElMessage.success(`视频合成成功，时长 ${result.duration} 秒`)
      showSynthesisDialog.value = false
    } else {
      ElMessage.error(store.error || '视频合成失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '视频合成失败')
  } finally {
    synthesisProgress.phase = ''
    synthesisProgress.progress = 0
  }
}

/**
 * 获取合成阶段标签
 */
function getSynthesisPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    shots: '生成镜头视频',
    audio: '合成音频',
    merge: '合并视频片段',
    final: '最终合成',
    complete: '完成'
  }
  return labels[phase] || phase
}

// 监听项目ID变化
watch(projectId, () => {
  loadProject()
}, { immediate: true })

// 设置默认剧集序号
watch(() => store.episodes.length, (length) => {
  episodeForm.episodeNumber = length + 1
})

// 监听搜索文本，过滤树
watch(outlineSearchText, (val) => {
  outlineTreeRef.value?.filter(val)
})
</script>

<style scoped lang="scss">
.video-project-editor {
  height: 100vh;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  height: 40px;
  min-height: 40px;
  flex-shrink: 0;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);

  .header-left {
    display: flex;
    align-items: center;
    min-width: 100px;
  }

  .header-center {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .header-right {
    display: flex;
    align-items: center;
    min-width: 100px;
    justify-content: flex-end;
  }

  .project-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.editor-content {
  flex: 1;
  height: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  box-sizing: border-box;
}

.left-panel {
  width: 180px;
  min-width: 140px;
  min-height: 0;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.episode-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  min-height: 0;
}

.right-panel {
  width: 320px;
  min-height: 0;
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  height: 44px;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
  }
}

.episode-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  padding-right: 40px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;

  &:hover {
    background: var(--el-fill-color-light);

    .episode-actions {
      opacity: 1;
    }
  }

  &.active {
    background: var(--el-color-primary-light-9);
  }

  .episode-number {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .episode-title {
    font-size: 14px;
    font-weight: 500;
  }

  .episode-status {
    margin-top: 4px;
  }

  .episode-actions {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0;
    transition: opacity 0.2s;
  }
}

.editor-tabs {
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  :deep(.el-tabs__header) {
    margin: 0;
    padding: 0 12px;
    background: var(--el-bg-color);
    height: 40px;
    min-height: 40px;
    flex-shrink: 0;
  }

  :deep(.el-tabs__nav-wrap) {
    height: 40px;
  }

  :deep(.el-tabs__nav-scroll) {
    height: 40px;
  }

  :deep(.el-tabs__nav) {
    height: 40px;
  }

  :deep(.el-tabs__item) {
    height: 40px;
    line-height: 40px;
    font-size: 13px;
  }

  :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  :deep(.el-tab-pane) {
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
}

.script-editor {
  .script-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
    }
  }

  .scene-section {
    margin-top: 24px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
      }
    }
  }
}

// 新的剧本编辑器样式
.script-editor-new {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;

  .scene-nav-sidebar {
    width: 200px;
    min-width: 180px;
    height: 100%;
    max-height: 100%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--el-border-color-light);
    background: var(--el-fill-color-blank);
    overflow: hidden;
    box-sizing: border-box;

    .sidebar-header {
      padding: 0 12px;
      height: 44px;
      min-height: 44px;
      border-bottom: 1px solid var(--el-border-color-light);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      box-sizing: border-box;

      h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 500;
      }
    }

    .scene-nav-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 6px;
    }

    .scene-nav-item {
      padding: 8px 10px;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 4px;
      transition: all 0.15s;
      border: 1px solid transparent;

      &:hover {
        background: var(--el-fill-color-light);
      }

      &.active {
        background: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary-light-5);
      }

      .scene-nav-number {
        font-size: 11px;
        color: var(--el-text-color-secondary);
        margin-bottom: 2px;
      }

      .scene-nav-location {
        font-size: 12px;
        font-weight: 500;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .scene-nav-time {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
    }
  }

  .script-content-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;

    .content-header {
      padding: 0 12px;
      height: 44px;
      min-height: 44px;
      border-bottom: 1px solid var(--el-border-color-light);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--el-fill-color-blank);
      flex-shrink: 0;
      box-sizing: border-box;

      h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 500;
      }
    }

    .script-content-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 12px 16px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;

      .scene-block {
        margin-bottom: 16px;
        padding: 12px;
        border-radius: 6px;
        border: 1px solid transparent;
        transition: all 0.15s;
        scroll-margin-top: 8px;

        &.active {
          border-color: var(--el-color-primary-light-5);
          background: var(--el-fill-color-lighter);
        }

        .scene-header-line {
          font-weight: bold;
          font-size: 12px;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--el-border-color-lighter);
        }

        .scene-script-content {
          font-size: 12px;
          line-height: 1.6;

          .empty-line {
            height: 6px;
          }

          .scene-header-line {
            font-weight: bold;
            color: var(--el-text-color-primary);
            margin-bottom: 8px;
          }

          .transition-line {
            text-align: right;
            color: var(--el-text-color-secondary);
            margin: 10px 0;
          }

          .character-name-line {
            text-align: center;
            margin: 8px 0 2px;
            font-weight: 600;

            strong {
              color: var(--el-text-color-primary);
            }
          }

          .parenthetical-line {
            text-align: center;
            color: var(--el-text-color-secondary);
            font-size: 11px;
            margin: 2px 0;
          }

          .dialogue-line {
            text-align: center;
            margin: 2px 0;
            padding: 0 40px;
          }

          .action-line {
            margin: 8px 0;
            text-align: justify;

            strong {
              color: var(--el-color-primary);
              font-weight: 600;
            }
          }

          .no-content {
            color: var(--el-text-color-placeholder);
            text-align: center;
            padding: 16px;
          }

          .fallback-content {
            .narration {
              color: var(--el-text-color-secondary);
              font-style: italic;
              margin-bottom: 16px;
            }

            .dialogue {
              margin: 12px 0;
              text-align: center;

              .character-name {
                font-weight: 500;
                display: block;
              }

              .parenthetical {
                color: var(--el-text-color-secondary);
                font-size: 12px;
              }

              .text {
                margin: 4px 0;
              }
            }

            .action {
              margin: 12px 0;

              .action-character {
                font-weight: 500;
                display: block;
                color: var(--el-text-color-primary);
              }

              .description {
                margin: 4px 0;
                color: var(--el-text-color-regular);
              }
            }
          }

          // 分镜标签样式
          .storyboard-tag {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: 500;
            color: var(--el-color-primary);
            background: var(--el-color-primary-light-9);
            border-radius: 4px;
            vertical-align: middle;
            white-space: nowrap;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              background: var(--el-color-primary-light-8);
              transform: scale(1.05);
            }
          }

          .dialogue, .action {
            position: relative;

            .storyboard-tag {
              float: right;
              margin-top: 4px;
            }
          }

          .narration {
            .storyboard-tag {
              display: inline-block;
              margin-left: 8px;
            }
          }
        }
      }

      .no-script-content {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        min-height: 300px;
      }
    }
  }
}

// 剧本梗概折叠面板
.script-synopsis-collapse {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-light);

  :deep(.el-collapse-item__header) {
    padding: 8px 12px;
    font-weight: 500;
    font-size: 13px;
  }

  :deep(.el-collapse-item__content) {
    padding: 12px;
  }
}

.scene-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }

  .scene-number {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .scene-location {
    font-size: 14px;
    font-weight: 500;
  }

  .scene-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.storyboard-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  min-height: 0;
}

.storyboard-item {
  padding: 12px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

    .storyboard-item-actions {
      opacity: 1;
    }
  }

  &.selected {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
  }

  &.has-image {
    .storyboard-preview {
      width: 100%;
      aspect-ratio: 16/9;
    }

    .storyboard-item-left {
      flex-direction: column;
    }
  }

  .storyboard-item-left {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 12px;
  }

  .storyboard-item-actions {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: flex;
    flex-direction: row;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .storyboard-preview {
    width: 80px;
    height: 45px;
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
    cursor: pointer;

    &:hover .preview-overlay {
      opacity: 1;
    }

    &.placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--el-fill-color);
      color: var(--el-text-color-placeholder);
      font-size: 10px;
      gap: 2px;
      cursor: default;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .preview-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      opacity: 0;
      transition: opacity 0.2s;
    }
  }

  .storyboard-info {
    flex: 1;
    min-width: 0;
  }

  .storyboard-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;

    .shot-number {
      font-size: 12px;
      font-weight: 500;
    }
  }

  .storyboard-description {
    font-size: 13px;
    color: var(--el-text-color-regular);
    line-height: 1.5;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .storyboard-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    flex-wrap: wrap;
  }
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.generate-info {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.selected-storyboard-info {
  display: flex;
  align-items: center;
  gap: 12px;

  .shot-label {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .shot-type {
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.no-selection-hint {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.frame-description-preview {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 8px 12px;
  border-radius: 4px;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.5;
}

.synthesis-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .progress-text {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

// 绑定配置通用样式（角色、物品、地点）
.character-bindings,
.item-bindings,
.location-bindings {
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  .bindings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 12px;
    height: 44px;
    border-bottom: 1px solid var(--el-border-color-light);
    flex-shrink: 0;

    h4 {
      margin: 0;
      font-size: 13px;
      font-weight: 500;
    }
  }
}

.bindings-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// 卡片式绑定项样式
.binding-card {
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }

  .card-icon {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &.character-icon {
      background: linear-gradient(135deg, var(--el-color-primary-light-8), var(--el-color-primary-light-5));
      color: var(--el-color-primary);
    }

    &.item-icon {
      background: linear-gradient(135deg, var(--el-color-warning-light-8), var(--el-color-warning-light-5));
      color: var(--el-color-warning);
    }

    &.location-icon {
      background: linear-gradient(135deg, var(--el-color-info-light-8), var(--el-color-info-light-5));
      color: var(--el-color-info);
    }
  }

  .card-title {
    flex: 1;
    min-width: 0;

    .binding-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .el-tag {
      margin-right: 4px;
    }
  }

  .card-body {
    margin-bottom: 12px;

    .binding-status {
      display: flex;
      align-items: center;
      gap: 8px;

      .el-tag {
        .el-icon {
          margin-right: 4px;
        }
      }
    }
  }

  .card-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--el-border-color-lighter);

    .el-button {
      .el-icon {
        margin-right: 4px;
      }
    }
  }
}

// 详情对话框样式
.entity-detail-dialog {
  .detail-content {
    max-height: 60vh;
    overflow-y: auto;
  }

  .detail-section {
    margin-bottom: 20px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    overflow: hidden;

    &.ai-section {
      border-color: var(--el-color-warning-light-5);
      background: var(--el-color-warning-light-9);
    }

    .section-title {
      padding: 12px 16px;
      font-weight: 600;
      font-size: 14px;
      background: var(--el-fill-color-light);
      border-bottom: 1px solid var(--el-border-color-light);
      display: flex;
      align-items: center;
      gap: 6px;

      .el-icon {
        color: var(--el-color-warning);
      }
    }

    .section-content {
      padding: 16px;
    }
  }

  .description-text {
    white-space: pre-wrap;
    line-height: 1.6;
    color: var(--el-text-color-regular);
  }

  .ai-info-box {
    .ai-info-hint {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-bottom: 12px;
    }

    .ai-info-code {
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: 6px;
      padding: 12px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      color: var(--el-text-color-primary);
    }
  }

  :deep(.el-descriptions) {
    .el-descriptions__label {
      width: 100px;
      font-weight: 500;
    }

    .el-descriptions__content {
      word-break: break-word;
    }
  }
}

.outline-tree-container {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 8px;
}

.outline-tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;

  .node-label {
    flex: 1;
  }
}

.outline-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.word-count-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;

  .word-count-warning {
    color: var(--el-color-warning);
  }

  .word-count-limit {
    color: var(--el-text-color-secondary);
  }
}

.form-error {
  color: var(--el-color-danger);
  font-size: 12px;
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

// 图片预览对话框样式
.image-preview-dialog {
  .el-dialog__body {
    padding: 0;
  }
}

.preview-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  max-height: 80vh;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.preview-image {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
}

// 项目设置对话框样式
:deep(.settings-dialog) {
  .el-dialog__body {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
    padding: 20px;
  }
}

.settings-form {
  // 确保表单内容可以正常滚动
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>