/**
 * 「画像」模块参数登记表
 * @module shared/constants/module-params/portrait
 *
 * settings 键 `portrait:image`（载荷平铺）。数值来源为 `portrait-params.types.ts`。
 *
 * 用户为什么会想调（调研结论）：默认尺寸 768×1024 与生成强度 0.55/0.5 都写死在代码里，
 * 想要更高清的形象只能每张手填尺寸；强度写死则必然有一部分人物"不像"或"没变化"。
 *
 * 说明：画像的**提示词**（负面提示词、一致性前缀等）没有纳入这里——它们是文本而非数值，
 * 归已有的画像提示词模板（`portrait_prompt_templates` 表）管理，避免两套口子。
 */

import {
  PORTRAIT_DEFAULTS as D,
  PORTRAIT_LIMITS as L,
} from '@shared/types/portrait-params.types'
import type { ModuleParamDefinition } from '@shared/types/module-params.types'
import { SETTINGS_KEYS } from '../settings-keys'

export const PORTRAIT_PARAMS: ModuleParamDefinition = {
  key: 'portrait',
  name: '画像',
  description:
    '生成人物形象的默认尺寸与生成强度。保存后下一次生成生效（页面/角色上已单独填写的尺寸与强度不受影响）。',
  settingsKey: SETTINGS_KEYS.portraitImage,
  effect: 'immediate',
  groups: [
    {
      title: '生成默认值',
      description:
        '只在"这一张没单独指定"时生效。尺寸调大更清晰但更慢更贵；强度是"像原图 ↔ 自由发挥"的滑杆。',
      params: [
        {
          kind: 'number',
          path: 'width',
          label: '默认宽度',
          hint: '生成形象的默认宽度（像素）；竖版更适合全身照',
          unit: 'Px',
          default: D.image.width,
          ceiling: L.image.width,
          step: 64,
        },
        {
          kind: 'number',
          path: 'height',
          label: '默认高度',
          hint: '生成形象的默认高度（像素）',
          unit: 'Px',
          default: D.image.height,
          ceiling: L.image.height,
          step: 64,
        },
        {
          kind: 'number',
          path: 'fullBodyStrengthPercent',
          label: '全身合成强度',
          hint: '把人物合成到全身照时的强度（百分比）：越低越贴近原图、越高越"自由发挥"',
          unit: 'Percent',
          default: D.image.fullBodyStrengthPercent,
          ceiling: L.image.fullBodyStrengthPercent,
          step: 5,
        },
        {
          kind: 'number',
          path: 'faceStrengthPercent',
          label: '面部/变体强度',
          hint: '面部形象与变身变体的强度（百分比）：调低更像本人，调高更有变化',
          unit: 'Percent',
          default: D.image.faceStrengthPercent,
          ceiling: L.image.faceStrengthPercent,
          step: 5,
        },
      ],
    },
  ],
}
