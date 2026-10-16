/**
 * 知识大脑测试基建（内存库共享建表）
 *
 * knowledge_bases / kb_documents 是存量表（迁移不建），大脑相关测试用最小 DDL
 * 手工建出——列清单与 entity 严格对齐（schema-drift 行为级一致性）。
 */
import type { DataSource } from 'typeorm'
import { setDefaultUser, LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { createKbBrainTables } from '@core/database/migrations/create-kb-brain-tables'
import { createKbChapters } from '@core/database/migrations/create-kb-chapters'
import { createKbBrainEvents } from '@core/database/migrations/create-kb-brain-events'
import { addKbEntityScope } from '@core/database/migrations/add-kb-entity-scope'
import { addKbAtomRole } from '@core/database/migrations/add-kb-atom-role'
import { createKbBrainDimensions } from '@core/database/migrations/create-kb-brain-dimensions'
import { addKbBrainV3Structures } from '@core/database/migrations/add-kb-brain-v3-structures'
import { createKbConsumptionLog } from '@core/database/migrations/create-kb-consumption-log'
import { createKbBrainP4Tables } from '@core/database/migrations/create-kb-brain-p4-tables'
import { createUnifiedGraphTables } from '@core/database/migrations/create-unified-graph-tables'

export async function createKbBrainTestTables(ds: DataSource): Promise<void> {
  // 生产语义：ALS 默认用户（Electron 启动即注入）——scoped 写入/查询都按此用户
  setDefaultUser(LOCAL_DEFAULT_USER_ID)
  await ds.query(`CREATE TABLE knowledge_bases (
    id varchar PRIMARY KEY, user_id varchar, name varchar NOT NULL,
    description text, embedding_model varchar NOT NULL, embedding_provider varchar NOT NULL,
    embedding_dimension INTEGER DEFAULT 1536, embedding_config TEXT,
    rerank_config TEXT, brain_config TEXT, brain_state TEXT, folder_id varchar,
    document_count INTEGER DEFAULT 0, vector_count INTEGER DEFAULT 0, total_size INTEGER DEFAULT 0,
    created_at datetime, updated_at datetime
  )`)
  await ds.query(`CREATE TABLE kb_documents (
    id varchar PRIMARY KEY, user_id varchar, knowledge_base_id varchar NOT NULL,
    name varchar NOT NULL, file_path text NOT NULL, file_type varchar NOT NULL,
    file_size INTEGER DEFAULT 0, status varchar DEFAULT 'pending', progress INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0, error_message text, metadata text,
    source_type varchar, source_id varchar,
    brain_status varchar, brain_progress INTEGER, brain_error text,
    created_at datetime, updated_at datetime
  )`)
  await createKbBrainTables(ds)
  await createKbBrainEvents(ds)
  await addKbEntityScope(ds)
  await addKbAtomRole(ds)
  await createKbBrainDimensions(ds)
  await addKbBrainV3Structures(ds)
  await createKbConsumptionLog(ds)
  await createKbBrainP4Tables(ds)
  // 语义边仓储已是统一图存储 facade——graph_edges 必须就绪
  await createUnifiedGraphTables(ds)
  await createKbChapters(ds)
  // 存量表：切片（大脑检索的 docLen/结果解析需要）
  await ds.query(`CREATE TABLE IF NOT EXISTS kb_chunks (
    id varchar PRIMARY KEY, user_id varchar,
    document_id varchar NOT NULL, knowledge_base_id varchar NOT NULL,
    content text NOT NULL, chunk_index INTEGER DEFAULT 0,
    start_offset INTEGER, end_offset INTEGER,
    title text, level INTEGER DEFAULT 1, parent_chunk_id text,
    split_method text, section_path text, metadata text,
    created_at datetime
  )`)
  // 存量表：倒排索引（对齐 kb-inverted-index.entity DDL）
  await ds.query(`CREATE TABLE IF NOT EXISTS kb_inverted_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL, chunk_id TEXT NOT NULL,
    knowledge_base_id TEXT NOT NULL,
    term_frequency INTEGER DEFAULT 1,
    positions TEXT,
    UNIQUE(term, chunk_id)
  )`)
}

/** 插入一个最小知识库行（brain_config 可选） */
export async function insertTestKb(
  ds: DataSource,
  input: { id: string; brainConfig?: string },
): Promise<void> {
  await ds.query(
    `INSERT INTO knowledge_bases (id, user_id, name, embedding_model, embedding_provider, brain_config)
     VALUES ('${input.id}', '${LOCAL_DEFAULT_USER_ID}', '测试库-${input.id}', 'm', 'cloud', ${input.brainConfig ? `'${input.brainConfig.replace(/'/g, "''")}'` : 'null'})`,
  )
}

/** 插入一个最小文档行 */
export async function insertTestDoc(
  ds: DataSource,
  input: { id: string; kbId: string },
): Promise<void> {
  await ds.query(
    `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type)
     VALUES ('${input.id}', '${LOCAL_DEFAULT_USER_ID}', '${input.kbId}', '测试书-${input.id}', '/tmp/${input.id}.txt', 'txt')`,
  )
}
