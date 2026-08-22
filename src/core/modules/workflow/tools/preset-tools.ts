/**
 * 预设工具资产（P0 片1：第三方 API 一键接入，只读内置）
 * @module core/modules/workflow/tools/preset-tools
 * @description 结构与 custom_tools 一致（含 auth 提示）。authType=credential 的工具
 *              在 tool-call 节点里选择具体凭据（credentialId），执行时注入。
 *              {{credential}} 占位 → 解密后的 key 原样替换（用户决定 header 名/格式）；
 *              无占位且 authType=credential → 自动加 Authorization: Bearer <key>。
 */

import type { PresetTool } from '@shared/types/tool.types'

export const PRESET_TOOLS: PresetTool[] = [
  {
    id: 'preset:web-search',
    category: '搜索',
    name: '网页搜索（Serper）',
    description: 'Google 搜索结果（serper.dev），需配置 Serper API Key',
    method: 'POST',
    url: 'https://google.serper.dev/search',
    headers: [
      { key: 'X-API-KEY', value: '{{credential}}' },
      { key: 'Content-Type', value: 'application/json' },
    ],
    paramsSchema: [
      { key: 'q', label: '查询词', type: 'string', required: true },
      { key: 'gl', label: '国家代码', type: 'string', default: 'cn' },
      { key: 'num', label: '结果数', type: 'number', default: 10 },
    ],
    authType: 'credential',
    credentialId: null,
  },
  {
    id: 'preset:translate',
    category: '翻译',
    name: '翻译（DeepL）',
    description: 'DeepL 文本翻译 API，需配置 DeepL Auth Key',
    method: 'POST',
    url: 'https://api-free.deepl.com/v2/translate',
    headers: [
      { key: 'Authorization', value: 'DeepL-Auth-Key {{credential}}' },
      { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
    ],
    paramsSchema: [
      { key: 'text', label: '待翻译文本', type: 'string', required: true },
      { key: 'target_lang', label: '目标语言', type: 'select', required: true, options: [
        { label: '中文', value: 'ZH' }, { label: '英文', value: 'EN' }, { label: '日语', value: 'JA' }, { label: '韩语', value: 'KO' },
      ] },
      { key: 'source_lang', label: '源语言（留空自动）', type: 'string' },
    ],
    authType: 'credential',
    credentialId: null,
  },
  {
    id: 'preset:weather',
    category: '天气',
    name: '天气（OpenWeather）',
    description: '实时天气（api.openweathermap.org），需配置 App ID',
    method: 'GET',
    url: 'https://api.openweathermap.org/data/2.5/weather',
    headers: [],
    paramsSchema: [
      { key: 'q', label: '城市（城市名,国家码）', type: 'string', required: true, default: 'Beijing,cn' },
      { key: 'units', label: '单位', type: 'select', options: [{ label: '摄氏', value: 'metric' }, { label: '华氏', value: 'imperial' }], default: 'metric' },
    ],
    authType: 'credential',
    credentialId: null,
  },
  {
    id: 'preset:news',
    category: '新闻',
    name: '新闻（NewsAPI）',
    description: '新闻头条（newsapi.org），需配置 API Key',
    method: 'GET',
    url: 'https://newsapi.org/v2/top-headlines',
    headers: [],
    paramsSchema: [
      { key: 'country', label: '国家代码', type: 'string', default: 'cn' },
      { key: 'q', label: '关键词', type: 'string' },
      { key: 'pageSize', label: '条数', type: 'number', default: 10 },
    ],
    authType: 'credential',
    credentialId: null,
  },
  {
    id: 'preset:image-search',
    category: '图片',
    name: '图片搜索（Unsplash）',
    description: '高质量图片搜索（unsplash.com API），需配置 Access Key',
    method: 'GET',
    url: 'https://api.unsplash.com/search/photos',
    headers: [],
    paramsSchema: [
      { key: 'query', label: '关键词', type: 'string', required: true },
      { key: 'per_page', label: '条数', type: 'number', default: 5 },
    ],
    authType: 'credential',
    credentialId: null,
  },
  {
    id: 'preset:baidu-ocr',
    category: 'OCR',
    name: 'OCR 文字识别（百度）',
    description: '通用文字识别（aip.baidubce.com），需配置百度 API Key（Bearer 或 X-API-KEY 依凭据格式）',
    method: 'POST',
    url: 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic',
    headers: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
    paramsSchema: [
      { key: 'image', label: '图片（base64）', type: 'string', required: true },
    ],
    authType: 'header',
    credentialId: null,
  },
]

/** 预设工具索引（id → 定义） */
export const PRESET_TOOL_MAP: Record<string, PresetTool> = Object.fromEntries(
  PRESET_TOOLS.map(t => [t.id, t]),
)
