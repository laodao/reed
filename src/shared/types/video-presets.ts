/**
 * 视频类型预设（V2/V3：短视频脚本生成视频 用）
 * @module core/platform/workflow/video-presets
 * @description 「根据视频类型与脚本内容生成素材」的类型预设数据源：
 *              V2 部分：每类预设给出 定位/叙事结构/画面基调/运镜/音乐氛围/字幕规范/文案口吻，
 *                       由 video-preset 节点装配成下游 LLM 可消费的规范文本。
 *              V3 部分（通用视觉策略）：每类预设携带 visualPolicy——默认画面策略
 *                       （imagery 意象化空镜 / asset 素材驱动）、素材依赖级别、意象表
 *                       （imageryMap：抽象主题 → 代表性意象）、素材使用规则（assetUse）。
 *              自由风格文字（videoStyle）作为叠加项由装配层并入 styleText。
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
  /** V3 通用视觉策略：该类型的默认画面策略与规则 */
  visualPolicy: VisualPolicy
}

// ───────────────────────── V3 通用视觉策略类型 ─────────────────────────

/** 画面策略模式：imagery=意象化空镜/B-roll（生成语义相关画面）；asset=素材驱动（用户素材即画面主体） */
export type VisualStrategyMode = 'imagery' | 'asset'
/** start 选择：auto=按类型预设解析；其余=强制 */
export type VisualStrategyChoice = 'auto' | VisualStrategyMode

/** 意象规则一条：当 narration/concept 命中 match 词簇 → 用 imagery 作为可执行画面意象（可拍物理场景、无文字） */
export interface ImageryRule {
  /** 主题簇名（便于审核与后续扩展） */
  conceptClass: string
  /** 触发词（中文词根；拆镜 LLM 按 concept 匹配） */
  match: string[]
  /** 代表性意象：可执行文生图描述（真实可拍、无任何文字/UI/图表字面） */
  imagery: string
}

/** 素材使用规则（asset 模式） */
export interface AssetUseRules {
  /** 视频首帧=素材图（默认 true：主体真实唯一来源） */
  requireFirstFrame?: boolean
  /** 是否允许少量氛围空镜补位（品牌片允许；产品介绍默认 false） */
  allowGeneratedScene?: boolean
  /** 负向提示（防加字/改主体/畸形） */
  negative?: string[]
}

export interface VisualPolicy {
  /** 该类型默认画面策略（auto 时生效） */
  mode: VisualStrategyMode
  /** 素材依赖：required=缺素材必须拦截；optional=有则素材模式、无则意象兜底；none=与素材无关 */
  assetDependency: 'none' | 'optional' | 'required'
  /** 意象表：抽象主题 → 代表性意象（imagery 模式拆镜/提示词用；asset 模式作为手动切换的兜底） */
  imageryMap: ImageryRule[]
  /** 素材使用规则（asset 模式） */
  assetUse?: AssetUseRules
}

/** 意象表纪律：意象描述不得“要求画面出现文字内容”（允许「无文字」这类负向短语本身） */
export const IMAGERY_NO_TEXT_MARKERS = ['字幕', '字体', '字样', '标题字', '海报字', '贴纸字', '水印字', '文字标题', '文字贴片'] as const

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
    visualPolicy: {
      mode: 'imagery',
      assetDependency: 'none',
      imageryMap: [
        { conceptClass: '股市行情', match: ['股价', '股市', '腰斩', '市值', '下跌', '上涨', '行情', '涨跌', '抛售', '蒸发', '震荡'], imagery: '金融交易大厅上空俯瞰，巨大曲面屏墙泛着红绿曲线光带与流动光晕，人影攒动而没有任何可读文字，深蓝鎏金主调' },
        { conceptClass: '货币汇率', match: ['汇率', '货币', '美元', '外汇', '人民币', '升值', '贬值', '通胀', '加息', '降息'], imagery: '银行外汇与贵金属柜台氛围，多国货币纸钞与金条的光影特写、点钞机反光，构图干净、无文字' },
        { conceptClass: '企业工厂', match: ['企业', '公司', '工厂', '产线', '制造业', '订单', '供应链', '员工', '裁员', '解约', '招聘'], imagery: '现代化工厂车间广角，自动化产线与机械臂运转，工装人员巡检，冷峻金属与暖色灯光并存、无文字' },
        { conceptClass: '车企客户', match: ['客户', '奔驰', '大众', '供应商', '车企', '整车', '合作方'], imagery: '汽车总装车间新车下线流水线，车灯光束扫过漆面与地面光影，氛围感强而画面干净、主体为车辆与光影' },
        { conceptClass: '监管合规', match: ['监管', '通报', '处罚', '整改', '投诉', '劳动监察', '合规', '审查', '调查', '责令'], imagery: '庄重政务建筑外立面与长会议桌特写，文件纸张翻动与红章光影氛围，画面无文字' },
        { conceptClass: '发布会道歉', match: ['发布会', '道歉', '鞠躬', '致歉', '声明', '回应', '业绩会', '公开'], imagery: '发布会现场讲台与话筒群剪影，聚光灯下记者镜头虚化前景，庄重而无文字' },
        { conceptClass: '校招应届生', match: ['应届生', '校招', '毕业', '求职', '入职', '辞职', 'offer', '简历'], imagery: '大学校园与礼堂招聘氛围，年轻学生群像与手执纸张的青春光线，纸上无任何文字' },
        { conceptClass: '舆论网络', match: ['舆论', '网友', '热搜', '评论', '发酵', '曝光', '话题'], imagery: '城市夜景中人群俯拍，手机屏幕光斑如星河流动，抽象氛围、无文字' },
        { conceptClass: '资本上市', match: ['IPO', '上市', '港交所', '港股', '发行', '募资', '资本'], imagery: '金融区天际线航拍，证券交易所大楼夜景，深蓝夜色与金色窗光，无文字' },
        { conceptClass: '财报数字', match: ['年报', '财报', '营收', '利润', '负债', '成本', '工资', '补贴', '赔偿'], imagery: '财务办公场景，报表纸张翻页与计算器按键的光影特写，抽象数字感、无文字' },
        { conceptClass: '压力与收缩', match: ['停职', '清退', '风险', '危机', '失信', '暴跌'], imagery: '阴云下的都市玻璃幕墙，人物剪影独自穿行，冷色低气压氛围' },
        { conceptClass: '家庭期待', match: ['家庭', '期待', '未来', '人生', '选择', '年轻人'], imagery: '黄昏光线下年轻人剪影望向窗外的暖调侧写，安静而有温度、无文字' },
      ],
    },
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
    visualPolicy: {
      mode: 'imagery',
      assetDependency: 'none',
      imageryMap: [
        { conceptClass: '现场突发', match: ['突发', '现场', '事故', '发生', '目击', '冲突'], imagery: '新闻现场外围的纪实画面，摄像机群与警戒光斑、人群剪影，快速现场感、无文字' },
        { conceptClass: '演播口播', match: ['记者', '报道', '消息', '据悉', '主持人'], imagery: '明亮新闻演播室，主播台与背景大屏光带，镜头中景、无文字' },
        { conceptClass: '官方发布', match: ['官方', '声明', '回应', '发布', '辟谣'], imagery: '发布会讲台与文件纸面光影，正式庄重、无文字' },
        { conceptClass: '城市民生', match: ['市民', '生活', '社区', '街头', '民生'], imagery: '清晨城市街头纪实，通勤人流与街市光影，生活气息、无文字' },
        { conceptClass: '交通物流', match: ['交通', '物流', '铁路', '机场', '港口', '出行'], imagery: '繁忙交通枢纽的纪实长曝光，车流光轨与站台人流，无文字' },
        { conceptClass: '应急医护', match: ['救援', '医疗', '健康', '疫苗', '急诊'], imagery: '医院走廊与急救灯光的纪实氛围，人影匆匆、无文字' },
        { conceptClass: '科技网络', match: ['科技', '互联网', '手机', 'AI', '人工智能', '芯片'], imagery: '数据中心机房与服务器灯带、电子元件特写，冷蓝科技氛围、无文字' },
        { conceptClass: '天气环境', match: ['天气', '台风', '暴雨', '高温', '环境', '污染'], imagery: '大范围天气纪实：云层翻涌/暴雨街景/城市上空的明暗对比，无文字' },
      ],
    },
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
    visualPolicy: {
      mode: 'imagery',
      assetDependency: 'none',
      imageryMap: [
        { conceptClass: '原理演示', match: ['原理', '机制', '过程', '反应', '运行'], imagery: '整洁实验室台面与玻璃器皿的透光特写，操作手部近景，明快无文字' },
        { conceptClass: '类比实物', match: ['类比', '就像', '好比', '相当于'], imagery: '与概念呼应的日常实物特写（水流/磁铁吸附/齿轮传动/温度计），近景光影、无文字' },
        { conceptClass: '自然现象', match: ['自然', '物理', '能量', '光', '电', '力', '星'], imagery: '自然现象实拍氛围：闪电/海浪/晨雾/星空延时的大场景，无文字' },
        { conceptClass: '学习场景', match: ['知识', '学习', '记忆', '阅读', '大脑'], imagery: '图书馆书架间的人影与书页光影、教室窗前专注侧写，安静氛围、无文字' },
        { conceptClass: '历史人文', match: ['历史', '古代', '文明', '发明', '由来'], imagery: '博物馆展陈与文物光影、古建细节特写，历史厚重感、无文字' },
        { conceptClass: '身体健康', match: ['身体', '健康', '细胞', '器官', '代谢'], imagery: '运动与健康生活实景：跑步剪影/新鲜食材特写，明快氛围、无文字' },
        { conceptClass: '宇宙太空', match: ['宇宙', '太空', '星球', '天文', '引力'], imagery: '天文馆穹顶光影或星空深空氛围延时，无文字' },
        { conceptClass: '微观世界', match: ['微观', '细胞', '分子', '细菌', '观察'], imagery: '显微镜观察手部与载玻片光影、抽象微观颗粒氛围，无文字' },
        { conceptClass: '社会心理', match: ['心理', '行为', '选择', '决策', '情绪'], imagery: '人群中一人独行的街拍、人群与个体对比的构图，无文字' },
        { conceptClass: '环境生态', match: ['环境', '生态', '气候', '碳', '回收'], imagery: '森林/河流/城市绿地与循环再利用场景实拍，通透自然光、无文字' },
      ],
    },
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
    visualPolicy: {
      mode: 'asset',
      assetDependency: 'required',
      assetUse: {
        requireFirstFrame: true,
        allowGeneratedScene: false,
        negative: [
          '不要在画面中出现任何文字、价格标签或贴纸字样',
          '不要改变产品的外观、颜色与结构',
          '不要出现多余手指或畸形的肢体结构',
        ],
      },
      // 用户手动切到 imagery 时的兜底意象（默认不会走到）
      imageryMap: [
        { conceptClass: '使用场景', match: ['使用', '场景', '居家', '厨房', '通勤'], imagery: '产品所在生活场景的实拍氛围（桌面/厨房/车内），干净布光、无文字' },
        { conceptClass: '材质细节', match: ['材质', '质感', '做工', '细节'], imagery: '产品材质光影特写（不还原具体商品外观时用材质氛围），微距光斑、无文字' },
        { conceptClass: '人群体验', match: ['体验', '感受', '用户', '口碑'], imagery: '人物使用产品时的愉悦近景，柔光、生活化、无文字' },
        { conceptClass: '生活方式', match: ['生活', '精致', '仪式', '氛围'], imagery: '生活方式场景氛围（晨光桌面/黄昏窗台），色调统一、无文字' },
        { conceptClass: '开箱仪式', match: ['开箱', '礼盒', '包装', '拆开'], imagery: '包装开箱的手部近景氛围，纸盒与光线特写、无文字' },
      ],
    },
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
    visualPolicy: {
      mode: 'asset',
      assetDependency: 'required',
      assetUse: {
        requireFirstFrame: true,
        allowGeneratedScene: true, // 品牌片允许少量氛围大场景空镜补位
        negative: [
          '不要在画面中出现任何文字与商标字样',
          '不要改变素材主体形象的辨识度',
        ],
      },
      imageryMap: [
        { conceptClass: '人物群像', match: ['人', '员工', '团队', '奋斗', '工匠'], imagery: '真实人物群像的纪实特写：车间/工地/办公室里的专注面孔与手部，电影级布光、无文字' },
        { conceptClass: '工艺细节', match: ['工艺', '技术', '研发', '创新', '制造'], imagery: '精密工艺与研发场景的微距氛围（零件/仪器/图纸光影，无文字），高级质感' },
        { conceptClass: '责任温度', match: ['责任', '公益', '温度', '社区', '关怀'], imagery: '人文场景氛围：校园/乡村/社区中的善意瞬间剪影，暖光、无文字' },
        { conceptClass: '自然大景', match: ['自然', '生态', '山', '海', '大地'], imagery: '自然大场景航拍氛围（山海/晨昏），留白构图、无文字' },
        { conceptClass: '城市天际', match: ['城市', '地标', '未来', '建筑'], imagery: '城市天际线与地标建筑的航拍夜色，品牌色氛围光、无文字' },
        { conceptClass: '时间沉淀', match: ['传承', '历史', '沉淀', '时间'], imagery: '旧厂房/老物件与光线尘埃的质感特写，时间厚重感、无文字' },
      ],
    },
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
    visualPolicy: {
      mode: 'imagery',
      assetDependency: 'none',
      imageryMap: [
        { conceptClass: '自然风光', match: ['风景', '山', '海', '湖', '草原', '日出', '日落'], imagery: '目的地自然风光的实拍大场景（山海晨昏/云海），真实光影、无文字' },
        { conceptClass: '街巷人文', match: ['街', '巷', '老城', '人文', '集市'], imagery: '老城街巷与市集人文纪实，当地生活气息、色彩自然、无文字' },
        { conceptClass: '地标建筑', match: ['地标', '打卡', '景点', '塔', '桥'], imagery: '目的地地标建筑的经典机位实拍，天色与人群氛围、无文字' },
        { conceptClass: '美食体验', match: ['美食', '吃', '餐厅', '小吃', '咖啡'], imagery: '当地美食与餐桌烟火气的近景特写，蒸汽与暖光、无文字' },
        { conceptClass: '旅途交通', match: ['火车', '飞机', '自驾', '路上', '出发'], imagery: '旅途中的交通工具与窗外流动风景，第一视角氛围、无文字' },
        { conceptClass: '夜与城市', match: ['夜景', '城市', '霓虹', '夜晚'], imagery: '目的地夜景的实拍氛围：灯光长曝光与街道人群，无文字' },
        { conceptClass: '住宿空间', match: ['酒店', '民宿', '住', '房间'], imagery: '特色住宿空间的清晨光线氛围，窗景与织物细节、无文字' },
        { conceptClass: '当地活动', match: ['活动', '节庆', '演出', '体验'], imagery: '当地节庆/活动的实拍人群氛围，动感光影、无文字' },
        { conceptClass: '海边时刻', match: ['海边', '沙滩', '浪', '岛'], imagery: '海岸线与海浪的实拍氛围（沙滩足迹/浪花/船），通透自然光、无文字' },
        { conceptClass: '人文面孔', match: ['当地', '人情', '居民', '故事'], imagery: '当地居民与旅人的真实肖像氛围，自然光抓拍、无文字' },
      ],
    },
  },
]

/** 通用意象兜底（无内置预设/自定义类型切 imagery 时使用；也是各类型意象表的补充） */
export const VIDEO_IMAGERY_FALLBACK: ImageryRule[] = [
  { conceptClass: '机构大楼', match: ['机构', '总部', '银行', '交易所', '机关', '办公楼'], imagery: '城市核心区机构大楼与玻璃幕墙的庄重实拍，天光云影、无文字' },
  { conceptClass: '生产制造', match: ['制造', '生产', '产线', '装配', '车间'], imagery: '车间产线与机械运转的实拍广角，金属与灯光氛围、无文字' },
  { conceptClass: '人群与观点', match: ['人群', '大众', '观点', '受访', '评论'], imagery: '街头人群与个体访谈氛围的纪实抓拍，自然光、无文字' },
  { conceptClass: '抽象概念', match: ['增长', '下降', '风险', '趋势', '变化', '影响'], imagery: '抽象氛围意象：曲线光带、流动光影、明暗对比的大景别，无文字' },
  { conceptClass: '时间与节奏', match: ['开始', '结束', '阶段', '历史', '未来'], imagery: '时钟/日历光影或昼夜更替的氛围意象，无文字' },
  { conceptClass: '会议与协作', match: ['会议', '讨论', '协作', '团队', '谈判'], imagery: '会议室与多人协作的实拍氛围，玻璃隔间光影、无文字' },
]

/**
 * 自定义类型（无内置预设）的兜底视觉策略：默认意象化空镜；用户提供素材时（optional）
 * 由 strategy 节点优先走素材驱动。
 */
export const CUSTOM_FALLBACK_POLICY: VisualPolicy = {
  mode: 'imagery',
  assetDependency: 'optional',
  imageryMap: VIDEO_IMAGERY_FALLBACK,
}

/** 按 id 取预设（未知 id 返回 undefined） */
export function getVideoPreset(id: string): VideoPresetSpec | undefined {
  return VIDEO_TYPE_PRESETS.find(p => p.id === id)
}

export const VIDEO_TYPE_IDS: string[] = VIDEO_TYPE_PRESETS.map(p => p.id)

/** 画面策略选项（start 输入 select 用；V3 def JSON 引用） */
export const VISUAL_STRATEGY_OPTIONS: Array<{ label: string; value: VisualStrategyChoice }> = [
  { label: '自动（按视频类型）', value: 'auto' },
  { label: '意象化空镜（imagery）', value: 'imagery' },
  { label: '素材驱动（asset）', value: 'asset' },
]

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
