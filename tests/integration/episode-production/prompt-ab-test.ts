/**
 * 剧集制作模块系统提示词 A/B 测试基础设施
 *
 * 用途：对比不同提示词版本的输出质量，验证优化假设（HYP 项）
 *
 * 设计原则：
 * 1. 支持多模型对比（DeepSeek、通义千问等）
 * 2. 支持多维度指标（解析成功率、字段完整性、枚举合规率）
 * 3. 支持统计显著性检验（t 检验）
 * 4. 输出可复现的测试报告
 */

import type { SingleRunResult, PromptABTestConfig, MetricSummary, ABTestResult } from './types'

// 导出类型供外部使用
export type { SingleRunResult, PromptABTestConfig, MetricSummary, ABTestResult }

/**
 * 计算平均值
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * 计算标准差
 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2))
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1))
}

/**
 * 计算 95% 置信区间
 */
function confidenceInterval95(values: number[]): { lower: number; upper: number } {
  if (values.length < 2) {
    const v = values[0] || 0
    return { lower: v, upper: v }
  }
  const avg = mean(values)
  const se = stdDev(values) / Math.sqrt(values.length)
  // t 分布临界值（95% 置信度，双尾）
  // 简化：使用 1.96（z 分布），样本量 > 30 时近似准确
  const t = 1.96
  return {
    lower: avg - t * se,
    upper: avg + t * se,
  }
}

/**
 * 计算 Cohen's d 效果量
 */
function cohensD(group1: number[], group2: number[]): number {
  const mean1 = mean(group1)
  const mean2 = mean(group2)
  const std1 = stdDev(group1)
  const std2 = stdDev(group2)
  const pooledStd = Math.sqrt((std1 * std1 + std2 * std2) / 2)
  if (pooledStd === 0) return 0
  return (mean1 - mean2) / pooledStd
}

/**
 * 独立样本 t 检验（双尾）
 * 返回 p-value
 */
function tTest(group1: number[], group2: number[]): number {
  const n1 = group1.length
  const n2 = group2.length
  if (n1 < 2 || n2 < 2) return 1

  const mean1 = mean(group1)
  const mean2 = mean(group2)
  const var1 = stdDev(group1) ** 2
  const var2 = stdDev(group2) ** 2

  // t 统计量
  const se = Math.sqrt(var1 / n1 + var2 / n2)
  if (se === 0) return 1
  const t = (mean1 - mean2) / se

  // 自由度（Welch-Satterthwaite 近似）
  const df = Math.pow(var1 / n1 + var2 / n2, 2) /
    (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1))

  // 简化：使用正态分布近似计算 p-value
  // 对于 df > 30，t 分布接近正态分布
  const absT = Math.abs(t)
  // 使用标准正态分布的累积分布函数近似
  const p = 2 * (1 - normalCDF(absT))
  return p
}

/**
 * 标准正态分布累积分布函数（近似）
 */
function normalCDF(x: number): number {
  // 使用 Abramowitz and Stegun 近似公式
  const b1 = 0.319381530
  const b2 = -0.356563782
  const b3 = 1.781477937
  const b4 = -1.821255978
  const b5 = 1.330274429
  const p = 0.2316419

  const t = 1 / (1 + p * x)
  const pdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
  const cdf = 1 - pdf * (b1 * t + b2 * t * t + b3 * t * t * t + b4 * t * t * t * t + b5 * t * t * t * t * t)
  return cdf
}

// ==================== 核心测试逻辑 ====================

/**
 * 运行单次 A/B 测试（需要外部提供 callAI 函数）
 */
async function runSingleTest(
  prompt: string,
  systemPrompt: string,
  modelId: string,
  sampleId: string,
  version: 'control' | 'experiment',
  callAIFn: (prompt: string, systemPrompt: string, maxTokens: number, providerConfigId: string | undefined, modelId: string) => Promise<string>,
  requiredFields?: string[],
  enumFields?: Record<string, string[]>,
): Promise<SingleRunResult> {
  try {
    // 调用 AI
    const response = await callAIFn(prompt, systemPrompt, 4096, undefined, modelId)

    // 尝试解析 JSON
    let parseSuccess = false
    let parsedData: any = null
    let error: string | undefined

    try {
      // 尝试从响应中提取 JSON
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[1])
        parseSuccess = true
      } else {
        // 尝试直接解析
        parsedData = JSON.parse(response)
        parseSuccess = true
      }
    } catch (e) {
      parseSuccess = false
      error = `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`
    }

    // 计算字段完整率
    let fieldCompleteness = 0
    if (parseSuccess && requiredFields && requiredFields.length > 0) {
      const filledFields = requiredFields.filter(field => {
        const value = parsedData[field]
        return value !== undefined && value !== null && value !== ''
      })
      fieldCompleteness = filledFields.length / requiredFields.length
    }

    // 计算枚举合规率
    let enumCompliance = 0
    if (parseSuccess && enumFields) {
      const enumChecks = Object.entries(enumFields)
      let compliantCount = 0
      for (const [field, validValues] of enumChecks) {
        const value = parsedData[field]
        if (value !== undefined && validValues.includes(value)) {
          compliantCount++
        }
      }
      enumCompliance = enumChecks.length > 0 ? compliantCount / enumChecks.length : 1
    }

    // 估算 token 数（简化：按字符数 / 4 估算）
    const inputTokens = Math.ceil((prompt.length + systemPrompt.length) / 4)
    const outputTokens = Math.ceil(response.length / 4)

    return {
      sampleId,
      version,
      modelId,
      rawResponse: response,
      parseSuccess,
      parsedData,
      fieldCompleteness,
      enumCompliance,
      inputTokens,
      outputTokens,
      error,
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    console.log(`\n    [DEBUG] 调用失败: ${errorMsg}`)
    return {
      sampleId,
      version,
      modelId,
      rawResponse: '',
      parseSuccess: false,
      fieldCompleteness: 0,
      enumCompliance: 0,
      inputTokens: 0,
      outputTokens: 0,
      error: errorMsg,
    }
  }
}

/**
 * 运行 A/B 测试
 */
export async function runABTest(
  config: PromptABTestConfig,
  callAIFn: (prompt: string, systemPrompt: string, maxTokens: number, providerConfigId: string | undefined, modelId: string) => Promise<string>,
  options?: {
    /** 必填字段列表（用于计算字段完整率） */
    requiredFields?: string[]
    /** 枚举字段及其有效值（用于计算枚举合规率） */
    enumFields?: Record<string, string[]>
  }
): Promise<ABTestResult[]> {
  const results: ABTestResult[] = []
  const runsPerSample = config.runsPerSample || 10

  for (const modelId of config.targetModels) {
    console.log(`\n========== 开始测试模型: ${modelId} ==========\n`)

    const controlRuns: SingleRunResult[] = []
    const experimentRuns: SingleRunResult[] = []

    // 对每个样本运行多次
    for (const sample of config.samples) {
      console.log(`样本 ${sample.id}:`)

      // 对照组
      for (let i = 0; i < runsPerSample; i++) {
        process.stdout.write(`  对照组运行 ${i + 1}/${runsPerSample}...`)
        const result = await runSingleTest(
          config.controlPrompt,
          config.controlSystemPrompt,
          modelId,
          sample.id,
          'control',
          callAIFn,
          options?.requiredFields,
          options?.enumFields,
        )
        controlRuns.push(result)
        console.log(result.parseSuccess ? '✓' : '✗')
      }

      // 实验组
      for (let i = 0; i < runsPerSample; i++) {
        process.stdout.write(`  实验组运行 ${i + 1}/${runsPerSample}...`)
        const result = await runSingleTest(
          config.experimentPrompt,
          config.experimentSystemPrompt,
          modelId,
          sample.id,
          'experiment',
          callAIFn,
          options?.requiredFields,
          options?.enumFields,
        )
        experimentRuns.push(result)
        console.log(result.parseSuccess ? '✓' : '✗')
      }
    }

    // 计算指标
    const metrics = [config.primaryMetric, ...(config.secondaryMetrics || [])]
    const controlMetrics: Record<string, MetricSummary> = {}
    const experimentMetrics: Record<string, MetricSummary> = {}

    for (const metric of metrics) {
      let controlValues: number[]
      let experimentValues: number[]

      switch (metric) {
        case 'parseSuccessRate':
          controlValues = controlRuns.map(r => r.parseSuccess ? 1 : 0)
          experimentValues = experimentRuns.map(r => r.parseSuccess ? 1 : 0)
          break
        case 'fieldCompleteness':
          controlValues = controlRuns.map(r => r.fieldCompleteness)
          experimentValues = experimentRuns.map(r => r.fieldCompleteness)
          break
        case 'enumCompliance':
          controlValues = controlRuns.map(r => r.enumCompliance)
          experimentValues = experimentRuns.map(r => r.enumCompliance)
          break
        case 'tokenEfficiency':
          controlValues = controlRuns.map(r => r.inputTokens + r.outputTokens)
          experimentValues = experimentRuns.map(r => r.inputTokens + r.outputTokens)
          break
        default:
          continue
      }

      controlMetrics[metric] = {
        name: metric,
        mean: mean(controlValues),
        stdDev: stdDev(controlValues),
        sampleSize: controlValues.length,
        confidenceInterval: confidenceInterval95(controlValues),
      }

      experimentMetrics[metric] = {
        name: metric,
        mean: mean(experimentValues),
        stdDev: stdDev(experimentValues),
        sampleSize: experimentValues.length,
        confidenceInterval: confidenceInterval95(experimentValues),
      }
    }

    // 统计检验（使用主要指标）
    const primaryControlValues = controlRuns.map(r =>
      config.primaryMetric === 'parseSuccessRate' ? (r.parseSuccess ? 1 : 0) :
      config.primaryMetric === 'fieldCompleteness' ? r.fieldCompleteness :
      config.primaryMetric === 'enumCompliance' ? r.enumCompliance :
      r.inputTokens + r.outputTokens
    )
    const primaryExperimentValues = experimentRuns.map(r =>
      config.primaryMetric === 'parseSuccessRate' ? (r.parseSuccess ? 1 : 0) :
      config.primaryMetric === 'fieldCompleteness' ? r.fieldCompleteness :
      config.primaryMetric === 'enumCompliance' ? r.enumCompliance :
      r.inputTokens + r.outputTokens
    )

    const pValue = tTest(primaryControlValues, primaryExperimentValues)
    const effectSize = cohensD(primaryControlValues, primaryExperimentValues)

    // 判断建议
    let recommendation: 'adopt' | 'reject' | 'inconclusive'
    const alpha = 0.05
    const primaryControlMean = controlMetrics[config.primaryMetric].mean
    const primaryExperimentMean = experimentMetrics[config.primaryMetric].mean

    if (pValue < alpha) {
      // 统计显著
      if (config.primaryMetric === 'tokenEfficiency') {
        // token 效率：越低越好
        recommendation = primaryExperimentMean < primaryControlMean ? 'adopt' : 'reject'
      } else {
        // 其他指标：越高越好
        recommendation = primaryExperimentMean > primaryControlMean ? 'adopt' : 'reject'
      }
    } else {
      recommendation = 'inconclusive'
    }

    const result: ABTestResult = {
      testName: config.name,
      modelId,
      controlMetrics,
      experimentMetrics,
      statisticalSignificance: pValue,
      effectSize,
      recommendation,
      details: {
        controlRuns,
        experimentRuns,
      },
    }

    results.push(result)

    // 打印结果摘要
    console.log(`\n========== ${modelId} 测试结果 ==========`)
    console.log(`主要指标: ${config.primaryMetric}`)
    console.log(`对照组: ${primaryControlMean.toFixed(3)} (±${controlMetrics[config.primaryMetric].stdDev.toFixed(3)})`)
    console.log(`实验组: ${primaryExperimentMean.toFixed(3)} (±${experimentMetrics[config.primaryMetric].stdDev.toFixed(3)})`)
    console.log(`p-value: ${pValue.toFixed(4)}`)
    console.log(`效果量 (Cohen's d): ${effectSize.toFixed(3)}`)
    console.log(`建议: ${recommendation}`)
    console.log('==========================================\n')
  }

  return results
}

/**
 * 生成测试报告（Markdown 格式）
 */
export function generateTestReport(results: ABTestResult[]): string {
  const lines: string[] = []
  lines.push('# A/B 测试报告\n')
  lines.push(`生成时间: ${new Date().toISOString()}\n`)

  for (const result of results) {
    lines.push(`## ${result.testName} - ${result.modelId}\n`)

    lines.push('### 所有指标对比\n')
    lines.push('| 指标 | 版本 | 平均值 | 标准差 | 95% CI |')
    lines.push('|------|------|--------|--------|--------|')

    for (const [metricName, controlMetric] of Object.entries(result.controlMetrics)) {
      const expMetric = result.experimentMetrics[metricName]
      if (expMetric) {
        lines.push(`| ${metricName} | 对照组 | ${controlMetric.mean.toFixed(3)} | ${controlMetric.stdDev.toFixed(3)} | [${controlMetric.confidenceInterval.lower.toFixed(3)}, ${controlMetric.confidenceInterval.upper.toFixed(3)}] |`)
        lines.push(`| ${metricName} | 实验组 | ${expMetric.mean.toFixed(3)} | ${expMetric.stdDev.toFixed(3)} | [${expMetric.confidenceInterval.lower.toFixed(3)}, ${expMetric.confidenceInterval.upper.toFixed(3)}] |`)
      }
    }

    lines.push('')
    lines.push(`**主要指标**: ${result.testName}`)
    lines.push(`**统计显著性**: p = ${result.statisticalSignificance.toFixed(4)}`)
    lines.push(`**效果量**: Cohen's d = ${result.effectSize.toFixed(3)}`)
    lines.push(`**建议**: ${result.recommendation}`)
    lines.push('')
  }

  return lines.join('\n')
}

    lines.push('### 主要指标\n')
    const primaryMetric = Object.values(result.controlMetrics)[0]
    const expPrimaryMetric = Object.values(result.experimentMetrics)[0]
    if (primaryMetric && expPrimaryMetric) {
      lines.push(`| 版本 | 平均值 | 标准差 | 95% CI |`)
      lines.push(`|------|--------|--------|--------|`)
      lines.push(`| 对照组 | ${controlMetric.mean.toFixed(3)} | ${controlMetric.stdDev.toFixed(3)} | [${controlMetric.confidenceInterval.lower.toFixed(3)}, ${controlMetric.confidenceInterval.upper.toFixed(3)}] |`)
      lines.push(`| 实验组 | ${expMetric.mean.toFixed(3)} | ${expMetric.stdDev.toFixed(3)} | [${expMetric.confidenceInterval.lower.toFixed(3)}, ${expMetric.confidenceInterval.upper.toFixed(3)}] |`)
    }

    lines.push('')
    lines.push(`**主要指标**: ${result.testName}`)
    lines.push(`**统计显著性**: p = ${result.statisticalSignificance.toFixed(4)}`)
    lines.push(`**效果量**: Cohen's d = ${result.effectSize.toFixed(3)}`)
    lines.push(`**建议**: ${result.recommendation}`)
    lines.push('')
  }

  return lines.join('\n')
}
