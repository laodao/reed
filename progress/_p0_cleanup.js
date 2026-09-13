// 清理 P0 遗留：删除临时定义与运行（delete 类通道参数形态验证）
const { connect } = require('./_lib_cdp')
async function main() {
  const { browser, page } = await connect()
  const ev = (expr) => page.evaluate(expr)
  const defId = 'wfdef_1788752825996_m238sj8rm'
  const runs = ['wfrun_1788752826025_rtkditv4m', 'wfrun_1788752874335_mju0foqs0']
  for (const r of runs) {
    const a = await ev(`window.electronAPI.workflow.deleteRun(${JSON.stringify(r)}).then(x => x)`)
    console.log('deleteRun', r, JSON.stringify(a))
  }
  const b = await ev(`window.electronAPI.workflow.deleteDefinition(${JSON.stringify(defId)}).then(x => x)`)
  console.log('deleteDefinition', defId, JSON.stringify(b))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
