<template>
  <div class="background-stage">
    <div class="stage-header">
      <div class="header-left">
        <h2>时代背景与地点设定</h2>
        <p class="stage-desc">设定故事发生的时代背景和主要地点场景</p>
      </div>
      <!-- 保存状态提示 -->
      <span v-if="saveStatus !== 'idle'" class="save-status" :class="saveStatus">
        {{ saveStatusText }}
      </span>
    </div>

    <el-tabs v-model="activeTab" class="background-tabs" :before-leave="handleTabLeave">
      <!-- 时代背景 -->
      <el-tab-pane label="时代背景" name="era">
        <div class="era-form">
          <!-- 时代类型 -->
          <div class="form-row">
            <label class="form-label">时代类型</label>
            <el-radio-group v-model="eraForm.eraType" class="era-type-group">
              <el-radio-button value="ancient">古代</el-radio-button>
              <el-radio-button value="modern">现代</el-radio-button>
              <el-radio-button value="future">未来</el-radio-button>
              <el-radio-button value="fictional">架空</el-radio-button>
            </el-radio-group>
          </div>

          <!-- 时代描述 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">时代描述</label>
              <el-tooltip content="AI 润色可丰富描述内容" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'eraDescription'"
                  :disabled="!eraForm.eraDescription.trim()"
                  @click="polishField('eraDescription')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.eraDescription"
              type="textarea"
              :rows="4"
              placeholder="描述故事发生的时代背景，如朝代、历史时期、虚构纪元等..."
              resize="none"
            />
          </div>

          <!-- 社会结构 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">社会结构</label>
              <el-tooltip content="AI 润色可丰富描述内容" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'socialStructure'"
                  :disabled="!eraForm.socialStructure.trim()"
                  @click="polishField('socialStructure')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.socialStructure"
              type="textarea"
              :rows="3"
              placeholder="描述社会阶层、权力结构、等级制度等..."
              resize="none"
            />
          </div>

          <!-- 技术水平 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">技术水平</label>
              <el-tooltip content="AI 润色可丰富描述内容" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'techLevel'"
                  :disabled="!eraForm.techLevel.trim()"
                  @click="polishField('techLevel')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.techLevel"
              type="textarea"
              :rows="2"
              placeholder="描述科技发展水平、生产力状况、特殊技术等..."
              resize="none"
            />
          </div>

          <!-- 特殊设定 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">特殊设定</label>
              <el-tooltip content="AI 润色可丰富描述内容" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'specialRules'"
                  :disabled="!eraForm.specialRules.trim()"
                  @click="polishField('specialRules')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.specialRules"
              type="textarea"
              :rows="3"
              placeholder="架空世界的特殊规则、魔法体系、修仙等级等..."
              resize="none"
            />
          </div>

          <!-- 势力分布 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">势力分布</label>
              <el-tooltip content="AI 润色可丰富描述内容，用于辅助势力设定的 AI 生成" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'factionDistribution'"
                  :disabled="!eraForm.factionDistribution.trim()"
                  @click="polishField('factionDistribution')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.factionDistribution"
              type="textarea"
              :rows="3"
              placeholder="描述世界中的主要势力分布，如各大门派、国家、阵营的地理位置和相互关系，用于辅助地图设定和势力设定的 AI 生成..."
              resize="none"
            />
          </div>

          <!-- 地理方位 -->
          <div class="form-row">
            <div class="form-label-row">
              <label class="form-label">地理方位</label>
              <el-tooltip content="AI 润色可丰富描述内容，用于辅助地点设定的 AI 生成" placement="top">
                <el-button
                  type="primary"
                  size="small"
                  :icon="MagicStick"
                  :loading="polishingField === 'geographicOrientation'"
                  :disabled="!eraForm.geographicOrientation.trim()"
                  @click="polishField('geographicOrientation')"
                >
                  润色
                </el-button>
              </el-tooltip>
            </div>
            <el-input
              v-model="eraForm.geographicOrientation"
              type="textarea"
              :rows="3"
              placeholder="描述世界的整体地理格局，如东南西北各区域的特点、气候、地形等，用于辅助地图设定的 AI 生成..."
              resize="none"
            />
          </div>

          <!-- 保存按钮 -->
          <div class="form-actions">
            <el-button type="primary" :loading="saveStatus === 'saving'" @click="saveBackground">
              <el-icon><Check /></el-icon>
              保存设定
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 地图设定 -->
      <el-tab-pane name="maps">
        <template #label>
          <span :class="{ 'disabled-tab': !isFeatureEnabled('map') }">地图设定</span>
        </template>
        <div class="map-list">
          <div v-for="map in maps" :key="map.id" class="map-card">
            <div class="map-image" v-if="map.imagePath">
              <img :src="getMapImageUrl(map.imagePath)" alt="地图图片" />
            </div>
            <div class="map-image map-image-placeholder" v-else>
              <el-icon size="40"><Picture /></el-icon>
              <span>暂无图片</span>
            </div>
            <div class="map-info">
              <h4>{{ map.name }}</h4>
              <div class="map-tags">
                <el-tag size="small" type="info">{{ getMapOrientationLabel(map.orientation) }}</el-tag>
              </div>
              <p class="map-desc">{{ map.characteristics }}</p>
              <div v-if="map.aiGeneratedData" class="map-ai-data">
                <el-collapse>
                  <el-collapse-item title="AI 生成的详细数据" name="aiData">
                    <div class="ai-data-content">
                      <div v-if="map.aiGeneratedData.regions?.length">
                        <strong>区域：</strong>
                        <span v-for="region in map.aiGeneratedData.regions" :key="region.name">{{ region.name }}、</span>
                      </div>
                      <div v-if="map.aiGeneratedData.landmarks?.length">
                        <strong>地标：</strong>
                        <span v-for="landmark in map.aiGeneratedData.landmarks" :key="landmark.name">{{ landmark.name }}、</span>
                      </div>
                      <div v-if="map.aiGeneratedData.climate">
                        <strong>气候：</strong>{{ map.aiGeneratedData.climate }}
                      </div>
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </div>
            </div>
            <div class="map-actions">
              <el-button text @click="editMap(map)">编辑</el-button>
              <el-button text @click="showGenerateMapImageDialog(map)" v-if="!map.imagePath">生成图片</el-button>
              <el-button text type="danger" @click="deleteMap(map.id)">删除</el-button>
            </div>
          </div>
          <el-button type="primary" plain class="add-map-btn" @click="showMapDialog = true">
            <el-icon><Plus /></el-icon>
            添加地图
          </el-button>
        </div>
      </el-tab-pane>

      <!-- 地点设定 -->
      <el-tab-pane label="地点设定" name="locations">
        <div class="location-list">
          <div class="tab-actions">
            <el-button
              type="primary"
              plain
              :icon="MagicStick"
              :loading="generatingLocations"
              :disabled="!selectedModel?.providerId"
              @click="generateLocationsFromAI"
            >
              AI 生成地点建议
            </el-button>
            <el-alert
              v-if="!selectedModel?.providerId"
              title="请先在顶部选择 AI 模型"
              type="info"
              :closable="false"
              show-icon
              style="margin-left: 12px;"
            />
          </div>
          <div v-for="location in locations" :key="location.id" class="location-card">
            <div class="location-info">
              <h4>{{ location.name }}</h4>
              <div class="location-tags">
                <el-tag size="small" type="info">{{ getLocationTypeLabel(location.type) }}</el-tag>
                <el-tag size="small">{{ getImportanceLabel(location.importance) }}</el-tag>
                <el-tag v-if="location.mapId" size="small" type="warning">{{ getMapName(location.mapId) }}</el-tag>
              </div>
              <p class="location-desc">{{ location.description }}</p>
            </div>
            <div class="location-actions">
              <el-button text @click="editLocation(location)">编辑</el-button>
              <el-button text type="danger" @click="deleteLocation(location.id)">删除</el-button>
            </div>
          </div>
          <el-button type="primary" plain class="add-location-btn" @click="showLocationDialog = true">
            <el-icon><Plus /></el-icon>
            添加地点
          </el-button>
        </div>
      </el-tab-pane>

      <!-- 势力设定 -->
      <el-tab-pane name="factions">
        <template #label>
          <span :class="{ 'disabled-tab': !isFeatureEnabled('country') && !isFeatureEnabled('faction') && !isFeatureEnabled('sect') }">势力设定</span>
        </template>
        <div class="faction-section">
          <!-- 操作按钮 -->
          <div class="tab-actions">
            <el-button
              type="primary"
              plain
              :icon="MagicStick"
              :loading="generatingFactions"
              :disabled="!selectedModel?.providerId || (!isFeatureEnabled('country') && !isFeatureEnabled('faction') && !isFeatureEnabled('sect'))"
              @click="generateFactionsFromAI"
            >
              AI 生成势力建议
            </el-button>
            <el-alert
              v-if="!selectedModel?.providerId"
              title="请先在顶部选择 AI 模型"
              type="info"
              :closable="false"
              show-icon
              style="margin-left: 12px;"
            />
          </div>
          <!-- 势力类型筛选 -->
          <div class="faction-filter">
            <el-radio-group v-model="factionFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="country" :disabled="!isFeatureEnabled('country')">国别</el-radio-button>
              <el-radio-button value="camp" :disabled="!isFeatureEnabled('faction')">阵营</el-radio-button>
              <el-radio-button value="sect" :disabled="!isFeatureEnabled('sect')">门派</el-radio-button>
            </el-radio-group>
          </div>

          <!-- 势力列表 -->
          <div class="faction-list">
            <div v-for="faction in filteredFactions" :key="faction.id" class="faction-card">
              <div class="faction-info">
                <div class="faction-header">
                  <h4>{{ faction.name }}</h4>
                  <el-tag size="small" :type="getFactionTagType(faction.factionType)">
                    {{ getFactionTypeLabel(faction.factionType) }}
                  </el-tag>
                </div>
                <div v-if="faction.locationId" class="faction-location">
                  <span class="label">所在地：</span>
                  <span>{{ getLocationName(faction.locationId) }}</span>
                </div>
                <p class="faction-desc">{{ faction.description }}</p>
              </div>
              <div class="faction-actions">
                <el-button text @click="editFaction(faction)">编辑</el-button>
                <el-button text type="danger" @click="deleteFaction(faction.id)">删除</el-button>
              </div>
            </div>
            <el-button type="primary" plain class="add-faction-btn" @click="showFactionDialog = true">
              <el-icon><Plus /></el-icon>
              添加势力
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 地点编辑对话框 -->
    <el-dialog v-model="showLocationDialog" :title="editingLocationId ? '编辑地点' : '添加地点'" width="500px">
      <el-form :model="locationForm" label-width="80px">
        <el-form-item label="地点名称" required>
          <el-input v-model="locationForm.name" placeholder="输入地点名称" />
        </el-form-item>
        <el-form-item label="地点类型">
          <el-select v-model="locationForm.type" placeholder="选择地点类型">
            <el-option label="城市" value="city" />
            <el-option label="村庄" value="village" />
            <el-option label="山脉" value="mountain" />
            <el-option label="宫殿" value="palace" />
            <el-option label="森林" value="forest" />
            <el-option label="海域" value="sea" />
            <el-option label="建筑" value="building" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联地图">
          <el-select v-model="locationForm.mapId" placeholder="选择关联地图（可选）" clearable>
            <el-option
              v-for="map in maps"
              :key="map.id"
              :label="map.name"
              :value="map.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="重要程度">
          <el-radio-group v-model="locationForm.importance">
            <el-radio value="main">主要场景</el-radio>
            <el-radio value="important">重要场景</el-radio>
            <el-radio value="auxiliary">辅助场景</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="地点描述">
          <el-input
            v-model="locationForm.description"
            type="textarea"
            :rows="3"
            placeholder="描述地点的环境特征、氛围..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLocationDialog = false">取消</el-button>
        <el-button type="primary" @click="saveLocation">保存</el-button>
      </template>
    </el-dialog>

    <!-- 势力编辑对话框 -->
    <el-dialog v-model="showFactionDialog" :title="editingFactionId ? '编辑势力' : '添加势力'" width="500px">
      <el-form :model="factionForm" label-width="80px">
        <el-form-item label="势力类型" required>
          <el-radio-group v-model="factionForm.factionType">
            <el-radio value="country" :disabled="!isFeatureEnabled('country')">国别</el-radio>
            <el-radio value="camp" :disabled="!isFeatureEnabled('faction')">阵营</el-radio>
            <el-radio value="sect" :disabled="!isFeatureEnabled('sect')">门派</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="势力名称" required>
          <el-input v-model="factionForm.name" placeholder="输入势力名称" />
        </el-form-item>
        <el-form-item label="所在地">
          <el-select v-model="factionForm.locationId" placeholder="选择所在地（可选）" clearable>
            <el-option
              v-for="loc in locations"
              :key="loc.id"
              :label="loc.name"
              :value="loc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="主要特点">
          <el-input
            v-model="factionForm.description"
            type="textarea"
            :rows="4"
            placeholder="描述势力的主要特点、立场、特色等..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showFactionDialog = false">取消</el-button>
        <el-button type="primary" @click="saveFaction">保存</el-button>
      </template>
    </el-dialog>

    <!-- 地图编辑对话框 -->
    <el-dialog v-model="showMapDialog" :title="editingMapId ? '编辑地图' : '添加地图'" width="550px">
      <el-form :model="mapForm" label-width="80px">
        <el-form-item label="地图名称" required>
          <el-input v-model="mapForm.name" placeholder="输入地图名称" />
        </el-form-item>
        <el-form-item label="地图方位">
          <el-select v-model="mapForm.orientation" placeholder="选择地图方位">
            <el-option label="北方" value="north" />
            <el-option label="南方" value="south" />
            <el-option label="东方" value="east" />
            <el-option label="西方" value="west" />
            <el-option label="中央" value="central" />
            <el-option label="东北" value="northeast" />
            <el-option label="西北" value="northwest" />
            <el-option label="东南" value="southeast" />
            <el-option label="西南" value="southwest" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="地图特点">
          <el-input
            v-model="mapForm.characteristics"
            type="textarea"
            :rows="3"
            placeholder="描述地图的地形特点、气候、重要地标等..."
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" plain @click="showAIMapDataDialog = true" :disabled="!mapForm.name">
            <el-icon><MagicStick /></el-icon>
            AI 生成详细数据
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showMapDialog = false">取消</el-button>
        <el-button type="primary" @click="saveMap">保存</el-button>
      </template>
    </el-dialog>

    <!-- AI 生成地图数据对话框 -->
    <el-dialog v-model="showAIMapDataDialog" title="AI 生成地图数据" width="550px">
      <el-form label-width="80px">
        <el-form-item label="提示词">
          <el-input
            v-model="aiMapDataPrompt"
            type="textarea"
            :rows="4"
            placeholder="描述你想要的地图内容，如：一个以山脉为主的北方区域，有三座主要城市..."
          />
        </el-form-item>
        <el-alert
          v-if="!selectedModel?.providerId"
          title="请先在顶部选择 AI 模型"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />
      </el-form>
      <template #footer>
        <el-button @click="showAIMapDataDialog = false">取消</el-button>
        <el-button
          type="primary"
          @click="generateMapData"
          :loading="generatingMapData"
          :disabled="!selectedModel?.providerId"
        >
          生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 生成地图图片对话框 -->
    <el-dialog v-model="showMapImageDialog" title="生成地图图片" width="450px">
      <el-form label-width="80px">
        <el-form-item label="图像模型">
          <el-select
            v-model="selectedImageModelKey"
            placeholder="选择图像模型"
            style="width: 100%"
          >
            <el-option-group
              v-for="provider in (imageProviderModels || [])"
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
        </el-form-item>
      </el-form>
      <p style="margin-top: -8px; color: var(--text-color-secondary); font-size: 13px;">
        将为地图「{{ generatingImageMap?.name }}」生成图片。
      </p>
      <template #footer>
        <el-button @click="showMapImageDialog = false">取消</el-button>
        <el-button
          type="primary"
          @click="generateMapImage"
          :loading="generatingMapImage"
          :disabled="!selectedImageModel"
        >
          生成图片
        </el-button>
      </template>
    </el-dialog>

    <!-- AI 生成地点结果对话框 -->
    <el-dialog v-model="showAILocationDialog" title="AI 生成的地点建议" width="650px">
      <p class="dialog-tip">以下是 AI 根据背景设定生成的地点建议，请勾选要采纳的地点：</p>
      <div class="ai-result-list">
        <div v-for="(item, index) in aiLocationResults" :key="index" class="ai-result-item">
          <el-checkbox v-model="item.selected" />
          <div class="ai-result-content">
            <div class="ai-result-header">
              <span class="ai-result-name">{{ item.name }}</span>
              <el-tag size="small" type="info">{{ getLocationTypeLabel(item.type) }}</el-tag>
              <el-tag size="small">{{ getImportanceLabel(item.importance) }}</el-tag>
            </div>
            <p class="ai-result-desc">{{ item.description }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showAILocationDialog = false">取消</el-button>
        <el-button type="primary" @click="adoptSelectedLocations">
          采纳选中 ({{ aiLocationResults.filter(i => i.selected).length }})
        </el-button>
      </template>
    </el-dialog>

    <!-- AI 生成势力结果对话框 -->
    <el-dialog v-model="showAIFactionDialog" title="AI 生成的势力建议" width="650px">
      <p class="dialog-tip">以下是 AI 根据背景设定生成的势力建议，请勾选要采纳的势力：</p>
      <div class="ai-result-list">
        <div v-for="(item, index) in aiFactionResults" :key="index" class="ai-result-item">
          <el-checkbox v-model="item.selected" />
          <div class="ai-result-content">
            <div class="ai-result-header">
              <span class="ai-result-name">{{ item.name }}</span>
              <el-tag size="small" :type="getFactionTagType(item.factionType)">
                {{ getFactionTypeLabel(item.factionType) }}
              </el-tag>
              <el-tag v-if="item.suggestedLocationName" size="small" type="warning">
                {{ item.suggestedLocationName }}
              </el-tag>
            </div>
            <p class="ai-result-desc">{{ item.description }}</p>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showAIFactionDialog = false">取消</el-button>
        <el-button type="primary" @click="adoptSelectedFactions">
          采纳选中 ({{ aiFactionResults.filter(i => i.selected).length }})
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, inject, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, MagicStick, Check, Picture } from '@element-plus/icons-vue'
import type { ComputedRef, Ref } from 'vue'
import { toImageUrl } from '@/utils/asset-url'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  'update:progress': [progress: number]
}>()

// 从父组件注入功能开关
const enabledFeatures = inject<Ref<string[]>>('enabledFeatures', ref([]))

// 检查功能是否启用
function isFeatureEnabled(feature: string): boolean {
  return enabledFeatures.value.includes(feature)
}

// Tab 切换前检查功能是否启用
function handleTabLeave(activeName: string, oldActiveName: string): boolean {
  if (activeName === 'maps' && !isFeatureEnabled('map')) {
    ElMessage.warning('地图功能未启用，请在故事概要中开启"地图"选项')
    return false
  }
  if (activeName === 'factions' && !isFeatureEnabled('country') && !isFeatureEnabled('faction') && !isFeatureEnabled('sect')) {
    ElMessage.warning('势力功能未启用，请在故事概要中开启国别/阵营/门派选项')
    return false
  }
  return true
}

// 从父组件注入选中的模型（computed ref）
const selectedModelRef = inject<ComputedRef<{ providerId: string; modelId: string } | null>>('selectedModel')
// 获取当前选中的模型值
const selectedModel = computed(() => selectedModelRef?.value)

// 从父组件注入图像模型列表
const imageProviderModels = inject<ComputedRef<Array<{
  id: string
  name: string
  shortId: string
  models: Array<{ id: string; name: string }>
}>>>('imageProviderModels')

// 本地图像模型选择
const selectedImageModelKey = ref<string>('')

// 解析选中的图像模型
const selectedImageModel = computed(() => {
  if (!selectedImageModelKey.value) return null
  const [providerId, modelId] = selectedImageModelKey.value.split(':')
  return { providerId, modelId }
})

const activeTab = ref('era')

// 时代背景表单
const eraForm = ref({
  eraType: 'ancient',
  eraDescription: '',
  socialStructure: '',
  techLevel: '',
  specialRules: '',
  factionDistribution: '',
  geographicOrientation: ''
})

// 地点列表
const locations = ref<Array<{
  id: string
  name: string
  type: string
  importance: string
  description: string
  mapId?: string
}>>([])

// 地点对话框
const showLocationDialog = ref(false)
const editingLocationId = ref<string | null>(null)
const locationForm = ref({
  name: '',
  type: 'city',
  importance: 'important',
  description: '',
  mapId: ''
})

// 势力列表
const factions = ref<Array<{
  id: string
  projectId: string
  factionType: 'country' | 'camp' | 'sect'
  name: string
  locationId?: string
  description: string
  sortOrder: number
}>>([])

// 势力筛选
const factionFilter = ref<'all' | 'country' | 'camp' | 'sect'>('all')

// 筛选后的势力列表
const filteredFactions = computed(() => {
  if (factionFilter.value === 'all') {
    return factions.value
  }
  return factions.value.filter(f => f.factionType === factionFilter.value)
})

// 势力对话框
const showFactionDialog = ref(false)
const editingFactionId = ref<string | null>(null)
const factionForm = ref({
  factionType: 'country' as 'country' | 'camp' | 'sect',
  name: '',
  locationId: '',
  description: ''
})

// 地图列表
const maps = ref<Array<{
  id: string
  projectId: string
  name: string
  orientation: string
  characteristics: string
  imagePath?: string
  aiGeneratedData?: any
  sortOrder: number
}>>([])

// 地图对话框
const showMapDialog = ref(false)
const editingMapId = ref<string | null>(null)
const mapForm = ref({
  name: '',
  orientation: 'other',
  characteristics: ''
})

// AI 生成地图数据对话框
const showAIMapDataDialog = ref(false)
const aiMapDataPrompt = ref('')
const generatingMapData = ref(false)

// 生成地图图片对话框
const showMapImageDialog = ref(false)
const generatingImageMap = ref<{ id: string; name: string } | null>(null)
const generatingMapImage = ref(false)

// 加载状态
const loading = ref(false)
// 保存状态
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
// 润色状态
const polishingField = ref<'eraDescription' | 'socialStructure' | 'techLevel' | 'specialRules' | 'factionDistribution' | 'geographicOrientation' | null>(null)
const polishingContent = ref('')

// AI 生成地点相关
const generatingLocations = ref(false)
const aiLocationResults = ref<Array<{
  name: string
  type: string
  importance: string
  description: string
  suggestedMapId?: string
  selected?: boolean
}>>([])
const showAILocationDialog = ref(false)

// AI 生成势力相关
const generatingFactions = ref(false)
const aiFactionResults = ref<Array<{
  factionType: string
  name: string
  suggestedLocationName?: string
  description: string
  selected?: boolean
}>>([])
const showAIFactionDialog = ref(false)

// 保存状态文字
const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saving': return '保存中...'
    case 'saved': return '已保存'
    default: return ''
  }
})

function getLocationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    city: '城市',
    village: '村庄',
    mountain: '山脉',
    palace: '宫殿',
    forest: '森林',
    sea: '海域',
    building: '建筑',
    other: '其他'
  }
  return labels[type] || type
}

function getImportanceLabel(importance: string): string {
  const labels: Record<string, string> = {
    main: '主要',
    important: '重要',
    auxiliary: '辅助'
  }
  return labels[importance] || importance
}

// 势力相关函数
function getFactionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    country: '国别',
    camp: '阵营',
    sect: '门派'
  }
  return labels[type] || type
}

function getFactionTagType(type: string): '' | 'success' | 'warning' | 'info' {
  const types: Record<string, '' | 'success' | 'warning' | 'info'> = {
    country: '',
    camp: 'success',
    sect: 'warning'
  }
  return types[type] || 'info'
}

function getLocationName(locationId: string): string {
  const location = locations.value.find(loc => loc.id === locationId)
  return location?.name || '未知'
}

function getMapName(mapId: string): string {
  const map = maps.value.find(m => m.id === mapId)
  return map?.name || '未知'
}

// 将本地路径转换为图像 URL（双端自适配）
function getMapImageUrl(imagePath: string): string {
  return toImageUrl(imagePath?.replace(/\\/g, '/'))
}

// 加载势力列表
async function loadFactions() {
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.getFactions(props.projectId)
  if (result.success) {
    factions.value = result.data || []
  }
}

function editFaction(faction: any) {
  editingFactionId.value = faction.id
  factionForm.value = {
    factionType: faction.factionType,
    name: faction.name,
    locationId: faction.locationId || '',
    description: faction.description
  }
  showFactionDialog.value = true
}

async function deleteFaction(id: string) {
  const result = await window.electronAPI.longwriting.deleteFaction(id)
  if (result.success) {
    await loadFactions()
    ElMessage.success('势力已删除')
  }
}

async function saveFaction() {
  if (!factionForm.value.name) {
    ElMessage.warning('请输入势力名称')
    return
  }

  const formData = toRaw(factionForm.value)

  if (editingFactionId.value) {
    // 更新
    const result = await window.electronAPI.longwriting.updateFaction(editingFactionId.value, formData)
    if (result.success) {
      ElMessage.success('势力已更新')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } else {
    // 创建
    const result = await window.electronAPI.longwriting.createFaction({
      projectId: props.projectId,
      ...formData
    })
    if (result.success) {
      ElMessage.success('势力已添加')
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  }

  showFactionDialog.value = false
  editingFactionId.value = null
  factionForm.value = {
    factionType: 'country',
    name: '',
    locationId: '',
    description: ''
  }
  await loadFactions()
  emit('update:progress', 35)
}

// ==================== 地图管理 ====================

function getMapOrientationLabel(orientation: string): string {
  const labels: Record<string, string> = {
    north: '北方',
    south: '南方',
    east: '东方',
    west: '西方',
    central: '中央',
    northeast: '东北',
    northwest: '西北',
    southeast: '东南',
    southwest: '西南',
    other: '其他'
  }
  return labels[orientation] || orientation
}

// 加载地图列表
async function loadMaps() {
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.getMaps(props.projectId)
  if (result.success) {
    maps.value = result.data || []
  }
}

function editMap(map: any) {
  editingMapId.value = map.id
  mapForm.value = {
    name: map.name,
    orientation: map.orientation || 'other',
    characteristics: map.characteristics || ''
  }
  showMapDialog.value = true
}

async function deleteMap(id: string) {
  const result = await window.electronAPI.longwriting.deleteMap(id)
  if (result.success) {
    await loadMaps()
    ElMessage.success('地图已删除')
  }
}

async function saveMap() {
  if (!mapForm.value.name) {
    ElMessage.warning('请输入地图名称')
    return
  }

  const formData = toRaw(mapForm.value)

  if (editingMapId.value) {
    // 更新
    const result = await window.electronAPI.longwriting.updateMap(editingMapId.value, formData)
    if (result.success) {
      ElMessage.success('地图已更新')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } else {
    // 创建
    const result = await window.electronAPI.longwriting.createMap({
      projectId: props.projectId,
      ...formData
    })
    if (result.success) {
      ElMessage.success('地图已添加')
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  }

  showMapDialog.value = false
  editingMapId.value = null
  mapForm.value = {
    name: '',
    orientation: 'other',
    characteristics: ''
  }
  await loadMaps()
  emit('update:progress', 30)
}

// 显示生成地图图片对话框
function showGenerateMapImageDialog(map: any) {
  generatingImageMap.value = { id: map.id, name: map.name }
  // 自动选择第一个图像模型（如果还没有选择）
  if (!selectedImageModelKey.value && imageProviderModels?.value && imageProviderModels.value.length > 0) {
    const firstProvider = imageProviderModels.value[0]
    if (firstProvider.models.length > 0) {
      selectedImageModelKey.value = `${firstProvider.id}:${firstProvider.models[0].id}`
    }
  }
  showMapImageDialog.value = true
}

// 生成地图图片
async function generateMapImage() {
  if (!generatingImageMap.value || !selectedImageModel.value?.providerId) return

  generatingMapImage.value = true

  try {
    const result = await window.electronAPI.longwriting.generateMapImage(
      props.projectId,
      generatingImageMap.value.id,
      selectedImageModel.value.providerId,
      selectedImageModel.value.modelId
    )

    if (result.success) {
      ElMessage.success('地图图片已生成')
      await loadMaps()
    } else {
      ElMessage.error(result.error || '生成失败')
    }
  } catch (error: any) {
    ElMessage.error('生成失败: ' + error.message)
  } finally {
    generatingMapImage.value = false
    showMapImageDialog.value = false
    generatingImageMap.value = null
  }
}

// AI 生成地图数据
async function generateMapData() {
  if (!selectedModel.value?.providerId) {
    ElMessage.warning('请先选择 AI 模型')
    return
  }

  generatingMapData.value = true

  const eventId = `map-data-${props.projectId}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; data?: any; error?: string }) => {
      if (event.type === 'done') {
        generatingMapData.value = false
        unsubscribe()

        // 更新地图的 AI 生成数据
        if (event.data || event.content) {
          try {
            const data = event.data || (event.content ? JSON.parse(event.content) : null)
            if (data && editingMapId.value) {
              window.electronAPI.longwriting.updateMap(editingMapId.value, {
                aiGeneratedData: data
              })
              ElMessage.success('地图数据已生成')
              loadMaps()
            }
          } catch (e) {
            console.error('解析 AI 生成数据失败:', e)
          }
        }

        showAIMapDataDialog.value = false
        aiMapDataPrompt.value = ''
      } else if (event.type === 'error') {
        generatingMapData.value = false
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  // 调用生成接口
  const result = await window.electronAPI.longwriting.generateMapData(
    eventId,
    props.projectId,
    editingMapId.value || '',
    aiMapDataPrompt.value,
    selectedModel.value.providerId,
    selectedModel.value.modelId
  )

  if (!result.success) {
    generatingMapData.value = false
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 加载背景设定
async function loadBackground() {
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.getBackground(props.projectId)
  if (result.success && result.data) {
    eraForm.value = {
      eraType: result.data.eraType || 'ancient',
      eraDescription: result.data.eraDescription || '',
      socialStructure: result.data.socialStructure || '',
      techLevel: result.data.techLevel || '',
      specialRules: result.data.specialRules || '',
      factionDistribution: result.data.factionDistribution || '',
      geographicOrientation: result.data.geographicOrientation || ''
    }
  }
}

// 保存背景设定
async function saveBackground() {
  console.log('saveBackground 被调用, projectId:', props.projectId)
  if (!props.projectId) return

  saveStatus.value = 'saving'
  // 使用 toRaw 将响应式对象转换为普通对象，避免 IPC 序列化错误
  const data = toRaw(eraForm.value)
  console.log('准备调用 updateBackground, data:', data)
  try {
    const result = await window.electronAPI.longwriting.updateBackground(props.projectId, data)
    console.log('updateBackground 返回结果:', result)
    if (result.success) {
      saveStatus.value = 'saved'
      emit('update:progress', 25)
      ElMessage.success('背景设定已保存')
      setTimeout(() => {
        saveStatus.value = 'idle'
      }, 2000)
    } else {
      saveStatus.value = 'idle'
      ElMessage.error(result.error || '保存失败')
    }
  } catch (error) {
    console.error('updateBackground 调用出错:', error)
    saveStatus.value = 'idle'
    ElMessage.error('保存失败: ' + error)
  }
}

// 加载地点列表
async function loadLocations() {
  if (!props.projectId) return

  const result = await window.electronAPI.longwriting.getLocations(props.projectId)
  if (result.success) {
    locations.value = result.data || []
  }
}

function editLocation(location: any) {
  editingLocationId.value = location.id
  locationForm.value = {
    name: location.name,
    type: location.type,
    importance: location.importance,
    description: location.description,
    mapId: location.mapId || ''
  }
  showLocationDialog.value = true
}

async function deleteLocation(id: string) {
  const result = await window.electronAPI.longwriting.deleteLocation(id)
  if (result.success) {
    await loadLocations()
    ElMessage.success('地点已删除')
  }
}

async function saveLocation() {
  if (!locationForm.value.name) {
    ElMessage.warning('请输入地点名称')
    return
  }

  // 使用 toRaw 将响应式对象转换为普通对象
  const formData = toRaw(locationForm.value)

  if (editingLocationId.value) {
    // 更新
    const result = await window.electronAPI.longwriting.updateLocation(editingLocationId.value, formData)
    if (result.success) {
      ElMessage.success('地点已更新')
    }
  } else {
    // 创建
    const result = await window.electronAPI.longwriting.createLocation({
      projectId: props.projectId,
      ...formData
    })
    if (result.success) {
      ElMessage.success('地点已添加')
    }
  }

  showLocationDialog.value = false
  editingLocationId.value = null
  locationForm.value = {
    name: '',
    type: 'city',
    importance: 'important',
    description: '',
    mapId: ''
  }
  await loadLocations()
  emit('update:progress', 35)
}

// AI 润色功能
async function polishField(field: 'eraDescription' | 'socialStructure' | 'techLevel' | 'specialRules' | 'factionDistribution' | 'geographicOrientation') {
  if (!props.projectId) return

  // 检查是否选择了模型
  if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  const content = eraForm.value[field]
  if (!content.trim()) {
    ElMessage.warning('请先输入内容')
    return
  }

  polishingField.value = field
  polishingContent.value = ''

  const eventId = `polish-${props.projectId}-${field}-${Date.now()}`

  // 监听流式生成事件
  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; error?: string }) => {
      if (event.type === 'content' && event.content) {
        polishingContent.value += event.content
      } else if (event.type === 'done') {
        polishingField.value = null
        unsubscribe()
        // 更新表单内容
        eraForm.value[field] = polishingContent.value.trim()
        ElMessage.success('润色完成')
      } else if (event.type === 'error') {
        polishingField.value = null
        unsubscribe()
        ElMessage.error(event.error || '润色失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.polishBackground(
    eventId,
    props.projectId,
    field,
    eraForm.value.eraType,
    content,
    selectedModel.value.providerId,
    selectedModel.value.modelId
  )

  if (!result.success) {
    polishingField.value = null
    unsubscribe()
    ElMessage.error(result.error || '润色失败')
  }
}

// AI 生成地点建议
async function generateLocationsFromAI() {
  if (!props.projectId) return

  if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  generatingLocations.value = true
  aiLocationResults.value = []

  const eventId = `gen-locations-${props.projectId}-${Date.now()}`

  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; data?: any; error?: string }) => {
      if (event.type === 'done') {
        generatingLocations.value = false
        unsubscribe()

        try {
          const data = event.data || (event.content ? JSON.parse(event.content) : null)
          if (data && Array.isArray(data)) {
            aiLocationResults.value = data.map((item: any) => ({ ...item, selected: true }))
            showAILocationDialog.value = true
          } else {
            ElMessage.warning('未生成有效的地点建议')
          }
        } catch (e) {
          console.error('解析地点数据失败:', e)
          ElMessage.error('解析地点数据失败')
        }
      } else if (event.type === 'error') {
        generatingLocations.value = false
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.generateLocations(
    eventId,
    props.projectId,
    selectedModel.value.providerId,
    selectedModel.value.modelId
  )

  if (!result.success) {
    generatingLocations.value = false
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 采纳选中的地点
async function adoptSelectedLocations() {
  const selectedItems = aiLocationResults.value.filter(item => item.selected)
  if (selectedItems.length === 0) {
    ElMessage.warning('请至少选择一个地点')
    return
  }

  let successCount = 0
  for (const item of selectedItems) {
    const result = await window.electronAPI.longwriting.createLocation({
      projectId: props.projectId,
      name: item.name,
      type: item.type,
      importance: item.importance,
      description: item.description,
      mapId: item.suggestedMapId || undefined
    })
    if (result.success) {
      successCount++
    }
  }

  ElMessage.success(`已添加 ${successCount} 个地点`)
  showAILocationDialog.value = false
  aiLocationResults.value = []
  await loadLocations()
  emit('update:progress', 35)
}

// AI 生成势力建议
async function generateFactionsFromAI() {
  if (!props.projectId) return

  if (!selectedModel.value?.providerId || !selectedModel.value?.modelId) {
    ElMessage.warning('请先在顶部选择 AI 模型')
    return
  }

  generatingFactions.value = true
  aiFactionResults.value = []

  const eventId = `gen-factions-${props.projectId}-${Date.now()}`

  const unsubscribe = window.electronAPI.longwriting.onGenerateEvent(
    eventId,
    (event: { type: string; content?: string; data?: any; error?: string }) => {
      if (event.type === 'done') {
        generatingFactions.value = false
        unsubscribe()

        try {
          const data = event.data || (event.content ? JSON.parse(event.content) : null)
          if (data && Array.isArray(data)) {
            aiFactionResults.value = data.map((item: any) => ({ ...item, selected: true }))
            showAIFactionDialog.value = true
          } else {
            ElMessage.warning('未生成有效的势力建议')
          }
        } catch (e) {
          console.error('解析势力数据失败:', e)
          ElMessage.error('解析势力数据失败')
        }
      } else if (event.type === 'error') {
        generatingFactions.value = false
        unsubscribe()
        ElMessage.error(event.error || '生成失败')
      }
    }
  )

  const result = await window.electronAPI.longwriting.generateFactions(
    eventId,
    props.projectId,
    selectedModel.value.providerId,
    selectedModel.value.modelId
  )

  if (!result.success) {
    generatingFactions.value = false
    unsubscribe()
    ElMessage.error(result.error || '生成失败')
  }
}

// 采纳选中的势力
async function adoptSelectedFactions() {
  const selectedItems = aiFactionResults.value.filter(item => item.selected)
  if (selectedItems.length === 0) {
    ElMessage.warning('请至少选择一个势力')
    return
  }

  let successCount = 0
  for (const item of selectedItems) {
    // 尝试匹配地点ID
    let locationId: string | undefined = undefined
    if (item.suggestedLocationName) {
      const matchedLocation = locations.value.find(
        loc => loc.name === item.suggestedLocationName
      )
      if (matchedLocation) {
        locationId = matchedLocation.id
      }
    }

    const result = await window.electronAPI.longwriting.createFaction({
      projectId: props.projectId,
      factionType: item.factionType,
      name: item.name,
      locationId: locationId,
      description: item.description
    })
    if (result.success) {
      successCount++
    }
  }

  ElMessage.success(`已添加 ${successCount} 个势力`)
  showAIFactionDialog.value = false
  aiFactionResults.value = []
  await loadFactions()
  emit('update:progress', 35)
}

onMounted(() => {
  loadBackground()
  loadMaps()
  loadLocations()
  loadFactions()
})
</script>

<style lang="scss" scoped>
.background-stage {
  max-width: 900px;
  margin: 0 auto;
}

.stage-header {
  margin-bottom: 12px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  .header-left {
    h2 {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color-primary);
      margin: 0 0 4px 0;
    }

    .stage-desc {
      font-size: 13px;
      color: var(--text-color-secondary);
      margin: 0;
    }
  }

  .save-status {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 16px;

    &.saving {
      color: var(--color-primary);
      background: var(--color-primary-light-9);
    }

    &.saved {
      color: var(--color-success);
      background: var(--color-success-light-9);
    }
  }
}

.background-tabs {
  :deep(.el-tabs__content) {
    padding: 20px 0;
  }
}

.era-form {
  background: var(--bg-color);
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
}

.form-row {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color-regular);
  margin-bottom: 8px;
}

.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;

  .form-label {
    margin-bottom: 0;
  }
}

.era-type-group {
  display: flex;
  gap: 0;

  :deep(.el-radio-button__inner) {
    border-radius: 0;
  }

  :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-radius: 8px 0 0 8px;
  }

  :deep(.el-radio-button:last-child .el-radio-button__inner) {
    border-radius: 0 8px 8px 0;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  margin-top: 8px;
  border-top: 1px solid var(--border-color-lighter);
}

.location-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.location-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px;
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }

  .location-info {
    flex: 1;

    h4 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--text-color-primary);
    }

    .location-tags {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .location-desc {
      margin: 0;
      font-size: 13px;
      color: var(--text-color-secondary);
      line-height: 1.6;
    }
  }

  .location-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .location-actions {
    opacity: 1;
  }
}

.add-location-btn {
  width: 100%;
  border-style: dashed;
}

// 势力设定样式
.faction-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.faction-filter {
  display: flex;
  justify-content: flex-start;
}

.faction-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.faction-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px;
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }

  .faction-info {
    flex: 1;

    .faction-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;

      h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
        color: var(--text-color-primary);
      }
    }

    .faction-location {
      font-size: 13px;
      color: var(--text-color-secondary);
      margin-bottom: 8px;

      .label {
        color: var(--text-color-placeholder);
      }
    }

    .faction-desc {
      margin: 0;
      font-size: 13px;
      color: var(--text-color-secondary);
      line-height: 1.6;
    }
  }

  .faction-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .faction-actions {
    opacity: 1;
  }
}

.add-faction-btn {
  width: 100%;
  border-style: dashed;
}

// 地图设定样式
.map-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.map-card {
  display: flex;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-color);
  border-radius: 12px;
  border: 1px solid var(--border-color-light);
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }

  .map-image {
    width: 120px;
    height: 90px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &.map-image-placeholder {
      background: var(--fill-color-light);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-color-placeholder);

      span {
        font-size: 12px;
        margin-top: 4px;
      }
    }
  }

  .map-info {
    flex: 1;
    min-width: 0;

    h4 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--text-color-primary);
    }

    .map-tags {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .map-desc {
      margin: 0;
      font-size: 13px;
      color: var(--text-color-secondary);
      line-height: 1.6;
    }

    .map-ai-data {
      margin-top: 12px;

      :deep(.el-collapse) {
        border: none;
      }

      :deep(.el-collapse-item__header) {
        font-size: 13px;
        color: var(--color-primary);
        background: transparent;
        height: 32px;
        line-height: 32px;
      }

      .ai-data-content {
        font-size: 13px;
        color: var(--text-color-secondary);

        > div {
          margin-bottom: 8px;

          strong {
            color: var(--text-color-regular);
          }
        }
      }
    }
  }

  .map-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .map-actions {
    opacity: 1;
  }
}

.add-map-btn {
  width: 100%;
  border-style: dashed;
}

// Tab 操作按钮区域
.tab-actions {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-color);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
}

// AI 生成结果对话框样式
.dialog-tip {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--text-color-secondary);
}

.ai-result-list {
  max-height: 400px;
  overflow-y: auto;
}

.ai-result-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--fill-color-lighter);
  border-radius: 8px;
  transition: all 0.2s;

  &:hover {
    background: var(--fill-color-light);
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.ai-result-content {
  flex: 1;
  min-width: 0;
}

.ai-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.ai-result-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-color-primary);
}

.ai-result-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.6;
}

.disabled-tab {
  color: var(--text-color-placeholder);
  cursor: not-allowed;
}
</style>