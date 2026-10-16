/**
 * 从运行中的应用获取 API 密钥
 *
 * 用法：
 *   1. 启动应用：npm run dev
 *   2. 在另一个终端运行：npm run export-keys
 *
 * 这会连接到运行中的应用，通过 IPC 获取 API 密钥，
 * 然后写入 tests/integration/episode-production/.env.ab-test
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

console.log('从运行中的应用获取 API 密钥...\n')

// 使用 electron 运行一个简单的脚本来获取密钥
const electronScript = `
const { app, ipcMain } = require('electron');
const path = require('path');

// 导入必要的模块
require('reflect-metadata');

async function getKeys() {
  // 等待应用就绪
  await app.whenReady();

  // 导入数据库和存储服务
  const { ElectronDatabase } = require('./out/electron/database/index.js');
  const { SecureStorageService } = require('./out/electron/services/secure-storage.service.js');
  const { getCoreDatabaseManager } = require('./out/core/database/database-manager.interface.js');

  // 初始化
  const secureStorage = SecureStorageService.getInstance();
  await secureStorage.initialize();

  const dbPath = path.join(app.getPath('userData'), 'database.sqlite');
  const database = new ElectronDatabase(dbPath);
  await database.initialize();

  const dbManager = getCoreDatabaseManager();
  const enabledConfigs = await dbManager.providerConfigs.getEnabled();

  const keys = {};
  for (const config of enabledConfigs) {
    if (!config.apiKey) continue;
    try {
      const key = secureStorage.decrypt(config.apiKey);
      const templateId = (config.templateId || '').toLowerCase();
      const baseUrl = (config.baseUrl || '').toLowerCase();

      if (templateId.includes('deepseek') || baseUrl.includes('deepseek')) {
        keys.deepseek = key;
      } else if (templateId.includes('qwen') || baseUrl.includes('dashscope') || baseUrl.includes('qwen')) {
        keys.qwen = key;
      }
    } catch (e) {
      // 忽略解密失败的配置
    }
  }

  console.log(JSON.stringify(keys));
  await database.close();
  app.quit();
}

getKeys().catch(e => {
  console.error(e);
  process.exit(1);
});
`

// 写入临时脚本
const tempScriptPath = path.join(__dirname, '../temp-get-keys.js')
fs.writeFileSync(tempScriptPath, electronScript, 'utf-8')

// 使用 electron 运行脚本
const electron = require('electron')
const child = spawn(electron, [tempScriptPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
})

let output = ''
let errorOutput = ''

child.stdout.on('data', (data) => {
  output += data.toString()
})

child.stderr.on('data', (data) => {
  errorOutput += data.toString()
})

child.on('close', (code) => {
  // 清理临时脚本
  try {
    fs.unlinkSync(tempScriptPath)
  } catch (e) {
    // 忽略
  }

  if (code !== 0) {
    console.error('获取密钥失败:', errorOutput)
    process.exit(1)
  }

  try {
    // 从输出中提取 JSON
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('无法解析输出:', output)
      process.exit(1)
    }

    const keys = JSON.parse(jsonMatch[0])

    // 写入 .env.ab-test 文件
    const envPath = path.join(__dirname, '../tests/integration/episode-production/.env.ab-test')
    const envContent = [
      '# A/B 测试 API 密钥（自动生成，请勿提交到版本控制）',
      `# 生成时间: ${new Date().toISOString()}`,
      '',
      keys.deepseek ? `AB_TEST_DEEPSEEK_API_KEY=${keys.deepseek}` : '# AB_TEST_DEEPSEEK_API_KEY=未找到',
      keys.qwen ? `AB_TEST_QWEN_API_KEY=${keys.qwen}` : '# AB_TEST_QWEN_API_KEY=未找到',
      '',
    ].join('\n')

    fs.writeFileSync(envPath, envContent, 'utf-8')
    console.log('✓ API 密钥已导出')
    console.log(`  DeepSeek: ${keys.deepseek ? '✓' : '✗'}`)
    console.log(`  通义千问: ${keys.qwen ? '✓' : '✗'}`)
    console.log(`\n✓ 密钥已保存到: ${envPath}`)
    console.log('  现在可以运行: npm run test:hyp3')
  } catch (e) {
    console.error('解析密钥失败:', e)
    process.exit(1)
  }
})
