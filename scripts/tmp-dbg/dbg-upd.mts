import { DataSource } from 'typeorm'
const { WorkflowDefinitionEntity } = await import('../../src/core/database/entities/workflow-definition.entity')
const ds = new DataSource({ type: 'better-sqlite3', database: '/tmp/appdb-copy.db', entities: [WorkflowDefinitionEntity], synchronize: false })
await ds.initialize()
const repo = ds.getRepository(WorkflowDefinitionEntity)
const id = 'wfdef_1788746380568_ijsqwowfr'
try {
  await repo.update({ id } as never, { name: 'standalone-test' } as never)
  const row = await repo.findOne({ where: { id } as never })
  console.log('STANDALONE UPDATE OK, name =', row?.name)
} catch (e) {
  console.log('STANDALONE FAIL:', (e as Error).message)
  console.log((e as Error).stack?.split('\n').slice(0, 10).join('\n'))
}
await ds.destroy()
