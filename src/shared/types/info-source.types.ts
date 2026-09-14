/**
 * 信息来源（通用外部信息源目录）
 * @module shared/types/info-source.types
 * @description 系统级「信息来源」目录，供工作流采集节点与各业务模块（领域学习等）引用。
 *
 * 三层结构（与数据库表一一对应）：
 * - 类别 `info_source_categories`：设置界面上的一个 tab。内置「新闻来源」(news)，
 *   用户可新增任意类别（如 金融信息来源 / 物理信息来源）。
 * - 分组 `info_source_topics`：类别内的一级分组（原「新闻主题」）。每个类别有且仅有一个
 *   `未分组` 默认分组（isDefault）——用户新建来源时不选分组即落入该组，
 *   因此「允许不要分组」与「按分组归档」两套用法共用同一套数据。
 * - 来源 `info_sources`：名称 + URL（原「新闻来源」），分组的直接子项。
 *
 * 命名沿革：本模块由「新闻来源」泛化而来，表名与类型已统一为 info_source_*；
 * 迁移 create-info-sources 会把存量 news_topics / news_sources 数据整体搬过来。
 */

/** 内置「新闻来源」类别 id（工作流兼容：老工作流未选类别时默认取它） */
export const INFO_SOURCE_NEWS_CATEGORY_ID = 'news'

/** 默认分组显示名（未指定分组的来源统一落在这里） */
export const INFO_SOURCE_DEFAULT_TOPIC_NAME = '未分组'

/** 信息来源类别（设置界面 tab） */
export interface InfoSourceCategoryRecord {
  id: string
  userId: string | null
  /** 类别显示名（如 新闻来源 / 金融信息来源） */
  name: string
  /** 内置类别禁删禁改（全局共享） */
  isBuiltin: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 信息来源分组（类别内的一级分组） */
export interface InfoSourceTopicRecord {
  id: string
  userId: string | null
  /** 所属类别 id */
  categoryId: string
  name: string
  isBuiltin: boolean
  /** 默认分组（未分组）：系统按需创建，界面按「未分组」呈现 */
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/** 信息来源（名称 + URL） */
export interface InfoSourceRecord {
  id: string
  userId: string | null
  /** 所属分组 id */
  topicId: string
  /** 所属类别 id（由其分组推导，仅便于前端标注与联动过滤） */
  categoryId: string
  name: string
  url: string
  isBuiltin: boolean
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}
