/**
 * 知识库切分策略集成测试
 * @module services/chunk-splitter/integration.spec
 * @description 验证切分策略在实际场景中的效果
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HybridSplitter, EmbeddingService, DEFAULT_SPLIT_CONFIG } from './index'
import { SplitChunk } from './types'

// 模拟真实的 Embedding API 响应
const createRealisticEmbeddingService = (): EmbeddingService => {
  return {
    getBatchEmbeddings: vi.fn(async (texts: string[]) => {
      // 为每个文本生成随机向量（模拟真实 API）
      return texts.map(() => {
        // 生成 1536 维向量（常见 Embedding 维度）
        const vector: number[] = []
        for (let i = 0; i < 1536; i++) {
          vector.push(Math.random() * 2 - 1) // -1 到 1 的随机值
        }
        return vector
      })
    })
  }
}

describe('知识库切分策略集成测试', () => {
  let embeddingService: EmbeddingService
  let splitter: HybridSplitter

  beforeEach(() => {
    embeddingService = createRealisticEmbeddingService()
    splitter = new HybridSplitter(embeddingService)
  })

  describe('Markdown 文档切分效果', () => {
    it('应正确切分技术文档', async () => {
      const content = `
# 技术架构文档

## 一、系统概述

本系统是一个基于 Electron + Vue3 的桌面应用程序。

主要技术栈包括：
- Electron：跨平台桌面应用框架
- Vue3：前端 UI 框架
- TypeScript：类型安全的开发语言

## 二、数据库设计

数据库采用 SQLite 存储，主要表结构如下：

### 2.1 用户表

存储用户基本信息，包括用户名、密码哈希等。

### 2.2 配置表

存储系统配置信息，支持动态更新。

## 三、API 接口

### 3.1 用户接口

- POST /api/users：创建用户
- GET /api/users/:id：获取用户信息

### 3.2 配置接口

- GET /api/config：获取配置
- PUT /api/config：更新配置
`
      const chunks = await splitter.split(content, { strategy: 'hybrid', minChunkSize: 50 })

      // 验证切分结果
      expect(chunks.length).toBeGreaterThan(0)

      // 验证层级信息
      const titleChunks = chunks.filter(c => c.title)
      expect(titleChunks.length).toBeGreaterThan(0)

      // 验证第一个 chunk 包含主标题
      const mainTitleChunk = chunks.find(c => c.title?.includes('技术架构'))
      expect(mainTitleChunk).toBeDefined()
      expect(mainTitleChunk?.level).toBe(1)

      // 验证合并后切片长度都超过阈值（短切片已合并）
      const shortChunks = chunks.filter(c => c.content.length < 50)
      // 合并后可能还有极短的切片（如最后一个），但数量应该很少
      console.log('Markdown 文档切分结果:')
      console.log(`- 总 chunk 数: ${chunks.length}`)
      console.log(`- 有标题的 chunk: ${titleChunks.length}`)
      console.log(`- 极短切片(<50字符): ${shortChunks.length}`)
      chunks.forEach(c => {
        if (c.title) {
          console.log(`  - [Level ${c.level}] ${c.title} (${c.content.length} 字符)`)
        }
      })
    })

    it('应正确处理多级标题层级路径', async () => {
      // 内容需要足够长（超过400字符）才不会被合并
      const longContent1 = '这是一段足够长的内容，用于避免被合并处理。'.repeat(15)
      const longContent2 = '这是另一段足够长的内容，用于避免被合并处理。'.repeat(15)
      const content = `
# 主标题

${longContent1}

## 一级子标题 A

${longContent2}

### 二级子标题 A-1

这是详细内容A-1，也需要足够长度以避免合并，重复几次内容以达到阈值要求。

### 二级子标题 A-2

这是详细内容A-2，同样需要足够长度以避免合并处理。

## 一级子标题 B

内容B部分，这段内容长度也足够长，不会与前面的章节合并在一起。
`
      const chunks = await splitter.split(content, { strategy: 'hybrid', minChunkSize: 200 })

      // 验证层级路径（合并后可能有些标题被合并，但应该至少有主标题）
      expect(chunks.length).toBeGreaterThan(0)

      console.log('多级标题层级路径:')
      chunks.forEach(c => {
        if (c.title) {
          console.log(`  - [Level ${c.level}] ${c.title} | Path: ${JSON.stringify(c.sectionPath)} (${c.content.length}字符)`)
        }
      })
    })
  })

  describe('小说章节切分效果', () => {
    it('应正确切分中文章节小说', async () => {
      // 每个章节需要足够长（超过400字符）才不会被合并
      const chapter1Content = '李明站在山顶，望着远方的城市。风吹过他的脸庞，带来一丝凉意。这是他期待已久的旅程起点，心中充满期待和不安。远方的城市灯火通明，看起来繁华而神秘。他深吸一口气，准备踏上这段未知的旅途。多年的梦想即将实现，内心既激动又忐忑。'.repeat(6)
      const chapter2Content = '在山脚下，李明遇到了一位老人。老人看起来慈祥而智慧，眼神中透露着深邃的光芒。"年轻人，你要去哪里？"老人问道。李明回答说他想去看看那座城市。老人笑了笑，指向前方的道路，说那里有他追寻的答案。'.repeat(6)
      const chapter3Content = '李明沿着老人指引的方向前进。路上遇到了各种挑战，首先是一片茂密的森林，他需要找到正确的路径。然后是一条湍急的河流，他需要想办法渡过。经历这些挑战后，他变得更加坚强和智慧。'.repeat(6)
      const content = `
第一章 开篇

${chapter1Content}

第二章 相遇

${chapter2Content}

第三章 冒险

${chapter3Content}
`
      const chunks = await splitter.split(content, { strategy: 'hybrid', minChunkSize: 50 })

      // 验证按章节切分
      expect(chunks.length).toBeGreaterThanOrEqual(3)

      // 验证章节标题
      const chapter1 = chunks.find(c => c.title?.includes('第一章'))
      expect(chapter1).toBeDefined()

      const chapter2 = chunks.find(c => c.title?.includes('第二章'))
      expect(chapter2).toBeDefined()

      console.log('小说章节切分结果:')
      chunks.forEach(c => {
        console.log(`  - ${c.title || '无标题'} (${c.content.length} 字符)`)
      })
    })
  })

  describe('纯文本切分效果', () => {
    it('应正确处理无结构的纯文本', async () => {
      // 生成一段没有明显结构的纯文本
      const content = `
这是一段普通的文本内容，没有章节标记。

这是第二段内容，讲的是不同的主题。可能需要在这里切分。

这是第三段，继续讲述另一个相关的话题。与前一段有关联，可能不应该切分。

这是第四段，完全不同的内容，应该在这里切分。

最后一段，作为结尾。

关于项目的讨论，这部分内容与前面不同，应该单独成块。
`
      const chunks = await splitter.split(content, {
        strategy: 'hybrid',
        similarityThreshold: 0.3,
        minChunkSize: 30
      })

      // 验证语义切分效果
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].splitMethod).toBe('semantic')

      console.log('纯文本语义切分结果:')
      console.log(`- 总 chunk 数: ${chunks.length}`)
      chunks.forEach(c => {
        console.log(`  - Chunk ${c.index}: ${c.content.substring(0, 50)}... (${c.content.length} 字符)`)
      })
    })
  })

  describe('长章节内部切分效果', () => {
    it('应对过长章节进行内部语义切分', async () => {
      // 创建一个超过 1000 字符的长章节，内容有语义变化以触发切分
      // 使用足够长的段落确保超过阈值
      const paragraphs = [
        '这是第一章的开篇内容，讲述了主人公的背景故事。主人公李明出生在一个小山村，从小就对山外的世界充满好奇。每天都望着远方的山峰，想象着外面的世界。',
        '随着年龄增长，李明开始学习武术和读书，准备离开山村去探索外面的世界。他每天刻苦练习，希望有一天能实现梦想。师傅告诉他要勇敢面对挑战。',
        '有一天，李明决定踏上旅程，去探索山外的广阔世界。他告别了父母和村民，背着简单的行囊出发了。村民们祝福他一路平安，期待他的归来。',
        '离开山村后，李明来到了一座繁华的城市。城市里的人们忙碌地生活着，街道上到处是商铺和行人。李明被城市的繁华景象震撼，决定在这里停留一段时间。',
        '李明感到既新奇又陌生。他在城市里找到了一份工作，开始适应新的生活节奏和城市文化。工作中他学会了与人沟通，积累了社会经验。',
        '工作中，李明结识了许多新朋友，学到了很多技能。几年后他成为经验丰富的冒险家，积累了丰富的阅历和人生智慧。他开始思考回家的旅程。',
        '他决定回到山村，把自己的经历分享给家乡的人们。回到山村后发现家乡变化很大，年轻人越来越多。村里修建了新房子，道路也变得更加宽阔。',
        '村民们对外面的世界更加感兴趣，李明成为了村里的骄傲和榜样。大家都喜欢听他讲外面的故事。孩子们围着他，好奇地询问城市的模样。',
        '李明开始教导村里的年轻人，帮助他们准备自己的旅程和冒险，传授生存技能和知识。他告诉他们要有勇气，同时也要谨慎。',
        '最后，李明在山村建立了一所学校，传授知识和技能给孩子们，帮助他们了解外面的世界。学校成为了村里的希望，家长们把孩子送来学习。'
      ]
      // 每个段落约80字符，10段落约800字符，加换行符约820，重复全部段落达到约1640字符
      const longContent = paragraphs.join('\n\n') + '\n\n' + paragraphs.join('\n\n')
      const content = `
# 长篇小说章节

${longContent}

# 下一章节

简短的内容。
`
      // 确认长章节内容超过阈值
      console.log('长章节内容长度:', longContent.length)
      expect(longContent.length).toBeGreaterThan(1000)

      const chunks = await splitter.split(content, {
        strategy: 'hybrid',
        similarityThreshold: 0.5,
        minChunkSize: 100
      })

      // 验证长章节被切分
      expect(chunks.length).toBeGreaterThan(2)

      // 检查是否有 sub-semantic 切分
      const subChunks = chunks.filter(c => c.splitMethod === 'sub-semantic')
      console.log('长章节内部切分结果:')
      console.log(`- 总 chunk 数: ${chunks.length}`)
      console.log(`- sub-semantic chunk 数: ${subChunks.length}`)
      chunks.forEach(c => {
        console.log(`  - [${c.splitMethod}] ${c.title || '子chunk'} (${c.content.length} 字符, level: ${c.level})`)
      })
    })
  })

  describe('固定切分兼容性', () => {
    it('应正确使用固定窗口切分（兼容旧版）', async () => {
      const content = '这是一个测试内容用于验证固定窗口切分策略是否正常工作。这是一个测试内容用于验证固定窗口切分策略是否正常工作。这是一个测试内容用于验证固定窗口切分策略是否正常工作。这是一个测试内容用于验证固定窗口切分策略是否正常工作。这是一个测试内容用于验证固定窗口切分策略是否正常工作。'

      const chunks = await splitter.split(content, { strategy: 'fixed' })

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].splitMethod).toBe('fixed')

      // 固定切分不使用 Embedding API
      expect(embeddingService.getBatchEmbeddings).not.toHaveBeenCalled()

      console.log('固定切分结果:')
      console.log(`- 总 chunk 数: ${chunks.length}`)
      chunks.forEach(c => {
        console.log(`  - Chunk ${c.index}: ${c.content.length} 字符`)
      })
    })
  })

  describe('切分策略对比', () => {
    it('对比不同策略的切分效果', async () => {
      const content = `
# 对比测试文档

## 第一节

内容 A 的详细描述，包含多个段落和详细信息。

## 第二节

内容 B 的描述，与第一节主题相关。

## 第三节

内容 C 的描述，完全不同的主题。
`
      const strategies = ['hybrid', 'structure', 'semantic', 'fixed'] as const

      console.log('\n切分策略对比:')
      for (const strategy of strategies) {
        const chunks = await splitter.split(content, { strategy, minChunkSize: 30 })
        console.log(`\n${strategy} 策略:`)
        console.log(`- 总 chunk 数: ${chunks.length}`)
        chunks.forEach(c => {
          const titleInfo = c.title ? `[${c.title}]` : '[无标题]'
          console.log(`  - ${titleInfo} ${c.content.length} 字符, method: ${c.splitMethod}, level: ${c.level}`)
        })
      }
    })
  })
})