/**
 * 知识大脑 6 表迁移（kb_brain，详细设计 §1.8）
 *
 * 一函数建 6 表（kb_atoms / kb_entities / kb_knowledge_edges / kb_notes /
 * kb_digest_passes / kb_note_reviews）+ knowledge_bases 补 brain_config /
 * brain_state 两列。幂等；兼容 SQLite + PG（方言分支照 create-kb-chapters）。
 *
 * 注册点（双入口，防漏单端——PR checklist 必查）：
 * - Electron: src/electron/database/index.ts runMultiTenantMigrations
 * - Web:      src/web/server/index.ts ensurePgvectorKbVectors 同层
 */
import type { DataSource } from 'typeorm'

async function checkTableExists(ds: DataSource, table: string, isPg: boolean): Promise<boolean> {
  const sql = isPg
    ? `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${table}' AND table_schema = current_schema()`
    : `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${table}'`
  const rows = (await ds.query(sql)) as Array<{ count: number }>
  return Number(rows[0]?.count ?? 0) > 0
}

async function checkColumnExists(ds: DataSource, table: string, column: string, isPg: boolean): Promise<boolean> {
  const sql = isPg
    ? `SELECT COUNT(*) as count FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}' AND table_schema = current_schema()`
    : `PRAGMA table_info(${table})`
  const rows = (await ds.query(sql)) as Array<Record<string, unknown>>
  if (isPg) return Number(rows[0]?.count ?? 0) > 0
  return rows.some((r) => r['name'] === column)
}

export async function createKbBrainTables(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'
  const vc = isPg ? 'varchar' : 'TEXT'
  const dt = isPg ? 'timestamp' : 'datetime'
  const rl = isPg ? 'real' : 'REAL'

  // ---------- kb_atoms（论断，§1.1） ----------
  if (!(await checkTableExists(ds, 'kb_atoms', isPg))) {
    await ds.query(`
      CREATE TABLE kb_atoms (
        id                   ${vc} PRIMARY KEY,
        user_id              ${vc},
        knowledge_base_id    ${vc} NOT NULL,
        statement            ${vc} NOT NULL,
        type                 ${vc} NOT NULL DEFAULT 'fact',
        status               ${vc} NOT NULL DEFAULT 'supported',
        certainty            ${rl} NOT NULL DEFAULT 0.8,
        valid_from           ${vc},
        valid_until          ${vc},
        source_document_id   ${vc} NOT NULL,
        source_chapter_id    ${vc},
        source_chapter_hash  ${vc},
        source_chunk_id      ${vc},
        source_quote         ${vc} NOT NULL,
        start_offset         INTEGER,
        end_offset           INTEGER,
        subject_entity_id    ${vc},
        object_entity_id     ${vc},
        lens_note_id         ${vc},
        extraction_pass      ${vc} NOT NULL DEFAULT 'base#1',
        origin               ${vc} NOT NULL DEFAULT 'ai',
        use_count            INTEGER NOT NULL DEFAULT 0,
        last_used_at         ${dt},
        superseded_by_atom_id ${vc},
        created_at           ${dt},
        updated_at           ${dt}
      )
    `)
    console.log('[create-kb-brain-tables] 表 kb_atoms 创建完成')
  }
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_atoms_kb_status ON kb_atoms (knowledge_base_id, status)',
  )
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_atoms_doc ON kb_atoms (source_document_id)')
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_atoms_subj ON kb_atoms (subject_entity_id)')
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_atoms_obj ON kb_atoms (object_entity_id)')
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_atoms_lens ON kb_atoms (lens_note_id)')
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_atoms_pass ON kb_atoms (source_document_id, extraction_pass)',
  )

  // ---------- kb_entities（实体，§1.2） ----------
  if (!(await checkTableExists(ds, 'kb_entities', isPg))) {
    await ds.query(`
      CREATE TABLE kb_entities (
        id                ${vc} PRIMARY KEY,
        user_id           ${vc},
        knowledge_base_id ${vc} NOT NULL,
        name              ${vc} NOT NULL,
        aliases           ${vc} NOT NULL DEFAULT '[]',
        entity_type       ${vc} NOT NULL DEFAULT 'concept',
        summary           ${vc},
        summary_status    ${vc} NOT NULL DEFAULT 'pending',
        status            ${vc} NOT NULL DEFAULT 'active',
        target_entity_id  ${vc},
        created_at        ${dt},
        updated_at        ${dt},
        CONSTRAINT uq_kb_entities_kb_name UNIQUE (knowledge_base_id, name)
      )
    `)
    console.log('[create-kb-brain-tables] 表 kb_entities 创建完成')
  }
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_entities_kb_type ON kb_entities (knowledge_base_id, entity_type)',
  )

  // ---------- kb_knowledge_edges（语义边，§1.3） ----------
  if (!(await checkTableExists(ds, 'kb_knowledge_edges', isPg))) {
    await ds.query(`
      CREATE TABLE kb_knowledge_edges (
        id                ${vc} PRIMARY KEY,
        user_id           ${vc},
        knowledge_base_id ${vc} NOT NULL,
        source_kind       ${vc} NOT NULL,
        source_id         ${vc} NOT NULL,
        relation          ${vc} NOT NULL,
        target_kind       ${vc} NOT NULL,
        target_id         ${vc} NOT NULL,
        evidence          ${vc} NOT NULL,
        confidence        ${rl} NOT NULL DEFAULT 0.7,
        origin            ${vc} NOT NULL DEFAULT 'ai',
        verified          INTEGER NOT NULL DEFAULT 0,
        created_at        ${dt},
        CONSTRAINT uq_kb_edges_unique UNIQUE (source_kind, source_id, relation, target_kind, target_id)
      )
    `)
    console.log('[create-kb-brain-tables] 表 kb_knowledge_edges 创建完成')
  }
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_edges_src ON kb_knowledge_edges (source_kind, source_id)',
  )
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_edges_tgt ON kb_knowledge_edges (target_kind, target_id)',
  )

  // ---------- kb_notes（卡片，§1.4） ----------
  if (!(await checkTableExists(ds, 'kb_notes', isPg))) {
    await ds.query(`
      CREATE TABLE kb_notes (
        id                  ${vc} PRIMARY KEY,
        user_id             ${vc},
        knowledge_base_id   ${vc} NOT NULL,
        title               ${vc} NOT NULL,
        description         ${vc} NOT NULL,
        body                ${vc} NOT NULL DEFAULT '',
        type                ${vc} NOT NULL,
        status              ${vc} NOT NULL DEFAULT 'proposed',
        evidence            ${vc} NOT NULL DEFAULT '[]',
        origin              ${vc} NOT NULL DEFAULT 'ai-distill',
        version             INTEGER NOT NULL DEFAULT 1,
        pattern_skeleton    ${vc},
        pattern_instances   ${vc},
        lens_attention      ${vc},
        classic_score       ${rl} NOT NULL DEFAULT 0,
        superseded_note_id  ${vc},
        tags                ${vc} NOT NULL DEFAULT '[]',
        fsrs_stability      ${rl},
        fsrs_difficulty     ${rl},
        last_review_at      ${dt},
        review_count        INTEGER NOT NULL DEFAULT 0,
        lapse_count         INTEGER NOT NULL DEFAULT 0,
        cited_count         INTEGER NOT NULL DEFAULT 0,
        last_cited_at       ${dt},
        created_at          ${dt},
        updated_at          ${dt}
      )
    `)
    console.log('[create-kb-brain-tables] 表 kb_notes 创建完成')
  }
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_notes_kb_type_status ON kb_notes (knowledge_base_id, type, status)',
  )
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_notes_kb_status ON kb_notes (knowledge_base_id, status)')

  // ---------- kb_digest_passes（消化台账，§1.5） ----------
  if (!(await checkTableExists(ds, 'kb_digest_passes', isPg))) {
    await ds.query(`
      CREATE TABLE kb_digest_passes (
        id                ${vc} PRIMARY KEY,
        user_id           ${vc},
        knowledge_base_id ${vc} NOT NULL,
        document_id       ${vc} NOT NULL,
        chapter_id        ${vc},
        pass_type         ${vc} NOT NULL,
        pass_key          ${vc} NOT NULL,
        chapter_hash      ${vc},
        status            ${vc} NOT NULL DEFAULT 'pending',
        stats_json        ${vc},
        cost_json         ${vc},
        error             ${vc},
        attempts          INTEGER NOT NULL DEFAULT 0,
        created_at        ${dt},
        updated_at        ${dt},
        CONSTRAINT uq_kb_digest_passes_chapter_pass UNIQUE (chapter_id, pass_key)
      )
    `)
    console.log('[create-kb-brain-tables] 表 kb_digest_passes 创建完成')
  }
  await ds.query(
    'CREATE INDEX IF NOT EXISTS idx_kb_digest_passes_pending ON kb_digest_passes (status, updated_at)',
  )

  // ---------- kb_note_reviews（复习日志，§1.7） ----------
  if (!(await checkTableExists(ds, 'kb_note_reviews', isPg))) {
    await ds.query(`
      CREATE TABLE kb_note_reviews (
        id             ${vc} PRIMARY KEY,
        user_id        ${vc},
        note_id        ${vc} NOT NULL,
        kb_id          ${vc} NOT NULL,
        rating         INTEGER NOT NULL,
        scheduled_days ${rl},
        elapsed_days   ${rl},
        reviewed_at    ${dt} NOT NULL
      )
    `)
    console.log('[create-kb-brain-tables] 表 kb_note_reviews 创建完成')
  }
  await ds.query('CREATE INDEX IF NOT EXISTS idx_kb_note_reviews_note ON kb_note_reviews (note_id)')

  // ---------- knowledge_bases 补列（brain_config 开关 + brain_state 运行态） ----------
  // 表存在才补列（防御：测试内存库/极端老库可能未建基表——基表由基础迁移负责）
  if (await checkTableExists(ds, 'knowledge_bases', isPg)) {
    if (!(await checkColumnExists(ds, 'knowledge_bases', 'brain_config', isPg))) {
      await ds.query(`ALTER TABLE knowledge_bases ADD COLUMN brain_config ${vc}`)
      console.log('[create-kb-brain-tables] knowledge_bases 加列 brain_config')
    }
    if (!(await checkColumnExists(ds, 'knowledge_bases', 'brain_state', isPg))) {
      await ds.query(`ALTER TABLE knowledge_bases ADD COLUMN brain_state ${vc}`)
      console.log('[create-kb-brain-tables] knowledge_bases 加列 brain_state')
    }
  }

  // ---------- kb_documents 补列（消化进度，与现有 status/progress 并列不混用，详细设计 §3.1） ----------
  if (await checkTableExists(ds, 'kb_documents', isPg)) {
    if (!(await checkColumnExists(ds, 'kb_documents', 'brain_status', isPg))) {
      await ds.query(`ALTER TABLE kb_documents ADD COLUMN brain_status ${vc}`)
      console.log('[create-kb-brain-tables] kb_documents 加列 brain_status')
    }
    if (!(await checkColumnExists(ds, 'kb_documents', 'brain_progress', isPg))) {
      await ds.query(`ALTER TABLE kb_documents ADD COLUMN brain_progress INTEGER`)
      console.log('[create-kb-brain-tables] kb_documents 加列 brain_progress')
    }
    if (!(await checkColumnExists(ds, 'kb_documents', 'brain_error', isPg))) {
      await ds.query(`ALTER TABLE kb_documents ADD COLUMN brain_error ${vc}`)
      console.log('[create-kb-brain-tables] kb_documents 加列 brain_error')
    }
  }
}
