<template>
  <div class="folder-tree-item">
    <div
      class="folder-item"
      :class="{ active: currentFolder?.id === folder.id }"
      :style="{ paddingLeft: `${level * 16 + 12}px` }"
    >
      <!-- 展开/收起按钮 -->
      <div
        v-if="hasChildren"
        class="expand-btn"
        @click.stop="$emit('toggle', folder.id)"
      >
        <el-icon :class="{ expanded: isExpanded }">
          <ArrowRight />
        </el-icon>
      </div>
      <div v-else class="expand-placeholder"></div>

      <!-- 目录内容 -->
      <div class="folder-content" @click="handleClick">
        <div class="folder-icon">
          <el-icon><Folder /></el-icon>
        </div>
        <div class="folder-name">{{ folder.name }}</div>
      </div>

      <!-- 右侧信息 -->
      <div class="folder-right">
        <span class="folder-stats">{{ folder.entryCount || 0 }} 篇</span>
        <div class="folder-actions" @click.stop>
          <el-dropdown trigger="click" @command="handleCommand">
            <el-button text size="small">
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="create-subfolder">
                  <el-icon><Plus /></el-icon>
                  新建子目录
                </el-dropdown-item>
                <el-dropdown-item command="rename">
                  <el-icon><Edit /></el-icon>
                  重命名
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 子目录 -->
    <div v-if="isExpanded && hasChildren" class="folder-children">
      <FolderTreeItem
        v-for="child in children"
        :key="child.id"
        :folder="child"
        :all-folders="allFolders"
        :current-folder="currentFolder"
        :expanded-folders="expandedFolders"
        :level="level + 1"
        @select="(f: DiaryFolder) => $emit('select', f)"
        @toggle="(id: string) => $emit('toggle', id)"
        @action="(cmd: string, f: DiaryFolder) => $emit('action', cmd, f)"
        @create-subfolder="(f: DiaryFolder) => $emit('create-subfolder', f)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Folder, MoreFilled, ArrowRight, Plus, Edit, Delete } from '@element-plus/icons-vue'
import type { DiaryFolder } from '@shared/types/diary'

const props = withDefaults(defineProps<{
  folder: DiaryFolder
  allFolders: DiaryFolder[]
  currentFolder: DiaryFolder | null
  expandedFolders: Set<string>
  level?: number
}>(), {
  level: 0
})

const emit = defineEmits<{
  select: [folder: DiaryFolder]
  toggle: [folderId: string]
  action: [command: string, folder: DiaryFolder]
  'create-subfolder': [folder: DiaryFolder]
}>()

const isExpanded = computed(() => props.expandedFolders.has(props.folder.id))
const children = computed(() => props.allFolders.filter(f => f.parentId === props.folder.id))
const hasChildren = computed(() => children.value.length > 0)

function handleClick() {
  // 选中目录
  emit('select', props.folder)
  // 如果有子目录，自动展开/收起
  if (hasChildren.value) {
    emit('toggle', props.folder.id)
  }
}

function handleCommand(command: string) {
  if (command === 'create-subfolder') {
    emit('create-subfolder', props.folder)
  } else {
    emit('action', command, props.folder)
  }
}
</script>

<style lang="scss" scoped>
.folder-tree-item {
  user-select: none;
}

.folder-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.2s;
  border-radius: 4px;
  margin: 1px 4px;

  &:hover {
    background: var(--fill-color-light);

    .folder-actions {
      opacity: 1;
    }
  }

  &.active {
    background: var(--color-primary-light-9);

    .folder-icon {
      color: var(--color-primary);
    }
  }
}

.expand-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 4px;

  .el-icon {
    transition: transform 0.2s;
    font-size: 12px;
    color: var(--text-color-secondary);

    &.expanded {
      transform: rotate(90deg);
    }
  }

  &:hover {
    background: var(--fill-color);
    border-radius: 4px;
  }
}

.expand-placeholder {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-right: 4px;
}

.folder-content {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.folder-icon {
  margin-right: 6px;
  color: var(--text-color-secondary);
  font-size: 16px;
}

.folder-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.folder-stats {
  font-size: 12px;
  color: var(--text-color-placeholder);
  padding: 0 4px;
}

.folder-actions {
  opacity: 0;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.folder-children {
  // 子目录样式
}
</style>