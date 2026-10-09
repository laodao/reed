<template>
  <div class="settings-page">
    <div class="page-header">
      <h2>系统设置</h2>
      <p>配置应用程序的各项参数</p>
    </div>

    <div class="settings-content">
      <el-tabs v-model="activeTab" tab-position="left" class="settings-tabs">
        <!-- 外观设置 -->
        <el-tab-pane label="外观设置" name="appearance">
          <div class="settings-section">
            <h3>主题颜色</h3>
            <p class="section-desc">选择你喜欢的主题颜色，让界面更具个性化</p>

            <div class="theme-grid">
              <div
                v-for="theme in availableThemes"
                :key="theme.id"
                class="theme-card"
                :class="{ active: currentTheme === theme.id }"
                @click="changeTheme(theme.id)"
              >
                <div class="theme-preview" :style="{ background: theme.gradient }">
                  <div class="theme-preview-inner">
                    <div class="preview-circle"></div>
                    <div class="preview-lines">
                      <div class="preview-line"></div>
                      <div class="preview-line short"></div>
                    </div>
                  </div>
                  <transition name="check">
                    <div v-if="currentTheme === theme.id" class="theme-check">
                      <el-icon :size="20"><Check /></el-icon>
                    </div>
                  </transition>
                </div>
                <div class="theme-info">
                  <span class="theme-name">{{ theme.name }}</span>
                  <span class="theme-desc">{{ theme.description }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h3>界面皮肤</h3>
            <p class="section-desc">选择界面整体风格，与主题颜色自由组合</p>
            <div class="skin-options">
              <div
                v-for="skin in SKIN_OPTIONS"
                :key="skin.id"
                class="skin-card"
                :class="{ active: currentSkin === skin.id }"
                @click="setSkin(skin.id)"
              >
                <div class="skin-preview" :class="skin.id">
                  <div class="skin-preview-sidebar"></div>
                  <div class="skin-preview-main"></div>
                </div>
                <div class="skin-info">
                  <span class="skin-name">{{ skin.name }}</span>
                  <span class="skin-desc">{{ skin.description }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h3>界面设置</h3>
            <el-form label-width="100px">
              <el-form-item label="字体大小">
                <el-radio-group v-model="settings.fontSize" @change="saveSettings" class="radio-group">
                  <el-radio-button value="small">小</el-radio-button>
                  <el-radio-button value="medium">中</el-radio-button>
                  <el-radio-button value="large">大</el-radio-button>
                </el-radio-group>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- AI Hub 账号（统一网关：登录即用，免配 Key） -->
        <el-tab-pane label="AI Hub 账号" name="aihub">
          <AihubSettings />
        </el-tab-pane>

        <!-- AI 模型配置 -->
        <el-tab-pane label="AI 模型配置" name="aiModels">
          <div class="settings-section">
            <div class="section-header">
              <div>
                <h3>提供商配置</h3>
                <p class="section-desc">配置各 AI 服务提供商的 API 密钥和参数</p>
              </div>
              <el-button type="primary" @click="openAddDialog">
                <el-icon><Plus /></el-icon>
                添加提供商
              </el-button>
            </div>

            <!-- 已配置的提供商列表 -->
            <div v-if="providerConfigs.length > 0" class="provider-config-list">
              <div
                v-for="config in providerConfigs"
                :key="config.id"
                class="provider-config-item"
                :class="{ disabled: !config.isEnabled, 'is-default': config.isDefault }"
              >
                <div class="config-icon">
                  <FaviconIcon :url="getTemplateSiteUrl(config.templateId)" :size="28" :fallback="getTemplateIcon(config.templateId)" />
                </div>
                <div class="config-info">
                  <div class="config-header">
                    <span class="config-name">{{ config.name }}</span>
                    <el-tag v-if="config.isDefault" type="success" size="small" effect="plain">
                      默认
                    </el-tag>
                    <el-tag
                      :type="config.testResult === 'success' ? 'success' : config.testResult === 'failed' ? 'danger' : 'info'"
                      size="small"
                      effect="light"
                    >
                      {{ config.testResult === 'success' ? '已验证' : config.testResult === 'failed' ? '验证失败' : '未验证' }}
                    </el-tag>
                  </div>
                  <div class="config-details">
                    <span class="config-template">{{ getTemplateName(config.templateId) }}</span>
                    <span v-if="config.baseUrl" class="config-endpoint">
                      端点: {{ config.baseUrl }}
                    </span>
                    <span v-if="config.models && config.models.length > 0" class="config-models">
                      模型: {{ config.models.length }}
                    </span>
                  </div>
                </div>
                <div class="config-actions">
                  <el-switch v-model="config.isEnabled" @change="toggleConfigEnabled(config)" />
                  <el-button size="small" @click="editConfig(config)">编辑</el-button>
                  <el-button
                    v-if="!config.isDefault"
                    size="small"
                    type="primary"
                    text
                    @click="setDefaultConfig(config)"
                  >
                    设为默认
                  </el-button>
                  <el-button size="small" type="danger" text @click="deleteConfig(config)">
                    删除
                  </el-button>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else class="empty-state">
              <div class="empty-icon">🔌</div>
              <p>还没有配置任何 AI 提供商</p>
              <el-button type="primary" @click="openAddDialog">
                添加第一个提供商
              </el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- 工具设置（P0：第三方 API 凭据/自定义工具/预设工具） -->
        <el-tab-pane label="工具" name="tools">
          <ToolSettings />
        </el-tab-pane>

        <!-- 参数设置：按模块分 Tab 的参数配置（2026-09-13 第二轮：由「AI 预算（高级）」升级而来） -->
        <el-tab-pane label="参数设置" name="moduleParams">
          <ModuleParamsSettings />
        </el-tab-pane>

        <!-- 邮箱账号（邮件收发工具账号配置） -->
        <el-tab-pane label="邮箱账号" name="email">
          <EmailSettings />
        </el-tab-pane>

        <!-- 数据源（工作流「数据表」节点连接的外部数据库） -->
        <el-tab-pane label="数据库数据源" name="datasource">
          <DataSourceManager />
        </el-tab-pane>

        <!-- 数据管理 -->
        <el-tab-pane label="数据路径" name="data">
          <div class="settings-section">
            <h3>数据存储路径</h3>
            <p class="section-desc">设置应用程序数据的存储位置，包括数据库、生成的图片、语音文件等</p>

            <el-form label-width="100px">
              <el-form-item label="当前路径">
                <el-input v-model="dataPathConfig.dataPath" disabled class="path-input">
                  <template #append>
                    <el-button @click="openDataFolder">
                      <el-icon><FolderOpened /></el-icon>
                      打开目录
                    </el-button>
                  </template>
                </el-input>
                <div class="path-info">
                  <el-tag v-if="dataPathConfig.isDefault" type="info" size="small">默认路径</el-tag>
                  <el-tag v-else type="success" size="small">自定义路径</el-tag>
                </div>
              </el-form-item>

              <el-form-item label="数据大小">
                <div class="size-info">
                  <span class="total-size">{{ formatSize(dataSizeInfo.total) }}</span>
                  <el-popover placement="right" :width="300" trigger="click">
                    <template #reference>
                      <el-button text size="small">
                        <el-icon><InfoFilled /></el-icon>
                        查看详情
                      </el-button>
                    </template>
                    <div class="size-details">
                      <div class="size-item">
                        <span>数据库</span>
                        <span>{{ formatSize(dataSizeInfo.details.database) }}</span>
                      </div>
                      <div class="size-item">
                        <span>图片</span>
                        <span>{{ formatSize(dataSizeInfo.details.images) }}</span>
                      </div>
                      <div class="size-item">
                        <span>语音</span>
                        <span>{{ formatSize(dataSizeInfo.details.voice) }}</span>
                      </div>
                      <div class="size-item">
                        <span>翻译</span>
                        <span>{{ formatSize(dataSizeInfo.details.translations) }}</span>
                      </div>
                    </div>
                  </el-popover>
                </div>
              </el-form-item>
            </el-form>

            <div class="path-actions">
              <el-button type="primary" @click="handleChangePath">
                <el-icon><Folder /></el-icon>
                更改路径
              </el-button>
              <el-button v-if="!dataPathConfig.isDefault" @click="handleResetPath">
                恢复默认路径
              </el-button>
            </div>
          </div>

          <div class="settings-section">
            <h3>数据操作</h3>
            <div class="action-buttons">
              <el-button @click="exportData" class="action-btn">
                <el-icon><Download /></el-icon>
                导出数据
              </el-button>
              <el-button @click="importData" class="action-btn">
                <el-icon><Upload /></el-icon>
                导入数据
              </el-button>
              <el-button type="danger" @click="clearAllData" class="action-btn danger">
                <el-icon><Delete /></el-icon>
                清除所有数据
              </el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- 搜索引擎配置 -->
        <el-tab-pane label="搜索引擎" name="searchEngine">
          <div class="settings-section">
            <div class="section-header">
              <div>
                <h3>搜索引擎配置</h3>
                <p class="section-desc">预置智谱 AI、Tavily、Perplexity、DeepSeek、博查、必应 API、Google 等 API 型搜索引擎（需 API Key），支持自定义搜索引擎</p>
              </div>
              <el-button type="primary" @click="openAddSearchEngineDialog">
                <el-icon><Plus /></el-icon>
                添加配置
              </el-button>
            </div>

            <!-- 快速搜索引擎（不需要配置） -->
            <div class="search-engine-group">
              <h4 class="group-title">快速搜索</h4>
              <p class="group-desc">以下搜索引擎无需配置，可直接使用</p>
              <div class="quick-engine-list">
                <div
                  v-for="engine in quickSearchEngines"
                  :key="engine.id"
                  class="quick-engine-item"
                  :class="{ disabled: disabledQuickEngines.includes(engine.id) }"
                >
                  <div class="engine-icon">
                    <FaviconIcon :url="engine.siteUrl" :size="20" :fallback="engine.icon" />
                  </div>
                  <div class="engine-info">
                    <span class="engine-name">{{ engine.name }}</span>
                    <span class="engine-desc">{{ engine.description }}</span>
                  </div>
                  <el-switch
                    :model-value="!disabledQuickEngines.includes(engine.id)"
                    @change="(val: boolean) => toggleQuickEngineEnabled(engine.id, val)"
                  />
                </div>
              </div>
            </div>

            <!-- 已配置的搜索引擎列表 -->
            <div v-if="searchEngineConfigs.length > 0" class="search-engine-group">
              <h4 class="group-title">已配置的搜索引擎</h4>
              <div class="provider-config-list">
                <div
                  v-for="config in searchEngineConfigs"
                  :key="config.id"
                  class="provider-config-item"
                  :class="{ disabled: !config.isEnabled, 'is-default': config.isDefault }"
                >
                  <div class="config-icon">
                    <FaviconIcon :url="getSearchEngineTemplateSiteUrl(config.templateId)" :size="28" :fallback="getSearchEngineTemplateIcon(config.templateId)" />
                  </div>
                  <div class="config-info">
                    <div class="config-header">
                      <span class="config-name">{{ config.name }}</span>
                      <el-tag v-if="config.isDefault" type="success" size="small" effect="plain">
                        默认
                      </el-tag>
                      <el-tag
                        :type="config.testResult === 'success' ? 'success' : config.testResult === 'failed' ? 'danger' : 'info'"
                        size="small"
                        effect="light"
                      >
                        {{ config.testResult === 'success' ? '已验证' : config.testResult === 'failed' ? '验证失败' : '未验证' }}
                      </el-tag>
                    </div>
                    <div class="config-details">
                      <span class="config-template">{{ getSearchEngineTemplateName(config.templateId) }}</span>
                    </div>
                  </div>
                  <div class="config-actions">
                    <el-switch
                      v-model="config.isEnabled"
                      @change="toggleSearchEngineEnabled(config)"
                    />
                    <el-button
                      text
                      size="small"
                      @click="testSearchEngineConfig(config)"
                      :loading="config.testing"
                    >
                      测试
                    </el-button>
                    <el-button
                      text
                      size="small"
                      @click="setDefaultSearchEngine(config)"
                      :disabled="config.isDefault"
                    >
                      设为默认
                    </el-button>
                    <el-dropdown trigger="click">
                      <el-button text size="small">
                        <el-icon><MoreFilled /></el-icon>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item @click="editSearchEngineConfig(config)">
                            编辑
                          </el-dropdown-item>
                          <el-dropdown-item @click="deleteSearchEngineConfig(config)" divided>
                            删除
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="empty-config">
              <p>暂无已配置的搜索引擎</p>
              <p class="hint">智谱 AI、Tavily、Perplexity、DeepSeek、博查等 API 型搜索引擎需要配置 API Key 后才能使用</p>
            </div>
          </div>
        </el-tab-pane>

        <!-- 信息来源设置（类别 = 一个 Tab；内置「新闻来源」为其一） -->
        <el-tab-pane label="信息来源" name="infoSources">
          <div class="settings-section">
            <div class="section-header">
              <div>
                <h3>信息来源</h3>
                <p class="section-desc">
                  管理外部信息源（媒体 / 专栏 / 站点）——按来源类别分 Tab，工作流「信息采集」节点与各业务模块（领域学习等）可多选引用
                </p>
              </div>
              <div class="section-header-actions">
                <el-button type="primary" plain @click="openAddSourceCategoryDialog">
                  <el-icon><Plus /></el-icon>
                  添加类别
                </el-button>
                <el-button type="primary" plain @click="openAddInfoSourceTopicDialog">
                  <el-icon><Plus /></el-icon>
                  添加分组
                </el-button>
                <el-button type="primary" @click="openAddInfoSourceDialog">
                  <el-icon><Plus /></el-icon>
                  添加来源
                </el-button>
              </div>
            </div>

            <!-- 类别 Tab：新增类别即多一个 Tab -->
            <el-tabs
              v-if="infoSourceCategories.length"
              v-model="activeSourceCategory"
              type="card"
              class="source-category-tabs"
            >
              <el-tab-pane
                v-for="category in infoSourceCategories"
                :key="category.id"
                :name="category.id"
              >
                <template #label>
                  <span class="source-category-label">
                    {{ category.name }}
                    <span class="source-category-count">{{ sourcesOfCategory(category.id).length }}</span>
                  </span>
                </template>

                <div class="source-category-toolbar">
                  <span class="source-category-desc">
                    <el-tag v-if="category.isBuiltin" type="warning" size="small" effect="plain">内置类别</el-tag>
                    分组用于归类来源；不选分组的来源统一放在「{{ INFO_SOURCE_DEFAULT_TOPIC_NAME }}」
                  </span>
                  <div v-if="!category.isBuiltin" class="group-title-actions">
                    <el-button text size="small" @click="editSourceCategory(category)">改类别名</el-button>
                    <el-button text type="danger" size="small" @click="deleteSourceCategory(category)">删除类别</el-button>
                  </div>
                </div>

                <!-- 分组折叠列表（点击分组标题折叠/展开其下来源） -->
                <div
                  v-for="topic in topicsOfCategory(category.id)"
                  :key="topic.id"
                  class="search-engine-group news-topic-group"
                >
                  <div
                    class="group-title-row news-topic-header"
                    :class="{ collapsed: isTopicCollapsed(topic.id) }"
                    @click="toggleTopic(topic.id)"
                  >
                    <div class="news-topic-title">
                      <el-icon class="topic-chevron"><ArrowRight /></el-icon>
                      <h4 class="group-title">{{ topic.name }}（{{ sourcesOfTopic(topic.id).length }}）</h4>
                      <el-tag v-if="topic.isDefault" type="info" size="small" effect="plain">未分组</el-tag>
                      <el-tag v-else-if="topic.isBuiltin" type="warning" size="small" effect="plain">内置</el-tag>
                    </div>
                    <div class="group-title-actions" @click.stop>
                      <el-button v-if="canEditInfoSourceTopic(topic)" text size="small" @click="editInfoSourceTopic(topic)">改分组名</el-button>
                      <el-button v-if="canEditInfoSourceTopic(topic)" text type="danger" size="small" @click="deleteInfoSourceTopic(topic)">删除分组</el-button>
                    </div>
                  </div>
                  <transition name="topic-collapse">
                    <div v-show="!isTopicCollapsed(topic.id)" class="news-topic-body">
                      <div v-if="sourcesOfTopic(topic.id).length" class="provider-config-list">
                        <div
                          v-for="source in sourcesOfTopic(topic.id)"
                          :key="source.id"
                          class="provider-config-item"
                          :class="{ disabled: !source.enabled, 'is-default': false }"
                        >
                          <div class="config-icon">
                            <FaviconIcon :url="source.url" :size="28" fallback="📰" />
                          </div>
                          <div class="config-info">
                            <div class="config-header">
                              <span class="config-name">{{ source.name }}</span>
                              <el-tag v-if="source.isBuiltin" type="warning" size="small" effect="plain">内置</el-tag>
                              <el-tag v-else type="success" size="small" effect="plain">自定义</el-tag>
                            </div>
                            <div class="config-details">
                              <span class="config-template" :title="source.url">{{ source.url }}</span>
                            </div>
                          </div>
                          <div class="config-actions">
                            <el-switch v-model="source.enabled" @change="toggleInfoSourceEnabled(source)" />
                            <el-button text size="small" :disabled="source.isBuiltin" @click="editInfoSource(source)">编辑</el-button>
                            <el-button text type="danger" size="small" :disabled="source.isBuiltin" @click="deleteInfoSource(source)">删除</el-button>
                          </div>
                        </div>
                      </div>
                      <div v-else class="empty-config"><p>该分组暂无来源</p></div>
                    </div>
                  </transition>
                </div>

                <div v-if="!topicsOfCategory(category.id).length" class="empty-config">
                  <p>该类别暂无分组</p>
                  <p class="hint">直接「添加来源」会自动归入「{{ INFO_SOURCE_DEFAULT_TOPIC_NAME }}」；需要归类时可先「添加分组」</p>
                </div>
              </el-tab-pane>
            </el-tabs>
            <div v-else class="empty-config">
              <p>暂无信息来源类别</p>
              <p class="hint">点击「添加类别」创建（如 金融信息来源 / 物理信息来源）</p>
            </div>
          </div>
        </el-tab-pane>

        <!-- 图床设置 -->
        <el-tab-pane label="图床设置" name="oss">
          <div class="settings-section">
            <div class="section-header">
              <div>
                <h3>图床/OSS 配置</h3>
                <p class="section-desc">
                  配置图床服务，用于将本地图片上传到云端获取公网 URL。
                  <el-tag type="info" size="small" class="hint-tag">
                    视频生成功能需要公网图片地址
                  </el-tag>
                </p>
              </div>
              <el-button type="primary" @click="openAddOSSDialog">
                <el-icon><Plus /></el-icon>
                添加配置
              </el-button>
            </div>

            <!-- 已配置的 OSS 列表 -->
            <div v-if="ossConfigs.length > 0" class="oss-config-list">
              <div
                v-for="config in ossConfigs"
                :key="config.id"
                class="provider-config-item"
                :class="{ disabled: !config.isEnabled, 'is-default': config.isDefault }"
              >
                <div class="config-icon">
                  <span class="icon-text">{{ config.provider === 'aliyun' ? '阿里' : '火山' }}</span>
                </div>
                <div class="config-info">
                  <div class="config-name">
                    {{ config.name }}
                    <el-tag v-if="config.isDefault" type="success" size="small">默认</el-tag>
                    <el-tag v-if="!config.isEnabled" type="info" size="small">已禁用</el-tag>
                  </div>
                  <div class="config-details">
                    <span>{{ config.provider === 'aliyun' ? '阿里云 OSS' : '火山引擎 TOS' }}</span>
                    <span class="detail-separator">|</span>
                    <span>{{ config.region }}</span>
                    <span class="detail-separator">|</span>
                    <span>{{ config.bucket }}</span>
                  </div>
                </div>
                <div class="config-actions">
                  <el-switch
                    v-model="config.isEnabled"
                    size="small"
                    @change="toggleOSSEnabled(config)"
                  />
                  <el-button
                    type="primary"
                    size="small"
                    text
                    :loading="config.testing"
                    @click="testOSSConnection(config)"
                  >
                    测试
                  </el-button>
                  <el-button
                    v-if="!config.isDefault"
                    type="warning"
                    size="small"
                    text
                    @click="setDefaultOSS(config)"
                  >
                    设为默认
                  </el-button>
                  <el-dropdown trigger="click">
                    <el-button type="primary" size="small" text>
                      <el-icon><MoreFilled /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item @click="editOSSConfig(config)">
                          编辑
                        </el-dropdown-item>
                        <el-dropdown-item @click="deleteOSSConfig(config)" divided>
                          删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </div>

            <div v-else class="empty-config">
              <p>暂无已配置的图床</p>
              <p class="hint">
                <el-icon><InfoFilled /></el-icon>
                视频生成会自动使用百炼临时上传（有效期 48 小时）。配置自己的 OSS 可获得更稳定的服务。
              </p>
            </div>
          </div>
        </el-tab-pane>

        <!-- 关于 -->
        <el-tab-pane label="关于" name="about">
          <div class="settings-section about-section">
            <div class="app-logo">
              <div class="logo-circle">
                <span>TB</span>
              </div>
            </div>
            <h2 class="app-title gradient-text">The Bot</h2>
            <p class="app-version">版本 0.1.0</p>
            <p class="app-desc">AI 工具箱 - 集成多种 AI 能力的跨平台桌面应用</p>

            <div class="info-list">
              <div class="info-item">
                <span class="info-label">作者</span>
                <span class="info-value">Daoge</span>
              </div>
              <div class="info-item">
                <span class="info-label">许可证</span>
                <span class="info-value">MIT</span>
              </div>
              <div class="info-item">
                <span class="info-label">技术栈</span>
                <span class="info-value">Electron + Vue3 + TypeScript</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 添加/编辑提供商对话框 -->
    <AddProviderDialog
      v-model="showAddDialog"
      :edit-config="editingConfig"
      @saved="loadProviderConfigs"
    />

    <!-- 添加/编辑搜索引擎对话框 -->
    <AddSearchEngineDialog
      v-model="showAddSearchEngineDialog"
      :edit-config="editingSearchEngineConfig"
      :templates="searchEngineTemplates"
      :existing-configs="searchEngineConfigs"
      @saved="loadSearchEngineConfigs"
    />

    <!-- 添加/编辑信息来源对话框 -->
    <el-dialog
      v-model="showInfoSourceDialog"
      :title="editingInfoSource ? '编辑信息来源' : '添加信息来源'"
      width="480px"
      append-to-body
    >
      <el-form label-width="80px" size="small">
        <el-form-item label="类别">
          <el-select v-model="infoSourceForm.categoryId" style="width: 100%" @change="onInfoSourceCategoryChange">
            <el-option v-for="c in infoSourceCategories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分组">
          <el-select v-model="infoSourceForm.topicId" clearable style="width: 100%" placeholder="不选 = 归入「未分组」">
            <el-option
              v-for="t in selectableTopicsOfCategory(infoSourceForm.categoryId)"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="infoSourceForm.name" placeholder="如 MIT Technology Review / 量子位" />
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="infoSourceForm.url" placeholder="https://..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInfoSourceDialog = false">取消</el-button>
        <el-button type="primary" @click="saveInfoSource">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑信息来源分组对话框 -->
    <el-dialog
      v-model="showInfoSourceTopicDialog"
      :title="editingInfoSourceTopic ? '编辑分组' : '添加分组'"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px" label-position="left">
        <el-form-item label="类别">
          <el-select v-model="infoSourceTopicForm.categoryId" style="width: 100%">
            <el-option v-for="c in infoSourceCategories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分组名" required>
          <el-input v-model="infoSourceTopicForm.name" placeholder="如：行业媒体 / 学术论文 / 官方文档" @keyup.enter="saveInfoSourceTopic" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInfoSourceTopicDialog = false">取消</el-button>
        <el-button type="primary" @click="saveInfoSourceTopic">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑信息来源类别对话框 -->
    <el-dialog
      v-model="showSourceCategoryDialog"
      :title="editingSourceCategory ? '编辑类别' : '添加类别'"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px" label-position="left">
        <el-form-item label="类别名" required>
          <el-input v-model="sourceCategoryName" placeholder="如：金融信息来源 / 物理信息来源" @keyup.enter="saveSourceCategory" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSourceCategoryDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSourceCategory">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑 OSS 配置对话框 -->
    <el-dialog
      v-model="showAddOSSDialog"
      :title="editingOSSConfig ? '编辑图床配置' : '添加图床配置'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="ossFormRef"
        :model="ossForm"
        :rules="ossFormRules"
        label-width="120px"
        label-position="left"
      >
        <el-form-item label="配置名称" prop="name">
          <el-input v-model="ossForm.name" placeholder="请输入配置名称" />
        </el-form-item>

        <el-form-item label="提供商" prop="provider">
          <el-select v-model="ossForm.provider" placeholder="选择提供商">
            <el-option label="阿里云 OSS" value="aliyun" />
            <el-option label="火山引擎 TOS" value="volcengine" />
          </el-select>
        </el-form-item>

        <el-form-item label="AccessKey ID" prop="accessKeyId">
          <el-input
            v-model="ossForm.accessKeyId"
            :placeholder="editingOSSConfig ? '留空表示不修改' : '请输入 AccessKey ID'"
          />
        </el-form-item>

        <el-form-item label="AccessKey Secret" prop="accessKeySecret">
          <el-input
            v-model="ossForm.accessKeySecret"
            type="password"
            :placeholder="editingOSSConfig ? '留空表示不修改（已保存的密钥不回显）' : '请输入 AccessKey Secret'"
            show-password
          />
        </el-form-item>

        <el-form-item label="地域 (Region)" prop="region">
          <el-input v-model="ossForm.region" placeholder="如: oss-cn-hangzhou 或 cn-beijing" />
        </el-form-item>

        <el-form-item label="Bucket 名称" prop="bucket">
          <el-input v-model="ossForm.bucket" placeholder="请输入 Bucket 名称" />
        </el-form-item>

        <el-form-item label="Endpoint">
          <el-input v-model="ossForm.endpoint" placeholder="可选，如 oss-cn-hangzhou.aliyuncs.com（无需 https://）" />
        </el-form-item>

        <el-form-item label="自定义域名">
          <el-input v-model="ossForm.customDomain" placeholder="可选，CDN 加速域名" />
        </el-form-item>

        <el-form-item label="路径前缀">
          <el-input v-model="ossForm.pathPrefix" placeholder="可选，如 images/" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showAddOSSDialog = false">取消</el-button>
        <el-button type="primary" @click="saveOSSConfig" :loading="ossSaving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, FolderOpened, Download, Upload, Delete, Plus, Folder, InfoFilled, MoreFilled, ArrowRight } from '@element-plus/icons-vue'
import { useTheme, availableThemes } from '@/composables/useTheme'
import { useSkin, SKIN_OPTIONS } from '@/composables/useSkin'
import { useAppSettings, type FontSize, type Language } from '@/composables/useAppSettings'
import AddProviderDialog from '@/components/settings/AddProviderDialog.vue'
import AddSearchEngineDialog from '@/components/settings/AddSearchEngineDialog.vue'
import FaviconIcon from '@/components/common/FaviconIcon.vue'
import ToolSettings from '@/components/settings/ToolSettings.vue'
import EmailSettings from '@/components/settings/EmailSettings.vue'
import AihubSettings from '@/components/settings/AihubSettings.vue'
import ModuleParamsSettings from '@/components/settings/ModuleParamsSettings.vue'
import DataSourceManager from '@/components/settings/DataSourceManager.vue'
import type {
  ProviderTemplate,
  UserProviderConfig
} from '../../../shared/types/provider-template.types'
import type {
  SearchEngineTemplate,
  UserSearchEngineConfig
} from '../../../shared/types/search-engine.types'
import type { OSSConfig } from '../../../shared/types/oss.types'
import { INFO_SOURCE_DEFAULT_TOPIC_NAME } from '../../../shared/types/info-source.types'

// 定义组件名称用于 keep-alive
defineOptions({
  name: 'Settings'
})

// 主题名称直接用 useTheme.availableThemes 里的 name 字段（中文）

// 主题
const { currentTheme, setTheme } = useTheme()
const { currentSkin, setSkin } = useSkin()

// 应用设置
const { settings: appSettings, loadSettings: loadAppSettings, setFontSize, setLanguage } = useAppSettings()

// 当前标签（支持 ?tab= 定位，如 AI Hub 错误引导跳转 #/settings?tab=aihub）
const activeTab = ref((new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab')) || 'appearance')

// 本地设置状态（用于双向绑定）
const settings = reactive({
  language: appSettings.language,
  fontSize: appSettings.fontSize
})

// 数据路径配置
const dataPathConfig = ref({
  dataPath: '',
  isDefault: true
})

// 数据大小信息
const dataSizeInfo = ref({
  total: 0,
  details: {
    database: 0,
    images: 0,
    voice: 0,
    translations: 0,
    other: 0
  }
})

// 提供商配置
const providerConfigs = ref<UserProviderConfig[]>([])
const templates = ref<ProviderTemplate[]>([])
const showAddDialog = ref(false)
const editingConfig = ref<UserProviderConfig | undefined>(undefined)

// 搜索引擎配置
const searchEngineTemplates = ref<SearchEngineTemplate[]>([])
const searchEngineConfigs = ref<UserSearchEngineConfig[]>([])
const quickSearchEngines = ref<SearchEngineTemplate[]>([])
const disabledQuickEngines = ref<string[]>([])
const showAddSearchEngineDialog = ref(false)
const editingSearchEngineConfig = ref<UserSearchEngineConfig | undefined>(undefined)

// 信息来源（类别 → 分组 → 来源）
interface InfoSourceCategoryItem {
  id: string
  name: string
  isBuiltin: boolean
  sortOrder: number
}
interface InfoSourceTopicItem {
  id: string
  categoryId: string
  name: string
  isBuiltin: boolean
  isDefault: boolean
}
interface InfoSourceItem {
  id: string
  topicId: string
  categoryId: string
  name: string
  url: string
  isBuiltin: boolean
  enabled: boolean
  sortOrder: number
}

const infoSourceCategories = ref<InfoSourceCategoryItem[]>([])
const infoSourceTopics = ref<InfoSourceTopicItem[]>([])
const infoSources = ref<InfoSourceItem[]>([])
/** 当前选中的来源类别 Tab */
const activeSourceCategory = ref('')

// 来源对话框
const showInfoSourceDialog = ref(false)
const editingInfoSource = ref<InfoSourceItem | undefined>(undefined)
const infoSourceForm = reactive({ categoryId: '', topicId: '', name: '', url: '' })

// 分组对话框
const showInfoSourceTopicDialog = ref(false)
const editingInfoSourceTopic = ref<InfoSourceTopicItem | undefined>(undefined)
const infoSourceTopicForm = reactive({ categoryId: '', name: '' })

// 类别对话框
const showSourceCategoryDialog = ref(false)
const editingSourceCategory = ref<InfoSourceCategoryItem | undefined>(undefined)
const sourceCategoryName = ref('')

/** 已折叠的分组 id 集合（点击分组标题可折叠/展开其下来源） */
const collapsedTopicIds = ref<Set<string>>(new Set())

function isTopicCollapsed(topicId: string): boolean {
  return collapsedTopicIds.value.has(topicId)
}

function toggleTopic(topicId: string): void {
  const next = new Set(collapsedTopicIds.value)
  if (next.has(topicId)) next.delete(topicId)
  else next.add(topicId)
  collapsedTopicIds.value = next
}

function apiAny(): any {
  return (window as unknown as { electronAPI: any }).electronAPI
}

/** 类别列表（同时纠正 Tab 选中项：新增类别后自动切到新 Tab） */
async function loadInfoSourceCategories(preferId?: string): Promise<void> {
  try {
    const resp = await apiAny().infoSourceCategory.list()
    if (resp.success) {
      infoSourceCategories.value = resp.data ?? []
      const ids = infoSourceCategories.value.map(c => c.id)
      if (preferId && ids.includes(preferId)) activeSourceCategory.value = preferId
      else if (!ids.includes(activeSourceCategory.value)) activeSourceCategory.value = ids[0] ?? ''
    } else console.warn('[Settings] 信息来源类别加载失败', resp.error)
  } catch (e) {
    console.warn('[Settings] 信息来源类别加载异常', e)
  }
}

async function loadInfoSourceTopics(): Promise<void> {
  try {
    const resp = await apiAny().infoSourceTopic.list({})
    if (resp.success) infoSourceTopics.value = resp.data ?? []
    else console.warn('[Settings] 信息来源分组加载失败', resp.error)
  } catch (e) {
    console.warn('[Settings] 信息来源分组加载异常', e)
  }
}

async function loadInfoSources(): Promise<void> {
  try {
    const resp = await apiAny().infoSource.list({})
    if (resp.success) infoSources.value = resp.data ?? []
    else console.warn('[Settings] 信息来源加载失败', resp.error)
  } catch (e) {
    console.warn('[Settings] 信息来源加载异常', e)
  }
}

function topicsOfCategory(categoryId: string): InfoSourceTopicItem[] {
  return infoSourceTopics.value.filter(t => t.categoryId === categoryId)
}

/** 可选分组（默认分组「未分组」不出现在下拉里：留空即表示不分组） */
function selectableTopicsOfCategory(categoryId: string): InfoSourceTopicItem[] {
  return topicsOfCategory(categoryId).filter(t => !t.isDefault)
}

function sourcesOfTopic(topicId: string): InfoSourceItem[] {
  return infoSources.value.filter(s => s.topicId === topicId)
}

function sourcesOfCategory(categoryId: string): InfoSourceItem[] {
  return infoSources.value.filter(s => s.categoryId === categoryId)
}

/** 分组可否改名/删除（内置分组与默认分组「未分组」均不可） */
function canEditInfoSourceTopic(topic: InfoSourceTopicItem): boolean {
  return !topic.isBuiltin && !topic.isDefault
}

// ---- 类别增删改 ----

function openAddSourceCategoryDialog(): void {
  editingSourceCategory.value = undefined
  sourceCategoryName.value = ''
  showSourceCategoryDialog.value = true
}

function editSourceCategory(category: InfoSourceCategoryItem): void {
  if (category.isBuiltin) return
  editingSourceCategory.value = category
  sourceCategoryName.value = category.name
  showSourceCategoryDialog.value = true
}

async function saveSourceCategory(): Promise<void> {
  const name = sourceCategoryName.value.trim()
  if (!name) { ElMessage.warning('请输入类别名'); return }
  const api = apiAny()
  const resp = editingSourceCategory.value
    ? await api.infoSourceCategory.update({ id: editingSourceCategory.value.id, name })
    : await api.infoSourceCategory.create({ name })
  if (!resp.success) { ElMessage.error(resp.error ?? '保存失败'); return }
  ElMessage.success(editingSourceCategory.value ? '类别已更新' : '类别已创建')
  showSourceCategoryDialog.value = false
  await loadInfoSourceCategories(resp.data?.id)
}

async function deleteSourceCategory(category: InfoSourceCategoryItem): Promise<void> {
  if (category.isBuiltin) return
  try {
    await ElMessageBox.confirm(
      `删除类别「${category.name}」？其下全部分组与来源将一并删除。`,
      '删除类别',
      { type: 'warning' },
    )
  } catch {
    return
  }
  const resp = await apiAny().infoSourceCategory.delete(category.id)
  if (!resp.success) { ElMessage.error(resp.error ?? '删除失败'); return }
  ElMessage.success('类别已删除')
  await loadInfoSourceCategories()
  await loadInfoSourceTopics()
  await loadInfoSources()
}

// ---- 分组增删改 ----

function openAddInfoSourceTopicDialog(): void {
  if (!infoSourceCategories.value.length) { ElMessage.warning('请先添加来源类别'); return }
  editingInfoSourceTopic.value = undefined
  infoSourceTopicForm.categoryId = activeSourceCategory.value || infoSourceCategories.value[0].id
  infoSourceTopicForm.name = ''
  showInfoSourceTopicDialog.value = true
}

function editInfoSourceTopic(topic: InfoSourceTopicItem): void {
  if (!canEditInfoSourceTopic(topic)) return
  editingInfoSourceTopic.value = topic
  infoSourceTopicForm.categoryId = topic.categoryId
  infoSourceTopicForm.name = topic.name
  showInfoSourceTopicDialog.value = true
}

async function saveInfoSourceTopic(): Promise<void> {
  const name = infoSourceTopicForm.name.trim()
  if (!name) { ElMessage.warning('请输入分组名'); return }
  if (!infoSourceTopicForm.categoryId) { ElMessage.warning('请选择类别'); return }
  const api = apiAny()
  const resp = editingInfoSourceTopic.value
    ? await api.infoSourceTopic.update({ id: editingInfoSourceTopic.value.id, name, categoryId: infoSourceTopicForm.categoryId })
    : await api.infoSourceTopic.create({ categoryId: infoSourceTopicForm.categoryId, name })
  if (!resp.success) { ElMessage.error(resp.error ?? '保存失败'); return }
  ElMessage.success(editingInfoSourceTopic.value ? '分组已更新' : '分组已创建')
  showInfoSourceTopicDialog.value = false
  await loadInfoSourceTopics()
  if (infoSourceTopicForm.categoryId) activeSourceCategory.value = infoSourceTopicForm.categoryId
}

async function deleteInfoSourceTopic(topic: InfoSourceTopicItem): Promise<void> {
  if (!canEditInfoSourceTopic(topic)) return
  try {
    await ElMessageBox.confirm(`删除分组「${topic.name}」？其下全部来源将一并删除。`, '删除分组', { type: 'warning' })
  } catch {
    return
  }
  const resp = await apiAny().infoSourceTopic.delete(topic.id)
  if (!resp.success) { ElMessage.error(resp.error ?? '删除失败'); return }
  ElMessage.success('分组已删除')
  await loadInfoSourceTopics()
  await loadInfoSources()
}

// ---- 来源增删改 ----

function openAddInfoSourceDialog(): void {
  if (!infoSourceCategories.value.length) { ElMessage.warning('请先添加来源类别'); return }
  editingInfoSource.value = undefined
  infoSourceForm.categoryId = activeSourceCategory.value || infoSourceCategories.value[0].id
  infoSourceForm.topicId = ''
  infoSourceForm.name = ''
  infoSourceForm.url = ''
  showInfoSourceDialog.value = true
}

/** 切换类别时清空分组（原分组属于另一个类别） */
function onInfoSourceCategoryChange(): void {
  infoSourceForm.topicId = ''
}

function editInfoSource(source: InfoSourceItem): void {
  editingInfoSource.value = source
  infoSourceForm.categoryId = source.categoryId
  // 默认分组（未分组）在下拉里以「留空」表示
  const topic = infoSourceTopics.value.find(t => t.id === source.topicId)
  infoSourceForm.topicId = topic?.isDefault ? '' : source.topicId
  infoSourceForm.name = source.name
  infoSourceForm.url = source.url
  showInfoSourceDialog.value = true
}

async function saveInfoSource(): Promise<void> {
  const name = infoSourceForm.name.trim()
  const url = infoSourceForm.url.trim()
  if (!infoSourceForm.categoryId) { ElMessage.warning('请选择类别'); return }
  if (!name || !url) { ElMessage.warning('请填写名称与 URL'); return }
  if (!/^https?:\/\//i.test(url)) { ElMessage.warning('URL 需以 http:// 或 https:// 开头'); return }
  const api = apiAny()
  // topicId 为空串 = 归入该类别的「未分组」（后端按需创建默认分组）
  const payload = { categoryId: infoSourceForm.categoryId, topicId: infoSourceForm.topicId, name, url }
  const resp = editingInfoSource.value
    ? await api.infoSource.update({ id: editingInfoSource.value.id, ...payload })
    : await api.infoSource.create(payload)
  if (!resp.success) { ElMessage.error(resp.error ?? '保存失败'); return }
  ElMessage.success(editingInfoSource.value ? '已更新' : '已添加')
  showInfoSourceDialog.value = false
  await loadInfoSourceTopics()
  await loadInfoSources()
}

async function deleteInfoSource(source: InfoSourceItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除信息来源「${source.name}」？`, '删除来源', { type: 'warning' })
  } catch {
    return
  }
  const resp = await apiAny().infoSource.delete(source.id)
  if (resp.success) { ElMessage.success('已删除'); await loadInfoSources() }
  else ElMessage.error(resp.error ?? '删除失败')
}

async function toggleInfoSourceEnabled(source: InfoSourceItem): Promise<void> {
  const resp = await apiAny().infoSource.update({ id: source.id, enabled: source.enabled })
  if (!resp.success) {
    source.enabled = !source.enabled // 回滚
    ElMessage.error(resp.error ?? '更新失败')
  }
}

// OSS 配置
interface OSSConfigWithState extends OSSConfig {
  testing?: boolean
}
const ossConfigs = ref<OSSConfigWithState[]>([])
const showAddOSSDialog = ref(false)
const editingOSSConfig = ref<OSSConfig | undefined>(undefined)
const ossSaving = ref(false)
const ossFormRef = ref()

// OSS 表单
const ossForm = reactive({
  name: '',
  provider: 'aliyun' as 'aliyun' | 'volcengine',
  accessKeyId: '',
  accessKeySecret: '',
  region: '',
  bucket: '',
  endpoint: '',
  customDomain: '',
  pathPrefix: ''
})

// OSS 表单验证规则
// 编辑模式：AccessKey ID / Secret 留空视为「不修改」，放行校验
const ossKeyRequiredRule = (message: string) => ({
  validator: (_rule: any, value: string, callback: (err?: Error) => void) => {
    if (editingOSSConfig.value && !value) return callback() // 编辑留空 = 不修改
    if (!value) return callback(new Error(message))
    callback()
  },
  trigger: 'blur'
})
const ossFormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  provider: [{ required: true, message: '请选择提供商', trigger: 'change' }],
  accessKeyId: [ossKeyRequiredRule('请输入 AccessKey ID')],
  accessKeySecret: [ossKeyRequiredRule('请输入 AccessKey Secret')],
  region: [{ required: true, message: '请输入地域', trigger: 'blur' }],
  bucket: [{ required: true, message: '请输入 Bucket 名称', trigger: 'blur' }]
}

// 切换主题
const changeTheme = async (themeId: string) => {
  await setTheme(themeId)
  ElMessage.success('主题已更换')
}

// 保存设置
const saveSettings = async () => {
  try {
    // 应用语言设置
    if (settings.language !== appSettings.language) {
      await setLanguage(settings.language as Language)
    }
    // 应用字体大小设置
    if (settings.fontSize !== appSettings.fontSize) {
      await setFontSize(settings.fontSize as FontSize)
    }
    ElMessage.success('设置已保存')
  } catch (error) {
    console.error('保存设置失败:', error)
    ElMessage.error('保存设置失败')
  }
}

// 加载模板列表
const loadTemplates = async () => {
  try {
    const result = await window.electronAPI.providerTemplate.list()
    if (result.success && result.templates) {
      templates.value = result.templates
    }
  } catch (error) {
    console.error('加载模板列表失败:', error)
  }
}

// 加载提供商配置
const loadProviderConfigs = async () => {
  try {
    const result = await window.electronAPI.providerConfig.list()
    if (result.success && result.data) {
      providerConfigs.value = result.data
    }
  } catch (error) {
    console.error('加载提供商配置失败:', error)
  }
}

// 获取模板名称
const getTemplateName = (templateId: string): string => {
  const template = templates.value.find((t) => t.id === templateId)
  return template?.name || templateId
}

// 获取模板图标
const getTemplateIcon = (templateId: string): string => {
  const template = templates.value.find((t) => t.id === templateId)
  return template?.icon || '🔌'
}

// 获取模板品牌官网（用于抓取真实品牌图标）
const getTemplateSiteUrl = (templateId: string): string => {
  const template = templates.value.find((t) => t.id === templateId)
  return template?.siteUrl || ''
}

// 打开添加提供商对话框
const openAddDialog = () => {
  editingConfig.value = undefined
  showAddDialog.value = true
}

// 切换配置启用状态
const toggleConfigEnabled = async (config: UserProviderConfig) => {
  try {
    await window.electronAPI.providerConfig.update(config.id, {
      isEnabled: config.isEnabled
    })
    ElMessage.success(config.isEnabled ? '已启用' : '已禁用')
  } catch (error) {
    console.error('更新配置失败:', error)
    config.isEnabled = !config.isEnabled // 回滚
    ElMessage.error('操作失败')
  }
}

// 设置默认配置
const setDefaultConfig = async (config: UserProviderConfig) => {
  try {
    const result = await window.electronAPI.providerConfig.setDefault(config.id)
    if (result.success) {
      // 更新本地状态
      providerConfigs.value.forEach((c) => {
        c.isDefault = c.id === config.id
      })
      ElMessage.success('操作成功')
    }
  } catch (error) {
    console.error('设置默认配置失败:', error)
    ElMessage.error('操作失败')
  }
}

// 编辑配置
const editConfig = (config: UserProviderConfig) => {
  editingConfig.value = config
  showAddDialog.value = true
}

// 删除配置
const deleteConfig = async (config: UserProviderConfig) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除该配置吗？ (${config.name})`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await window.electronAPI.providerConfig.delete(config.id)
    if (result.success) {
      await loadProviderConfigs()
      ElMessage.success('已删除')
    } else {
      ElMessage.error(result.error || '操作失败')
    }
  } catch {
    // 用户取消
  }
}

// ==================== 搜索引擎相关 ====================

// 加载搜索引擎模板
const loadSearchEngineTemplates = async () => {
  try {
    const result = await window.electronAPI.searchEngine.getTemplates()
    if (result.success && result.templates) {
      searchEngineTemplates.value = result.templates
      // 筛选快速搜索引擎（网页抓取型）
      quickSearchEngines.value = result.templates.filter(
        (t: SearchEngineTemplate) => t.category === 'web-scrape'
      )
    }
  } catch (error) {
    console.error('加载搜索引擎模板失败:', error)
  }
}

// 加载搜索引擎配置
const loadSearchEngineConfigs = async () => {
  try {
    const result = await window.electronAPI.searchEngine.list()
    if (result.success && result.data) {
      searchEngineConfigs.value = result.data
    }
  } catch (error) {
    console.error('加载搜索引擎配置失败:', error)
  }
}

// 加载被禁用的快速搜索引擎列表
const loadDisabledQuickEngines = async () => {
  try {
    const result = await window.electronAPI.searchEngine.getDisabledQuickEngines()
    if (result.success && result.disabledEngines) {
      disabledQuickEngines.value = result.disabledEngines
    }
  } catch (error) {
    console.error('加载被禁用的快速搜索引擎列表失败:', error)
  }
}

// 获取搜索引擎模板名称
const getSearchEngineTemplateName = (templateId: string): string => {
  const template = searchEngineTemplates.value.find((t) => t.id === templateId)
  return template?.name || templateId
}

// 获取搜索引擎模板图标
const getSearchEngineTemplateIcon = (templateId: string): string => {
  const template = searchEngineTemplates.value.find((t) => t.id === templateId)
  return template?.icon || '🔍'
}

// 获取搜索引擎品牌官网（用于抓取真实品牌图标）
const getSearchEngineTemplateSiteUrl = (templateId: string): string => {
  const template = searchEngineTemplates.value.find((t) => t.id === templateId)
  return template?.siteUrl || ''
}

// 打开添加搜索引擎对话框
const openAddSearchEngineDialog = () => {
  editingSearchEngineConfig.value = undefined
  showAddSearchEngineDialog.value = true
}

// 切换搜索引擎启用状态
const toggleSearchEngineEnabled = async (config: UserSearchEngineConfig) => {
  try {
    await window.electronAPI.searchEngine.update(config.id, {
      isEnabled: config.isEnabled
    })
    ElMessage.success(config.isEnabled ? '已启用' : '已禁用')
  } catch (error) {
    console.error('更新搜索引擎配置失败:', error)
    config.isEnabled = !config.isEnabled // 回滚
    ElMessage.error('操作失败')
  }
}

// 切换快速搜索引擎启用状态
const toggleQuickEngineEnabled = async (engineId: string, enabled: boolean) => {
  try {
    const result = await window.electronAPI.searchEngine.setQuickEngineEnabled(engineId, enabled)
    if (result.success) {
      if (enabled) {
        disabledQuickEngines.value = disabledQuickEngines.value.filter(id => id !== engineId)
      } else {
        if (!disabledQuickEngines.value.includes(engineId)) {
          disabledQuickEngines.value.push(engineId)
        }
      }
      ElMessage.success(enabled ? '已启用' : '已禁用')
    }
  } catch (error) {
    console.error('设置快速搜索引擎启用状态失败:', error)
    ElMessage.error('操作失败')
  }
}

// 设置默认搜索引擎
const setDefaultSearchEngine = async (config: UserSearchEngineConfig) => {
  try {
    const result = await window.electronAPI.searchEngine.setDefault(config.id)
    if (result.success) {
      // 更新本地状态
      searchEngineConfigs.value.forEach((c) => {
        c.isDefault = c.id === config.id
      })
      ElMessage.success('操作成功')
    }
  } catch (error) {
    console.error('设置默认搜索引擎失败:', error)
    ElMessage.error('操作失败')
  }
}

// 测试搜索引擎配置
const testSearchEngineConfig = async (config: UserSearchEngineConfig) => {
  config.testing = true
  try {
    const result = await window.electronAPI.searchEngine.test({ configId: config.id })
    if (result.success) {
      config.testResult = 'success'
      ElMessage.success('连接测试成功')
    } else {
      config.testResult = 'failed'
      ElMessage.error(result.message || '连接测试失败')
    }
    // 重新加载配置以获取最新状态
    await loadSearchEngineConfigs()
  } catch (error) {
    console.error('测试搜索引擎配置失败:', error)
    ElMessage.error('测试失败')
  } finally {
    config.testing = false
  }
}

// 编辑搜索引擎配置
const editSearchEngineConfig = (config: UserSearchEngineConfig) => {
  editingSearchEngineConfig.value = config
  showAddSearchEngineDialog.value = true
}

// 删除搜索引擎配置
const deleteSearchEngineConfig = async (config: UserSearchEngineConfig) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除该配置吗？ (${config.name})`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await window.electronAPI.searchEngine.delete(config.id)
    if (result.success) {
      await loadSearchEngineConfigs()
      ElMessage.success('已删除')
    } else {
      ElMessage.error(result.error || '操作失败')
    }
  } catch {
    // 用户取消
  }
}

// 加载 OSS 配置
const loadOSSConfigs = async () => {
  try {
    const result = await window.electronAPI.oss.listConfigs()
    if (result.success && result.data) {
      ossConfigs.value = result.data as OSSConfigWithState[]
    }
  } catch (error) {
    console.error('加载 OSS 配置失败:', error)
  }
}

// 打开添加 OSS 配置对话框
const openAddOSSDialog = () => {
  editingOSSConfig.value = undefined
  resetOSSForm()
  showAddOSSDialog.value = true
}

// 重置 OSS 表单
const resetOSSForm = () => {
  ossForm.name = ''
  ossForm.provider = 'aliyun'
  ossForm.accessKeyId = ''
  ossForm.accessKeySecret = ''
  ossForm.region = ''
  ossForm.bucket = ''
  ossForm.endpoint = ''
  ossForm.customDomain = ''
  ossForm.pathPrefix = ''
}

// 保存 OSS 配置
const saveOSSConfig = async () => {
  try {
    await ossFormRef.value?.validate()
    ossSaving.value = true

    if (editingOSSConfig.value) {
      // 编辑模式：AccessKey ID / Secret 留空表示不修改，不提交该字段
      const updateData: Record<string, unknown> = {
        name: ossForm.name,
        region: ossForm.region,
        bucket: ossForm.bucket,
        endpoint: ossForm.endpoint || undefined,
        customDomain: ossForm.customDomain || undefined,
        pathPrefix: ossForm.pathPrefix || undefined
      }
      if (ossForm.accessKeyId) updateData.accessKeyId = ossForm.accessKeyId
      if (ossForm.accessKeySecret) updateData.accessKeySecret = ossForm.accessKeySecret
      const result = await window.electronAPI.oss.updateConfig(editingOSSConfig.value.id, updateData)
      if (result.success) {
        await loadOSSConfigs()
        showAddOSSDialog.value = false
        ElMessage.success('配置已更新')
      } else {
        ElMessage.error(result.error || '更新失败')
      }
    } else {
      // 新增模式
      const result = await window.electronAPI.oss.createConfig({
        name: ossForm.name,
        provider: ossForm.provider,
        accessKeyId: ossForm.accessKeyId,
        accessKeySecret: ossForm.accessKeySecret,
        region: ossForm.region,
        bucket: ossForm.bucket,
        endpoint: ossForm.endpoint || undefined,
        customDomain: ossForm.customDomain || undefined,
        pathPrefix: ossForm.pathPrefix || undefined
      })
      if (result.success) {
        await loadOSSConfigs()
        showAddOSSDialog.value = false
        ElMessage.success('配置已创建')
      } else {
        ElMessage.error(result.error || '创建失败')
      }
    }
  } catch (error) {
    console.error('保存 OSS 配置失败:', error)
  } finally {
    ossSaving.value = false
  }
}

// 切换 OSS 启用状态
const toggleOSSEnabled = async (config: OSSConfigWithState) => {
  try {
    const result = await window.electronAPI.oss.toggleEnabled(config.id)
    if (result.success) {
      ElMessage.success(config.isEnabled ? '已启用' : '已禁用')
    } else {
      config.isEnabled = !config.isEnabled // 回滚
      ElMessage.error('操作失败')
    }
  } catch (error) {
    console.error('切换 OSS 启用状态失败:', error)
    config.isEnabled = !config.isEnabled // 回滚
    ElMessage.error('操作失败')
  }
}

// 设置默认 OSS
const setDefaultOSS = async (config: OSSConfig) => {
  try {
    const result = await window.electronAPI.oss.setDefault(config.id)
    if (result.success) {
      // 更新本地状态
      ossConfigs.value.forEach((c) => {
        c.isDefault = c.id === config.id
      })
      ElMessage.success('已设为默认')
    }
  } catch (error) {
    console.error('设置默认 OSS 失败:', error)
    ElMessage.error('操作失败')
  }
}

// 测试 OSS 连接
const testOSSConnection = async (config: OSSConfigWithState) => {
  config.testing = true
  try {
    const result = await window.electronAPI.oss.testConnection(config.id)
    if (result.success && result.data?.success) {
      ElMessage.success(result.data.message || '连接成功')
    } else {
      ElMessage.error(result.data?.message || result.error || '连接失败')
    }
  } catch (error) {
    console.error('测试 OSS 连接失败:', error)
    ElMessage.error('测试失败')
  } finally {
    config.testing = false
  }
}

// 编辑 OSS 配置
const editOSSConfig = (config: OSSConfig) => {
  editingOSSConfig.value = config
  ossForm.name = config.name
  ossForm.provider = config.provider
  ossForm.accessKeyId = config.accessKeyId
  ossForm.accessKeySecret = '' // 密钥不返回，用户需要重新输入或保持原样
  ossForm.region = config.region
  ossForm.bucket = config.bucket
  ossForm.endpoint = config.endpoint || ''
  ossForm.customDomain = config.customDomain || ''
  ossForm.pathPrefix = config.pathPrefix || ''
  showAddOSSDialog.value = true
}

// 删除 OSS 配置
const deleteOSSConfig = async (config: OSSConfig) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除该配置吗？ (${config.name})`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await window.electronAPI.oss.deleteConfig(config.id)
    if (result.success) {
      await loadOSSConfigs()
      ElMessage.success('已删除')
    } else {
      ElMessage.error(result.error || '操作失败')
    }
  } catch {
    // 用户取消
  }
}

// 打开数据目录
const openDataFolder = async () => {
  try {
    const result = await window.electronAPI.dataPath.openFolder()
    if (!result.success) {
      ElMessage.error(result.error || '打开目录失败')
    }
  } catch (error) {
    console.error('打开目录失败:', error)
    ElMessage.error('打开目录失败')
  }
}

// 加载数据路径配置
const loadDataPathConfig = async () => {
  try {
    const result = await window.electronAPI.dataPath.getConfig()
    if (result.success && result.data) {
      dataPathConfig.value = result.data
    }
  } catch (error) {
    console.error('加载数据路径配置失败:', error)
  }
}

// 加载数据大小信息
const loadDataSize = async () => {
  try {
    const result = await window.electronAPI.dataPath.calculateSize()
    if (result.success && result.data) {
      dataSizeInfo.value = result.data
    }
  } catch (error) {
    console.error('计算数据大小失败:', error)
  }
}

// 更改数据路径
const handleChangePath = async () => {
  try {
    // 先选择路径
    const selectResult = await window.electronAPI.dataPath.select()
    if (!selectResult.success || !selectResult.path) {
      return
    }

    // 确认是否迁移数据
    const confirmResult = await ElMessageBox.confirm(
      '是否将现有数据迁移到新路径？选择"迁移"将复制现有数据到新位置，选择"不迁移"则新路径将为空。',
      '数据迁移',
      {
        confirmButtonText: '迁移',
        cancelButtonText: '不迁移',
        distinguishCancelAndClose: true,
        type: 'info'
      }
    ).then(() => true)
      .catch((action) => action === 'cancel')

    // 设置新路径
    const result = await window.electronAPI.dataPath.set(
      selectResult.path,
      confirmResult === true
    )

    if (result.success) {
      ElMessage.success(confirmResult === true ? '路径已更改，数据已迁移' : '路径已更改')
      await loadDataPathConfig()
      await loadDataSize()
    } else {
      ElMessage.error(result.error || '更改路径失败')
    }
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('更改路径失败:', error)
      ElMessage.error('更改路径失败')
    }
  }
}

// 重置为默认路径
const handleResetPath = async () => {
  try {
    const confirmResult = await ElMessageBox.confirm(
      '是否将现有数据迁移到默认路径？',
      '恢复默认路径',
      {
        confirmButtonText: '迁移',
        cancelButtonText: '不迁移',
        distinguishCancelAndClose: true,
        type: 'info'
      }
    ).then(() => true)
      .catch((action) => action === 'cancel')

    const result = await window.electronAPI.dataPath.reset(confirmResult === true)

    if (result.success) {
      ElMessage.success('已恢复默认路径')
      await loadDataPathConfig()
      await loadDataSize()
    } else {
      ElMessage.error(result.error || '恢复默认路径失败')
    }
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('恢复默认路径失败:', error)
      ElMessage.error('恢复默认路径失败')
    }
  }
}

// 格式化文件大小
const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i]
}

// 导出数据
const exportData = () => {
  ElMessage.info('功能开发中...')
}

// 导入数据
const importData = () => {
  ElMessage.info('功能开发中...')
}

// 清除所有数据
const clearAllData = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清除所有数据吗？此操作不可恢复！',
      '警告',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    ElMessage.info('功能开发中...')
  } catch {
    // 用户取消
  }
}

// 监听对话框状态变化，关闭时清除编辑配置
watch(showAddDialog, (visible) => {
  if (!visible) {
    // 对话框关闭时清除编辑状态
    editingConfig.value = undefined
  }
})

onMounted(async () => {
  await loadAppSettings()
  // 同步本地状态
  settings.language = appSettings.language
  settings.fontSize = appSettings.fontSize
  await loadTemplates()
  await loadProviderConfigs()
  await loadDataPathConfig()
  await loadDataSize()
  // 加载搜索引擎配置
  await loadSearchEngineTemplates()
  await loadSearchEngineConfigs()
  await loadDisabledQuickEngines()
  // 加载 OSS 配置
  await loadOSSConfigs()
  // 加载信息来源（类别 → 分组 → 来源）
  await loadInfoSourceCategories()
  await loadInfoSourceTopics()
  await loadInfoSources()
})
</script>

<style lang="scss" scoped>
.settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color-page);
}

.page-header {
  padding: 24px 32px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-lighter);

  h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
  }
}

.settings-content {
  flex: 1;
  overflow: hidden;
  padding: 24px;

  .settings-tabs {
    height: 100%;
    background: var(--bg-color);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-card);

    /* 注意：这些 :deep() 规则必须限定为「直接子元素」（>）——它们是左侧竖向 tab 的专属
       布局（nav 竖排、nav-scroll 带 16px 内边距、item 44px 行高）。用后代选择器会连
       pane 里嵌套的子 tab（如「信息来源」内的类别 tab）一起命中：表头被 padding 顶出
       固定高 + overflow:hidden 的可视区，标签文字只剩一半。 */
    :deep(> .el-tabs__header) {
      margin: 0;
      background: var(--bg-color-page);
      border-right: 1px solid var(--border-color-lighter);
    }

    :deep(> .el-tabs__header .el-tabs__nav-wrap) {
      height: 100%;
    }

    :deep(> .el-tabs__header .el-tabs__nav-scroll) {
      height: 100%;
      padding: 16px 8px;
    }

    :deep(> .el-tabs__header .el-tabs__nav) {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    :deep(> .el-tabs__header .el-tabs__item) {
      height: 44px;
      line-height: 44px;
      padding: 0 20px;
      border-radius: var(--radius-md);
      transition: all var(--transition-normal);
      color: var(--text-regular);

      &:hover {
        color: var(--color-primary);
        background: var(--bg-color-hover);
      }

      &.is-active {
        color: var(--color-primary);
        background: rgba(var(--color-primary), 0.1);
        font-weight: 500;
      }
    }

    :deep(> .el-tabs__content) {
      height: 100%;
      padding: 24px 32px;
      overflow-y: auto;
    }

    :deep(> .el-tabs__content > .el-tab-pane) {
      // 底部留白放在 pane 上：滚动到底或内容不满一屏时都与容器下边框保持间距
      min-height: 100%;
      padding-bottom: 56px;
    }
  }
}

.settings-section {
  margin-bottom: 32px;

  h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .section-desc {
    margin: 0 0 20px 0;
    color: var(--text-secondary);
    font-size: 13px;
  }
}

// 主题选择器
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}


/* 界面皮肤选择（data-skin） */
.skin-options {
  display: flex;
  gap: 16px;
}

.skin-card {
  width: 200px;
  border: 2px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  padding: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary-light-5);
  }

  &.active {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-light-8);
  }
}

.skin-preview {
  display: flex;
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-color-lighter);
  margin-bottom: 8px;

  .skin-preview-sidebar {
    width: 34%;
  }

  .skin-preview-main {
    flex: 1;
  }

  &.classic {
    .skin-preview-sidebar { background: linear-gradient(180deg, #4a7570, #3a5a56); }
    .skin-preview-main { background: #faf9f7; }
  }

  &.modern {
    .skin-preview-sidebar { background: #0f1419; }
    .skin-preview-main { background: #f7f8fa; }
  }
}

.skin-info {
  display: flex;
  flex-direction: column;

  .skin-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .skin-desc {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 2px;
  }
}

.theme-card {
  cursor: pointer;
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all var(--transition-normal);
  border: 2px solid transparent;
  background: var(--bg-color);

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-card-hover);
  }

  &.active {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-glow);
  }
}

.theme-preview {
  height: 100px;
  position: relative;
  overflow: hidden;
}

.theme-preview-inner {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .preview-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
  }

  .preview-lines {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preview-line {
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.2);

    &.short {
      width: 60%;
    }
  }
}

.theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.theme-info {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.theme-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

// 提供商配置列表
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;

  h3 {
    margin: 0 0 4px 0;
  }

  .section-desc {
    margin: 0;
  }
}

.provider-config-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-config-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-color-page);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color-lighter);
  transition: all var(--transition-normal);

  &:hover {
    border-color: var(--color-primary-light);
    box-shadow: var(--shadow-sm);
  }

  &.disabled {
    opacity: 0.6;
  }

  &.is-default {
    background: linear-gradient(135deg, rgba(103, 194, 58, 0.05) 0%, rgba(103, 194, 58, 0.02) 100%);
    border-color: rgba(103, 194, 58, 0.3);
  }
}

.config-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: var(--bg-color);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.config-info {
  flex: 1;
  min-width: 0;
}

.config-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.config-name {
  font-weight: 500;
  color: var(--text-primary);
}

.config-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.config-template {
  color: var(--text-regular);
}

.config-endpoint {
  font-family: monospace;
}

.config-models {
  color: var(--color-primary);
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

// 空状态
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-secondary);

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  p {
    margin: 0 0 20px 0;
    font-size: 14px;
  }
}

// 表单样式
.form-select {
  width: 200px;
}

.radio-group {
  :deep(.el-radio-button__inner) {
    padding: 8px 20px;
  }
}

.path-input {
  width: 400px;
}

.path-info {
  margin-top: 8px;
}

.size-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.total-size {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.size-details {
  .size-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color-lighter);

    &:last-child {
      border-bottom: none;
    }

    span:first-child {
      color: var(--text-secondary);
    }

    span:last-child {
      color: var(--text-primary);
      font-weight: 500;
    }
  }
}

.path-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-btn {
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-2px);
  }

  &.danger:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 108, 108, 0.3);
  }
}

// 关于页面
.about-section {
  text-align: center;
  padding: 40px 0;
}

.app-logo {
  margin-bottom: 24px;
}

.logo-circle {
  width: 80px;
  height: 80px;
  margin: 0 auto;
  border-radius: var(--radius-xl);
  background: var(--color-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-glow);
  animation: glow-pulse 3s ease-in-out infinite;

  span {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
  }
}

.app-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.app-version {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 8px 0;
}

.app-desc {
  color: var(--text-regular);
  font-size: 14px;
  margin: 0 0 32px 0;
}

.info-list {
  max-width: 400px;
  margin: 0 auto;
  text-align: left;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color-lighter);

  &:last-child {
    border-bottom: none;
  }
}

.info-label {
  color: var(--text-secondary);
}

.info-value {
  color: var(--text-primary);
  font-weight: 500;
}

// API 对话框
.api-dialog {
  :deep(.el-dialog__body) {
    padding: 20px 24px;
  }
}

.api-form {
  .form-input {
    width: 100%;
  }
}

// 动画
.check-enter-active,
.check-leave-active {
  transition: all var(--transition-bounce);
}

.check-enter-from,
.check-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-fast);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 搜索引擎配置样式
.search-engine-group {
  margin-bottom: 24px;
}

.group-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

/* 信息来源分组：标题行（名称 + 操作按钮），整行可点击折叠 */
.group-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.group-title-row .group-title { margin: 0; }
.group-title-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }

/* 信息来源：类别 Tab（一个类别 = 一个 Tab）。
   刻意不覆盖 tab 高度/行高：样式泄漏已从源头堵住（外层左侧 tab 规则限定为直接子元素），
   这里沿用 Element 默认 40px 表头，视觉与其它 tab 一致。 */
.source-category-tabs {
  margin-top: 4px;

  :deep(.el-tabs__header) {
    margin-bottom: 12px;
  }
}

.source-category-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  /* 行高交给容器居中，不用固定值（固定行高 + 裁切容器会把字切一半） */
  line-height: normal;
}

.source-category-count {
  font-size: 11px;
  line-height: normal;
  color: var(--text-secondary);
}

.source-category-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.source-category-desc {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 头部操作按钮组（添加主题 在 添加来源 左侧） */
.section-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 信息来源分组折叠 */
.news-topic-group {
  border: 1px solid var(--border-color-lighter);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  background: var(--bg-color);
  transition: border-color var(--transition-normal);

  &:hover {
    border-color: var(--color-primary-light);
  }
}

.news-topic-header {
  cursor: pointer;
  user-select: none;
  padding: 4px 0;

  .news-topic-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .topic-chevron {
    font-size: 14px;
    color: var(--text-secondary);
    transition: transform var(--transition-normal);
  }

  &.collapsed .topic-chevron {
    transform: rotate(90deg);
  }

  &:hover .topic-chevron {
    color: var(--color-primary);
  }
}

.news-topic-body {
  padding-top: 4px;
}

.topic-collapse-enter-active,
.topic-collapse-leave-active {
  transition: opacity var(--transition-normal), transform var(--transition-normal);
  transform-origin: top;
}

.topic-collapse-enter-from,
.topic-collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

// OSS 配置列表样式
.oss-config-list {
  margin-top: 16px;
}

.hint-tag {
  margin-left: 8px;
}

.group-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
}

.quick-engine-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-engine-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-color-page);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color-lighter);
  transition: all var(--transition-normal);

  &.disabled {
    opacity: 0.6;
    background: var(--bg-color-disabled);
  }
}

.engine-icon {
  font-size: 20px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.engine-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.engine-name {
  font-weight: 500;
  color: var(--text-primary);
}

.engine-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.empty-config {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);

  p {
    margin: 0 0 8px 0;
  }

  .hint {
    font-size: 12px;
    color: var(--text-placeholder);
  }
}
</style>
