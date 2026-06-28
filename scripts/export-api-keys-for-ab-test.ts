/**
 * 导出 API 密钥脚本（在 Electron 环境中运行）
 *
 * 用法：
 *   1. 启动应用：npm run dev
 *   2. 在应用运行期间，运行此脚本：
 *      npx tsx scripts/export-api-keys-for-ab-test.ts
 *
 * 输出：
 *   将 API 密钥写入 tests/integration/episode-production/.env.ab-test
 *   A/B 测试框架会自动读取此文件
 */

import * as fs from 'fs'
import * as path from 'path'

// 导入必要的模块
import { getCoreDatabaseManager } from '../src/core/database/database-manager.interface'
import { SecureStorageService } from '../src/electron/services/secure-storage.service'
import { ElectronDatabase } from '../src/electron/database'
import { app } from 'electron'

async function exportApiKeys() {
  console.log('正在导出 API 密钥...')

  // 初始化 SecureStorage
  const secureStorage = SecureStorageService.getInstance()
  await secureStorage.initialize()
  console.log('✓ SecureStorage 已初始化')

  // 初始化数据库
  const dbPath = path.join(app.getPath('userData'), 'database.sqlite')
  const database = new ElectronDatabase(dbPath)
  await database.initialize()
  console.log('✓ 数据库已初始化')

  // 获取数据库管理器
  const dbManager = getCoreDatabaseManager()
  if (!dbManager.providerConfigs) {
    console.error('✗ 无法获取 providerConfigs repository')
    process.exit(1)
  }

  // 获取所有已启用的提供商配置
  const enabledConfigs = await dbManager.providerConfigs.getEnabled()
  console.log(`✓ 找到 ${enabledConfigs.length} 个已启用的提供商配置`)

  if (enabledConfigs.length === 0) {
    console.error('✗ 没有已启用的提供商配置，请先在应用设置中配置并启用提供商')
    process.exit(1)
  }

  // 查找 DeepSeek 和通义千问的配置
  let deepseekKey: string | undefined
  let qwenKey: string | undefined

  for (const config of enabledConfigs) {
    if (!config.apiKey) continue

    try {
      const decryptedKey = secureStorage.decrypt(config.apiKey)

      // 根据 templateId 或 baseUrl 判断提供商类型
      const templateId = config.templateId?.toLowerCase() || ''
      const baseUrl = (config.baseUrl || '').toLowerCase()

      if (templateId.includes('deepseek') || baseUrl.includes('deepseek')) {
        deepseekKey = decryptedKey
        console.log(`✓ 找到 DeepSeek 配置: ${config.name || config.id}`)
      } else if (
        templateId.includes('qwen') ||
        templateId.includes('dashscope') ||
        baseUrl.includes('dashscope') ||
        baseUrl.includes('qwen')
      ) {
        qwenKey = decryptedKey
        console.log(`✓ 找到通义千问配置: ${config.name || config.id}`)
      }
    } catch (error) {
      console.warn(`⚠ 解密失败: ${config.name || config.id}`, error)
    }
  }

  // 写入 .env.ab-test 文件
  const envPath = path.join(__dirname, '../tests/integration/episode-production/.env.ab-test')
  const envContent = [
    '# A/B 测试 API 密钥（自动生成，请勿提交到版本控制）',
    `# 生成时间: ${new Date().toISOString()}`,
    '',
    deepseekKey ? `AB_TEST_DEEPSEEK_API_KEY=${deepseekKey}` : '# AB_TEST_DEEPSEEK_API_KEY=未找到',
    qwenKey ? `AB_TEST_QWEN_API_KEY=${qwenKey}` : '# AB_TEST_QWEN_API_KEY=未找到',
    '',
  ].join('\n')

  fs.writeFileSync(envPath, envContent, 'utf-8')
  console.log(`\n✓ API 密钥已导出到: ${envPath}`)
  console.log('  现在可以运行: npm run test:hyp3')

  // 关闭数据库
  await database.close()
  process.exit(0)
}

// 等待应用就绪
if (app.isReady()) {
  exportApiKeys().catch((error) => {
    console.error('导出失败:', error)
    process.exit(1)
  })
} else {
  app.whenReady().then(() => {
    exportApiKeys().catch((error) => {
      console.error('导出失败:', error)
      process.exit(1)
    })
  })
}
