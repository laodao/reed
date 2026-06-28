/**
 * BUG-4 质量评估：分镜分析结果传递对分镜质量的影响
 *
 * 测试设计：
 * - 用同一场景分别生成两组分镜
 * - A 组：不传分析结果（模拟修复前）
 * - B 组：传分析结果（修复后）
 * - 人工对比评估质量差异
 */

import * as fs from 'fs'
import * as path from 'path'

// 加载 .env.local
const envPath = path.join(process.cwd(), '.env.local')
const content = fs.readFileSync(envPath, 'utf-8')
for (const line of content.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const match = trimmed.match(/^([^=]+)=(.*)$/)
  if (match) {
    const key = match[1].trim()
    const value = match[2].trim()
    if (!process.env[key]) process.env[key] = value
  }
}

import { createDirectCallAI } from './direct-call-ai'

// 测试场景
const TEST_SCENE = {
  sceneNumber: 1,
  location: '茶馆',
  locationType: 'interior',
  timeOfDay: '白天',
  weather: '晴',
  sceneDescription: '古色古香的茶馆，木质桌椅，茶香四溢。张三坐在角落喝茶，李四推门进入。',
  mood: '市井温馨',
  lighting: '自然光',
  characters: [
    { characterBindingId: 'char_zhangsan', characterName: '张三', expression: '平静', action: '喝茶' },
    { characterBindingId: 'char_lisi', characterName: '李四', expression: '期待', action: '推门进入' },
  ],
  narration: '',
  dialogues: [
    { id: 'dlg_1', characterName: '张三', text: '来了，坐。', emotion: '平静' },
    { id: 'dlg_2', characterName: '李四', text: '等你很久了。', emotion: '期待' },
  ],
  actions: [
    { id: 'act_1', description: '李四推门进入茶馆' },
    { id: 'act_2', description: '张三抬手示意李四坐下' },
  ],
}

// 模拟分析结果
const ANALYSIS_RESULT = {
  shotCount: 5,
  shotTypes: ['long', 'medium', 'close', 'medium', 'long'],
  notes: '开场用远景建立环境，中间用中近景展示对话互动，结尾用远景收束。',
}

// 提示词模板（简化版）
const SINGLE_STORYBOARD_PROMPT = `请为以下场景生成第 {shotNumber} 个分镜。

场景信息：
{sceneScript}

上下文信息：
{contextInfo}

输出 JSON 格式：
{
  "shotNumber": 镜头序号,
  "shotType": "景别（extreme_long/long/full/medium/medium_close/close/extreme_close/detail）",
  "cameraAngle": "角度（eye_level/high/low/dutch/birds_eye/worms_eye）",
  "cameraMovement": "运镜（static/pan_left/pan_right/tilt_up/tilt_down/dolly_in/dolly_out）",
  "frameDescription": "画面描述（50-100字，详细描述人物位置、动作、表情、环境）",
  "duration": 持续时间（秒，2-8之间）,
  "characters": [{"characterId": "角色ID", "position": "位置", "expression": "表情"}],
  "dialogueIds": ["对话ID数组"],
  "actionIds": ["动作ID数组"]
}

直接输出 JSON，不要有任何其他内容。`

function buildSceneDescription() {
  return `
场景 ${TEST_SCENE.sceneNumber}: ${TEST_SCENE.location}
地点类型: ${TEST_SCENE.locationType}
时间: ${TEST_SCENE.timeOfDay}
天气: ${TEST_SCENE.weather}
场景描述: ${TEST_SCENE.sceneDescription}
氛围: ${TEST_SCENE.mood}
光线: ${TEST_SCENE.lighting}

出场角色:
${TEST_SCENE.characters.map(c => `- ID: ${c.characterBindingId}, 名称: ${c.characterName}, 表情(${c.expression}), 动作(${c.action})`).join('\n')}

对话:
${TEST_SCENE.dialogues.map(d => `- ID: ${d.id}, 角色: ${d.characterName}, 内容: "${d.text}", 情感: ${d.emotion}`).join('\n')}

动作:
${TEST_SCENE.actions.map(a => `- ID: ${a.id}, 描述: ${a.description}`).join('\n')}
`
}

function buildContextInfoA(shotNumber: number) {
  // A 组：不传分析结果
  if (shotNumber === 1) {
    return '这是场景的第一个镜头（开场镜头），需要建立场景环境，展示空间关系和人物位置。'
  }
  return `上一个镜头（第${shotNumber - 1}号）已生成。请考虑镜头的衔接和变化。`
}

function buildContextInfoB(shotNumber: number) {
  // B 组：传分析结果
  let context = ''
  context += `整体分镜规划：本场景预计 ${ANALYSIS_RESULT.shotCount} 个镜头，建议景别序列为 [${ANALYSIS_RESULT.shotTypes.join(', ')}]。`
  context += `规划说明：${ANALYSIS_RESULT.notes}\n\n`

  if (shotNumber === 1) {
    context += '这是场景的第一个镜头（开场镜头），需要建立场景环境，展示空间关系和人物位置。'
  } else {
    context += `当前是第 ${shotNumber} 个镜头，建议使用景别：${ANALYSIS_RESULT.shotTypes[shotNumber - 1] || 'medium'}。`
  }

  return context
}

async function generateStoryboards(group: 'A' | 'B', callAI: any) {
  console.log(`\n========== 生成 ${group} 组分镜 ==========\n`)
  const storyboards = []

  for (let i = 1; i <= 5; i++) {
    const sceneDesc = buildSceneDescription()
    const context = group === 'A' ? buildContextInfoA(i) : buildContextInfoB(i)
    const prompt = SINGLE_STORYBOARD_PROMPT
      .replace('{shotNumber}', String(i))
      .replace('{sceneScript}', sceneDesc)
      .replace('{contextInfo}', context)

    console.log(`生成第 ${i} 个镜头...`)
    const response = await callAI(prompt, '你是专业分镜师，输出严格 JSON。', 2048, undefined, 'deepseek-chat')

    try {
      const parsed = JSON.parse(response)
      storyboards.push(parsed)
      console.log(`  ✓ 景别: ${parsed.shotType}, 角度: ${parsed.cameraAngle}`)
    } catch (e) {
      console.log(`  ✗ 解析失败: ${e}`)
    }
  }

  return storyboards
}

async function main() {
  console.log('========== BUG-4 质量评估测试 ==========\n')

  const callAI = createDirectCallAI()

  // 生成 A 组（无分析结果）
  const groupA = await generateStoryboards('A', callAI)

  // 生成 B 组（有分析结果）
  const groupB = await generateStoryboards('B', callAI)

  // 输出对比报告
  console.log('\n\n========== 对比报告 ==========\n')
  console.log('A 组（无分析结果）景别序列:', groupA.map(s => s.shotType).join(', '))
  console.log('B 组（有分析结果）景别序列:', groupB.map(s => s.shotType).join(', '))
  console.log('建议景别序列:', ANALYSIS_RESULT.shotTypes.join(', '))

  // 计算景别匹配度
  const matchCount = groupB.filter((s, i) => s.shotType === ANALYSIS_RESULT.shotTypes[i]).length
  console.log(`\nB 组与建议景别匹配数: ${matchCount}/${ANALYSIS_RESULT.shotTypes.length}`)

  // 保存到文件
  const reportPath = path.join(process.cwd(), 'tests/reports/bug4-quality-evaluation.md')
  const report = `# BUG-4 质量评估报告

生成时间: ${new Date().toISOString()}

## 测试场景
${TEST_SCENE.sceneDescription}

## 分析结果（传给 B 组）
- 预计镜头数: ${ANALYSIS_RESULT.shotCount}
- 建议景别: ${ANALYSIS_RESULT.shotTypes.join(', ')}
- 规划说明: ${ANALYSIS_RESULT.notes}

## A 组（无分析结果）

| 镜头 | 景别 | 角度 | 运镜 | 时长 |
|------|------|------|------|------|
${groupA.map((s, i) => `| ${i + 1} | ${s.shotType} | ${s.cameraAngle} | ${s.cameraMovement} | ${s.duration}s |`).join('\n')}

## B 组（有分析结果）

| 镜头 | 景别 | 角度 | 运镜 | 时长 | 与建议匹配 |
|------|------|------|------|------|------------|
${groupB.map((s, i) => `| ${i + 1} | ${s.shotType} | ${s.cameraAngle} | ${s.cameraMovement} | ${s.duration}s | ${s.shotType === ANALYSIS_RESULT.shotTypes[i] ? '✓' : '✗'} |`).join('\n')}

## 对比分析

- A 组景别序列: ${groupA.map(s => s.shotType).join(', ')}
- B 组景别序列: ${groupB.map(s => s.shotType).join(', ')}
- 建议景别序列: ${ANALYSIS_RESULT.shotTypes.join(', ')}

**B 组与建议匹配度**: ${matchCount}/${ANALYSIS_RESULT.shotTypes.length} (${(matchCount / ANALYSIS_RESULT.shotTypes.length * 100).toFixed(0)}%)

## 评估结论

（需要人工评估）

- 景别分布是否更合理？
- 镜头序列是否更连贯？
- 是否符合场景氛围？
`

  fs.writeFileSync(reportPath, report, 'utf-8')
  console.log(`\n✓ 报告已保存到: ${reportPath}`)
}

main().catch(console.error)
