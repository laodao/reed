// @vitest-environment happy-dom
/**
 * ShotPromptEditor · 逐镜头只读台词 chip 单测（2026-10-05 台词可见性）。
 *
 * 覆盖：
 *  1. dialoguesByShot 命中的镜头行末尾渲染台词 chip（说话人 + 原文）；
 *  2. 未传 prop / 该镜头无台词 → 不渲染；
 *  3. chip 在 .pk-desc 之外且无 data-key → 序列化（保存回写 frameDescription）
 *     完全不携带台词，提示词字符串原样往返；
 *  4. 台词语音时长（4.5 字/秒）超过镜头时长 → chip 加 .over 警示。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import ShotPromptEditor from '../../../../src/renderer/src/components/episode-production/storyboard/ShotPromptEditor.vue'

const MODEL =
  '镜头1 [景别=full|运镜=static|时长=2|风格=cinematic] 深夜，沈云萝推门而入\n' +
  '镜头2 [景别=medium|运镜=static|时长=8|风格=cinematic] 掌门抬眼，放下书卷。'

function mountEditor(dialoguesByShot?: Record<number, Array<{ speaker: string; text: string }>>) {
  return mount(ShotPromptEditor, {
    props: { modelValue: MODEL, entities: [], dialoguesByShot },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

describe('ShotPromptEditor 台词 chip', () => {
  it('命中镜头的行末渲染只读台词 chip（说话人+原文）', async () => {
    const w = mountEditor({
      1: [{ speaker: '沈云萝', text: '我饿了。' }],
      2: [{ speaker: '掌门', text: '坐下说。' }],
    })
    await nextTick()
    const chips = w.findAll('.pk-dlg')
    expect(chips).toHaveLength(2)
    expect(chips[0].text()).toContain('沈云萝：我饿了。')
    expect(chips[1].text()).toContain('掌门：坐下说。')
    // chip 必须 contenteditable=false（只读）
    expect(w.find('.pk-dialogues').attributes('contenteditable')).toBe('false')
    w.unmount()
  })

  it('未传 dialoguesByShot → 无 chip，不报错', async () => {
    const w = mountEditor(undefined)
    await nextTick()
    expect(w.findAll('.pk-dlg')).toHaveLength(0)
    w.unmount()
  })

  it('序列化不携带台词：input 后 emit 的字符串与原始模型值完全一致', async () => {
    const w = mountEditor({ 1: [{ speaker: '沈云萝', text: '我饿了。' }] })
    await nextTick()
    await nextTick() // renderHtml 的 nextTick 复位 rendering 标志
    await w.find('.rich-box').trigger('input')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.at(-1)![0]).toBe(MODEL)
    w.unmount()
  })

  it('台词语音时长超过镜头时长 → chip 带 .over 警示；时长充足则无', async () => {
    const w = mountEditor({
      // 15 字 / 4.5 ≈ 3.3s > 时长 2s → over
      1: [{ speaker: '沈云萝', text: '那不正好？嘴皮子一流，破案靠嘴！' }],
      // 4 字 / 4.5 ≈ 0.9s < 时长 8s → 正常
      2: [{ speaker: '掌门', text: '坐下说。' }],
    })
    await nextTick()
    const line1 = w.find('.pk-line[data-no="1"]')
    const line2 = w.find('.pk-line[data-no="2"]')
    expect(line1.find('.pk-dlg').classes()).toContain('over')
    expect(line1.find('.pk-dlg').attributes('title')).toContain('超过镜头时长')
    expect(line2.find('.pk-dlg').classes()).not.toContain('over')
    w.unmount()
  })

  it('台词数据变化（同字符串）→ 重渲 chip（序列化守卫不挡台词更新）', async () => {
    const w = mountEditor({ 1: [{ speaker: '沈云萝', text: '我饿了。' }] })
    await nextTick()
    expect(w.findAll('.pk-dlg')).toHaveLength(1)
    await w.setProps({ dialoguesByShot: { 1: [{ speaker: '沈云萝', text: '我饿了。' }, { speaker: '秦越', text: '下山吧。' }] } })
    await nextTick()
    expect(w.findAll('.pk-dlg')).toHaveLength(2)
    w.unmount()
  })
})

describe('ShotPromptEditor 台词编辑', () => {
  const DLG = { 1: [{ id: 'dlg_1', speaker: '沈云萝', text: '我饿了。' }] }

  it('chip 携带 data-dlg-id（编辑回写定位用）', async () => {
    const w = mountEditor(DLG)
    await nextTick()
    expect(w.find('.pk-dlg').attributes('data-dlg-id')).toBe('dlg_1')
    w.unmount()
  })

  it('点击 chip → 打开编辑弹层（标题带说话人，textarea 含原文）', async () => {
    const w = mountEditor(DLG)
    await nextTick()
    w.find('.pk-dlg').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const popup = w.find('.dlg-popup')
    expect(popup.exists()).toBe(true)
    expect(popup.find('.popup-title').text()).toContain('沈云萝')
    expect((popup.find('.dlg-textarea').element as HTMLTextAreaElement).value).toBe('我饿了。')
    w.unmount()
  })

  it('修改后保存 → emit update-dialogue（id + 镜头号 + 新文本），弹层关闭', async () => {
    const w = mountEditor(DLG)
    await nextTick()
    w.find('.pk-dlg').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const ta = w.find('.dlg-textarea')
    ;(ta.element as HTMLTextAreaElement).value = '  师兄，我饿了。  '
    await ta.trigger('input')
    await w.find('.dlg-btn.primary').trigger('click')
    const emitted = w.emitted('update-dialogue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual({ id: 'dlg_1', shotNumber: 1, text: '师兄，我饿了。' })
    expect(w.find('.dlg-popup').exists()).toBe(false)
    w.unmount()
  })

  it('空白文本 → 保存按钮禁用，不允许空台词', async () => {
    const w = mountEditor(DLG)
    await nextTick()
    w.find('.pk-dlg').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const ta = w.find('.dlg-textarea')
    ;(ta.element as HTMLTextAreaElement).value = '   '
    await ta.trigger('input')
    expect((w.find('.dlg-btn.primary').element as HTMLButtonElement).disabled).toBe(true)
    w.unmount()
  })

  it('Esc → 关闭弹层且不 emit', async () => {
    const w = mountEditor(DLG)
    await nextTick()
    w.find('.pk-dlg').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await w.find('.dlg-textarea').trigger('keydown', { key: 'Escape' })
    expect(w.find('.dlg-popup').exists()).toBe(false)
    expect(w.emitted('update-dialogue')).toBeFalsy()
    w.unmount()
  })

  it('编辑中实时显示超长提示（镜头 2s，文本超长 → meta 变 over）', async () => {
    const w = mountEditor({ 1: [{ id: 'dlg_1', speaker: '沈云萝', text: '短。' }] })
    await nextTick()
    w.find('.pk-dlg').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    const ta = w.find('.dlg-textarea')
    ;(ta.element as HTMLTextAreaElement).value = '这是一段远远超过两秒镜头能说完的长台词'
    await ta.trigger('input')
    expect(w.find('.dlg-meta').classes()).toContain('over')
    expect(w.find('.dlg-over-tip').exists()).toBe(true)
    w.unmount()
  })
})
