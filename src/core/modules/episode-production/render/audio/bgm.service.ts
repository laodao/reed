/**
 * BGM（背景音乐）service stub（P5-T16 · spec §4.7 隐含）
 * @module modules/episode-production/render/audio/bgm.service
 *
 * spec 未细化 BGM 选取规则；本 service 提供 stub 接口让 audio-mix
 * 在用户启用 backgroundMusicEnabled 时能拿到 BGM 路径（即使 null
 * 也不报错）。
 *
 * 未来扩展（P5/P6 后续 follow-up）：
 *   - BGM 库管理（用户上传 / 预设）
 *   - 按场景 mood 自动匹配（happy/sad/intense → 预设 BGM）
 *   - 多场景间 BGM 转场（淡入淡出）
 */

export interface BgmPickInput {
  /** 场景情绪（spec §4.1 SceneScript.mood） */
  mood?: string | null
  /** 项目级用户偏好（暂不消费） */
  preferences?: Record<string, unknown>
}

export interface BgmPickResult {
  /** 选中的 BGM 文件路径（null 表示无可用 BGM） */
  bgmPath: string | null
  /** 选中原因 / 模式（"preset_by_mood" / "user_upload" / "none"） */
  source: 'preset_by_mood' | 'user_upload' | 'none'
}

/**
 * BGM 选取 service（当前 stub 实现：始终返回 none）。
 *
 * 真实现要求：
 *   1. 维护 BGM 预设库（路径 + 标签 mood/genre/duration）
 *   2. 用户可上传 / 选择
 *   3. 按场景情绪自动匹配
 *
 * 当前用户启用 backgroundMusicEnabled 但本 service 返回 null →
 * audio-mix 检测路径不存在会跳过 BGM 输入（已有逻辑）。
 */
export class BgmService {
  /**
   * 按场景信息选 BGM 路径。
   *
   * @returns 当前 stub 始终 source='none' / bgmPath=null。
   *          后续真实现保留 input 接口不变。
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pickBgmForScene(_input: BgmPickInput): Promise<BgmPickResult> {
    return { bgmPath: null, source: 'none' }
  }
}
