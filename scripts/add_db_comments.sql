-- SQLite 数据库注释表
-- SQLite 不支持 COMMENT ON 语法，因此创建专门的注释表

-- 创建数据库注释表
CREATE TABLE IF NOT EXISTS db_table_comments (
  table_name TEXT PRIMARY KEY,
  table_comment TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS db_column_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  column_comment TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(table_name, column_name)
);

-- ==================== 长文写作模块 ====================

-- lw_projects 项目表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_projects', '长文写作项目表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_projects', 'id', '项目ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_projects', 'name', '项目名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_projects', 'type', '项目类型：story-故事类，comment-评论类');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_projects', 'stage', '当前阶段');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_projects', 'progress', '进度百分比 0-100');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_projects', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_projects', 'updated_at', '更新时间');

-- lw_story_overviews 故事概要表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_overviews', '故事概要表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'id', '主键ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'story_type', '故事类型：武侠/仙侠/玄幻/科幻/悬疑/都市/言情/历史/其他');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'title', '故事标题');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'core_idea', '核心构思');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'style', '故事风格');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'target_reader', '目标读者');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'estimated_length', '预估篇幅');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'other_requirements', '其他要求');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'summary', '故事简介');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'core_conflict', '核心冲突');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'estimated_chapters', '预估章节数');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'is_locked', '是否锁定：0-未锁定，1-已锁定');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_overviews', 'updated_at', '更新时间');

-- lw_story_backgrounds 时代背景表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_backgrounds', '时代背景设定表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'id', '主键ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'era_type', '时代类型：ancient-古代，modern-现代，future-未来，fictional-虚构');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'era_description', '时代描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'social_structure', '社会结构');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'tech_level', '科技水平');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'special_rules', '特殊规则');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'faction_distribution', '势力分布描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'geographic_orientation', '地理方位描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_backgrounds', 'updated_at', '更新时间');

-- lw_story_characters 角色表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_characters', '故事角色表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'id', '角色ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'portrait_id', '关联人像形象ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'name', '角色名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'gender', '性别：male-男，female-女，other-其他');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'age', '年龄');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'appearance', '外貌描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'background', '背景故事');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'personality', '性格特点');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'abilities', '能力特长');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'role_position', '角色定位：protagonist-主角，supporting-配角，antagonist-反派，minor-次要');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'major_events', '主要事件');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_characters', 'updated_at', '更新时间');

-- lw_character_relations 角色关系表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_character_relations', '角色关系表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_character_relations', 'id', '关系ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_character_relations', 'character_id', '角色ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_character_relations', 'related_character_id', '关联角色ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_character_relations', 'relation_type', '关系类型：师徒/仇敌/恋人等');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_character_relations', 'relation_description', '关系描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_character_relations', 'created_at', '创建时间');

-- lw_story_locations 地点表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_locations', '故事地点表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'id', '地点ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'name', '地点名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'type', '地点类型：city-城市，village-村庄，mountain-山脉，palace-宫殿，forest-森林，sea-海域，building-建筑，other-其他');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'description', '地点描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'importance', '重要程度：main-主要，important-重要，auxiliary-辅助');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'map_id', '关联地图ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_locations', 'updated_at', '更新时间');

-- lw_project_factions 势力表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_project_factions', '故事势力表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'id', '势力ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'faction_type', '势力类型：country-国别，camp-阵营，sect-门派');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'name', '势力名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'location_id', '所在地ID，关联地点表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'description', '势力描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_factions', 'updated_at', '更新时间');

-- lw_story_plots 情节表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_plots', '故事情节表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'id', '情节ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'title', '情节标题');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'summary', '情节概要');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'plot_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'involved_characters', '涉及的角色名称列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'involved_locations', '涉及的地点名称列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'notes', '备注');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_plots', 'updated_at', '更新时间');

-- lw_story_skills 技能表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_skills', '故事技能表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'id', '技能ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'name', '技能名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'type', '技能类型：martial-武功，magic-法术，ability-天赋，tech-科技，other-其他');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'level', '技能等级：beginner-初级，intermediate-中级，advanced-高级，master-大师');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'description', '技能描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'system', '所属门派/体系');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'character_ids', '掌握此技能的角色ID列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_skills', 'updated_at', '更新时间');

-- lw_story_items 物品表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_items', '故事物品表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'id', '物品ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'name', '物品名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'type', '物品类型：weapon-武器，artifact-神器，medicine-丹药，manual-秘籍，token-信物，other-其他');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'level', '物品等级：common-普通，rare-稀有，legendary-传说，divine-神级');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'description', '物品描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'owner_id', '持有者角色ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_items', 'updated_at', '更新时间');

-- lw_story_outlines 大纲表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_outlines', '故事大纲表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'id', '大纲节点ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'parent_id', '父节点ID，支持嵌套结构');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'name', '节点名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'level', '层级：1/2/3');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'node_type', '节点类型：volume-卷，chapter-章，section-节');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'summary', '节点概要');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'involved_characters', '涉及角色ID列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'involved_locations', '涉及地点ID列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'status', '状态：pending-待写，progressing-进行中，completed-已完成');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'estimated_words', '预估字数');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'order_index', '排序索引');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_outlines', 'updated_at', '更新时间');

-- lw_story_chapters 章节内容表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_chapters', '章节内容表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_chapters', 'id', '章节ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_chapters', 'outline_id', '关联大纲节点ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_chapters', 'content', '章节内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_chapters', 'word_count', '字数统计');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_chapters', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_chapters', 'updated_at', '更新时间');

-- lw_chapter_versions 章节版本表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_chapter_versions', '章节版本表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'id', '版本ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'chapter_id', '关联章节ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'content', '版本内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'version_type', '版本类型：generated-生成，manual-手动');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'word_count', '字数统计');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'is_locked', '是否锁定：0-未锁定，1-已锁定');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'version_number', '版本号');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_versions', 'created_at', '创建时间');

-- lw_story_materials 素材表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_materials', '故事素材表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'id', '素材ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'name', '素材名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'type', '素材类型：file-文件，url-网址，manual-手动输入');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'source', '来源：文件路径或网址');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'content', '素材内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'status', '状态：pending-待处理，success-成功，failed-失败');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'error_message', '错误信息');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'retry_count', '重试次数');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'used', '是否已使用：0-未使用，1-已使用');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_materials', 'created_at', '创建时间');

-- lw_design_conversations 设计对话表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_design_conversations', '设计对话记录表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_design_conversations', 'id', '对话ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_design_conversations', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_design_conversations', 'stage', '所属阶段');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_design_conversations', 'messages', '对话消息列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_design_conversations', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_design_conversations', 'updated_at', '更新时间');

-- lw_global_settings 全局设置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_global_settings', '长文写作全局设置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'id', '设置ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'story_types', '故事类型选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'styles', '故事风格选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'target_readers', '目标读者选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'estimated_lengths', '预估篇幅选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'skill_types', '技能类型选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'skill_levels', '技能等级选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'item_types', '物品类型选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'item_levels', '物品等级选项列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_global_settings', 'updated_at', '更新时间');

-- lw_dictionary_category 字典分类表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_dictionary_category', '字典分类表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary_category', 'id', '分类ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary_category', 'code', '分类编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary_category', 'name', '分类名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary_category', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary_category', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary_category', 'updated_at', '更新时间');

-- lw_dictionary 字典项表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_dictionary', '字典项表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary', 'id', '字典项ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary', 'category_code', '所属分类编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary', 'code', '字典项编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary', 'name', '字典项名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_dictionary', 'updated_at', '更新时间');

-- lw_project_skill_types 项目技能类型配置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_project_skill_types', '项目技能类型配置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'id', '配置ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'code', '类型编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'name', '类型名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'description', '类型描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_types', 'updated_at', '更新时间');

-- lw_project_item_types 项目物品类型配置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_project_item_types', '项目物品类型配置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'id', '配置ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'code', '类型编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'name', '类型名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'description', '类型描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_types', 'updated_at', '更新时间');

-- lw_project_skill_levels 技能等级配置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_project_skill_levels', '技能等级配置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'id', '等级ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'skill_type_code', '所属技能类型编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'code', '等级编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'name', '等级名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'description', '等级描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_skill_levels', 'updated_at', '更新时间');

-- lw_project_item_levels 物品等级配置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_project_item_levels', '物品等级配置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'id', '等级ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'item_type_code', '所属物品类型编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'code', '等级编码');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'name', '等级名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'description', '等级描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_item_levels', 'updated_at', '更新时间');

-- lw_project_maps 地图表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_project_maps', '故事地图表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'id', '地图ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'name', '地图名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'orientation', '地图方位：north-北方，south-南方，east-东方，west-西方，central-中央等');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'characteristics', '地图特征描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'image_path', '地图图片路径');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'ai_generated_data', 'AI生成的地图数据，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'sort_order', '排序顺序');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_project_maps', 'updated_at', '更新时间');

-- lw_chapter_prewrites 章节预写表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_chapter_prewrites', '章节预写表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_prewrites', 'id', '预写ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_prewrites', 'outline_id', '关联大纲节点ID，一对一关系');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_prewrites', 'content', '预写内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_prewrites', 'is_confirmed', '是否已确认：0-未确认，1-已确认');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_prewrites', 'confirmed_at', '确认时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_prewrites', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_chapter_prewrites', 'updated_at', '更新时间');

-- lw_story_memories 故事记忆表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_story_memories', '故事记忆表（事件层）- 记录章节中发生的关键事件');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'id', '记忆ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'source_outline_id', '来源章节大纲ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'memory_type', '记忆类型：character_event-角色事件，location_event-地点事件，item_event-物品事件，relationship_change-关系变化，faction_event-势力事件，skill_event-技能事件，general-一般事件');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'title', '记忆标题');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'description', '详细描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'involved_entities', '涉及实体列表，JSON格式：[{type,id,name}]');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'chapter_number', '章节序号');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'importance', '重要程度：critical-关键，normal-重要，minor-次要');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'is_active', '是否生效：0-禁用，1-生效');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_story_memories', 'updated_at', '更新时间');

-- lw_entity_state_snapshots 实体状态快照表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('lw_entity_state_snapshots', '实体状态快照表（状态层）- 记录每个实体在各章节完成时的状态');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'id', '快照ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'entity_type', '实体类型：character-角色，location-地点，item-物品，faction-势力，skill-技能');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'entity_id', '实体ID，关联对应的设定表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'entity_name', '实体名称，用于显示和搜索');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'chapter_number', '章节序号，表示该章节完成时的状态');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'state_summary', '状态摘要，自然语言描述实体的完整状态');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'key_changes', '本章节的关键变化列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('lw_entity_state_snapshots', 'updated_at', '更新时间');

-- ==================== 其他模块表 ====================

-- api_keys API密钥表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('api_keys', 'API密钥表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('api_keys', 'id', '密钥ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('api_keys', 'name', '密钥名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('api_keys', 'provider', '提供商');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('api_keys', 'api_key', 'API密钥（加密存储）');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('api_keys', 'base_url', 'API基础URL');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('api_keys', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('api_keys', 'updated_at', '更新时间');

-- attachments 附件表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('attachments', '对话附件表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('attachments', 'id', '附件ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('attachments', 'message_id', '关联消息ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('attachments', 'file_name', '文件名');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('attachments', 'file_path', '文件路径');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('attachments', 'file_type', '文件类型');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('attachments', 'file_size', '文件大小');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('attachments', 'created_at', '创建时间');

-- cloned_voices 克隆声音表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('cloned_voices', '克隆声音表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('cloned_voices', 'id', '声音ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('cloned_voices', 'name', '声音名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('cloned_voices', 'audio_path', '音频文件路径');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('cloned_voices', 'voice_id', '声音ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('cloned_voices', 'provider', '提供商');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('cloned_voices', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('cloned_voices', 'updated_at', '更新时间');

-- dialogs 对话表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('dialogs', '对话会话表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('dialogs', 'id', '对话ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('dialogs', 'title', '对话标题');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('dialogs', 'role_id', '关联角色ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('dialogs', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('dialogs', 'updated_at', '更新时间');

-- images 图片表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('images', '生成的图片表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('images', 'id', '图片ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('images', 'prompt', '生成提示词');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('images', 'file_path', '文件路径');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('images', 'provider', '提供商');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('images', 'created_at', '创建时间');

-- knowledge_bases 知识库表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('knowledge_bases', '知识库表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('knowledge_bases', 'id', '知识库ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('knowledge_bases', 'name', '知识库名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('knowledge_bases', 'description', '知识库描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('knowledge_bases', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('knowledge_bases', 'updated_at', '更新时间');

-- kb_documents 知识库文档表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('kb_documents', '知识库文档表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_documents', 'id', '文档ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_documents', 'kb_id', '关联知识库ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_documents', 'name', '文档名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_documents', 'content', '文档内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_documents', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_documents', 'updated_at', '更新时间');

-- kb_chunks 知识库切片表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('kb_chunks', '知识库切片表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_chunks', 'id', '切片ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_chunks', 'document_id', '关联文档ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_chunks', 'content', '切片内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_chunks', 'chunk_index', '切片索引');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_chunks', 'created_at', '创建时间');

-- kb_vectors 向量表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('kb_vectors', '知识库向量表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_vectors', 'id', '向量ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_vectors', 'chunk_id', '关联切片ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_vectors', 'vector', '向量数据');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_vectors', 'created_at', '创建时间');

-- kb_inverted_index 倒排索引表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('kb_inverted_index', '知识库倒排索引表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_inverted_index', 'id', '索引ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_inverted_index', 'term', '词项');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_inverted_index', 'chunk_ids', '包含该词项的切片ID列表，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('kb_inverted_index', 'created_at', '创建时间');

-- messages 消息表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('messages', '对话消息表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('messages', 'id', '消息ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('messages', 'dialog_id', '关联对话ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('messages', 'role', '角色：user-用户，assistant-助手');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('messages', 'content', '消息内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('messages', 'created_at', '创建时间');

-- portrait_characters 人像角色表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('portrait_characters', '人像角色表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'id', '角色ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'project_id', '关联项目ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'name', '角色名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'description', '角色描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'age', '年龄');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'gender', '性别');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_characters', 'updated_at', '更新时间');

-- portrait_projects 人像项目表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('portrait_projects', '人像项目表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_projects', 'id', '项目ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_projects', 'name', '项目名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_projects', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_projects', 'updated_at', '更新时间');

-- portrait_variants 人像变体表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('portrait_variants', '人像变体表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_variants', 'id', '变体ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_variants', 'character_id', '关联角色ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_variants', 'image_path', '图片路径');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_variants', 'prompt', '生成提示词');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_variants', 'is_primary', '是否为主要形象：0-否，1-是');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_variants', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('portrait_variants', 'updated_at', '更新时间');

-- provider_configs 提供商配置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('provider_configs', 'AI提供商配置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('provider_configs', 'id', '配置ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('provider_configs', 'provider_id', '提供商ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('provider_configs', 'name', '配置名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('provider_configs', 'config', '配置内容，JSON格式');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('provider_configs', 'is_default', '是否为默认配置：0-否，1-是');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('provider_configs', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('provider_configs', 'updated_at', '更新时间');

-- roles 角色表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('roles', '对话角色表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('roles', 'id', '角色ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('roles', 'name', '角色名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('roles', 'description', '角色描述');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('roles', 'system_prompt', '系统提示词');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('roles', 'avatar', '头像路径');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('roles', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('roles', 'updated_at', '更新时间');

-- search_engine_configs 搜索引擎配置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('search_engine_configs', '搜索引擎配置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('search_engine_configs', 'id', '配置ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('search_engine_configs', 'name', '配置名称');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('search_engine_configs', 'engine_type', '引擎类型');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('search_engine_configs', 'api_key', 'API密钥');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('search_engine_configs', 'is_default', '是否为默认：0-否，1-是');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('search_engine_configs', 'created_at', '创建时间');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('search_engine_configs', 'updated_at', '更新时间');

-- settings 系统设置表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('settings', '系统设置表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('settings', 'key', '设置键，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('settings', 'value', '设置值');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('settings', 'updated_at', '更新时间');

-- translations 翻译记录表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('translations', '翻译记录表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('translations', 'id', '翻译ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('translations', 'source_text', '原文');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('translations', 'target_text', '译文');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('translations', 'source_lang', '源语言');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('translations', 'target_lang', '目标语言');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('translations', 'provider', '提供商');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('translations', 'created_at', '创建时间');

-- voice_records 语音记录表
INSERT OR REPLACE INTO db_table_comments (table_name, table_comment) VALUES ('voice_records', '语音记录表');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('voice_records', 'id', '记录ID，主键');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('voice_records', 'text', '文本内容');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('voice_records', 'audio_path', '音频路径');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('voice_records', 'voice_id', '声音ID');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('voice_records', 'provider', '提供商');
INSERT OR REPLACE INTO db_column_comments (table_name, column_name, column_comment) VALUES ('voice_records', 'created_at', '创建时间');