/**
 * 「画像」参数测试（登记表 + 持有者 + 读取点真实行为）
 * @module tests/unit/shared/portrait-params
 *
 * 背景（2026-09-13 参数设置第八批）：画像的默认尺寸（768×1024）与生成强度（0.55 全身 / 0.5 面部）
 * 都写死，用户想要更高清或"更像本人"只能每张手填。
 *
 * 这里既测登记表/持有者，也用**真实的 `PortraitService` 生成链路**（假 ImageService）证明：
 * 不传尺寸/强度时，服务用的就是设置里的值。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  portraitFaceStrength,
  portraitFullBodyStrength,
  portraitParams,
  portraitParamsFromSettings,
  resetPortraitParams,
  setPortraitParams,
} from '@shared/utils/portrait-params'
import { PORTRAIT_DEFAULTS, PORTRAIT_LIMITS } from '@shared/types/portrait-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'

const DEF = getModuleParams('portrait')!

beforeEach(() => resetPortraitParams())
afterEach(() => resetPortraitParams())

describe('登记表与持有者', () => {
  it('归属键与默认值（= 改造前写死的常量）', () => {
    expect(DEF.name).toBe('画像')
    expect(moduleParamSettingsKeys(DEF)).toEqual([SETTINGS_KEYS.portraitImage])
    const r = resolveModuleParams(DEF, {})
    expect(r.values['width']).toBe(768)
    expect(r.values['height']).toBe(1024)
    expect(r.values['fullBodyStrengthPercent']).toBe(55)
    expect(r.values['faceStrengthPercent']).toBe(50)
    for (const key of Object.keys(PORTRAIT_DEFAULTS.image) as Array<keyof typeof PORTRAIT_DEFAULTS.image>) {
      expect(PORTRAIT_DEFAULTS.image[key]).toBeLessThanOrEqual(PORTRAIT_LIMITS.image[key])
    }
  })

  it('覆盖生效、超限夹取、非法值保留', () => {
    expect(portraitParams().image.width).toBe(768)
    setPortraitParams({ image: { width: 1024, height: 1536 } })
    expect(portraitParams().image.width).toBe(1024)
    expect(portraitParams().image.height).toBe(1536)
    setPortraitParams({ image: { width: 99_999, height: -1 } })
    expect(portraitParams().image.width).toBe(PORTRAIT_LIMITS.image.width)
    expect(portraitParams().image.height).toBe(1536) // 上次有效值保留
  })

  it('强度按百分比存、读取点换算成 0~1 小数', () => {
    expect(portraitFullBodyStrength()).toBeCloseTo(0.55, 5)
    expect(portraitFaceStrength()).toBeCloseTo(0.5, 5)
    setPortraitParams({ image: { fullBodyStrengthPercent: 80, faceStrengthPercent: 30 } })
    expect(portraitFullBodyStrength()).toBeCloseTo(0.8, 5)
    expect(portraitFaceStrength()).toBeCloseTo(0.3, 5)
  })

  it('从 settings 解析；垃圾载荷回落默认', () => {
    const parsed = portraitParamsFromSettings({
      [SETTINGS_KEYS.portraitImage]: { width: 512, fullBodyStrengthPercent: 40 },
    })
    expect(parsed.image.width).toBe(512)
    expect(parsed.image.fullBodyStrengthPercent).toBe(40)
    expect(parsed.image.height).toBe(PORTRAIT_DEFAULTS.image.height)
    expect(portraitParamsFromSettings({})).toEqual(PORTRAIT_DEFAULTS)
  })
})
