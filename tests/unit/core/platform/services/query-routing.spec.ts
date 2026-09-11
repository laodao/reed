/**
 * 查询意图路由 单测
 * @module query-routing
 *
 * 背景（M4 评估结论）：语义型问句纯向量最优，关键词型查询（法条编号/API 符号/专有名词）
 * 混合检索（RRF）显著更强（recall@1 70% → 80%）；且 RRF 在语义型 @1 不损失 →
 * 自动路由的误判代价极低。本模块给出「是否关键词型」的启发式判定与建议参数。
 */
import { describe, it, expect } from 'vitest'
import { detectKeywordIntent } from '@core/platform/services/query-routing'

describe('detectKeywordIntent', () => {
  it('法条/条款编号 → 关键词型（建议 RRF）', () => {
    for (const q of ['公司法第四十二条的内容', '第八十四条股权转让规定', '第二十九条 设立公司登记申请', '第 3 章讲了什么']) {
      const r = detectKeywordIntent(q)
      expect(r.keywordish, q).toBe(true)
      expect(r.suggested.fusion).toBe('rrf')
    }
  })

  it('版本号 / 公式编号 → 关键词型', () => {
    for (const q of ['第6.24 式是哪个公式', 'Release 2.5.0 有哪些变化', 'numpy 1.26 的改动']) {
      expect(detectKeywordIntent(q).keywordish, q).toBe(true)
    }
  })

  it('代码 / API 符号（点号、下划线、@、括号） → 关键词型', () => {
    for (const q of ['np.newaxis 如何用来增加维度', 'numpy.linalg.inv 求矩阵逆', 'np.arange 与 np.linspace 差异', '使用 @ 装饰器', 'shape=(3,1) 广播规则']) {
      expect(detectKeywordIntent(q).keywordish, q).toBe(true)
    }
  })

  it('英文全大写缩写 / 专有 API 名 → 关键词型', () => {
    for (const q of ['CUDA 与 GPU 计算', 'FFT 模块用法', 'RAG 的检索流程']) {
      expect(detectKeywordIntent(q).keywordish, q).toBe(true)
    }
  })

  it('中文疑问句中的弱特征不触发路由（评估实证的误判修正）', () => {
    // 这些查询被判关键词型后走 RRF，语义型 recall@1 从 96.9% 掉到 93.8%
    for (const q of [
      '自编码器（autoencoder）如何把输入拷贝到输出，和 PCA 有什么关系？',
      'numpy 中矩阵乘法用 dot 或 @ 怎么计算？',
      'FFT 模块怎么用？',
      'shape=(3,1) 如何广播到 (3,4)？',
    ]) {
      const r = detectKeywordIntent(q)
      expect(r.keywordish, q).toBe(false)
    }
  })

  it('强特征在疑问句中依然触发（法条编号 / 版本号 / API 点号 / 精确引用）', () => {
    for (const q of [
      '公司法第四十二条的内容是什么？',
      '第6.24 式是什么意思？',
      'numpy.linalg.inv 怎么求矩阵逆？',
      '书中「潜变量」是什么意思？',
      // 多个缩写同现（评估校准：该条是关键词型但含疑问词）
      '书里如何描述 CUDA 与 GPU 计算',
    ]) {
      expect(detectKeywordIntent(q).keywordish, q).toBe(true)
    }
  })

  it('精确引用（引号/书名号） → 关键词型', () => {
    expect(detectKeywordIntent('书中「潜变量」是什么意思').keywordish).toBe(true)
    expect(detectKeywordIntent('《公司法》关于股权转让').keywordish).toBe(true)
  })

  it('自然语言问句 → 非关键词型（保持纯向量，不动默认行为）', () => {
    for (const q of [
      '什么是欠拟合和过拟合？如何理解机器学习的泛化能力？',
      '有限责任公司股东向股东以外的人转让股权的规定是什么？',
      'Dropout 正则化方法的原理是什么，它如何防止过拟合？',
      '如何选择向量数据库？',
    ]) {
      const r = detectKeywordIntent(q)
      expect(r.keywordish, q).toBe(false)
      expect(r.suggested.fusion).toBe('weighted')
      expect(r.suggested.vectorWeight).toBe(1)
    }
  })

  it('中文问句中的括号缩写（补充说明）不触发路由 —— 评估实证的误判修正', () => {
    // 评估发现：这些查询被判关键词型后走 RRF，语义型 recall@1 从 96.9% 掉到 93.8%
    for (const q of [
      '主成分分析（PCA）如何用于数据降维？',
      '变分自编码器（VAE）的核心思想是什么？',
      '生成对抗网络 (GAN) 的训练过程是怎样的？',
    ]) {
      const r = detectKeywordIntent(q)
      expect(r.keywordish, q).toBe(false)
    }
  })

  it('返回判定理由（可观测/可调试）', () => {
    const r = detectKeywordIntent('公司法第四十二条的内容')
    expect(r.reasons.length).toBeGreaterThan(0)
    expect(r.reasons.join(',')).toContain('clause')
  })
})