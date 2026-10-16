/**
 * A/B 测试类型定义
 */

/**
 * A/B 测试配置
 */
export interface PromptABTestConfig {
  /** 测试名称 */
  name: string
  /** 目标模型列表（如 ['deepseek-v3', 'qwen-max']） */
  targetModels: string[]
  /** 对照组提示词（当前版本） */
  controlPrompt: string
  /** 实验组提示词 */
  experimentPrompt: string
  /** 对照组系统提示词 */
  controlSystemPrompt: string
  /** 实验组系统提示词 */
  experimentSystemPrompt: string
  /** 测试样本 */
  samples: Array<{
    /** 样本 ID */
    id: string
    /** 输入文本 */
    input: string
    /** 预期输出（可选，用于验证字段完整性） */
    expectedOutput?: Record<string, any>
  }>
  /** 每样本运行次数（默认 10） */
  runsPerSample?: number
  /** 主要指标 */
  primaryMetric: 'parseSuccessRate' | 'fieldCompleteness' | 'enumCompliance' | 'tokenEfficiency'
  /** 次要指标 */
  secondaryMetrics?: Array<'parseSuccessRate' | 'fieldCompleteness' | 'enumCompliance' | 'tokenEfficiency'>
}

/**
 * 单次运行结果
 */
export interface SingleRunResult {
  /** 样本 ID */
  sampleId: string
  /** 提示词版本（control / experiment） */
  version: 'control' | 'experiment'
  /** 模型 ID */
  modelId: string
  /** AI 原始响应 */
  rawResponse: string
  /** 解析是否成功 */
  parseSuccess: boolean
  /** 解析后的数据（如果成功） */
  parsedData?: any
  /** 必填字段完整率（0-1） */
  fieldCompleteness: number
  /** 枚举合规率（0-1） */
  enumCompliance: number
  /** 输入 token 数 */
  inputTokens: number
  /** 输出 token 数 */
  outputTokens: number
  /** 错误信息（如果失败） */
  error?: string
}

/**
 * 指标汇总
 */
export interface MetricSummary {
  /** 指标名称 */
  name: string
  /** 平均值 */
  mean: number
  /** 标准差 */
  stdDev: number
  /** 样本数 */
  sampleSize: number
  /** 95% 置信区间 */
  confidenceInterval: {
    lower: number
    upper: number
  }
}

/**
 * A/B 测试结果
 */
export interface ABTestResult {
  /** 测试名称 */
  testName: string
  /** 模型 ID */
  modelId: string
  /** 对照组指标 */
  controlMetrics: Record<string, MetricSummary>
  /** 实验组指标 */
  experimentMetrics: Record<string, MetricSummary>
  /** 统计显著性（p-value） */
  statisticalSignificance: number
  /** 效果量（Cohen's d） */
  effectSize: number
  /** 建议：adopt（采用实验组）/ reject（保留对照组）/ inconclusive（无法判断） */
  recommendation: 'adopt' | 'reject' | 'inconclusive'
  /** 详细结果 */
  details: {
    controlRuns: SingleRunResult[]
    experimentRuns: SingleRunResult[]
  }
}
