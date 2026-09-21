/**
 * 一次性数据修复：lw_projects.wizard_state 为 NULL 的历史项目 → '{}'（§G，2026-09-20）
 * @module core/database/migrations/init-null-wizard-state
 *
 * 背景：createProject 曾不初始化 wizard_state，读方虽容错 NULL，但写方
 * （mutateWizardState 等）依赖「行存在即可改」的隐式契约。幂等：只更新 NULL 行。
 */

import type { DataSource } from 'typeorm'

export async function initNullWizardState(ds: DataSource): Promise<void> {
  await ds.query(`UPDATE lw_projects SET wizard_state = '{}' WHERE wizard_state IS NULL`)
}
