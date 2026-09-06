/**
 * 视频类型预设（V2：短视频脚本生成视频 用）
 * @module core/platform/workflow/video-presets
 * @description 「根据视频类型与脚本内容生成素材」的类型预设数据源：
 *              每类预设给出 定位/叙事结构/画面基调/运镜/音乐氛围/字幕规范/文案口吻，
 *              由 video-preset 节点装配成下游 LLM 可消费的规范文本（大纲/素材提示词共用）。
 *              自由风格文字（videoStyle）作为叠加项由装配层并入 styleText，不单独设常量。
 */

export interface VideoPresetSpec {
  id: string
  label: string
  /** 一句话定位（大纲阶段“选题定位”参考） */
  positioning: string
  /** 叙事结构建议（段落/节奏，供大纲阶段约束） */
  structure: string
  /** 画面基调：色调/质感/构图取向/写实度（文生图/图生视频画面风格） */
  visualStyle: string
  /** 运镜语言偏好 */
  camera: string
  /** 音乐/音效氛围 */
  music: string
  /** 字幕规范（烧录字幕风格约束） */
  subtitle: string
  /** 文案口吻（拆解口播/大纲文案约束） */
  tone: string
}

export const VIDEO_TYPE_PRESETS: VideoPresetSpec[] = [
  {
    id: 'financial-deep',
    label: '财经深度',
    positioning: '吃瓜向 × 严肃财经深度分析：高信息密度、客观中立、带来源口径（官方通报/当事人自述/媒体报道/年报数据）。',
    structure: '钩子开场(冲突数据) → 事件时间线 → 各方反应与反转 → 疑点追问(口径对比) → 深度归因(数据/制度) → 金句收束 → 关注引导；节奏紧凑、要点卡分节。',
    visualStyle: '严肃财经纪实风：深蓝与鎏金主色调，演播室/交易所/工厂产线/发布会/城市航拍等真实场景质感，写实干净、信息层次分明；画面禁止出现任何文字（文字一律进字幕层）。',
    camera: '固定机位为主，缓慢推近/横移/俯拍下降，庄重克制，避免花哨运镜与卡通感。',
    music: '低频财经资讯垫乐 + 数据/新闻提示音；悬念处鼓点收紧、收尾弦乐收束。',
    subtitle: '要点卡式短句分条；口径来源用「官方通报/当事人自述/媒体报道」角标文字仅进字幕层。',
    tone: '理性、克制、可信：事实与观点分离，疑问句带出处，不煽情不站队。',
  },
  {
    id: 'news-talk',
    label: '资讯口播',
    positioning: '热点资讯快速解读：时效优先、人话翻译专业信息、口语化但不失准确。',
    structure: '热点事件开场 → 三问推进(是什么/为什么/怎么看) → 关联背景速览 → 行动或关注引导；每段 15~30 秒。',
    visualStyle: '资讯演播/纪实风：明亮清晰、现场画面与演播室结合，真实场景质感，构图干净、无卡通；画面禁止文字。',
    camera: '正面口播或现场跟随，轻微推近/平移增强动感，稳定为主。',
    music: '新闻快讯垫乐 + 提示音；关键信息加重音。',
    subtitle: '信息条短句，一句一屏，重点词加粗（字幕层呈现）。',
    tone: '快而不躁，清楚交代时间/主体/来源；多用短句与人话比喻。',
  },
  {
    id: 'knowledge',
    label: '知识科普',
    positioning: '把一个概念/现象讲透：由浅入深、类比先行、图文并茂，结论可验证。',
    structure: '生活化疑问开场 → 原理拆解(类比/示意) → 数据或案例佐证 → 误区澄清 → 总结金句；节奏从容。',
    visualStyle: '明快科普风：干净明亮、可含示意图感的实景（实验室/车间/自然场景），色彩清晰、层次分明；画面禁止文字。',
    camera: '中近景讲解 + 特写演示，缓慢推近引导注意力，转场平稳。',
    music: '轻快科普垫乐，段落切换有辨识音效。',
    subtitle: '术语首次出现配短解释，一句话一屏。',
    tone: '亲切专业：先抛问题再解答，用生活类比降低门槛，不堆术语。',
  },
  {
    id: 'ecommerce',
    label: '电商种草',
    positioning: '卖点可视化种草：产品利益点前置、使用场景共情、促单引导自然。',
    structure: '痛点场景/钩子 → 产品登场与核心卖点(3 个以内) → 场景化演示 → 真实感背书 → 促单收尾；节奏明快。',
    visualStyle: '高质感商业摄影风：干净背景突出主体、柔和主光+轮廓光、产品质感锐利、色彩鲜活；画面禁止文字（卖点进字幕/贴片由字幕层承担）。',
    camera: '产品环绕/微距特写 + 使用场景中景，运动流畅利落。',
    music: '轻快流行/生活方式感 BGM，鼓点卡点。',
    subtitle: '卖点短语逐条弹入字幕层，价格/优惠仅文字信息走字幕。',
    tone: '真诚种草、口语化场景共情，避免夸张承诺；数据给来源。',
  },
  {
    id: 'brand',
    label: '品牌宣传',
    positioning: '企业/品牌形象片：使命愿景可视化，克制高级、情绪共鸣为主。',
    structure: '价值观金句开场 → 三个侧面(技术/人文/责任) 叙事 → 品牌主张收束；镜头少而精。',
    visualStyle: '品牌大片质感：电影级布光、品牌色贯穿、大场景与细节特写交替，写实克制；画面禁止文字/LOGO（LOGO 仅片尾字幕层可提）。',
    camera: '大景深航拍/环境交代 + 人物特写，镜头语言讲究、节奏舒缓。',
    music: '弦乐/氛围乐铺底，情绪递进，留白收尾。',
    subtitle: '少而点睛，一句主张 + 必要背景句。',
    tone: '克制有温度：讲人与价值，少喊口号，用事实与画面说话。',
  },
  {
    id: 'travel',
    label: '旅行记录',
    positioning: '目的地/行程 Vlog：第一视角沉浸感、攻略信息与人情味并存。',
    structure: '最有冲击力的画面开场 → 行程动线(早→晚/点→点) → 当地体验细节 → 攻略贴士 → 氛围收尾；随性但有序。',
    visualStyle: '自然纪实旅拍风：真实光影、街景人文与自然风光交替，色彩还原自然、略带胶片感；画面禁止文字。',
    camera: '手持跟拍+稳定器推进，第一视角代入，剪辑点跟节奏。',
    music: '轻快旅行/氛围 BGM，环境音保留增强代入。',
    subtitle: '地名/攻略要点短句，语气轻松。',
    tone: '朋友式分享：真实感受 + 实用信息，不硬广。',
  },
]

/** 按 id 取预设（未知 id 返回 undefined） */
export function getVideoPreset(id: string): VideoPresetSpec | undefined {
  return VIDEO_TYPE_PRESETS.find(p => p.id === id)
}

export const VIDEO_TYPE_IDS: string[] = VIDEO_TYPE_PRESETS.map(p => p.id)

/**
 * 装配预设提示词块：单段 markdown（含定位/结构/画面/运镜/音乐/字幕/口吻），
 * 可直接注入大纲与素材生成的 systemPrompt；自定义自由风格并入画面基调行。
 */
export function assembleVideoPresetPrompt(id: string, freeStyle = ''): string {
  const p = getVideoPreset(id)
  if (!p) {
    return freeStyle.trim()
      ? `自定义视频风格（无内置预设）：${freeStyle.trim()}`
      : ''
  }
  const lines = [
    `【视频类型】${p.label}：${p.positioning}`,
    `【叙事结构】${p.structure}`,
    `【画面基调】${p.visualStyle}${freeStyle.trim() ? `\n【用户自定义风格叠加】${freeStyle.trim()}` : ''}`,
    `【运镜】${p.camera}`,
    `【音乐氛围】${p.music}`,
    `【字幕规范】${p.subtitle}`,
    `【文案口吻】${p.tone}`,
  ]
  return lines.join('\n')
}
