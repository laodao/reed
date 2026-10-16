/**
 * R2 板复刻检测回测（2026-09-21 v3 逐帧复核实锤）
 * @module tests/unit/episode-production/render/keyframe-machine-checks-board-copy
 *
 * fixtures/board-copy/ 下是 v3 实锤图的半尺寸拷贝（img_* = 被当成片的关键帧，
 * board_* = 生成时实际使用的编号参考板，配对关系取自 image_assets.metadata.referenceBoard）：
 *   - img_1789960046542（掌门×2+秦越三栏板，dist=32 超 aHash 阈值 → 由红徽章信号捕获）
 *   - img_1789958864516（沈云萝+秦越+房间俯视板，dist=10）
 *   - img_1789961586285（板魔改成科幻人物+轮胎，dist=5）
 *   - img_1789974302503（动漫风板，dist=18 → 红徽章信号）
 *   以上 4 张必须判 board_copy fail；
 *   - img_1789965012846（山道帧，dist=20，red=0.217%）必须 pass。
 */

import { afterAll, describe, expect, it } from 'vitest'
import * as path from 'path'
import { runKeyframeMachineChecks } from '@core/platform/episode-production/render/keyframe/keyframe-machine-checks'
import { workerBoardCopyCheck, disposeSharpWorker } from '@core/platform/episode-production/common/sharp-worker'

const FIX = path.join(__dirname, 'fixtures', 'board-copy')

const FAIL_CASES: Array<[string, string]> = [
  ['img_1789960046542_0.png', 'board_1789960025433_gz6x7a.png'],
  ['img_1789958864516_0.png', 'board_1789958843398_4jtjme.png'],
  ['img_1789961586285_0.png', 'board_1789961565185_m236g6.png'],
  ['img_1789974302503_0.png', 'board_1789974275215_j0uewm.png'],
]
const PASS_CASE: [string, string] = ['img_1789965012846_0.png', 'board_1789964985721_pwcne3.png']

afterAll(() => {
  disposeSharpWorker()
})

describe('R2 板复刻检测（实锤图回测）', () => {
  for (const [kf, board] of FAIL_CASES) {
    it(`板复刻 fail：${kf}`, async () => {
      const r = await runKeyframeMachineChecks(path.join(FIX, kf), [], {
        boardPath: path.join(FIX, board),
      })
      expect(r.pass).toBe(false)
      expect(r.failures.some((f) => f.code === 'board_copy')).toBe(true)
    })
  }

  it(`正常帧 pass：${PASS_CASE[0]}（山道帧）`, async () => {
    const r = await runKeyframeMachineChecks(path.join(FIX, PASS_CASE[0]), [], {
      boardPath: path.join(FIX, PASS_CASE[1]),
    })
    expect(r.pass).toBe(true)
  })

  it('workerBoardCopyCheck op：返回 dist + redRatio + redConcentration；缺文件 → null', async () => {
    const bc = await workerBoardCopyCheck(path.join(FIX, FAIL_CASES[1][0]), path.join(FIX, FAIL_CASES[1][1]))
    expect(bc).not.toBeNull()
    expect(bc!.dist).toBeLessThanOrEqual(12)
    expect(bc!.redRatio).toBeGreaterThan(0.002)
    expect(bc!.redConcentration).toBeGreaterThan(0)
    expect(await workerBoardCopyCheck(path.join(FIX, 'ghost.png'), path.join(FIX, FAIL_CASES[0][1]))).toBeNull()
  })

  it('不传 boardPath（非拼板模式）→ 不做板检测，正常帧 pass', async () => {
    const r = await runKeyframeMachineChecks(path.join(FIX, PASS_CASE[0]), [])
    expect(r.pass).toBe(true)
  })
})
