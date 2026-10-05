// @vitest-environment happy-dom
/**
 * mentionQueryAtCaret 单测 —— 分镜提示词编辑器 @ 提及误弹修复。
 *
 * 核心场景：已渲染的资产 token（contenteditable=false）可见文字是 `@名字`，
 * DOM 文本里没有序列化格式的 `[ ]` 边界；检测必须只看光标所在的纯文本节点，
 * token 可见文字不得参与匹配，否则点击 token 后任意描述文字都会误弹资产搜索框。
 */
import { describe, it, expect } from 'vitest'
import { mentionQueryAtCaret } from '../../../../src/renderer/src/components/episode-production/storyboard/shot-prompt-mention'

/** 构造一行典型分镜 DOM：<token>@沈云萝</token> + 文本节点 */
function build(descInnerHtml: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'rich-box'
  root.innerHTML =
    `<div class="pk-line" data-no="1">` +
    `<span class="pk-label" contenteditable="false">镜头1:</span>` +
    `<span class="pk-dot" contenteditable="false">.</span> ` +
    `<span class="pk-desc">${descInnerHtml}</span></div>`
  document.body.appendChild(root)
  return root
}

const TOKEN = '<span class="pk-token entity" data-key="@entity" contenteditable="false">@沈云萝</span>'

function descTextNode(root: HTMLElement, index = 0): Text {
  const desc = root.querySelector('.pk-desc')!
  const texts: Text[] = []
  desc.childNodes.forEach((n) => { if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text) })
  return texts[index]
}

describe('mentionQueryAtCaret', () => {
  it('点击 token 之后的描述文字 → 不弹（token 可见文字不参与匹配）', () => {
    // 用户报告的核心 bug：token 紧跟描述文字，点哪里都弹资产搜索框
    const root = build(`${TOKEN}说道，手指轻点下巴。`)
    const text = descTextNode(root) // "说道，手指轻点下巴。"
    expect(mentionQueryAtCaret(text, 2)).toBeNull() // 点在「说道，」后
    expect(mentionQueryAtCaret(text, text.textContent!.length)).toBeNull() // 点在句尾
  })

  it('光标落在 token 元素边界（元素节点间隙）→ 不弹', () => {
    const root = build(`${TOKEN}说道。`)
    const desc = root.querySelector('.pk-desc')!
    // offset 1 = token 之后、文本节点之前
    expect(mentionQueryAtCaret(desc, 1)).toBeNull()
  })

  it('真实输入 @query（文本节点内）→ 返回 query', () => {
    const root = build(`${TOKEN}`)
    const desc = root.querySelector('.pk-desc')!
    desc.appendChild(document.createTextNode('@秦'))
    const text = descTextNode(root)
    expect(mentionQueryAtCaret(text, 2)).toBe('秦')
  })

  it('只输入 @ 还没打字 → 返回空串 query（弹完整资产列表）', () => {
    const root = build('画面渐暗。')
    const text = descTextNode(root)
    text.textContent = '画面渐暗。@'
    expect(mentionQueryAtCaret(text, text.textContent.length)).toBe('')
  })

  it('@ 后面带空白/括号 → 不弹', () => {
    const root = build('这是 @ 符号不是提及')
    const text = descTextNode(root)
    expect(mentionQueryAtCaret(text, text.textContent!.length)).toBeNull()
    const root2 = build('邮箱 a@example.com')
    const t2 = descTextNode(root2)
    expect(mentionQueryAtCaret(t2, t2.textContent!.length)).toBe('example.com') // 连续字符仍视为 query，与旧行为一致
  })

  it('query 跨越相邻纯文本节点拼接，但遇元素节点即停', () => {
    // 输入过程文本被拆成两个文本节点：「说@」+「沈」
    const root = build('')
    const desc = root.querySelector('.pk-desc')!
    desc.appendChild(document.createTextNode('说@'))
    desc.appendChild(document.createTextNode('沈'))
    expect(mentionQueryAtCaret(descTextNode(root, 1), 1)).toBe('沈')

    // 但 token（元素）会截断回溯：token 后的文本节点不含 @ → null
    const root2 = build(`${TOKEN}说道`)
    expect(mentionQueryAtCaret(descTextNode(root2), 2)).toBeNull()
  })

  it('token 后的 &nbsp; 边界 → 不弹（nbsp 归一为空格后截断匹配）', () => {
    const root = build(TOKEN + '\u00a0继续描述')
    const text = descTextNode(root)
    expect(mentionQueryAtCaret(text, text.textContent!.length)).toBeNull()
  })
})
