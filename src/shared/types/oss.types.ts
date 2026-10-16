/**
 * 图床/OSS 配置类型定义
 * @module types/oss.types
 */

/**
 * OSS 提供商类型
 */
export type OSSProviderType = 'aliyun' | 'volcengine'

/**
 * OSS 配置基础接口
 */
export interface OSSConfigBase {
  id: string
  name: string
  provider: OSSProviderType
  isEnabled: boolean
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 阿里云 OSS 配置
 */
export interface AliyunOSSConfig extends OSSConfigBase {
  provider: 'aliyun'
  accessKeyId: string           // AccessKey ID
  accessKeySecret: string       // AccessKey Secret（加密存储）
  region: string                // 地域，如 oss-cn-hangzhou
  bucket: string                // Bucket 名称
  endpoint?: string             // 自定义 endpoint
  customDomain?: string         // 自定义域名（可选）
  pathPrefix?: string           // 路径前缀（可选）
}

/**
 * 火山引擎 TOS 配置
 */
export interface VolcengineTOSConfig extends OSSConfigBase {
  provider: 'volcengine'
  accessKeyId: string           // AccessKey ID
  accessKeySecret: string       // AccessKey Secret（加密存储）
  region: string                // 地域，如 cn-beijing
  bucket: string                // Bucket 名称
  endpoint?: string             // 自定义 endpoint
  customDomain?: string         // 自定义域名（可选）
  pathPrefix?: string           // 路径前缀（可选）
}

/**
 * OSS 配置联合类型
 */
export type OSSConfig = AliyunOSSConfig | VolcengineTOSConfig

/**
 * OSS 配置创建请求
 */
export interface CreateOSSConfigRequest {
  name: string
  provider: OSSProviderType
  accessKeyId: string
  accessKeySecret: string
  region: string
  bucket: string
  endpoint?: string
  customDomain?: string
  pathPrefix?: string
}

/**
 * OSS 配置更新请求
 */
export interface UpdateOSSConfigRequest {
  id: string
  name?: string
  accessKeyId?: string
  accessKeySecret?: string
  region?: string
  bucket?: string
  endpoint?: string
  customDomain?: string
  pathPrefix?: string
  isEnabled?: boolean
  isDefault?: boolean
}

/**
 * OSS 上传请求
 */
export interface OSSUploadRequest {
  configId?: string             // 指定使用的配置 ID，不指定则使用默认配置
  localPath: string             // 本地文件路径
  customPath?: string           // 自定义云存储路径（可选）
  fileName?: string             // 自定义文件名（可选）
}

/**
 * OSS 上传结果
 */
export interface OSSUploadResult {
  success: boolean
  url?: string                  // 上传后的公网 URL
  path?: string                 // 云存储路径
  error?: string
}

/**
 * OSS 测试连接结果
 */
export interface OSSTestResult {
  success: boolean
  message: string
}

/**
 * OSS 配置数据库记录
 */
export interface OSSConfigRecord {
  id: string
  name: string
  provider: string
  access_key_id: string
  access_key_secret: string     // 加密存储
  region: string
  bucket: string
  endpoint: string | null
  custom_domain: string | null
  path_prefix: string | null
  is_enabled: number
  is_default: number
  created_at: number
  updated_at: number
}