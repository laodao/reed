/**
 * 领域学习空间表（dl_project/dl_concept/dl_relation/dl_mastery_log/dl_card/dl_doc/dl_question/dl_note，共 8 张）
 *
 * 数据模型见 tasks/2026-09-07-domain-learning-space/design-v3.md §9 +
 * content-template-design.md（v4 内容模型）。树与图共享 dl_concept（node_type='group'
 * 为目录），关系边在 dl_relation，「前置依赖」边驱动学习门控。
 *
 * 兼容 SQLite + PG，幂等（ensureTable/ensureIndex）。接入点：
 * electron runMultiTenantMigrations / web initDatabase（与两端调用保持同构）。
 */
import type { DataSource } from 'typeorm'
import { ensureTable, ensureIndex, ensureColumn } from './migration-utils'

/** 创建全部 7 张 dl_* 表（若不存在）。 */
export async function createDomainLearningTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  await ensureTable(ds, isPg, 'dl_project', ddlProject(isPg), () => projectIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'dl_concept', ddlConcept(isPg), () => conceptIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'dl_relation', ddlRelation(isPg), () => relationIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'dl_mastery_log', ddlMasteryLog(isPg), () => masteryLogIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'dl_card', ddlCard(isPg), () => cardIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'dl_doc', ddlDoc(isPg), () => docIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'dl_question', ddlQuestion(isPg), () => questionIndexes(ds, isPg))
  await ensureTable(ds, isPg, 'dl_note', ddlNote(isPg), () => noteIndexes(ds, isPg))
  // M2-C：pace_settings 列（老库升级路径——ensureTable 只补索引，新增列显式 ALTER）
  await ensureColumn(
    ds,
    isPg,
    'dl_project',
    'pace_settings',
    isPg ? 'pace_settings text' : 'pace_settings TEXT',
  )
  // M3-B：review_settings 列
  await ensureColumn(
    ds,
    isPg,
    'dl_project',
    'review_settings',
    isPg ? 'review_settings text' : 'review_settings TEXT',
  )
  // M4-UX2：dl_card.verification 列（内部核验 JSON）
  await ensureColumn(
    ds,
    isPg,
    'dl_card',
    'verification',
    isPg ? 'verification text' : 'verification TEXT',
  )
}

// ==================== dl_project ====================

function ddlProject(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_project (
        id            varchar PRIMARY KEY,
        user_id       varchar,
        name          varchar NOT NULL,
        goal          varchar NOT NULL,
        profile_id    varchar,
        profile_json  text,
        status        varchar NOT NULL DEFAULT 'active',
        description   text,
        kb_id         varchar,
        default_model text,
        pace_settings text,
        review_settings text,
        created_at    timestamp,
        updated_at    timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_project (
      id            TEXT PRIMARY KEY,
      user_id       TEXT,
      name          TEXT NOT NULL,
      goal          TEXT NOT NULL,
      profile_id    TEXT,
      profile_json  TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      description   TEXT,
      kb_id         TEXT,
      default_model TEXT,
      pace_settings TEXT,
      review_settings TEXT,
      created_at    DATETIME,
      updated_at    DATETIME
    )
  `
}

async function projectIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_project_user', 'dl_project', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_project_status', 'dl_project', '(status)')
}

// ==================== dl_concept ====================

function ddlConcept(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_concept (
        id               varchar PRIMARY KEY,
        user_id          varchar,
        project_id       varchar NOT NULL,
        node_type        varchar NOT NULL,
        name             varchar NOT NULL,
        en               varchar,
        parent_id        varchar,
        definition_short text,
        research_state   varchar NOT NULL DEFAULT 'unresearched',
        mastery          varchar NOT NULL DEFAULT 'untouched',
        source           varchar NOT NULL DEFAULT 'material',
        attrs            text,
        card_id          varchar,
        note             text,
        created_at       timestamp,
        updated_at       timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_concept (
      id               TEXT PRIMARY KEY,
      user_id          TEXT,
      project_id       TEXT NOT NULL,
      node_type        TEXT NOT NULL,
      name             TEXT NOT NULL,
      en               TEXT,
      parent_id        TEXT,
      definition_short TEXT,
      research_state   TEXT NOT NULL DEFAULT 'unresearched',
      mastery          TEXT NOT NULL DEFAULT 'untouched',
      source           TEXT NOT NULL DEFAULT 'material',
      attrs            TEXT,
      card_id          TEXT,
      note             TEXT,
      created_at       DATETIME,
      updated_at       DATETIME
    )
  `
}

async function conceptIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_concept_user', 'dl_concept', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_concept_project_parent', 'dl_concept', '(project_id, parent_id)')
  await ensureIndex(ds, isPg, 'idx_dl_concept_project_type', 'dl_concept', '(project_id, node_type)')
  // 同级不重名（project + parent + name 唯一）。SQLite/PG 的 UNIQUE 均不把 NULL
  // 视为冲突值——parent_id IS NULL 的根目录行不受本约束（由服务层建空间时兜底）。
  await ensureIndex(
    ds,
    isPg,
    'uniq_dl_concept_sibling_name',
    'dl_concept',
    '(project_id, parent_id, name)',
    true,
  )
}

// ==================== dl_relation ====================

function ddlRelation(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_relation (
        id            varchar PRIMARY KEY,
        user_id       varchar,
        project_id    varchar NOT NULL,
        source_id     varchar NOT NULL,
        target_id     varchar NOT NULL,
        relation_type varchar NOT NULL,
        evidence      text,
        verified      integer NOT NULL DEFAULT 0,
        created_at    timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_relation (
      id            TEXT PRIMARY KEY,
      user_id       TEXT,
      project_id    TEXT NOT NULL,
      source_id     TEXT NOT NULL,
      target_id     TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      evidence      TEXT,
      verified      INTEGER NOT NULL DEFAULT 0,
      created_at    DATETIME
    )
  `
}

async function relationIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_relation_user', 'dl_relation', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_relation_project_source', 'dl_relation', '(project_id, source_id)')
  await ensureIndex(ds, isPg, 'idx_dl_relation_project_target', 'dl_relation', '(project_id, target_id)')
  // 三元唯一：同 project 下 (source, target, relation_type) 只允许一条（设计稿 §9；
  // 关系抽取/人工确认对同一边幂等 upsert）
  await ensureIndex(
    ds,
    isPg,
    'uniq_dl_relation_triple',
    'dl_relation',
    '(project_id, source_id, target_id, relation_type)',
    true,
  )
}

// ==================== dl_mastery_log ====================

function ddlMasteryLog(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_mastery_log (
        id          varchar PRIMARY KEY,
        user_id     varchar,
        project_id  varchar NOT NULL,
        concept_id  varchar NOT NULL,
        from_mastery varchar NOT NULL,
        to_mastery  varchar NOT NULL,
        trigger     varchar NOT NULL,
        at          timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_mastery_log (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      project_id  TEXT NOT NULL,
      concept_id  TEXT NOT NULL,
      from_mastery TEXT NOT NULL,
      to_mastery  TEXT NOT NULL,
      trigger     TEXT NOT NULL,
      at          DATETIME
    )
  `
}

async function masteryLogIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_mastery_log_user', 'dl_mastery_log', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_mastery_log_concept', 'dl_mastery_log', '(project_id, concept_id)')
}

// ==================== dl_card ====================

function ddlCard(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_card (
        id              varchar PRIMARY KEY,
        user_id         varchar,
        project_id      varchar NOT NULL,
        concept_id      varchar NOT NULL,
        essence_type    varchar NOT NULL,
        sections        text NOT NULL,
        works           text,
        content_md      text,
        evidence_sources text,
        version         integer NOT NULL DEFAULT 1,
        status          varchar NOT NULL DEFAULT 'draft',
        verification    text,
        created_at      timestamp,
        updated_at      timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_card (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      project_id      TEXT NOT NULL,
      concept_id      TEXT NOT NULL,
      essence_type    TEXT NOT NULL,
      sections        TEXT NOT NULL,
      works           TEXT,
      content_md      TEXT,
      evidence_sources TEXT,
      version         INTEGER NOT NULL DEFAULT 1,
      status          TEXT NOT NULL DEFAULT 'draft',
      verification    TEXT,
      created_at      DATETIME,
      updated_at      DATETIME
    )
  `
}

async function cardIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_card_user', 'dl_card', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_card_concept', 'dl_card', '(project_id, concept_id)')
}

// ==================== dl_doc ====================

function ddlDoc(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_doc (
        id          varchar PRIMARY KEY,
        user_id     varchar,
        project_id  varchar NOT NULL,
        doc_type    varchar NOT NULL,
        title       varchar NOT NULL,
        concept_ids text,
        content_md  text,
        created_at  timestamp,
        published_at timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_doc (
      id           TEXT PRIMARY KEY,
      user_id      TEXT,
      project_id   TEXT NOT NULL,
      doc_type     TEXT NOT NULL,
      title        TEXT NOT NULL,
      concept_ids  TEXT,
      content_md   TEXT,
      created_at   DATETIME,
      published_at DATETIME
    )
  `
}

async function docIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_doc_user', 'dl_doc', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_doc_project_type', 'dl_doc', '(project_id, doc_type)')
}

// ==================== dl_question ====================

function ddlQuestion(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_question (
        id            varchar PRIMARY KEY,
        user_id       varchar,
        project_id    varchar NOT NULL,
        concept_id    varchar,
        question      text NOT NULL,
        answer_md     text,
        answer_source varchar,
        status        varchar NOT NULL DEFAULT 'open',
        created_at    timestamp,
        answered_at   timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_question (
      id            TEXT PRIMARY KEY,
      user_id       TEXT,
      project_id    TEXT NOT NULL,
      concept_id    TEXT,
      question      TEXT NOT NULL,
      answer_md     TEXT,
      answer_source TEXT,
      status        TEXT NOT NULL DEFAULT 'open',
      created_at    DATETIME,
      answered_at   DATETIME
    )
  `
}

async function questionIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_question_user', 'dl_question', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_question_project_status', 'dl_question', '(project_id, status)')
}

// ==================== dl_note ====================

function ddlNote(pg: boolean): string {
  if (pg) {
    return `
      CREATE TABLE dl_note (
        id           varchar PRIMARY KEY,
        user_id      varchar,
        project_id   varchar NOT NULL,
        concept_id   varchar,
        source       varchar NOT NULL,
        anchor_text  text,
        anchor_start integer,
        anchor_end   integer,
        question_id  varchar,
        content_md   text NOT NULL,
        created_at   timestamp
      )
    `
  }
  return `
    CREATE TABLE dl_note (
      id           TEXT PRIMARY KEY,
      user_id      TEXT,
      project_id   TEXT NOT NULL,
      concept_id   TEXT,
      source       TEXT NOT NULL,
      anchor_text  TEXT,
      anchor_start INTEGER,
      anchor_end   INTEGER,
      question_id  TEXT,
      content_md   TEXT NOT NULL,
      created_at   DATETIME
    )
  `
}

async function noteIndexes(ds: DataSource, isPg: boolean): Promise<void> {
  await ensureIndex(ds, isPg, 'idx_dl_note_user', 'dl_note', '(user_id)')
  await ensureIndex(ds, isPg, 'idx_dl_note_project_concept', 'dl_note', '(project_id, concept_id)')
  // 2026-09-09 复盘：同空间同一问题只允许一条收藏笔记（qna 收藏幂等的库级兜底；
  // 消除"同问题多行 + findByQuestion 同毫秒排序不稳"；question_id 为 NULL 的选区笔记不受限）
  await ensureIndex(ds, isPg, 'uniq_dl_note_question', 'dl_note', '(project_id, question_id)', true)
}
