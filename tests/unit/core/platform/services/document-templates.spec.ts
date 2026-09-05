/**
 * 文档排版模板测试：13 套模板齐全且可渲染 / 表单选项与模板注册表一致 / 内置应用 templateId 有效
 * @module tests/unit/core/platform/services/document-templates
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DOCUMENT_TEMPLATES, renderTemplateHtml } from '@core/platform/services/document-tools/templates'
import { NODE_CONFIG_FORMS } from '@shared/types/workflow-node-forms'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import type { WorkflowGraph } from '@shared/types/workflow.types'

/** 全部模板 id（早报/周报/通用/对话/吃瓜） */
const EXPECTED_IDS = [
  'generic',
  'morningReport',
  'morningReportBlue',
  'morningReportMinimal',
  'industryWeekly',
  'industryWeeklyGreen',
  'industryWeeklyDark',
  'chatTranscript',
  'gossipTabloid',
  'gossipTimeline',
  'gossipArticle',
  'gossipHK',
  'gossipInfographic',
  'gossipMinguo',
]

describe('DOCUMENT_TEMPLATES 注册表', () => {
  it('包含全部预期模板（早报×3 / 周报×3 / 通用 / 对话 / 吃瓜×6）', () => {
    for (const id of EXPECTED_IDS) {
      expect(DOCUMENT_TEMPLATES[id], `缺少模板 ${id}`).toBeDefined()
    }
    expect(Object.keys(DOCUMENT_TEMPLATES).length).toBe(EXPECTED_IDS.length)
  })

  it('每套模板可渲染出完整排版 HTML（页眉 + 正文 + 页脚 + 转义标题）', async () => {
    for (const id of EXPECTED_IDS) {
      const html = await renderTemplateHtml('# 测试标题\n\n正文内容', {
        template: DOCUMENT_TEMPLATES[id],
        title: '报告<标题>',
      })
      expect(html, id).toContain('<!DOCTYPE html>')
      expect(html, id).toContain('测试标题')
      // 标题经 escapeHtml 转义（防注入）
      expect(html, id).toContain('&lt;标题&gt;')
      // 正文区入口（body 开始即页眉之后）
      expect(html, id).toContain('</style></head><body>')
      // 报告族模板（早报×3/周报×3/吃瓜×5）有卡片页眉与页脚；通用/对话模板结构不同
      const reportFamily = ['morningReport', 'morningReportBlue', 'morningReportMinimal', 'industryWeekly', 'industryWeeklyGreen', 'industryWeeklyDark', 'gossipTabloid', 'gossipTimeline', 'gossipArticle', 'gossipHK', 'gossipInfographic', 'gossipMinguo']
      if (reportFamily.includes(id)) {
        expect(html, id).toContain('doc-header')
        expect(html, id).toContain('doc-footer')
      }
    }
  })

  it('周报模板页眉含周次信息（年第 N 周）', async () => {
    const html = await renderTemplateHtml('正文', { template: DOCUMENT_TEMPLATES.industryWeekly, title: '周报' })
    expect(html).toMatch(/\d{4} 年第 \d+ 周/)
  })

  it('深色模板：正文区为深色底 + 亮字（高对比覆盖生效）', async () => {
    const html = await renderTemplateHtml('# 标题\n\n正文', { template: DOCUMENT_TEMPLATES.industryWeeklyDark, title: '深色周报' })
    expect(html).toContain('background:#0b1220')
    expect(html).toContain('color:#e2e8f0')
  })

  it('通用模板（generic）为卡片式排版：章节卡片 + 要点引用卡 + 彩色表头（长图不再纯黑白）', async () => {
    const html = await renderTemplateHtml('# 标题\n\n## 🔥 爆点速览\n\n> 要点一\n\n| 时间 | 事件 |\n| --- | --- |\n| 1月 | 爆料 |', {
      template: DOCUMENT_TEMPLATES.generic,
      title: '吃瓜',
    })
    // 章节标题卡片（底色块 + 左彩条）
    expect(html).toContain('h2 { font-size:19px; color:#b03a2e')
    expect(html).toContain('border-left:5px solid #e8604c')
    // 要点引用卡浅色底色
    expect(html).toContain('background:#fdeeea')
    // 表格彩色表头
    expect(html).toContain('th { background:#e8604c')
    // markdown 结构与 emoji 正常渲染（> 引用块 → blockquote 卡片）
    expect(html).toContain('<blockquote>')
    expect(html).toContain('🔥 爆点速览')
    expect(html).toContain('<th>时间</th>')
  })
})

describe('排版模板选项与内置应用一致性', () => {
  it('report-image 表单的 templateId 选项全部在模板注册表中（防漂移）', () => {
    const form = NODE_CONFIG_FORMS['report-image']
    const field = form.find(f => f.key === 'templateId')
    expect(field).toBeDefined()
    const options = (field as { options?: Array<{ value: string }> }).options ?? []
    expect(options.length).toBeGreaterThanOrEqual(6)
    for (const opt of options) {
      expect(DOCUMENT_TEMPLATES[opt.value], `表单选项 ${opt.value} 未注册`).toBeDefined()
    }
  })

  it('内置应用 report-image 节点的 templateId 全部有效（动态模板表达式跳过，运行时按输入解析）', () => {
    const dir = resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps')
    const files = readdirSync(dir).filter(f => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const raw = JSON.parse(readFileSync(resolve(dir, f), 'utf-8')) as { graph: WorkflowGraph }
      for (const node of raw.graph.nodes) {
        if (node.type !== 'report-image') continue
        const tid = (node.config as { templateId?: string })?.templateId
        expect(tid, `${f}/${node.id} 缺 templateId`).toBeTruthy()
        // 静态 templateId 必须在注册表；{{...}} 模板表达式由 start 输入在运行时解析
        if (typeof tid === 'string' && tid.includes('{{')) continue
        expect(DOCUMENT_TEMPLATES[tid as string], `${f}/${node.id} templateId=${tid} 未注册`).toBeDefined()
      }
    }
  })

  it('内置吃瓜工作流：风格由提示词驱动（无 template 下拉），report1 用通用排版 templateId 有效', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../../../src/core/database/migrations/builtin-apps/gossip-event-report.json'), 'utf-8')) as { graph: WorkflowGraph }
    const start = raw.graph.nodes.find(n => n.type === 'start')
    const inputs = (start?.config?.inputs as Array<{ key?: string; type?: string }>) ?? []
    // 通用化：风格走 stylePrompt 提示词，不再绑定预设视觉模板下拉
    expect(inputs.some(i => i.key === 'stylePrompt' && i.type === 'textarea')).toBe(true)
    expect(inputs.some(i => i.key === 'template')).toBe(false)
    // 长图仍用通用排版（generic），其 templateId 必须在注册表中（防漂移）
    const report = raw.graph.nodes.find(n => n.type === 'report-image')
    const tid = (report?.config as { templateId?: string })?.templateId
    expect(tid).toBe('generic')
    expect(DOCUMENT_TEMPLATES[tid as string]).toBeDefined()
  })

  it('report-image 目录缺省配置 templateId=generic 有效', () => {
    const catalog = NODE_TYPE_CATALOG_MAP['report-image']
    const def = (catalog as { defaultConfig?: { templateId?: string } }).defaultConfig
    expect(DOCUMENT_TEMPLATES[def?.templateId ?? '']).toBeDefined()
  })
})
