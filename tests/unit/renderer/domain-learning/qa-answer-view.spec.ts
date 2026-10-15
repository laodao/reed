// @vitest-environment happy-dom
/**
 * 追问回答渲染契约（QaAnswerView）
 * @module tests/unit/renderer/domain-learning/qa-answer-view.spec
 *
 * 背景（用户反馈）：「领域学习模块，主题学习界面，右侧追问答疑部分，模型输出内容
 * 应该要显示为渲染后的，支持切换到源文件」。
 *
 * 此前右栏答疑把 `dl_question.answerMd`（markdown）当成纯文本塞进气泡
 * （`<div class="qa-text">{{ t.text }}</div>` + `white-space: pre-wrap`），
 * 于是 `**加粗**`、表格、公式、代码围栏全部以原始字符示人。
 *
 * 本 spec 钉死：
 * - 默认渲染态：markdown 交给 MarkdownViewer（与讲义同一套渲染管线：KaTeX/mermaid/高亮）；
 * - 「源码」切换：显示**原始 markdown**（格式字符保留），渲染器退场；
 * - 空文本（流式首包未到）给占位符，不渲染空文档；
 * - 流式增量节流刷新（bytemd 全量重解析 + KaTeX/mermaid 客户端渲染，逐字重渲染会拖垮右栏），
 *   但流式结束时必须补齐到最新全文；
 * - 装配契约：右栏答疑面板的 assistant 轮改用本组件（源码级断言，视图体量大不便 mount）。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import QaAnswerView from '../../../../src/renderer/src/views/domain-learning/QaAnswerView.vue'

// happy-dom 13 未实现 `document.compatMode`，而 KaTeX 在模块求值时据此自禁用；
// 真实页面带 `<!DOCTYPE html>`（见 markdown-viewer.spec.ts 同一处补齐）。
Object.defineProperty(document, 'compatMode', { value: 'CSS1Compat', configurable: true })

/** 等待懒加载 + 插件客户端渲染完成（不用固定 sleep） */
async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((r) => setTimeout(r, 25))
  }
  return predicate()
}

/** MarkdownViewer 用 stub 替换（真渲染器拉起重型 bytemd 模块，且已有独立 spec 守护）。
 *  注意：props 必须带类型声明——`compact` 是布尔属性，裸写法（无值）依赖 Vue 的
 *  Boolean 转换；若 stub 写成 `props: ['compact']`（无类型）则拿到的是空字符串。 */
const VIEWER_STUB = {
  props: { md: { type: String, default: '' }, compact: { type: Boolean, default: false } },
  template: '<div class="md-viewer-stub" :data-compact="String(compact)">{{ md }}</div>',
}

const STUBS = {
  MarkdownViewer: VIEWER_STUB,
  'el-tooltip': { template: '<span class="tip-stub"><slot /></span>' },
  'el-icon': { template: '<i class="el-icon-stub"><slot /></i>' },
}

const ANSWER_MD = [
  '**结论**：矩阵乘法对形状有约束。',
  '',
  '| 记号 | 含义 |',
  '| --- | --- |',
  '| `Wx` | 权重乘输入 |',
  '',
  '行内公式 $x_{2,3}=6$ 表示第 2 行第 3 列。',
].join('\n')

function mountAnswer(md: string, streaming = false) {
  return mount(QaAnswerView, { props: { md, streaming }, global: { stubs: STUBS } })
}

/** 点「源码 / 渲染」切换按钮（Tooltip 已 stub，取原生 button） */
async function toggle(w: ReturnType<typeof mountAnswer>): Promise<void> {
  const btn = w.find('.qa-mode-toggle')
  expect(btn.exists(), '未找到渲染/源码切换按钮').toBe(true)
  await btn.trigger('click')
  await nextTick()
}

describe('追问回答渲染（QaAnswerView）', () => {
  it('默认渲染态：markdown 原文交给 MarkdownViewer，不出现源码块', () => {
    const w = mountAnswer(ANSWER_MD)
    const viewer = w.find('.md-viewer-stub')
    expect(viewer.exists()).toBe(true)
    expect(viewer.text()).toBe(ANSWER_MD)
    // 渲染态不提「源码」块（原始 md 不在 pre 里）
    expect(w.find('.qa-src').exists()).toBe(false)
  })

  it('渲染器用紧凑排版（气泡内不套讲义级首行缩进/大间距）', () => {
    const w = mountAnswer(ANSWER_MD)
    expect(w.find('.md-viewer-stub').attributes('data-compact')).toBe('true')
  })

  it('切到源码：原始 markdown 逐字可见（加粗星号/表格管道符保留），渲染器退场', async () => {
    const w = mountAnswer(ANSWER_MD)
    await toggle(w)
    const src = w.find('.qa-src')
    expect(src.exists()).toBe(true)
    expect(src.text()).toBe(ANSWER_MD)
    expect(src.text()).toContain('**结论**')
    expect(src.text()).toContain('| 记号 | 含义 |')
    expect(w.find('.md-viewer-stub').exists()).toBe(false)
  })

  it('再点一次切回渲染态（切换是双向的）', async () => {
    const w = mountAnswer(ANSWER_MD)
    await toggle(w)
    expect(w.find('.qa-src').exists()).toBe(true)
    await toggle(w)
    expect(w.find('.qa-src').exists()).toBe(false)
    expect(w.find('.md-viewer-stub').text()).toBe(ANSWER_MD)
  })

  it('切换按钮带可读标签（不是只有图标，窄栏里也要能认出）', async () => {
    const w = mountAnswer(ANSWER_MD)
    expect(w.find('.qa-mode-toggle').text()).toContain('源码')
    await toggle(w)
    expect(w.find('.qa-mode-toggle').text()).toContain('渲染')
  })

  it('空文本（流式首包未到）给占位符，不渲染空文档', () => {
    const w = mountAnswer('')
    expect(w.find('.md-viewer-stub').exists()).toBe(false)
    expect(w.find('.qa-answer-pending').exists()).toBe(true)
    // 空态下也不需要切换按钮
    expect(w.find('.qa-mode-toggle').exists()).toBe(false)
  })

  it('切到源码后内容随流式增长（源码态同样是最新的）', async () => {
    const w = mountAnswer('第一段', false)
    await toggle(w)
    await w.setProps({ md: '第一段\n\n第二段' })
    expect(w.find('.qa-src').text()).toBe('第一段\n\n第二段')
  })

  describe('流式节流（bytemd 全量重渲染代价高）', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('流式增量合并刷新（不是每个 chunk 都重渲染），结束时立即补齐全文', async () => {
      vi.useFakeTimers()
      const w = mountAnswer('a', true)
      expect(w.find('.md-viewer-stub').text()).toBe('a')

      // 连续三个增量落在同一节流窗口内 → 渲染器仍停在旧值
      await w.setProps({ md: 'ab' })
      await w.setProps({ md: 'abc' })
      await w.setProps({ md: 'abcd' })
      await nextTick()
      expect(w.find('.md-viewer-stub').text()).toBe('a')

      // 窗口到点 → 一次补齐到最新
      vi.advanceTimersByTime(300)
      await nextTick()
      expect(w.find('.md-viewer-stub').text()).toBe('abcd')

      // 流式结束：不再节流，立即跟上（并清掉挂起的定时器）
      await w.setProps({ md: 'abcde', streaming: false })
      await nextTick()
      expect(w.find('.md-viewer-stub').text()).toBe('abcde')
    })

    it('非流式（回看历史）不节流：改内容立刻反映', async () => {
      const w = mountAnswer('历史答案一', false)
      await w.setProps({ md: '历史答案一（修订）' })
      expect(w.find('.md-viewer-stub').text()).toBe('历史答案一（修订）')
    })
  })
})

// ==================== 真渲染器集成（不走 stub：钉死"模型输出真的被渲染"） ====================

describe('追问回答渲染（真 MarkdownViewer 集成）', () => {
  it('加粗与表格渲染成 HTML；切「源码」后回到原始 markdown 文本', async () => {
    const w = mount(QaAnswerView, { props: { md: ANSWER_MD } })
    // @bytemd/vue-next 的 Viewer 根节点就是 `.markdown-body`（没有 `.bytemd` 外层壳），
    // 故就绪锚点取 `.markdown-body`。
    const ready = await waitFor(() => w.find('.markdown-body').exists())
    expect(ready, `渲染器未就绪：${w.html().slice(0, 600)}`).toBe(true)

    // 渲染态：markdown 语义真的落到 DOM（而不是格式字符）
    expect(w.find('strong').text()).toBe('结论')
    expect(w.find('table').exists()).toBe(true)
    expect(w.find('.markdown-body').text()).not.toContain('**结论**')

    // 源码态：回到原始 markdown（核对模型输出）
    await w.find('.qa-mode-toggle').trigger('click')
    await nextTick()
    expect(w.find('.qa-src').text()).toContain('**结论**')
    expect(w.find('.qa-src').text()).toContain('| 记号 | 含义 |')
    expect(w.find('.markdown-body').exists()).toBe(false)
  })
})

// ==================== 装配契约（DomainLearningSpace 体量大，按本仓既有做法做源码级断言） ====================
const SFC_PATH = resolve(__dirname, '../../../../src/renderer/src/views/domain-learning/DomainLearningSpace.vue')
const sfc = readFileSync(SFC_PATH, 'utf8')

describe('右栏答疑面板装配', () => {
  it('答疑面板引入 QaAnswerView 并用于 assistant 轮（带流式标记）', () => {
    expect(sfc).toContain("import QaAnswerView from './QaAnswerView.vue'")
    expect(sfc).toMatch(/<QaAnswerView[\s\S]{0,200}?:md="t\.text"/)
    expect(sfc).toMatch(/<QaAnswerView[\s\S]{0,200}?:streaming="isTurnStreaming\(i, t\)"/)
  })

  it('assistant 轮不再把 markdown 当纯文本直出（旧 qa-text 直出已移除）', () => {
    expect(sfc).not.toMatch(/<div class="qa-text[^"]*">\{\{ t\.text/)
  })

  it('用户提问仍是纯文本（不把用户输入当 markdown 渲染）', () => {
    expect(sfc).toMatch(/<div v-else class="qa-text-user">\{\{ t\.text \|\| '…' \}\}<\/div>/)
  })

  it('流式标记只在末轮 assistant 生效（避免历史轮被当成"回答中"）', () => {
    const m = /function isTurnStreaming\(index: number, turn: DlChatTurn\): boolean \{([\s\S]*?)\n\}/.exec(sfc)
    expect(m, '未找到 isTurnStreaming 定义').not.toBeNull()
    expect(m?.[1]).toContain("turn.role === 'assistant'")
    expect(m?.[1]).toContain('tutorStreaming.value')
    expect(m?.[1]).toContain('displayTurns.value.length - 1')
  })
})
