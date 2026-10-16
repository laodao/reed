# 数据库结构文档

> 本文档自动生成，记录所有数据库表和字段的中文注释。

生成时间：2026/4/4 00:02:21

---

## 长文写作模块 (lw_*)

### lw_chapter_prewrites

**表说明**：章节预写表

| 字段名 | 中文注释 |
|--------|----------|
| confirmed_at | 确认时间 |
| content | 预写内容 |
| created_at | 创建时间 |
| id | 预写ID，主键 |
| is_confirmed | 是否已确认：0-未确认，1-已确认 |
| outline_id | 关联大纲节点ID，一对一关系 |
| updated_at | 更新时间 |

### lw_chapter_versions

**表说明**：章节版本表

| 字段名 | 中文注释 |
|--------|----------|
| chapter_id | 关联章节ID |
| content | 版本内容 |
| created_at | 创建时间 |
| id | 版本ID，主键 |
| is_locked | 是否锁定：0-未锁定，1-已锁定 |
| version_number | 版本号 |
| version_type | 版本类型：generated-生成，manual-手动 |
| word_count | 字数统计 |

### lw_character_relations

**表说明**：角色关系表

| 字段名 | 中文注释 |
|--------|----------|
| character_id | 角色ID |
| created_at | 创建时间 |
| id | 关系ID，主键 |
| related_character_id | 关联角色ID |
| relation_description | 关系描述 |
| relation_type | 关系类型：师徒/仇敌/恋人等 |

### lw_design_conversations

**表说明**：设计对话记录表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| id | 对话ID，主键 |
| messages | 对话消息列表，JSON格式 |
| project_id | 关联项目ID |
| stage | 所属阶段 |
| updated_at | 更新时间 |

### lw_dictionary

**表说明**：字典项表

| 字段名 | 中文注释 |
|--------|----------|
| category_code | 所属分类编码 |
| code | 字典项编码 |
| created_at | 创建时间 |
| id | 字典项ID，主键 |
| name | 字典项名称 |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_dictionary_category

**表说明**：字典分类表

| 字段名 | 中文注释 |
|--------|----------|
| code | 分类编码 |
| created_at | 创建时间 |
| id | 分类ID，主键 |
| name | 分类名称 |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_entity_state_snapshots

**表说明**：实体状态快照表（状态层）- 记录每个实体在各章节完成时的状态

| 字段名 | 中文注释 |
|--------|----------|
| chapter_number | 章节序号，表示该章节完成时的状态 |
| created_at | 创建时间 |
| entity_id | 实体ID，关联对应的设定表 |
| entity_name | 实体名称，用于显示和搜索 |
| entity_type | 实体类型：character-角色，location-地点，item-物品，faction-势力，skill-技能 |
| id | 快照ID，主键 |
| key_changes | 本章节的关键变化列表，JSON格式 |
| project_id | 关联项目ID |
| state_summary | 状态摘要，自然语言描述实体的完整状态 |
| updated_at | 更新时间 |

### lw_global_settings

**表说明**：长文写作全局设置表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| estimated_lengths | 预估篇幅选项列表，JSON格式 |
| id | 设置ID，主键 |
| item_levels | 物品等级选项列表，JSON格式 |
| item_types | 物品类型选项列表，JSON格式 |
| skill_levels | 技能等级选项列表，JSON格式 |
| skill_types | 技能类型选项列表，JSON格式 |
| story_types | 故事类型选项列表，JSON格式 |
| styles | 故事风格选项列表，JSON格式 |
| target_readers | 目标读者选项列表，JSON格式 |
| updated_at | 更新时间 |

### lw_project_factions

**表说明**：故事势力表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| description | 势力描述 |
| faction_type | 势力类型：country-国别，camp-阵营，sect-门派 |
| id | 势力ID，主键 |
| location_id | 所在地ID，关联地点表 |
| name | 势力名称 |
| project_id | 关联项目ID |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_project_item_levels

**表说明**：物品等级配置表

| 字段名 | 中文注释 |
|--------|----------|
| code | 等级编码 |
| created_at | 创建时间 |
| description | 等级描述 |
| id | 等级ID，主键 |
| item_type_code | 所属物品类型编码 |
| name | 等级名称 |
| project_id | 关联项目ID |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_project_item_types

**表说明**：项目物品类型配置表

| 字段名 | 中文注释 |
|--------|----------|
| code | 类型编码 |
| created_at | 创建时间 |
| description | 类型描述 |
| id | 配置ID，主键 |
| name | 类型名称 |
| project_id | 关联项目ID |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_project_maps

**表说明**：故事地图表

| 字段名 | 中文注释 |
|--------|----------|
| ai_generated_data | AI生成的地图数据，JSON格式 |
| characteristics | 地图特征描述 |
| created_at | 创建时间 |
| id | 地图ID，主键 |
| image_path | 地图图片路径 |
| name | 地图名称 |
| orientation | 地图方位：north-北方，south-南方，east-东方，west-西方，central-中央等 |
| project_id | 关联项目ID |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_project_skill_levels

**表说明**：技能等级配置表

| 字段名 | 中文注释 |
|--------|----------|
| code | 等级编码 |
| created_at | 创建时间 |
| description | 等级描述 |
| id | 等级ID，主键 |
| name | 等级名称 |
| project_id | 关联项目ID |
| skill_type_code | 所属技能类型编码 |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_project_skill_types

**表说明**：项目技能类型配置表

| 字段名 | 中文注释 |
|--------|----------|
| code | 类型编码 |
| created_at | 创建时间 |
| description | 类型描述 |
| id | 配置ID，主键 |
| name | 类型名称 |
| project_id | 关联项目ID |
| sort_order | 排序顺序 |
| updated_at | 更新时间 |

### lw_projects

**表说明**：长文写作项目表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| id | 项目ID，主键 |
| name | 项目名称 |
| progress | 进度百分比 0-100 |
| stage | 当前阶段 |
| type | 项目类型：story-故事类，comment-评论类 |
| updated_at | 更新时间 |

### lw_story_backgrounds

**表说明**：时代背景设定表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| era_description | 时代描述 |
| era_type | 时代类型：ancient-古代，modern-现代，future-未来，fictional-虚构 |
| faction_distribution | 势力分布描述 |
| geographic_orientation | 地理方位描述 |
| id | 主键ID |
| project_id | 关联项目ID |
| social_structure | 社会结构 |
| special_rules | 特殊规则 |
| tech_level | 科技水平 |
| updated_at | 更新时间 |

### lw_story_chapters

**表说明**：章节内容表

| 字段名 | 中文注释 |
|--------|----------|
| content | 章节内容 |
| created_at | 创建时间 |
| id | 章节ID，主键 |
| outline_id | 关联大纲节点ID |
| updated_at | 更新时间 |
| word_count | 字数统计 |

### lw_story_characters

**表说明**：故事角色表

| 字段名 | 中文注释 |
|--------|----------|
| abilities | 能力特长 |
| age | 年龄 |
| appearance | 外貌描述 |
| background | 背景故事 |
| created_at | 创建时间 |
| gender | 性别：male-男，female-女，other-其他 |
| id | 角色ID，主键 |
| major_events | 主要事件 |
| name | 角色名称 |
| personality | 性格特点 |
| portrait_id | 关联人像形象ID |
| project_id | 关联项目ID |
| role_position | 角色定位：protagonist-主角，supporting-配角，antagonist-反派，minor-次要 |
| updated_at | 更新时间 |

### lw_story_items

**表说明**：故事物品表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| description | 物品描述 |
| id | 物品ID，主键 |
| level | 物品等级：common-普通，rare-稀有，legendary-传说，divine-神级 |
| name | 物品名称 |
| owner_id | 持有者角色ID |
| project_id | 关联项目ID |
| type | 物品类型：weapon-武器，artifact-神器，medicine-丹药，manual-秘籍，token-信物，other-其他 |
| updated_at | 更新时间 |

### lw_story_locations

**表说明**：故事地点表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| description | 地点描述 |
| id | 地点ID，主键 |
| importance | 重要程度：main-主要，important-重要，auxiliary-辅助 |
| map_id | 关联地图ID |
| name | 地点名称 |
| project_id | 关联项目ID |
| type | 地点类型：city-城市，village-村庄，mountain-山脉，palace-宫殿，forest-森林，sea-海域，building-建筑，other-其他 |
| updated_at | 更新时间 |

### lw_story_materials

**表说明**：故事素材表

| 字段名 | 中文注释 |
|--------|----------|
| content | 素材内容 |
| created_at | 创建时间 |
| error_message | 错误信息 |
| id | 素材ID，主键 |
| name | 素材名称 |
| project_id | 关联项目ID |
| retry_count | 重试次数 |
| source | 来源：文件路径或网址 |
| status | 状态：pending-待处理，success-成功，failed-失败 |
| type | 素材类型：file-文件，url-网址，manual-手动输入 |
| used | 是否已使用：0-未使用，1-已使用 |

### lw_story_memories

**表说明**：故事记忆表（事件层）- 记录章节中发生的关键事件

| 字段名 | 中文注释 |
|--------|----------|
| chapter_number | 章节序号 |
| created_at | 创建时间 |
| description | 详细描述 |
| id | 记忆ID，主键 |
| importance | 重要程度：critical-关键，normal-重要，minor-次要 |
| involved_entities | 涉及实体列表，JSON格式：[{type,id,name}] |
| is_active | 是否生效：0-禁用，1-生效 |
| memory_type | 记忆类型：character_event-角色事件，location_event-地点事件，item_event-物品事件，relationship_change-关系变化，faction_event-势力事件，skill_event-技能事件，general-一般事件 |
| project_id | 关联项目ID |
| source_outline_id | 来源章节大纲ID |
| title | 记忆标题 |
| updated_at | 更新时间 |

### lw_story_outlines

**表说明**：故事大纲表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| estimated_words | 预估字数 |
| id | 大纲节点ID，主键 |
| involved_characters | 涉及角色ID列表，JSON格式 |
| involved_locations | 涉及地点ID列表，JSON格式 |
| level | 层级：1/2/3 |
| name | 节点名称 |
| node_type | 节点类型：volume-卷，chapter-章，section-节 |
| order_index | 排序索引 |
| parent_id | 父节点ID，支持嵌套结构 |
| project_id | 关联项目ID |
| status | 状态：pending-待写，progressing-进行中，completed-已完成 |
| summary | 节点概要 |
| updated_at | 更新时间 |

### lw_story_overviews

**表说明**：故事概要表

| 字段名 | 中文注释 |
|--------|----------|
| core_conflict | 核心冲突 |
| core_idea | 核心构思 |
| created_at | 创建时间 |
| estimated_chapters | 预估章节数 |
| estimated_length | 预估篇幅 |
| id | 主键ID |
| is_locked | 是否锁定：0-未锁定，1-已锁定 |
| other_requirements | 其他要求 |
| project_id | 关联项目ID |
| story_type | 故事类型：武侠/仙侠/玄幻/科幻/悬疑/都市/言情/历史/其他 |
| style | 故事风格 |
| summary | 故事简介 |
| target_reader | 目标读者 |
| title | 故事标题 |
| updated_at | 更新时间 |

### lw_story_plots

**表说明**：故事情节表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| id | 情节ID，主键 |
| involved_characters | 涉及的角色名称列表，JSON格式 |
| involved_locations | 涉及的地点名称列表，JSON格式 |
| notes | 备注 |
| plot_order | 排序顺序 |
| project_id | 关联项目ID |
| summary | 情节概要 |
| title | 情节标题 |
| updated_at | 更新时间 |

### lw_story_skills

**表说明**：故事技能表

| 字段名 | 中文注释 |
|--------|----------|
| character_ids | 掌握此技能的角色ID列表，JSON格式 |
| created_at | 创建时间 |
| description | 技能描述 |
| id | 技能ID，主键 |
| level | 技能等级：beginner-初级，intermediate-中级，advanced-高级，master-大师 |
| name | 技能名称 |
| project_id | 关联项目ID |
| system | 所属门派/体系 |
| type | 技能类型：martial-武功，magic-法术，ability-天赋，tech-科技，other-其他 |
| updated_at | 更新时间 |

## 知识库模块

### kb_chunks

**表说明**：知识库切片表

| 字段名 | 中文注释 |
|--------|----------|
| chunk_index | 切片索引 |
| content | 切片内容 |
| created_at | 创建时间 |
| document_id | 关联文档ID |
| id | 切片ID，主键 |

### kb_documents

**表说明**：知识库文档表

| 字段名 | 中文注释 |
|--------|----------|
| content | 文档内容 |
| created_at | 创建时间 |
| id | 文档ID，主键 |
| kb_id | 关联知识库ID |
| name | 文档名称 |
| updated_at | 更新时间 |

### kb_inverted_index

**表说明**：知识库倒排索引表

| 字段名 | 中文注释 |
|--------|----------|
| chunk_ids | 包含该词项的切片ID列表，JSON格式 |
| created_at | 创建时间 |
| id | 索引ID，主键 |
| term | 词项 |

### kb_vectors

**表说明**：知识库向量表

| 字段名 | 中文注释 |
|--------|----------|
| chunk_id | 关联切片ID |
| created_at | 创建时间 |
| id | 向量ID，主键 |
| vector | 向量数据 |

### knowledge_bases

**表说明**：知识库表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| description | 知识库描述 |
| id | 知识库ID，主键 |
| name | 知识库名称 |
| updated_at | 更新时间 |

## 对话模块

### attachments

**表说明**：对话附件表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| file_name | 文件名 |
| file_path | 文件路径 |
| file_size | 文件大小 |
| file_type | 文件类型 |
| id | 附件ID，主键 |
| message_id | 关联消息ID |

### dialogs

**表说明**：对话会话表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| id | 对话ID，主键 |
| role_id | 关联角色ID |
| title | 对话标题 |
| updated_at | 更新时间 |

### messages

**表说明**：对话消息表

| 字段名 | 中文注释 |
|--------|----------|
| content | 消息内容 |
| created_at | 创建时间 |
| dialog_id | 关联对话ID |
| id | 消息ID，主键 |
| role | 角色：user-用户，assistant-助手 |

## AI Provider 模块

### api_keys

**表说明**：API密钥表

| 字段名 | 中文注释 |
|--------|----------|
| api_key | API密钥（加密存储） |
| base_url | API基础URL |
| created_at | 创建时间 |
| id | 密钥ID，主键 |
| name | 密钥名称 |
| provider | 提供商 |
| updated_at | 更新时间 |

### provider_configs

**表说明**：AI提供商配置表

| 字段名 | 中文注释 |
|--------|----------|
| config | 配置内容，JSON格式 |
| created_at | 创建时间 |
| id | 配置ID，主键 |
| is_default | 是否为默认配置：0-否，1-是 |
| name | 配置名称 |
| provider_id | 提供商ID |
| updated_at | 更新时间 |

## 其他模块

### cloned_voices

**表说明**：克隆声音表

| 字段名 | 中文注释 |
|--------|----------|
| audio_path | 音频文件路径 |
| created_at | 创建时间 |
| id | 声音ID，主键 |
| name | 声音名称 |
| provider | 提供商 |
| updated_at | 更新时间 |
| voice_id | 声音ID |

### images

**表说明**：生成的图片表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| file_path | 文件路径 |
| id | 图片ID，主键 |
| prompt | 生成提示词 |
| provider | 提供商 |

### portrait_characters

**表说明**：人像角色表

| 字段名 | 中文注释 |
|--------|----------|
| age | 年龄 |
| created_at | 创建时间 |
| description | 角色描述 |
| gender | 性别 |
| id | 角色ID，主键 |
| name | 角色名称 |
| project_id | 关联项目ID |
| updated_at | 更新时间 |

### portrait_projects

**表说明**：人像项目表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| id | 项目ID，主键 |
| name | 项目名称 |
| updated_at | 更新时间 |

### portrait_variants

**表说明**：人像变体表

| 字段名 | 中文注释 |
|--------|----------|
| character_id | 关联角色ID |
| created_at | 创建时间 |
| id | 变体ID，主键 |
| image_path | 图片路径 |
| is_primary | 是否为主要形象：0-否，1-是 |
| prompt | 生成提示词 |
| updated_at | 更新时间 |

### roles

**表说明**：对话角色表

| 字段名 | 中文注释 |
|--------|----------|
| avatar | 头像路径 |
| created_at | 创建时间 |
| description | 角色描述 |
| id | 角色ID，主键 |
| name | 角色名称 |
| system_prompt | 系统提示词 |
| updated_at | 更新时间 |

### search_engine_configs

**表说明**：搜索引擎配置表

| 字段名 | 中文注释 |
|--------|----------|
| api_key | API密钥 |
| created_at | 创建时间 |
| engine_type | 引擎类型 |
| id | 配置ID，主键 |
| is_default | 是否为默认：0-否，1-是 |
| name | 配置名称 |
| updated_at | 更新时间 |

### settings

**表说明**：系统设置表

| 字段名 | 中文注释 |
|--------|----------|
| key | 设置键，主键 |
| updated_at | 更新时间 |
| value | 设置值 |

### translations

**表说明**：翻译记录表

| 字段名 | 中文注释 |
|--------|----------|
| created_at | 创建时间 |
| id | 翻译ID，主键 |
| provider | 提供商 |
| source_lang | 源语言 |
| source_text | 原文 |
| target_lang | 目标语言 |
| target_text | 译文 |

### voice_records

**表说明**：语音记录表

| 字段名 | 中文注释 |
|--------|----------|
| audio_path | 音频路径 |
| created_at | 创建时间 |
| id | 记录ID，主键 |
| provider | 提供商 |
| text | 文本内容 |
| voice_id | 声音ID |

---

## 统计信息

- 表总数：46
- 字段总数：358
