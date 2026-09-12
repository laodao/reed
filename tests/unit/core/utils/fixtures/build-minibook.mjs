/**
 * 生成最小真实 EPUB 测试夹具（tests/unit/core/utils/fixtures/）
 *
 * 产物：
 *   - minibook.epub   EPUB3（nav 文档 + 中文两章 + 图片）  ~2.5KB
 *   - minibook2.epub  EPUB2（toc.ncx 目录 + 中文两章）     ~2.5KB
 *
 * 用途：extract-text 的 epub 解析单测需要真实的 epub 文件。
 * 真实电子书（数百 KB ~ 数 MB）入库不划算，这里按 EPUB 规范手工构造两份
 * 最小完整样本：
 *   - mimetype 必须为第一个条目且不压缩（规范要求，STORE 存储）
 *   - META-INF/container.xml 指向 OEBPS/content.opf
 *   - EPUB3 用 nav 文档（properties="nav"），EPUB2 用 toc.ncx（spine toc="ncx"）
 *   - 章节 xhtml 含中文正文与 <style>/<b>/<img> 等，用于验证 HTML → 纯文本剥离
 *     （<b> 等行内标签会被剥离为空白，测试按去空白口径断言）
 *
 * 执行：node tests/unit/core/utils/fixtures/build-minibook.mjs
 * 产物提交入库，脚本保留以便审计/再生成。
 */

import { createRequire } from 'module'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

const fixturesDir = path.dirname(fileURLToPath(import.meta.url))

/** EPUB 规范：mimetype 必须是第一个文件且不压缩 */
function addMimetype(zip) {
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
}

function addContainer(zip) {
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
  )
}

function chapter1() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>第一章 引子</title>
    <style>body { color: #333; }</style>
  </head>
  <body>
    <h1>第一章 引子</h1>
    <p>这是<b>测试之书</b>的第一章正文，包含中文与样式标签。</p>
    <p>第二段：验证多段合并后依旧保留段落分隔。</p>
  </body>
</html>
`
}

function chapter2() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>第二章 图片</title></head>
  <body>
    <h1>第二章 图片</h1>
    <p>本章包含一个自闭合图片引用与空段落。</p>
    <img src="images/logo.svg" alt="logo"/>
    <p></p>
    <p>结尾段落。</p>
  </body>
</html>
`
}

function logo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ff8800"/></svg>
`
}

/** EPUB3：nav 文档目录 */
function buildEpub3() {
  const zip = new JSZip()
  addMimetype(zip)
  addContainer(zip)

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:minibook-2026-0001</dc:identifier>
    <dc:title>测试之书</dc:title>
    <dc:language>zh</dc:language>
    <dc:creator>夹具生成器</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="pic" href="images/logo.svg" media-type="image/svg+xml"/>
  </manifest>
  <spine>
    <itemref idref="nav"/>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
`
  )

  zip.file(
    'OEBPS/toc.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>目录</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter1.xhtml">第一章 引子</a></li>
        <li><a href="chapter2.xhtml">第二章 图片</a></li>
      </ol>
    </nav>
  </body>
</html>
`
  )

  zip.file('OEBPS/chapter1.xhtml', chapter1())
  zip.file('OEBPS/chapter2.xhtml', chapter2())
  zip.file('OEBPS/images/logo.svg', logo())
  return zip
}

/** EPUB2：toc.ncx 目录 */
function buildEpub2() {
  const zip = new JSZip()
  addMimetype(zip)
  addContainer(zip)

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="book-id">urn:uuid:minibook2-2026-0001</dc:identifier>
    <dc:title>测试之书（二）</dc:title>
    <dc:language>zh</dc:language>
    <dc:creator>夹具生成器</dc:creator>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
`
  )

  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:minibook2-2026-0001"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>测试之书（二）</text></docTitle>
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>第一章 引子</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
    <navPoint id="np2" playOrder="2">
      <navLabel><text>第二章 图片</text></navLabel>
      <content src="chapter2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>
`
  )

  zip.file('OEBPS/chapter1.xhtml', chapter1())
  zip.file('OEBPS/chapter2.xhtml', chapter2())
  return zip
}

async function writeZip(zip, name) {
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const outFile = path.join(fixturesDir, name)
  writeFileSync(outFile, content)
  console.log(`已生成: ${outFile} (${content.length} bytes)`)
}

await writeZip(buildEpub3(), 'minibook.epub')
await writeZip(buildEpub2(), 'minibook2.epub')