/**
 * Vector Store registry：启动时由 PC / Web 各自调用，按 mode 注册具体实现。
 * @module core/services/vector/registry
 */

import { LanceDBService } from '@core/services/lance-db.service'
import { LanceDBVectorStore } from './lance-db-vector-store'
import { PgVectorStore } from './pg-vector-store'
import { registerVectorStore, type IVectorStore } from './vector-store.interface'

export type VectorStoreMode = 'lance' | 'pgvector'

export interface InitVectorStoreOpts {
  mode: VectorStoreMode
  /** mode='lance' 时必填：LanceDB 本地数据目录 */
  dataPath?: string
}

/**
 * 启动 vector store。重复调用将覆盖之前的注册。
 *
 * @param opts.mode 'lance' 用 LanceDBVectorStore；'pgvector' 用 PgVectorStore
 *                  （需 PG 装 pgvector extension）
 * @throws mode='lance' 但 dataPath 缺失；mode='pgvector' 但 PG 未装 vector extension
 */
export async function initVectorStore(opts: InitVectorStoreOpts): Promise<void> {
  if (opts.mode === 'lance') {
    if (!opts.dataPath) {
      throw new Error('[initVectorStore] mode=lance 需要 dataPath')
    }
    const lance = LanceDBService.getInstance()
    await lance.initialize(opts.dataPath)
    const store: IVectorStore = new LanceDBVectorStore(lance)
    registerVectorStore(() => store)
    console.log(`[VectorStore] LanceDB 实现已注册（dataPath=${opts.dataPath}）`)
    return
  }

  // pgvector mode
  const pg = new PgVectorStore()
  await pg.initialize()
  registerVectorStore(() => pg)
  console.log('[VectorStore] PgVectorStore 已注册（halfvec(8192) + HNSW）')
}
