# 剧集制作模块数据库优化方案

## 一、当前设计问题分析

### 1. 第三范式原则回顾

第三范式（3NF）要求：
1. 符合第二范式（2NF）：每个非主键属性完全依赖于主键
2. 消除传递依赖：非主键属性不能依赖于其他非主键属性
3. 数据原子性：每个字段存储不可再分的原子值

### 2. 当前设计违反第三范式的问题

| 表名 | 问题字段 | 问题描述 | 违反原则 |
|------|----------|----------|----------|
| episode_scripts | scenes | 冗余存储场景列表，场景已存在于scene_scripts表 | 数据冗余 |
| episode_scripts | character_appearances | JSON存储角色ID列表，可通过查询获取 | 数据冗余 |
| scene_scripts | characters | JSON存储角色信息，应拆分为独立表 | 非原子性 |
| scene_scripts | dialogues | JSON存储对话列表，应拆分为独立表 | 非原子性 |
| scene_scripts | actions | JSON存储动作列表，应拆分为独立表 | 非原子性 |
| storyboards | characters | JSON存储角色信息，应拆分为独立表 | 非原子性 |
| storyboards | dialogue_ids | JSON存储对话ID引用，冗余 | 数据冗余 |
| storyboards | action_ids | JSON存储动作ID引用，冗余 | 数据冗余 |
| storyboards | frame_image | JSON存储完整图像资产，应使用关联 | 非原子性 |
| video_episodes | audio_tracks | JSON存储音轨列表，应拆分为独立表 | 非原子性 |
| character_bindings | voice_config | JSON存储声音配置，应拆分为独立字段 | 非原子性 |

## 二、优化方案

### 2.1 保留的表结构（符合第三范式）

#### video_projects 表
```sql
CREATE TABLE video_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  long_writing_project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (long_writing_project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
)
```

#### character_bindings 表
```sql
CREATE TABLE character_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  long_writing_character_id TEXT NOT NULL,
  portrait_id TEXT,
  -- 声音配置拆分为独立字段
  voice_id TEXT NOT NULL,
  voice_speed REAL NOT NULL DEFAULT 1.0,
  voice_pitch REAL NOT NULL DEFAULT 1.0,
  -- 生成配置拆分为独立字段
  base_description TEXT,
  style_reference TEXT,
  additional_prompts TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (portrait_id) REFERENCES portrait_characters(id) ON DELETE SET NULL
)
```

### 2.2 需要移除冗余字段的表

#### episode_scripts 表（移除冗余字段）
```sql
CREATE TABLE episode_scripts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  outline_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  synopsis TEXT,
  total_duration INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES video_episodes(id) ON DELETE CASCADE
)
```
**变更说明**：移除 `scenes` 和 `character_appearances` 字段，这些数据可通过查询获取。

#### video_episodes 表（移除冗余字段）
```sql
CREATE TABLE video_episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  outline_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  duration INTEGER DEFAULT 0,
  script_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
)
```
**变更说明**：移除 `audio_tracks` 字段，使用独立的音轨表。

### 2.3 需要重构的表

#### scene_scripts 表（移除JSON字段，保留基本场景信息）
```sql
CREATE TABLE scene_scripts (
  id TEXT PRIMARY KEY,
  episode_script_id TEXT NOT NULL,
  scene_number INTEGER NOT NULL,
  location TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'exterior',
  time_of_day TEXT NOT NULL DEFAULT 'morning',
  weather TEXT,
  scene_description TEXT NOT NULL,
  mood TEXT,
  lighting TEXT,
  original_text TEXT,
  narration TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (episode_script_id) REFERENCES episode_scripts(id) ON DELETE CASCADE
)
```
**变更说明**：移除 `characters`、`dialogues`、`actions` JSON字段，使用独立的子表。

#### storyboards 表（移除JSON字段）
```sql
CREATE TABLE storyboards (
  id TEXT PRIMARY KEY,
  scene_script_id TEXT NOT NULL,
  shot_number INTEGER NOT NULL,
  shot_type TEXT NOT NULL DEFAULT 'medium',
  camera_angle TEXT NOT NULL DEFAULT 'eye_level',
  camera_movement TEXT NOT NULL DEFAULT 'static',
  movement_duration REAL,
  frame_description TEXT NOT NULL,
  subject TEXT,
  composition TEXT,
  duration REAL NOT NULL DEFAULT 3,
  -- 转场配置拆分为独立字段
  transition_type TEXT NOT NULL DEFAULT 'cut',
  transition_duration INTEGER NOT NULL DEFAULT 500,
  transition_direction TEXT,
  transition_easing TEXT DEFAULT 'ease_out',
  transition_color TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  frame_image_id TEXT,
  narration_audio_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE,
  FOREIGN KEY (frame_image_id) REFERENCES image_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (narration_audio_id) REFERENCES audio_assets(id) ON DELETE SET NULL
)
```
**变更说明**：
- 移除 `characters`、`dialogue_ids`、`action_ids`、`frame_image` JSON字段
- 转场配置拆分为独立字段
- 使用外键关联图像和音频资产

### 2.4 新增的子表

#### 场景角色关联表 (scene_characters)
```sql
CREATE TABLE scene_characters (
  id TEXT PRIMARY KEY,
  scene_script_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  position TEXT DEFAULT 'center',
  expression TEXT,
  action TEXT,
  outfit TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE
)
```

#### 场景道具关联表 (scene_props)
```sql
CREATE TABLE scene_props (
  id TEXT PRIMARY KEY,
  scene_character_id TEXT NOT NULL,
  prop_name TEXT NOT NULL,
  FOREIGN KEY (scene_character_id) REFERENCES scene_characters(id) ON DELETE CASCADE
)
```

#### 对话表 (scene_dialogues)
```sql
CREATE TABLE scene_dialogues (
  id TEXT PRIMARY KEY,
  scene_script_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  text TEXT NOT NULL,
  emotion TEXT,
  volume TEXT DEFAULT 'normal',
  pace TEXT DEFAULT 'normal',
  pause INTEGER DEFAULT 0,
  voice_id TEXT,
  audio_asset_id TEXT,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE,
  FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE SET NULL
)
```

#### 动作表 (scene_actions)
```sql
CREATE TABLE scene_actions (
  id TEXT PRIMARY KEY,
  scene_script_id TEXT NOT NULL,
  character_id TEXT,
  description TEXT NOT NULL,
  timing TEXT NOT NULL DEFAULT 'during',
  duration REAL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE
)
```

#### 分镜角色关联表 (storyboard_characters)
```sql
CREATE TABLE storyboard_characters (
  id TEXT PRIMARY KEY,
  storyboard_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  position_x REAL NOT NULL DEFAULT 50,
  position_y REAL NOT NULL DEFAULT 50,
  position_scale REAL NOT NULL DEFAULT 1.0,
  expression TEXT,
  action TEXT,
  facing TEXT DEFAULT 'front',
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
)
```

#### 分镜对话关联表 (storyboard_dialogue_links)
```sql
CREATE TABLE storyboard_dialogue_links (
  id TEXT PRIMARY KEY,
  storyboard_id TEXT NOT NULL,
  dialogue_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
)
```

#### 分镜动作关联表 (storyboard_action_links)
```sql
CREATE TABLE storyboard_action_links (
  id TEXT PRIMARY KEY,
  storyboard_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (action_id) REFERENCES scene_actions(id) ON DELETE CASCADE
)
```

### 2.5 资产表

#### 图像资产表 (image_assets)
```sql
CREATE TABLE image_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  image_path TEXT NOT NULL,
  thumbnail_path TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
)
```

#### 音频资产表 (audio_assets)
```sql
CREATE TABLE audio_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT,
  voice_id TEXT,
  audio_path TEXT NOT NULL,
  duration INTEGER NOT NULL,
  volume INTEGER DEFAULT 100,
  fade_in INTEGER,
  fade_out INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
)
```

#### 音轨表 (audio_tracks)
```sql
CREATE TABLE audio_tracks (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  volume INTEGER DEFAULT 100,
  muted INTEGER DEFAULT 0,
  solo INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (episode_id) REFERENCES video_episodes(id) ON DELETE CASCADE
)
```

#### 音轨音频关联表 (audio_track_items)
```sql
CREATE TABLE audio_track_items (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  audio_asset_id TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (track_id) REFERENCES audio_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE CASCADE
)
```

## 三、优化后的数据关系图

```
video_projects
├── character_bindings
│   └── scene_characters (通过 character_id 关联)
├── video_episodes
│   ├── episode_scripts
│   │   ├── scene_scripts
│   │   │   ├── scene_characters
│   │   │   │   └── scene_props
│   │   │   ├── scene_dialogues
│   │   │   └── scene_actions
│   │   └── storyboards
│   │       ├── storyboard_characters
│   │       ├── storyboard_dialogue_links
│   │       └── storyboard_action_links
│   └── audio_tracks
│       └── audio_track_items
├── image_assets
└── audio_assets
```

## 四、迁移策略

### 4.1 迁移步骤

1. **创建新表**：先创建所有新表结构
2. **数据迁移**：将JSON字段数据拆分到新表
3. **更新外键**：建立表间关联
4. **删除旧字段**：确认数据迁移完成后删除冗余字段
5. **更新Repository**：修改仓库层代码适配新结构

### 4.2 兼容性处理

在迁移期间，保留原有JSON字段的读取兼容：
- 新数据写入新表结构
- 读取时优先从新表读取，若无数据则从JSON字段读取

## 五、优化收益

1. **数据一致性**：消除数据冗余，避免数据不一致
2. **查询性能**：可通过索引优化关联查询
3. **扩展性**：易于添加新字段和功能
4. **维护性**：结构清晰，易于理解和维护
5. **符合规范**：完全符合数据库设计第三范式