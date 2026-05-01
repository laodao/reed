/**
 * 路径提供者接口
 * @module core/interfaces/path
 * @description 平台无关的路径获取抽象
 */

/**
 * 子目录配置
 */
export interface SubDirectories {
  database: string
  images: string
  voice: string
  translations: string
  knowledgeBase: string
  video: string
  portrait: string
  diary: string
  longwriting: string
  stv: string
}

/**
 * 资源 URL 类型 - 决定前端用哪种协议加载
 *
 * Electron：image → local-image:// ；video → local-video:// ；file → local-file://
 * Web：所有类型都走 HTTP /assets 路由（web-server 按 cookie userId 隔离）
 */
export type AssetScheme = 'image' | 'video' | 'file'

/**
 * 路径提供者接口
 * 用于获取应用所需的各类路径
 */
export interface IPathProvider {
  /**
   * 获取用户数据目录
   */
  getUserDataPath(): string

  /**
   * 获取应用数据目录
   */
  getAppDataPath(): string

  /**
   * 获取临时目录
   */
  getTempPath(): string

  /**
   * 获取数据存储路径（可能自定义）
   */
  getDataPath(): string

  /**
   * 设置数据存储路径
   * @param path - 新的数据路径
   */
  setDataPath?(path: string): void

  /**
   * 获取子目录路径配置
   */
  getSubDirectories(): SubDirectories

  /**
   * 获取特定子目录的完整路径
   * @param name - 子目录名称
   */
  getSubDirectoryPath(name: keyof SubDirectories): string

  /**
   * 把数据库存储的相对路径（或兼容的绝对路径）转为前端可加载的 URL。
   * 不同运行环境返回不同协议（详见 AssetScheme 注释）。
   *
   * 输入若已是 URL（含 'http://' / 'local-image://' 等），原样返回。
   *
   * @param relOrAbsPath - 相对 dataPath 的路径（推荐），或兼容的绝对路径
   * @param scheme - 资源类型；Electron 端决定 protocol；Web 端忽略（统一 /assets）
   */
  toAssetUrl(relOrAbsPath: string, scheme?: AssetScheme): string
}

/**
 * 全局 PathProvider 访问器：core 服务通过此访问器获取实例。
 * 各运行环境（electron/web/node）需在初始化时调用 registerPathProvider 注册具体实现。
 */
export type PathProviderAccessor = () => IPathProvider

let _pathProviderAccessor: PathProviderAccessor | null = null

export function registerPathProvider(accessor: PathProviderAccessor): void {
  _pathProviderAccessor = accessor
}

export function getPathProvider(): IPathProvider {
  if (!_pathProviderAccessor) {
    throw new Error(
      '[IPathProvider] 未注册访问器：请在运行环境初始化时调用 registerPathProvider()',
    )
  }
  return _pathProviderAccessor()
}