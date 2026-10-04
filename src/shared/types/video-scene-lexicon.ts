/**
 * 镜头真实场景词典（配图相关性数据资产）
 * @module types/video-scene-lexicon
 * @description V3 配图质量的核心数据：把**抽象财经/资讯主题**映射到**真实世界里拍得到的
 *              具体场景**（主体+场所+动作+光线），并给出素材库可用的英文检索词。
 *
 *              为什么需要：拆镜 LLM 只有"意象"概念时，遇到「产业指数/进出口/外贸」这类
 *              抽象词容易画成文字海报或跑题。词典把这类词硬绑到可拍场景
 *              （产业指数→工业园区厂房产线；进出口外贸→集装箱码头龙门吊装卸），
 *              并同时供三条供给路径使用：真实视频素材检索、真实图片检索、文生图兜底。
 *
 *              纪律：
 *              1. scene 只描述**可实拍物理场景**，不含任何画面文字/图表/UI/水印；
 *              2. searchQuery 为素材库英文检索词（2~4 词），必须指向真实存在的事物；
 *              3. 词典是数据资产：新增主题只加条目，不改代码与工作流。
 */

/** 一条场景规则 */
export interface ShotSceneRule {
  /** 主题簇名（审核与维护可读） */
  conceptClass: string
  /** 触发词（中文词根，命中即采用该条目） */
  match: string[]
  /** 中文可拍场景：主体+场所+动作+光线氛围（无任何画面文字） */
  scene: string
  /** 素材库英文检索词（真实素材优先路径用） */
  searchQuery: string
  /** 备选检索词（首选无结果时依次尝试，全部英文） */
  altQueries?: string[]
}

/**
 * 全量场景词典。
 * 覆盖财经/资讯/知识/文旅类短视频的高频主题；未命中时由拆镜 LLM 自行落到真实可拍场景。
 */
export const SHOT_SCENE_LEXICON: ShotSceneRule[] = [
  {
    conceptClass: '产业指数·工业制造',
    match: ['产业指数', '工业增加值', '制造业', '产能', '景气', 'PMI', '开工率', '工业', '产量', '制造'],
    scene: '现代化厂房内部广角，自动化产线高速运转，机械臂焊接溅起火花，工装人员巡检设备，冷金属与暖色灯光并存',
    searchQuery: 'factory production line',
    altQueries: ['industrial manufacturing plant', 'assembly line workers'],
  },
  {
    conceptClass: '进出口·外贸·港口',
    match: ['进出口', '外贸', '出口', '进口', '关税', '贸易', '外贸额', '顺差', '逆差', '通关', '一带一路', '跨境电商', '港口', '口岸'],
    scene: '繁忙的集装箱码头，龙门吊吊装集装箱，货轮靠泊装卸，集装箱卡车在堆场排队穿行，海面泛着晨光',
    searchQuery: 'container port terminal',
    altQueries: ['cargo ship container crane', 'shipping port aerial'],
  },
  {
    conceptClass: '航运·船舶',
    match: ['航运', '海运', '货轮', '集运', '运价', '运力', '船运', '码头'],
    scene: '大型集装箱货轮停泊港区，船身与吊机特写，海面波纹与船体倒影，远处堆场层层叠叠',
    searchQuery: 'cargo ship harbor',
    altQueries: ['container ship sea', 'port crane vessel'],
  },
  {
    conceptClass: '物流·供应链·仓储',
    match: ['物流', '供应链', '货运', '仓储', '快递', '配送', '库存', '冷链'],
    scene: '现代物流分拣中心，传送带上包裹快速流动，叉车穿梭于高架货架之间，顶部冷白灯带纵深感强',
    searchQuery: 'warehouse logistics conveyor',
    altQueries: ['package sorting center', 'forklift warehouse shelves'],
  },
  {
    conceptClass: '铁路·班列·轨道',
    match: ['铁路', '班列', '高铁', '轨道', '中欧班列', '动车', '地铁'],
    scene: '货运列车编组站航拍，多条铁轨并行延伸，集装箱平车排队；或高铁列车高速掠过站台，气流掀起尘埃',
    searchQuery: 'freight train yard',
    altQueries: ['high speed train station', 'railway tracks aerial'],
  },
  {
    conceptClass: '航空·机场',
    match: ['航空', '机场', '航班', '客机', '民航', '航线', '空运'],
    scene: '机场跑道客机起飞爬升，航站楼玻璃幕墙反射天光，地勤车辆在停机坪穿行',
    searchQuery: 'airport runway airplane',
    altQueries: ['airplane takeoff terminal', 'airport apron ground crew'],
  },
  {
    conceptClass: '基建·地产·施工',
    match: ['基建', '房地产', '楼市', '施工', '工地', '投资', '开工', '竣工', '土地', '物业', '水泥', '建筑'],
    scene: '大型建筑工地，塔吊林立吊装钢梁，钢筋骨架与混凝土浇筑，工人在脚手架上作业，黄昏逆光剪影',
    searchQuery: 'construction site crane',
    altQueries: ['building site steel frame', 'high rise construction'],
  },
  {
    conceptClass: '能源·电力·电网',
    match: ['电力', '电网', '特高压', '发电', '电价', '用电', '火电', '水电', '核电', '煤电'],
    scene: '特高压输电铁塔与银线向远方延伸，或电厂冷却塔升起白色水汽，朝阳穿过线缆',
    searchQuery: 'power transmission tower',
    altQueries: ['power plant cooling tower', 'electricity grid pylon'],
  },
  {
    conceptClass: '新能源·光伏·风电·储能',
    match: ['光伏', '风电', '新能源', '储能', '锂电', '碳中和', '绿电', '氢能', '电池'],
    scene: '荒漠光伏板阵列航拍，深蓝面板反射天空；或海上风电场巨大风机叶片缓慢旋转',
    searchQuery: 'solar panel farm aerial',
    altQueries: ['wind turbine farm sea', 'battery energy storage'],
  },
  {
    conceptClass: '半导体·芯片',
    match: ['芯片', '半导体', '晶圆', '集成电路', '光刻', '封测', '制程'],
    scene: '半导体无尘车间内部，晶圆在机械臂间传送，蓝色洁净光与黄色光刻区交替，工作人员穿白色无尘服',
    searchQuery: 'semiconductor wafer fab',
    altQueries: ['cleanroom chip manufacturing', 'microchip circuit closeup'],
  },
  {
    conceptClass: '科技·算力·AI',
    match: ['算力', '数据中心', '人工智能', 'AI', '云计算', '大模型', '服务器', '算法'],
    scene: '数据中心机房长走廊，服务器列阵指示灯明灭闪烁，冷蓝光线与电缆束纵深感',
    searchQuery: 'data center server room',
    altQueries: ['server rack blue light', 'cloud computing hardware'],
  },
  {
    conceptClass: '汽车·新能源车',
    match: ['汽车', '新能源车', '整车', '车企', '产销', '车市', '零部件', '充电桩', '智能驾驶'],
    scene: '汽车总装车间新车下线流水线，车灯亮起扫过漆面，机械臂安装部件，地面反光干净',
    searchQuery: 'car assembly line',
    altQueries: ['electric vehicle charging', 'automobile factory robot'],
  },
  {
    conceptClass: '消费·零售·商场',
    match: ['消费', '零售', '商场', '客流', '双十一', '促销', '门店', '百货', '社零'],
    scene: '商场中庭人流穿梭，扶梯上下交错，橱窗灯光通明，购物袋与人群形成流动感',
    searchQuery: 'shopping mall crowd',
    altQueries: ['retail store shelves', 'supermarket shoppers'],
  },
  {
    conceptClass: '电商·直播·带货',
    match: ['电商', '直播', '带货', '平台', '网店', '达人', '种草'],
    scene: '直播间补光灯与柔光箱环绕，主播背影对着摄像头，桌面陈列商品与包装盒堆叠',
    searchQuery: 'live streaming studio',
    altQueries: ['online shopping parcels', 'ecommerce packaging boxes'],
  },
  {
    conceptClass: '农业·粮食·养殖',
    match: ['农业', '粮食', '丰收', '种植', '农产品', '猪价', '养殖', '饲料', '种子'],
    scene: '金色麦田里联合收割机作业航拍，谷粒扬起；或现代化温室大棚内作物整齐排列',
    searchQuery: 'harvest combine harvester',
    altQueries: ['greenhouse farming rows', 'wheat field aerial'],
  },
  {
    conceptClass: '金融·股市·资本市场',
    match: ['股市', '股价', 'A股', '港股', '指数', '市值', '涨停', '跌停', '成交额', '券商', '牛市', '熊市', 'IPO', '上市', '募资', '融资'],
    scene: '证券交易所交易大厅，巨幅行情屏泛起红绿光带（屏上无可读文字），交易员背影与键盘手部特写，人影攒动',
    searchQuery: 'stock exchange trading floor',
    altQueries: ['stock market screen trader', 'financial district night'],
  },
  {
    conceptClass: '债券·利率·银行间',
    match: ['债券', '利率', '国债', '收益率', '央行', '降准', '降息', '加息', '流动性'],
    scene: '银行交易室多屏环绕的办公桌，交易员敲击键盘手部特写，屏幕蓝光映在面部轮廓上',
    searchQuery: 'bond trading desk',
    altQueries: ['financial analyst monitors', 'central bank building'],
  },
  {
    conceptClass: '汇率·外汇·货币',
    match: ['汇率', '外汇', '人民币', '美元', '欧元', '升值', '贬值', '货币', '结算'],
    scene: '多国货币纸钞在桌面铺展与点钞机快速翻动，金条与硬币的光影特写，构图干净',
    searchQuery: 'currency exchange money',
    altQueries: ['banknotes counting machine', 'gold bars closeup'],
  },
  {
    conceptClass: '银行·信贷·金融业务',
    match: ['银行', '贷款', '信贷', '存款', '不良', '按揭', '网点', '支付'],
    scene: '银行营业大厅内景，柜台玻璃与排队叫号人群，ATM 区灯光通明，大理石地面反光',
    searchQuery: 'bank branch interior',
    altQueries: ['atm machine cash', 'bank teller counter'],
  },
  {
    conceptClass: '保险·理赔',
    match: ['保险', '理赔', '保费', '保单', '险企'],
    scene: '现代办公区签约场景，文件与钢笔在桌面对焦，双方握手虚化背景，暖色自然光',
    searchQuery: 'insurance office meeting',
    altQueries: ['contract signing documents', 'handshake business deal'],
  },
  {
    conceptClass: '物价·通胀·CPI',
    match: ['物价', '通胀', 'CPI', '涨价', '降价', '菜价', '肉价', '消费价格'],
    scene: '超市生鲜货架与冷柜特写，顾客挑选商品的背影，价签虚化不可读，冷白灯光通明',
    searchQuery: 'supermarket grocery aisle',
    altQueries: ['fresh market vegetables', 'grocery shopping cart'],
  },
  {
    conceptClass: '就业·招聘·裁员',
    match: ['就业', '招聘', '失业', '裁员', '应届', '求职', '岗位', '用工', '离职', '校招'],
    scene: '大型招聘会现场人潮，求职者手持资料排队，展位灯箱与人流形成纵深；或工厂门口招工队伍',
    searchQuery: 'job fair crowd',
    altQueries: ['career fair booth', 'job interview office'],
  },
  {
    conceptClass: '政策·监管·通报',
    match: ['监管', '政策', '通报', '处罚', '合规', '审查', '约谈', '责令', '整改', '案件', '调查'],
    scene: '庄重政务建筑外立面与台阶，内部长会议桌与文件翻动特写，红章与纸张光影，无任何可读文字',
    searchQuery: 'government building meeting',
    altQueries: ['official documents desk', 'courthouse exterior'],
  },
  {
    conceptClass: '会议·论坛·发布会',
    match: ['会议', '论坛', '峰会', '发布会', '大会', '演讲', '致辞', '业绩会'],
    scene: '大型会议厅内讲台与话筒群剪影，聚光灯下听众举手机拍摄，深色座椅成排',
    searchQuery: 'conference stage podium',
    altQueries: ['business summit audience', 'press conference microphones'],
  },
  {
    conceptClass: '医疗·医药·医保',
    match: ['医疗', '医院', '药品', '医保', '疫苗', '器械', '临床', '集采', '健康'],
    scene: '医院走廊延伸与手术室无影灯，医护推车穿行，蓝白洁净色调；或药房货架整齐排列',
    searchQuery: 'hospital corridor surgery',
    altQueries: ['pharmacy shelves medicine', 'medical laboratory'],
  },
  {
    conceptClass: '教育·培训·考试',
    match: ['教育', '学校', '大学', '培训', '考试', '招生', '双减', '留学'],
    scene: '大学图书馆自习区，学生伏案书写与书架纵深，窗外天光斜射桌面',
    searchQuery: 'university library students',
    altQueries: ['classroom lecture students', 'campus building aerial'],
  },
  {
    conceptClass: '环保·双碳·污染治理',
    match: ['环保', '碳排放', '双碳', '污染', '减排', '污水', '固废', '生态'],
    scene: '污水处理厂沉淀池航拍，水面漩涡与管道；或森林晨雾航拍与风机远景',
    searchQuery: 'wind turbine forest aerial',
    altQueries: ['water treatment plant', 'forest aerial morning mist'],
  },
  {
    conceptClass: '文旅·旅游·出行',
    match: ['旅游', '文旅', '景区', '酒店', '出行', '游客', '免签', '假期'],
    scene: '热门古镇或景区人流航拍，石板路与檐角连绵，游客撑伞穿行；或高铁站候车大厅人流',
    searchQuery: 'tourist scenic spot crowd',
    altQueries: ['ancient town aerial', 'hotel lobby travel'],
  },
  {
    conceptClass: '餐饮·食品',
    match: ['餐饮', '食品', '预制菜', '门店', '外卖', '连锁', '奶茶'],
    scene: '餐厅后厨出餐口，厨师颠勺火光升腾，蒸汽与铜锅特写；或门店外排队人群',
    searchQuery: 'restaurant kitchen chef',
    altQueries: ['food delivery courier', 'street food stall'],
  },
  {
    conceptClass: '城市·人口·落户',
    match: ['城市', '都市', '人口', '落户', '城镇化', '一线城市', '通勤'],
    scene: '城市天际线航拍与主干道车流延时，玻璃幕墙映出云层移动，早晚高峰车灯成线',
    searchQuery: 'city skyline aerial traffic',
    altQueries: ['downtown traffic timelapse', 'skyscraper glass facade'],
  },
  {
    conceptClass: '人口·老龄化·养老',
    match: ['老龄化', '生育', '养老', '退休', '出生率', '社保'],
    scene: '清晨公园里老人打太极与散步，长椅与树影斑驳；或温馨室内老人与家人相处',
    searchQuery: 'elderly park morning',
    altQueries: ['senior citizens walking', 'family generations home'],
  },
  {
    conceptClass: '大宗商品·矿业·原油',
    match: ['铁矿', '铜价', '大宗', '原油', '煤炭', '期货', '黄金', '油价'],
    scene: '露天矿场重型矿卡在盘旋道路上行驶，扬尘与巨型铲斗；或油田抽油机在荒原上起伏作业',
    searchQuery: 'open pit mine truck',
    altQueries: ['oil pumpjack field', 'bulk cargo mineral'],
  },
  {
    conceptClass: '化工·石化',
    match: ['化工', '石化', '炼化', '化肥', '塑料', '橡胶'],
    scene: '化工厂管道与储罐塔群夜景，蒸汽与灯光交织，管廊纵深延伸',
    searchQuery: 'chemical plant pipes night',
    altQueries: ['oil refinery towers', 'industrial pipeline network'],
  },
  {
    conceptClass: '钢铁·有色冶金',
    match: ['钢铁', '钢厂', '有色', '铝', '铜', '冶炼', '高炉'],
    scene: '钢铁厂高炉出铁，铁水飞溅橙红光芒，热浪与烟尘中工人远远站立',
    searchQuery: 'steel mill molten metal',
    altQueries: ['foundry pouring sparks', 'aluminum rolling mill'],
  },
  {
    conceptClass: '航天·军工·卫星',
    match: ['航天', '卫星', '军工', '火箭', '北斗', '发射', '国防'],
    scene: '火箭发射塔架与加注管线特写，点火瞬间尾焰与白雾翻涌，远山轮廓',
    searchQuery: 'rocket launch pad',
    altQueries: ['satellite orbit earth', 'aerospace assembly hangar'],
  },
  {
    conceptClass: '通信·5G·运营商',
    match: ['通信', '5G', '6G', '基站', '运营商', '宽带', '光纤'],
    scene: '通信铁塔矗立在山脊与城市楼顶，天线阵列特写，黄昏天光下的城市剪影',
    searchQuery: 'telecom tower city',
    altQueries: ['fiber optic cables', 'network antenna array'],
  },
  {
    conceptClass: '宏观经济数据·统计',
    match: ['GDP', '经济数据', '增速', '统计局', '宏观', '经济形势', '增速放缓', '复苏'],
    scene: '港口集装箱堆场与城市天际线同框航拍，货轮、卡车与高楼构成宏观产业矩阵',
    searchQuery: 'city aerial timelapse',
    altQueries: ['container yard aerial', 'industrial city skyline'],
  },
  {
    conceptClass: '舆情·热搜·网络',
    match: ['舆情', '热搜', '网友', '评论', '发酵', '曝光', '话题', '舆论'],
    scene: '夜晚城市街头人群低头看手机，屏幕冷白光斑映亮面孔，背景霓虹虚化成光带',
    searchQuery: 'crowd using smartphones night',
    altQueries: ['people phone screen glow', 'city night crowd'],
  },
  {
    conceptClass: '民生·家庭·收入',
    match: ['家庭', '民生', '收入', '工资', '生活成本', '消费信心'],
    scene: '傍晚家庭餐桌暖光下的一家人用餐，窗外城市灯亮起；或超市里推着购物车的一家人',
    searchQuery: 'family dinner home',
    altQueries: ['family shopping supermarket', 'home living room evening'],
  },
  {
    conceptClass: '危机·风险·违约',
    match: ['危机', '风险', '暴雷', '违约', '破产', '暴跌', '失信', '爆雷', '退市'],
    scene: '乌云压顶的城市玻璃幕墙反射暗色天光，空置写字楼内景与散落纸张，冷调低气压氛围',
    searchQuery: 'storm clouds city skyline',
    altQueries: ['empty office interior', 'abandoned building window'],
  },
  {
    conceptClass: '竞争·市场份额·价格战',
    match: ['竞争', '市场份额', '价格战', '内卷', '份额', '对手', '护城河'],
    scene: '并列的工厂产线与仓储货架纵深对比，机械臂节奏一致运转，冷白工业灯照明',
    searchQuery: 'industrial warehouse shelves',
    altQueries: ['factory robots working', 'manufacturing competition'],
  },
  {
    conceptClass: '研发·创新·实验室',
    match: ['研发', '创新', '专利', '实验室', '技术突破', '中试'],
    scene: '实验室里科研人员操作精密仪器，滴管与显微镜特写，屏幕蓝光与玻璃器皿反光',
    searchQuery: 'research laboratory scientist',
    altQueries: ['microscope laboratory work', 'engineer testing prototype'],
  },
]

/** 词典纪律：scene 不得要求画面出现可读文字（允许"无文字/不可读"这类负向描述） */
export const SCENE_TEXT_FORBIDDEN_MARKERS = ['字幕', '字体', '字样', '标题', '海报字', '贴纸', '水印'] as const

/**
 * 按文本命中的场景条目（用于给拆镜提示词做**聚焦注入**）。
 * 命中越多、词越长的条目越靠前；无命中返回空数组（调用方回落全量词典）。
 */
export function matchSceneRules(text: string, limit = 8): ShotSceneRule[] {
  const src = String(text || '')
  if (!src.trim()) return []
  const scored = SHOT_SCENE_LEXICON.map(rule => {
    let score = 0
    for (const kw of rule.match) {
      if (kw && src.includes(kw)) score += kw.length
    }
    return { rule, score }
  }).filter(x => x.score > 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.max(1, limit)).map(x => x.rule)
}

/** 渲染词典文本（供拆镜提示词注入）。rules 省略时输出全量词典。 */
export function renderSceneLexiconText(rules?: ShotSceneRule[]): string {
  const list = rules && rules.length > 0 ? rules : SHOT_SCENE_LEXICON
  return list
    .map(r => {
      const alts = r.altQueries && r.altQueries.length > 0 ? `（备选检索词：${r.altQueries.join(' / ')}）` : ''
      return `- 主题簇「${r.conceptClass}」触发词：${r.match.join('/')}\n  可拍场景：${r.scene}\n  素材检索词：${r.searchQuery}${alts}`
    })
    .join('\n')
}

/** 按主题簇名查条目（测试与运维排查用） */
export function findSceneRule(conceptClass: string): ShotSceneRule | undefined {
  return SHOT_SCENE_LEXICON.find(r => r.conceptClass === conceptClass)
}