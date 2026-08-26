# 面容分析五官精调局部性优化 · 实施笔记

**日期：** 2026-08-27
**分支：** feat/workflow-engine
**模块：** `src/renderer/src/components/portrait/geometry/`

## 背景问题（用户反馈）

人像设计 → 面容分析的各项五官精调存在严重的跨区域联动：

| 参数 | 用户反馈的问题 |
| --- | --- |
| 眼睛大小 (eyeSize) | 调整导致整个脸都在变 |
| 眼角上扬 (eyeTilt) | 调整导致整个脸都在变 |
| 鼻尖上翘/大小 (noseTipLift/noseTipSize) | 调整导致嘴巴变形 |
| 嘴唇厚薄 (lip)、嘴角上扬 (mouthCorner) | 调整导致整个下巴变形 |
| 唇峰高低 (cupidH) | 调整影响鼻尖 |
| 颧骨突起 (cheekProject) | 效果很奇怪（方向错乱） |

## 根因分析

`displacementField.ts` 的 `evalField` 是所有五官精调的核心：对网格每个顶点叠加各参数的位移场。

1. **高斯尾部无限延伸**：`gauss2D` = `exp(-d²/2σ²)` 在任何距离都不为 0。即使远处权重极小（如 1e-6），在 120×150 网格变形中也会让整张脸的每个像素产生微位移，用户感知为"整张脸都在变"。
2. **σ 过大**：多数精调参数 σ 直接取区域半径的 0.4–1.2 倍，导致影响范围跨到相邻五官：
   - `eyeSize`/`eyeLen`：σ = 眼半径（≈眼距×0.33），2–3σ 覆盖半张脸；
   - `eyeTilt`：σ = 1.2×眼半径，旋转位移还随 `(x-cx)` 放大；
   - `noseTip`：σ = 0.55×鼻半宽，鼻尖→上唇距离仅 ≈1.2σ，嘴巴被带飞；
   - `lip`：σ = 0.5×嘴半宽，下唇→下巴过渡区权重仍高；
   - `cupidH`：σ = 0.4×嘴半宽且锚在唇峰向上扫，鼻尖处权重 ≈0.46；
   - `mouthCorner`：σ = 0.6×嘴半宽，扫到下巴；
   - `cheekProject`：σ = 0.5×半脸宽（≈全脸），且位移方向以颧骨点为锚径向缩放（`dx=(x-cb.x)*project`）——面中被推向颧骨、颧骨外侧被推开，方向反直觉。

## 实施方案（`displacementField.ts`）

1. **新增紧支撑权重 `localGauss2D`**（导出，可单测）：
   - 高斯形状 × 平滑削尾，在 2.4σ 处**精确归零**（`1 - smoothstep(1.44σ, 2.4σ, d)`），消除无限尾部；
   - 所有五官精调参数一律改用该权重。
2. **逐参数收紧影响半径并修正位移方向**：
   - `eye`（眼距）：σ = 0.85×eyeSigma；
   - `eyeSize`：σ = 0.55×眼半径（止于眉下/鼻梁前）；
   - `eyeTilt`/`eyeLen`：σ = 0.6×眼半径（共用紧支撑）；
   - `noseTipLift`/`noseTipSize`：σ = 0.26×鼻半宽（止于鼻翼/人中/上唇之前）；
   - `lip`：由高斯改为**唇带遮罩**——全量带 = 上唇顶(yLip)~下唇底(yMouth)，上下各 `0.5×上唇高` 过渡带外归零（不再推人中与下巴）；
   - `cupidH`：改为上唇带遮罩，向鼻尖方向 0.004 内归零，x 限嘴宽内；
   - `mouthCorner`：σ = 0.28×嘴半宽；
   - `cheekW`/`cheekUp`/`cheekProject`：σ 统一收窄到 0.3×半脸宽；**cheekProject 位移方向修正**为以面中为锚的 x 向外推（左脸向左、右脸向右，`dirX * project * w * (halfW*0.3)`）+ 轻微纵向分量，不再以颧骨点为锚径向缩放。

## 渲染管线一致性

`evalField` 是唯一位移场实现，全部渲染路径复用：
- WebGL2 实时预览/全分辨率导出：`gridWarpGL.ts`（FaceAnnotator.vue 使用）
- Canvas 2D 兜底渲染：`gridWarp.ts`（bandWarp.warpFaceBands）
- 关键点 overlay 同步：`bandWarp.transformLandmarks`

改动一处，预览、导出、标注三者行为一致。

## 自动化验证

- **新增测试**（`tests/unit/geometry/displacementField.spec.ts`）：
  - `localGauss2D`：中心=1、2.4σ 外精确 0、1.5σ 内显著；
  - 9 组"局部性"用例：每个精调参数在最大档下，相邻区域代表点（眉心/鼻梁/鼻尖/人中/上唇/嘴角/下巴/鼻翼/面中）位移 < 1e-4，且目标区域本身仍有效果（方向断言）。
- **修正测试数据**：`LM_NOSE_TIP = 4`（原测试数据只给了近似索引 `[1]`），三个测试文件的 baseLM 均补 `[4]`。
- **测试结果**：geometry 目录 10 个文件 123 个测试全部通过；改动相关 43 个测试全绿。
- **ESLint**：改动文件 0 error（顺带清理了 `displacementField.ts` 既有 unused import 与 `let ny` → `const`）。
- **typecheck**：项目既有 `electron.vite.config.d.ts` 缺失（TS6305）与 `vertexWarp.ts`/`mlsWarp.ts` 遗留旧参数类型错误（stash 验证为改动前既有），本次改动文件无新增类型错误。

## 关键文件

- `src/renderer/src/components/portrait/geometry/displacementField.ts`（核心修改）
- `tests/unit/geometry/displacementField.spec.ts`（新增局部性测试）
- `tests/unit/geometry/faceMeasure.spec.ts`、`tests/unit/geometry/bandWarp.spec.ts`（测试数据补 `[4]`）

---

## 第二轮修复（实测反馈：嘴唇厚度只动上唇、唇峰高低变形严重）

**反馈 1：嘴唇厚度调整只调整了上嘴唇，没调整下嘴唇。**
- 根因：`yMouth`（嘴部/下巴分界、lip 全量带下界）用的是 `LM_LOWER_LIP_MID = 14`（下唇**内缘**中点），下唇外缘（17 号点）到 14 号点之间的区域落在全量带之外，下唇几乎不动。
- 修复：新增 `LM_LOWER_LIP_OUTER = 17`（下唇外缘中点），`faceMeasure.yMouth` 改用 17 号点。lip 全量带 = 上唇顶(0 号点) ~ 下唇外缘底(17 号点)，锚点仍是唇缝（13/14 内缘中点），上下唇完全对称（数值模拟：lip=1.6 时上唇顶 -18 / 下唇底 +18，人中/下巴/鼻尖位移 0）。

**反馈 2：唇峰高低调整嘴唇变形严重，像没识别到上嘴唇/唇峰。**
- 根因：`cupidH` 的 x 遮罩太宽（0.55×嘴半宽全量→1.05×归零）+ y 带太深（延伸到上唇中下部 0.9×上唇高），整个上唇中部被整体抬起，看起来是"上唇变形"而非"唇峰抬高"。
- 修复：重写为窄带 M 形遮罩——x 只动中间 0.25×嘴半宽（0.55×嘴半宽处归零），y 只影响上唇上半（0.5×上唇高全量、0.9×上唇高归零），向鼻尖方向 0.005 内归零。数值模拟：唇峰 -15，横截面 x=0.50/0.48 全量、x=0.46 衰减、x=0.44 起为 0；下唇/嘴角/人中/鼻尖全为 0。

**验证：** geometry 目录 123 测试全绿；`displacementField.spec.ts` 嘴唇厚薄测试新增"下唇内缘+下唇外缘都下移"断言、唇峰高低测试新增"上唇两侧/唇缝不动"断言；ESLint 0 error。

