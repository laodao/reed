#!/usr/bin/env node
/**
 * 讲义排版视觉验证（临时诊断脚本，不入产品代码）
 *
 * 用途：把真实空间的讲义 sections（`dl_card.sections` 导出 JSON）渲染成独立 HTML：
 * - Markdown → HTML 用 marked（与 bytemd 的 remark/rehype 输出结构一致）；
 * - 公式按 plugin-math 的做法在客户端用 KaTeX 渲染 `.math.math-inline/.math.math-display`；
 * - 样式取自**真实文件**：lesson-markdown.scss（sass 编译）+ SectionLesson.vue 的 style 块，
 *   只把 Vue 的 `:deep(X)` 还原成 `X`（预览页没有 scoped 属性）；
 * - 复现全局 reset（`* { margin:0; padding:0 }`）与 Element Plus 变量，才能看到真实排版问题。
 *
 * 用法：node progress/_dl_lesson_preview.cjs [sections.json] [out.html]
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const sass = require('sass')
const { marked } = require('marked')
const katex = require('katex')

const ROOT = process.cwd()
const sectionsJsonPath = process.argv[2] || path.join(ROOT, '.run', 'card-tensor.json')
const outPath = process.argv[3] || path.join(ROOT, 'progress', '_dl_lesson_preview.html')

const DL_DIR = path.join(ROOT, 'src/renderer/src/views/domain-learning')

/** 把 Vue scoped 的 :deep(X) 还原成 X（预览页无 data-v 属性） */
function unwrapDeep(css) {
  return css.replace(/:deep\(([^)]*)\)/g, '$1')
}

function compileScssString(source, label) {
  return unwrapDeep(sass.compileString(source, { syntax: 'scss', loadPaths: [DL_DIR] }).css)
}

function compileScssFile(file) {
  return unwrapDeep(sass.compile(file).css)
}

function extractStyleBlock(vueFile) {
  const src = fs.readFileSync(vueFile, 'utf8')
  const m = src.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  if (!m) throw new Error(`未找到 style 块：${vueFile}`)
  return m[1]
}

// ---------- 1. 读真实讲义内容 ----------
let raw = fs.readFileSync(sectionsJsonPath, 'utf8')
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
const sections = JSON.parse(raw.trim())

// ---------- 2. 按 planLessonSections 的口径分区（正文编号 / 编写注记汇总） ----------
const isNotesSection = (s) => s.key === 'notes' || /编写注记|作者注记|注记/.test(s.title ?? '')
const contentSections = sections.filter((s) => !isNotesSection(s))
const authoringNotes = sections
  .filter(isNotesSection)
  .flatMap((s) =>
    String(s.md)
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
      .filter(Boolean),
  )

// ---------- 3. Markdown → HTML（含公式占位，交给 KaTeX 客户端渲染） ----------
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 自测答案切分（与 src/shared/utils/lesson-selfcheck.ts 同口径的极简复刻）：
 * 答案标记独占一行时，答案部分交给 `<details>`（预览页里默认折叠，与产品行为一致）。
 */
const ANSWER_MARKER_LINE =
  /^\s{0,3}(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:参考答案与解析|答案与解析|参考答案|标准答案|正确答案|答案|解答)\s*(?:\*\*|__)?\s*[:：]?\s*$/

function splitAnswers(md) {
  const lines = String(md ?? '').split(/\r?\n/)
  const at = lines.findIndex((l) => ANSWER_MARKER_LINE.test(l))
  if (at < 0) return { questions: String(md ?? ''), answers: '' }
  const questions = lines.slice(0, at).join('\n').replace(/\n+(?:-{3,}|\*{3,}|_{3,})\s*$/, '').trimEnd()
  const answers = lines.slice(at + 1).join('\n').trim()
  if (!questions.trim() || !answers) return { questions: String(md ?? ''), answers: '' }
  return { questions, answers }
}

/**
 * 复现 remark-math 的 hast 产物：`$$…$$` → `<div class="math math-display">`，
 * `$…$` → `<span class="math math-inline">`（plugin-math 靠这两个类名定位渲染锚点）。
 */
function withMathNodes(md) {
  return String(md ?? '')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => `\n\n<div class="math math-display">${escapeHtml(tex.trim())}</div>\n\n`)
    .replace(/\$([^$\n]+?)\$/g, (_, tex) => `<span class="math math-inline">${escapeHtml(tex)}</span>`)
}

function mdToHtml(md) {
  return marked.parse(withMathNodes(md), { gfm: true, breaks: false })
}

const sectionHtml = contentSections
  .map((sec, i) => {
    const title = sec.title ?? sec.key
    const style = sec.style ?? 'body'
    const folded = !!sec.folded
    const { questions, answers } = splitAnswers(sec.md)
    const answersHtml = answers
      ? `
      <div class="selfcheck-answers">
        <details>
          <summary class="answers-toggle">显示答案（建议先自己做）</summary>
          <div class="answers-body"><div class="markdown-viewer"><div class="markdown-body">${mdToHtml(answers)}</div></div></div>
        </details>
      </div>`
      : ''
    return `
  <div class="sec sec-${style}">
    <div class="sec-head">
      <span class="sec-index">${i + 1}</span>
      <span class="sec-title">${title}</span>
      <span class="sec-actions">
        <span class="sec-confuse">这块没懂</span>
        ${folded ? '<span class="fold-hint">展开全文</span>' : ''}
      </span>
    </div>
    <div class="sec-body">
      <div class="markdown-viewer"><div class="markdown-body">${mdToHtml(questions)}</div></div>
      ${answersHtml}
    </div>
  </div>`
  })
  .join('\n')

const notesHtml = authoringNotes.length
  ? `
  <div class="authoring-notes">
    <span class="notes-toggle">编写注记（学习者可跳过）· ${authoringNotes.length} 条展开</span>
    <ul class="notes-list">${authoringNotes.map((n) => `<li>${marked.parseInline(n)}</li>`).join('')}</ul>
  </div>`
  : ''

// ---------- 4. 组装页面 ----------
const resetAndVars = `
/* 复现应用全局样式（styles/index.scss 的 reset + Element Plus 亮色变量子集） */
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --el-color-primary: #6fa8dc;
  --el-color-primary-light-3: #8fc0ea;
  --el-color-primary-light-5: #a8ccf0;
  --el-color-primary-light-7: #c5ddf5;
  --el-color-primary-light-9: #eaf3fb;
  --el-color-warning: #e6a23c;
  --el-color-warning-light-9: #fdf6ec;
  --el-color-info-light-5: #c8c9cc;
  --el-text-color-primary: #303133;
  --el-text-color-regular: #606266;
  --el-text-color-secondary: #909399;
  --el-text-color-placeholder: #c0c4cc;
  --el-border-color: #dcdfe6;
  --el-border-color-lighter: #ebeef5;
  --el-fill-color: #f0f2f5;
  --el-fill-color-light: #f5f7fa;
  --el-fill-color-lighter: #fafafa;
}
body { font-family: 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; color: var(--el-text-color-primary); background: #faf9f7; }
.pane-lesson { width: 900px; margin: 16px auto; background: #fff; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; }
.lesson-body { padding: 14px 18px; }
`

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<base href="file:///${path.join(ROOT, 'node_modules/katex/dist').replace(/\\/g, '/')}/" />
<link rel="stylesheet" href="katex.css" />
<style>${resetAndVars}</style>
<style>${compileScssFile(path.join(DL_DIR, 'lesson-markdown.scss'))}</style>
<style>${compileScssString(extractStyleBlock(path.join(DL_DIR, 'SectionLesson.vue')))}</style>
<script src="katex.min.js"></script>
</head>
<body>
<div class="pane-lesson">
  <div class="lesson-body block-body-pad">
    <div class="section-lesson">
${sectionHtml}
${notesHtml}
    </div>
  </div>
</div>
<script>
  // 与 @bytemd/plugin-math 的 viewerEffect 同口径：查询类名锚点后客户端渲染 KaTeX
  document.querySelectorAll('.math.math-inline').forEach(function (el) {
    katex.render(el.innerText, el, { throwOnError: false, displayMode: false });
  });
  document.querySelectorAll('.math.math-display').forEach(function (el) {
    katex.render(el.innerText, el, { throwOnError: false, displayMode: true });
  });
</script>
</body>
</html>`

fs.writeFileSync(outPath, html, 'utf8')
console.log(`preview: ${outPath}`)
console.log(`sections: ${contentSections.length} 区 + 注记 ${authoringNotes.length} 条`)
