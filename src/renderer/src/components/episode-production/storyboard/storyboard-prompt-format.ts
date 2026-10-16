/**
 * storyboard-prompt-format · 分镜提示词字符串 <-> 结构化行的互转（纯函数，便于单测）。
 *
 * 提示词本体就是一个字符串（一个字段），富文本编辑器只是编辑它的界面层。
 * 字符串内用显式格式标记区分「分镜 / 镜头参数 / 描述语言」，一行 = 一个镜头：
 *
 *   行 := "镜头" shotNumber " [" params "] " description
 *   params := "key=value" 以 "|" 分隔，顺序固定：景别|运镜|时长|风格
 *
 * 例：
 *   镜头1 [景别=full|运镜=static|时长=5|风格=cinematic] 夜色中，江凌江湿透侧，一艘画舫停在江心
 *   镜头2 [景别=medium|运镜=pan_left|时长=4|风格=cinematic] 李甲站在岸边，面色苍白……
 *
 * parse 把字符串解析成行数组；serialize 把行数组还原成同一字符串（可逆）。
 * 参数 key 泛化为字符串，由上层（编辑器）负责展示为中文 label / 弹下拉。
 */

/** 一行（一个镜头） */
export interface PromptLine {
  /** 镜头序号（1-based，用于「镜头N」行前缀） */
  shotNumber: number
  /** 镜头参数（key -> value；如 景别->full） */
  params: Record<string, string>
  /** 该镜头的描述语言 */
  description: string
}

const LINE_RE = /^镜头(\d+)\s*\[([^\]]*)\]\s*(.*)$/

/**
 * 解析提示词字符串为行数组。
 * 无法匹配「镜头N [..]」格式的行会被当作原始行（shotNumber 递增补位，参数空，描述=整行），
 * 以保证用户手动输入的自由文本不会丢。
 */
export function parsePrompt(text: string): PromptLine[] {
  const rawLines = (text || '').replace(/\r/g, '').split('\n')
  const out: PromptLine[] = []
  let fallbackNo = 0
  for (const raw of rawLines) {
    const m = raw.match(LINE_RE)
    if (m) {
      const shotNumber = Number(m[1])
      const params: Record<string, string> = {}
      for (const seg of m[2].split('|')) {
        const idx = seg.indexOf('=')
        if (idx > 0) params[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim()
      }
      out.push({ shotNumber, params, description: m[3] })
      fallbackNo = shotNumber
    } else {
      fallbackNo++
      out.push({ shotNumber: fallbackNo, params: {}, description: raw })
    }
  }
  return out
}

/** 单行序列化 */
export function lineToText(line: PromptLine): string {
  const parts = Object.entries(line.params).map(([k, v]) => `${k}=${v}`)
  const params = parts.join('|')
  const desc = line.description ?? ''
  return desc ? `镜头${line.shotNumber} [${params}] ${desc}` : `镜头${line.shotNumber} [${params}]`
}

/** 行数组序列化为提示词字符串 */
export function serializePrompt(lines: PromptLine[]): string {
  return (lines || []).map(lineToText).join('\n')
}

/**
 * 由「分镜记录数组 + 页面风格」构建提示词字符串（一行一个镜头）。
 * 每个分镜取 shotNumber / shotType / cameraMovement / duration，描述取 frameDescription。
 * 说明：一个分镜 = 一行（一个镜头），其描述（frameDescription）可能含多行分隔的
 * 维度块（【场景】/【人物】…），这里把内部换行展平为单个空格，确保一行=一个镜头，
 * 内容不丢（仅去掉行分隔符）。style 由外部传入（页面级，逐行一致）。
 */
export function buildPromptText(
  shots: Array<{
    shotNumber?: number | null
    shotType?: string | null
    cameraMovement?: string | null
    duration?: number | null
    frameDescription?: string | null
  }>,
  style: string,
): string {
  const lines: PromptLine[] = (shots || []).map((sb) => ({
    shotNumber: sb.shotNumber || 0,
    params: {
      景别: sb.shotType || 'full',
      运镜: sb.cameraMovement || 'static',
      时长: String(sb.duration ?? 5),
      风格: style,
    },
    // 展平描述内换行：一行=一个镜头，维度标签内容保留
    description: (sb.frameDescription || '').replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean).join(' '),
  }))
  return serializePrompt(lines)
}

/**
 * 把提示词字符串解析为逐镜头行（供逐镜写回）。
 * 行数与 shots 数量可能不一致时，按 shotNumber 尽量对齐；这里直接返回解析结果，
 * 由调用方按位置/index 对应到各分镜。
 */
export function splitPromptText(text: string): PromptLine[] {
  return parsePrompt(text)
}
