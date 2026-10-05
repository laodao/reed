/**
 * 世界观库·内置题材模板（设定资产库 P0-2026-09-24，设计 §4.4）
 * 模板 = 纯数据：新建世界选模板时由 world-library.service 播种 kinds + 示范条目（可删）。
 * 修真维度对应头部网文拆解（凡人修仙传/遮天/斗破苍穹等的共性十维度），
 * fields_schema 驱动动态表单与 AI 生成；promptHint 供 P1 生成向导使用。
 */

import type { LibraryFieldSchemaItem } from '@shared/types/lw-library.types'

export interface WorldTemplateEntrySeed {
  kindKey: string
  name: string
  aliases?: string[]
  summary: string
  fields?: Record<string, unknown>
  pinned?: boolean
  rankValue?: number
}

export interface WorldTemplateKindSeed {
  key: string
  label: string
  icon: string
  sortOrder: number
  fieldsSchema: LibraryFieldSchemaItem[]
  promptHint: string
}

export interface WorldTemplate {
  id: string
  name: string
  genre: string
  tagline: string
  kinds: WorldTemplateKindSeed[]
  entries: WorldTemplateEntrySeed[]
}

/** rank 品阶字段（法宝/丹药/仙草/功法共用形状） */
const RANK_FIELD: LibraryFieldSchemaItem = {
  key: 'rank', label: '品阶', type: 'select',
  options: ['下品', '中品', '上品', '极品', '灵器', '法宝', '灵宝'],
}

export const XIUZHEN_TEMPLATE: WorldTemplate = {
  id: 'xiuzhen',
  name: '修真世界模板',
  genre: 'xiuzhen',
  tagline: '灵气·境界·宗门——凡人逆天改命的世界底座',
  kinds: [
    {
      key: 'power_system', label: '力量体系', icon: '🌀', sortOrder: 1,
      fieldsSchema: [
        { key: 'energySource', label: '能量来源', type: 'text', required: true },
        { key: 'coreRule', label: '核心规则', type: 'textarea', required: true },
        { key: 'breakthrough', label: '突破机制', type: 'textarea' },
        { key: 'cost', label: '力量代价', type: 'textarea' },
      ],
      promptHint: '{"energySource":"灵气","coreRule":"核心规则","breakthrough":"突破机制","cost":"力量代价"}',
    },
    {
      key: 'realm', label: '境界', icon: '🪜', sortOrder: 2,
      fieldsSchema: [
        { key: 'lifespan', label: '寿元', type: 'text' },
        { key: 'breakCondition', label: '突破条件', type: 'textarea' },
        { key: 'ability', label: '该阶能力', type: 'textarea' },
      ],
      promptHint: '{"lifespan":"寿元","breakCondition":"突破条件","ability":"该阶能力"}',
    },
    {
      key: 'aptitude', label: '资质体系', icon: '🌱', sortOrder: 3,
      fieldsSchema: [
        { key: 'attributes', label: '属性', type: 'text', required: true },
        { key: 'grades', label: '品级', type: 'text', required: true },
        { key: 'effect', label: '对修行的影响', type: 'textarea' },
      ],
      promptHint: '{"attributes":"金木水火土/变异","grades":"天/真/伪灵根","effect":"对修行速度与上限的影响"}',
    },
    {
      key: 'sect', label: '门派', icon: '⛩️', sortOrder: 4,
      fieldsSchema: [
        { key: 'tier', label: '层级', type: 'select', options: ['顶尖', '一流', '二流', '三流'] },
        { key: 'stronghold', label: '驻地', type: 'text' },
        { key: 'specialty', label: '功法倾向', type: 'text' },
        { key: 'foundation', label: '镇派底蕴', type: 'textarea' },
      ],
      promptHint: '{"tier":"一流","stronghold":"驻地","specialty":"功法倾向","foundation":"镇派底蕴"}',
    },
    {
      key: 'region', label: '地域', icon: '🏔️', sortOrder: 5,
      fieldsSchema: [
        { key: 'terrain', label: '地貌', type: 'text' },
        { key: 'qiDensity', label: '灵气浓度', type: 'select', options: ['稀薄', '寻常', '浓郁', '圣地'] },
        { key: 'dangerLevel', label: '凶险程度', type: 'text' },
      ],
      promptHint: '{"terrain":"地貌","qiDensity":"稀薄/寻常/浓郁/圣地","dangerLevel":"凶险程度"}',
    },
    {
      key: 'country', label: '国别', icon: '🏯', sortOrder: 6,
      fieldsSchema: [
        { key: 'polity', label: '政体', type: 'text' },
        { key: 'militaryPower', label: '国力', type: 'text' },
        { key: 'sectRelations', label: '与宗门关系', type: 'textarea' },
      ],
      promptHint: '{"polity":"政体","militaryPower":"国力","sectRelations":"与宗门关系"}',
    },
    {
      key: 'weapon', label: '法宝', icon: '⚔️', sortOrder: 7,
      fieldsSchema: [RANK_FIELD, { key: 'material', label: '材料', type: 'text' }, { key: 'taboo', label: '禁忌', type: 'textarea' }],
      promptHint: '{"rank":"品阶","material":"材料","taboo":"使用禁忌"}',
    },
    {
      key: 'pill', label: '丹药', icon: '💊', sortOrder: 8,
      fieldsSchema: [RANK_FIELD, { key: 'effect', label: '药效', type: 'textarea', required: true }, { key: 'sideEffect', label: '副作用', type: 'text' }],
      promptHint: '{"rank":"品阶","effect":"药效","sideEffect":"副作用"}',
    },
    {
      key: 'herb', label: '仙草', icon: '🌿', sortOrder: 9,
      fieldsSchema: [RANK_FIELD, { key: 'age', label: '年份', type: 'text' }, { key: 'habitat', label: '产地', type: 'text' }],
      promptHint: '{"rank":"品阶","age":"年份","habitat":"产地"}',
    },
    {
      key: 'spell', label: '法术', icon: '✨', sortOrder: 10,
      fieldsSchema: [RANK_FIELD, { key: 'element', label: '属性', type: 'text' }, { key: 'condition', label: '修炼条件', type: 'text' }],
      promptHint: '{"rank":"品阶","element":"属性","condition":"修炼条件"}',
    },
    {
      key: 'art', label: '功法', icon: '📜', sortOrder: 11,
      fieldsSchema: [RANK_FIELD, { key: 'origin', label: '来源', type: 'text' }, { key: 'stage', label: '层次', type: 'text' }],
      promptHint: '{"rank":"品阶","origin":"来源","stage":"层次"}',
    },
    {
      key: 'rule', label: '规则禁忌', icon: '⛔', sortOrder: 12,
      fieldsSchema: [
        { key: 'content', label: '规则内容', type: 'textarea', required: true },
        { key: 'penalty', label: '违反代价', type: 'textarea', required: true },
        { key: 'scope', label: '涉及境界/地域', type: 'text' },
      ],
      promptHint: '{"content":"规则内容","penalty":"违反代价","scope":"涉及范围"}',
    },
    {
      key: 'economy', label: '经济', icon: '💰', sortOrder: 13,
      fieldsSchema: [
        { key: 'currency', label: '货币', type: 'text', required: true },
        { key: 'exchange', label: '兑换/产出', type: 'textarea' },
      ],
      promptHint: '{"currency":"灵石等货币","exchange":"兑换与产出逻辑"}',
    },
    {
      key: 'history_event', label: '历史', icon: '🏺', sortOrder: 14,
      fieldsSchema: [
        { key: 'era', label: '纪元', type: 'text', required: true },
        { key: 'impact', label: '影响', type: 'textarea', required: true },
        { key: 'relics', label: '遗留物', type: 'text' },
      ],
      promptHint: '{"era":"纪元","impact":"影响","relics":"遗留物"}',
    },
    {
      key: 'daily_life', label: '日常', icon: '🍵', sortOrder: 15,
      fieldsSchema: [
        { key: 'lifespan', label: '凡人寿命', type: 'text' },
        { key: 'customs', label: '衣食住行/礼俗', type: 'textarea' },
      ],
      promptHint: '{"lifespan":"凡人寿命","customs":"衣食住行礼俗"}',
    },
  ],
  entries: [
    {
      kindKey: 'power_system', name: '修真体系', pinned: true,
      summary: '炼气化灵入体，境界的本质是对灵气的掌控层级；突破靠顿悟与资源，力量伴随心魔代价。',
      fields: {
        energySource: '天地灵气',
        coreRule: '灵气入体化为法力，境界即掌控层级；灵根资质决定修行速度上限',
        breakthrough: '小境界靠积累，大境界需顿悟+丹药辅助，天劫验收',
        cost: '强行突破损及道基；心魔滋生，入魔则修为尽废',
      },
    },
    {
      kindKey: 'aptitude', name: '灵根体系', pinned: true, aliases: ['灵根'],
      summary: '金木水火土五行灵根，另有雷风冰等变异灵根；单属性为天灵根，四五行为伪灵根。',
      fields: {
        attributes: '金、木、水、火、土五行 + 雷/风/冰变异',
        grades: '天灵根（单一）> 真灵根（二三）> 伪灵根（四五）',
        effect: '天灵根修行极快；伪灵根起步艰难，但五行圆满在炼虚后有独特优势',
      },
    },
    { kindKey: 'realm', name: '炼气', rankValue: 1, pinned: true, summary: '修真第一步，引灵气入体洗练经脉，共十三层。', fields: { lifespan: '百余年', breakCondition: '灵气积累圆满+筑基丹', ability: '御物、基础法术' } },
    { kindKey: 'realm', name: '筑基', rankValue: 2, pinned: true, summary: '筑就道基，寿元倍增，方可称修士。', fields: { lifespan: '两百余岁', breakCondition: '筑基丹/雷劫淬体', ability: '御器飞行、开辟洞府' } },
    { kindKey: 'realm', name: '结丹', rankValue: 3, pinned: true, summary: '法力凝丹，一方巨擘，可开宗立派。', fields: { lifespan: '五百岁', breakCondition: '金丹天劫', ability: '法域雏形、结丹可压制筑基' } },
    { kindKey: 'realm', name: '元婴', rankValue: 4, pinned: true, summary: '元婴不灭则真身可塑，人间顶尖战力。', fields: { lifespan: '千岁', breakCondition: '碎丹成婴', ability: '婴变第二元神、夺舍重生' } },
    { kindKey: 'realm', name: '化神', rankValue: 5, pinned: true, summary: '神识化神，触及天地法则，飞升灵界之门。', fields: { lifespan: '三千岁', breakCondition: '神识合天地', ability: '初步驾驭法则' } },
    { kindKey: 'rule', name: '天劫规则', pinned: true, summary: '大境界突破必引天劫，渡过则生，渡不过则形神俱灭。', fields: { content: '结丹/元婴/化神突破时天降劫雷', penalty: '渡劫失败形神俱灭', scope: '全体修士' } },
    { kindKey: 'economy', name: '灵石体系', pinned: true, aliases: ['灵石'], summary: '灵石分下中上品，既是货币也是修行资源；宗门以灵矿为命脉。', fields: { currency: '下品/中品/上品灵石', exchange: '百下品=一中品，百中品=一上品' } },
  ],
}

/** 西幻模板（职业/序列/种族/神祇维度，对标诡秘之主式途径结构与经典剑与魔法） */
export const WESTERN_FANTASY_TEMPLATE: WorldTemplate = {
  id: 'western_fantasy',
  name: '西幻世界模板',
  genre: 'western_fantasy',
  tagline: '序列·职业·诸神——秩序与神秘并存的大陆',
  kinds: [
    {
      key: 'power_system', label: '力量体系', icon: '🌀', sortOrder: 1,
      fieldsSchema: [
        { key: 'energySource', label: '能量来源', type: 'text', required: true },
        { key: 'coreRule', label: '核心规则', type: 'textarea', required: true },
        { key: 'cost', label: '力量代价', type: 'textarea' },
      ],
      promptHint: '{"energySource":"魔力/星光","coreRule":"核心规则","cost":"力量代价"}',
    },
    {
      key: 'realm', label: '阶位', icon: '🪜', sortOrder: 2,
      fieldsSchema: [
        { key: 'lifespan', label: '寿元变化', type: 'text' },
        { key: 'ability', label: '该阶能力', type: 'textarea' },
      ],
      promptHint: '{"lifespan":"寿元变化","ability":"该阶能力"}',
    },
    {
      key: 'profession', label: '职业途径', icon: '⚔️', sortOrder: 3,
      fieldsSchema: [
        { key: 'sequence', label: '序列/阶位链', type: 'text', required: true },
        { key: 'actingRule', label: '晋升法则', type: 'textarea' },
        { key: 'faction', label: '对应阵营/教会', type: 'text' },
      ],
      promptHint: '{"sequence":"序列9→序列0","actingRule":"扮演法/晋升法则","faction":"对应教会（选途径=选阵营=自动树敌）"}',
    },
    {
      key: 'race', label: '种族', icon: '🧝', sortOrder: 4,
      fieldsSchema: [
        { key: 'traits', label: '天赋特征', type: 'textarea', required: true },
        { key: 'habitat', label: '栖息地', type: 'text' },
        { key: 'relation', label: '与其他种族关系', type: 'text' },
      ],
      promptHint: '{"traits":"天赋特征","habitat":"栖息地","relation":"种族关系"}',
    },
    {
      key: 'deity', label: '神祇', icon: '⛪', sortOrder: 5,
      fieldsSchema: [
        { key: 'domain', label: '神职领域', type: 'text', required: true },
        { key: 'church', label: '地上教会', type: 'text' },
        { key: 'taboo', label: '禁忌', type: 'textarea' },
      ],
      promptHint: '{"domain":"神职领域","church":"地上教会组织","taboo":"信仰禁忌"}',
    },
    {
      key: 'region', label: '地域', icon: '🏔️', sortOrder: 6,
      fieldsSchema: [
        { key: 'terrain', label: '地貌', type: 'text' },
        { key: 'dangerLevel', label: '凶险程度', type: 'text' },
      ],
      promptHint: '{"terrain":"地貌","dangerLevel":"凶险程度"}',
    },
    {
      key: 'country', label: '国别', icon: '🏰', sortOrder: 7,
      fieldsSchema: [
        { key: 'polity', label: '政体', type: 'text' },
        { key: 'sectRelations', label: '与教会/组织关系', type: 'textarea' },
      ],
      promptHint: '{"polity":"政体","sectRelations":"与教会关系"}',
    },
    {
      key: 'weapon', label: '神奇物品', icon: '🗡️', sortOrder: 8,
      fieldsSchema: [
        { key: 'rank', label: '品阶', type: 'select', options: ['普通', '稀有', '史诗', '传说', '神器'] },
        { key: 'effect', label: '非凡能力', type: 'textarea', required: true },
        { key: 'cost', label: '负面代价', type: 'textarea' },
      ],
      promptHint: '{"rank":"品阶","effect":"非凡能力","cost":"负面代价（非凡必有代价）"}',
    },
    {
      key: 'rule', label: '规则禁忌', icon: '⛔', sortOrder: 9,
      fieldsSchema: [
        { key: 'content', label: '规则内容', type: 'textarea', required: true },
        { key: 'penalty', label: '违反代价', type: 'textarea', required: true },
      ],
      promptHint: '{"content":"规则内容","penalty":"违反代价"}',
    },
    {
      key: 'history_event', label: '历史', icon: '🏺', sortOrder: 10,
      fieldsSchema: [
        { key: 'era', label: '纪元', type: 'text', required: true },
        { key: 'impact', label: '影响', type: 'textarea', required: true },
      ],
      promptHint: '{"era":"纪元","impact":"影响"}',
    },
  ],
  entries: [
    {
      kindKey: 'power_system', name: '魔力与序列', pinned: true,
      summary: '魔力为源、序列为阶；晋升靠魔药与扮演，选途径即选阵营，非凡必付代价。',
      fields: { energySource: '魔力', coreRule: '序列9→0，高位者影响现实', cost: '失控与疯狂' },
    },
  ],
}

/** 都市异能模板（现代背景的隐秘超凡） */
export const URBAN_TEMPLATE: WorldTemplate = {
  id: 'urban',
  name: '都市异能模板',
  genre: 'urban',
  tagline: '霓虹之下，异能与秩序共存的隐秘世界',
  kinds: [
    {
      key: 'power_system', label: '异能体系', icon: '🌀', sortOrder: 1,
      fieldsSchema: [
        { key: 'energySource', label: '异能来源', type: 'text', required: true },
        { key: 'coreRule', label: '核心规则（觉醒/限制）', type: 'textarea', required: true },
        { key: 'exposure', label: '曝光控制（隐秘程度）', type: 'textarea' },
      ],
      promptHint: '{"energySource":"觉醒来源","coreRule":"觉醒与限制规则","exposure":"超凡对普通人的隐秘程度"}',
    },
    {
      key: 'realm', label: '异能等级', icon: '🪜', sortOrder: 2,
      fieldsSchema: [
        { key: 'ability', label: '该级能力', type: 'textarea' },
        { key: 'breakCondition', label: '晋级条件', type: 'textarea' },
      ],
      promptHint: '{"ability":"该级能力","breakCondition":"晋级条件"}',
    },
    {
      key: 'faction', label: '组织', icon: '🏢', sortOrder: 3,
      fieldsSchema: [
        { key: 'tier', label: '层级', type: 'select', options: ['官方', '顶流', '一流', '地下'] },
        { key: 'goal', label: '组织目标', type: 'textarea', required: true },
        { key: 'stronghold', label: '据点', type: 'text' },
      ],
      promptHint: '{"tier":"官方/地下","goal":"组织目标","stronghold":"据点"}',
    },
    {
      key: 'region', label: '地域', icon: '🏙️', sortOrder: 4,
      fieldsSchema: [
        { key: 'trait', label: '地段特征', type: 'text' },
        { key: 'dangerLevel', label: '异变风险', type: 'text' },
      ],
      promptHint: '{"trait":"地段特征","dangerLevel":"异变风险"}',
    },
    {
      key: 'weapon', label: '异物', icon: '🔑', sortOrder: 5,
      fieldsSchema: [
        { key: 'rank', label: '危险级', type: 'select', options: ['安全', '可控', '危险', '灾厄'] },
        { key: 'effect', label: '异能效果', type: 'textarea', required: true },
        { key: 'cost', label: '使用代价', type: 'textarea' },
      ],
      promptHint: '{"rank":"危险级","effect":"异能效果","cost":"使用代价"}',
    },
    {
      key: 'rule', label: '规则禁忌', icon: '⛔', sortOrder: 6,
      fieldsSchema: [
        { key: 'content', label: '规则内容', type: 'textarea', required: true },
        { key: 'penalty', label: '违反代价', type: 'textarea', required: true },
      ],
      promptHint: '{"content":"规则内容","penalty":"违反代价"}',
    },
    {
      key: 'daily_life', label: '日常', icon: '🍵', sortOrder: 7,
      fieldsSchema: [
        { key: 'customs', label: '隐秘社会日常', type: 'textarea' },
      ],
      promptHint: '{"customs":"异能者的衣食住行与黑市"}',
    },
  ],
  entries: [
    {
      kindKey: 'power_system', name: '觉醒体系', pinned: true,
      summary: '异能觉醒不可逆，等级即话语权；官方注册与地下黑市并存，曝光即灾难。',
      fields: { energySource: '觉醒', coreRule: '觉醒不可逆，能力形态因人而异', exposure: '隐秘统治：普通人不知异能存在' },
    },
  ],
}

/** 内置模板注册表（P1：修真/西幻/都市） */
export const WORLD_TEMPLATES: Record<string, WorldTemplate> = {
  [XIUZHEN_TEMPLATE.id]: XIUZHEN_TEMPLATE,
  [WESTERN_FANTASY_TEMPLATE.id]: WESTERN_FANTASY_TEMPLATE,
  [URBAN_TEMPLATE.id]: URBAN_TEMPLATE,
}
