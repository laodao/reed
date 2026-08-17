/**
 * 应用菜单单一数据源
 * @module config/menu
 *
 * MainLayout 侧边栏和 Home 首页功能入口共用这份菜单定义，
 * 保证两处入口永远一致（历史上两处各自复制一份，频繁漂移）。
 *
 * 字段说明：
 * - hidden：整项（含子项）不显示（功能开发中暂不暴露入口；路由仍可访问）
 * - hideSelf：仅父项自身不显示，子项照常列出（纯分组父项）
 * - description：首页功能卡片的一句描述（侧边栏不用）
 */

import { markRaw } from 'vue'
import { Connection,
  HomeFilled,
  ChatDotRound,
  Picture,
  Document,
  Microphone,
  Headset,
  MagicStick,
  Setting,
  FolderOpened,
  User,
  EditPen,
  Notebook,
  VideoCamera,
  Promotion,
} from '@element-plus/icons-vue'

export interface MenuItem {
  path: string
  label: string
  icon: any
  /** 首页功能卡片描述 */
  description?: string
  children?: MenuItem[]
  /** 整项隐藏（含子项），路由仍可访问 */
  hidden?: boolean
  /** 仅隐藏自身，子项照常显示（纯分组父项） */
  hideSelf?: boolean
}

/** 主菜单（侧边栏 + 首页共用） */
export const mainMenuItems: MenuItem[] = [
  {
    path: '/',
    label: '首页',
    icon: markRaw(HomeFilled)
  },
  {
    path: '/chat',
    label: 'AI 对话',
    description: '与 AI 进行智能对话，支持多种大模型',
    icon: markRaw(ChatDotRound)
  },
  {
    path: '/image',
    label: '图像生成',
    description: '使用 AI 生成创意图像',
    icon: markRaw(Picture)
  },
  {
    path: '/portrait',
    label: '人像设计',
    description: 'AI 角色人像设计与生成',
    icon: markRaw(User)
  },
  {
    path: '/longwriting',
    label: '长文写作',
    description: 'AI 辅助长篇小说创作',
    icon: markRaw(EditPen),
    hidden: true // 功能开发中，暂不显示入口
  },
  {
    path: '/episode-production',
    label: '剧集制作',
    description: '剧本生成与视频制作',
    icon: markRaw(VideoCamera),
    hidden: true // 功能开发中，暂不显示入口
  },
  {
    path: '/translate',
    label: '文档翻译',
    description: '智能翻译多种语言文档',
    icon: markRaw(Document)
  },
  {
    path: '/voice',
    label: '语音助手',
    description: '语音识别与语音合成',
    icon: markRaw(Microphone),
    hideSelf: true, // 纯分组父项：不显示自身，只列出子项
    children: [
      {
        path: '/voice/tts',
        label: '文本转语音',
        description: '将文本合成为自然语音',
        icon: markRaw(Promotion),
      },
      {
        path: '/voice/stt',
        label: '语音转文本',
        description: '识别语音并转写为文字',
        icon: markRaw(Headset),
      },
      {
        path: '/voice/clone',
        label: '声音复刻',
        description: '克隆定制专属音色',
        icon: markRaw(MagicStick),
      },
    ],
  },
  {
    path: '/knowledge-base',
    label: '知识库',
    description: '个人知识管理与检索',
    icon: markRaw(FolderOpened)
  },
  {
    path: '/workflow',
    label: '工作流',
    description: '可视化流程编排与自动化执行',
    icon: markRaw(Connection),
  },
  {
    path: '/diary',
    label: '日记',
    description: '智能日记记录与管理',
    icon: markRaw(Notebook)
  }
]

/** 底部菜单（仅侧边栏使用） */
export const footerMenuItems: MenuItem[] = [
  {
    path: '/settings',
    label: '设置',
    icon: markRaw(Setting)
  }
]

/**
 * 展开菜单为平铺列表（侧边栏纯图标模式 / 首页功能卡片共用）：
 * - hidden：整项（含子项）过滤
 * - hideSelf：父项自身过滤，子项保留
 */
export function flattenMenuItems(items: MenuItem[]): MenuItem[] {
  const flat: MenuItem[] = []
  for (const item of items) {
    if (item.hidden) continue
    if (!item.hideSelf) {
      flat.push(item)
    }
    if (item.children) {
      flat.push(...item.children.filter(c => !c.hidden))
    }
  }
  return flat
}
