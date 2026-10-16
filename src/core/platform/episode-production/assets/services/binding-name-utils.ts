/**
 * 资产绑定名字归一化 + 按名查找工具（2026-09-21 资产绑定去重归一）
 * @module platform/episode-production/assets/services/binding-name-utils
 *
 * 背景：binding 有多条创建路径（剧集自动绑定 / 上传识别 / 手工 IPC / cogen /
 * script-binding-fixer），命名口径不一（全角空格、书名号、"雪麓山庄" 前缀有无），
 * 各入口去重各管各的 → 同名重复 binding 落库（实测 vp_1789922608027_am0itsdzp：
 * 沈云萝×2 / 秦越×2 / 白鹿城×2 / 书房类×3）。
 *
 * 本模块提供统一的名字归一化与 find-or-create 用的按名查找：
 *   - normalizeBindingName：trim、全角/半角空格统一、去书名号/引号、忽略大小写；
 *   - findCharacterBindingByName / findLocationBindingByName / findItemBindingByName：
 *     项目内全量归一化匹配（角色含 alias），多命中取 created_at 最早者；
 *   - 地点额外支持前缀归一（"雪麓山庄书房" 剥掉已有地点前缀 "雪麓山庄" 后命中 "书房"），
 *     剥离剩余 <2 字不允许匹配（防 "白鹿城" 误并 "白鹿城门口"）。
 */

import type { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'

/** 前缀剥离允许的最小剩余长度（"白鹿城门口" 剥 "白鹿城" 剩 "门口"，仍需 "门口" 本身是已有地点才命中） */
const PREFIX_REMAINDER_MIN_LEN = 2

/** 前缀候选的最小长度（单字前缀误并风险太高） */
const PREFIX_MIN_LEN = 2

/**
 * 名字归一化：trim、全角空格转半角、去除书名号/引号、去掉全部空白（中文名字内
 * 空白无意义）、ASCII 小写化。空输入返回 ''。
 */
export function normalizeBindingName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\u3000/g, ' ')
    .replace(/[《》〈〉"'“”‘’「」『』]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** alias 自由文本（"三爷 / 浪剑客"）拆成独立候选名 */
function splitAlias(alias: string | null | undefined): string[] {
  if (!alias) return []
  return alias
    .split(/[/、,，;；|]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 角色 binding 的全部名字候选：standalone / override / alias 拆分 */
export function characterBindingNames(
  b: Pick<CharacterBindingEntity, 'standaloneName' | 'overrideName' | 'alias'>,
): Array<string | null | undefined> {
  return [b.standaloneName, b.overrideName, ...splitAlias(b.alias)]
}

/** 地点 binding 的全部名字候选：standalone / override / location_name（双轨列） */
export function locationBindingNames(
  b: Pick<LocationBindingEntity, 'standaloneName' | 'overrideName' | 'locationName'>,
): Array<string | null | undefined> {
  return [b.standaloneName, b.overrideName, b.locationName]
}

/** 物品 binding 的全部名字候选：standalone / override / item_name */
export function itemBindingNames(
  b: Pick<ItemBindingEntity, 'standaloneName' | 'overrideName' | 'itemName'>,
): Array<string | null | undefined> {
  return [b.standaloneName, b.overrideName, b.itemName]
}

/**
 * 建归一化名字索引。调用方需按 created_at 升序传入 bindings ——
 * 同名多命中时先进入者（最早创建）赢，与"定妆图/资产图挂在最早 binding"的惯例一致。
 */
export function buildBindingNameIndex<T extends { id: string }>(
  bindings: readonly T[],
  namesOf: (b: T) => Array<string | null | undefined>,
): Map<string, T> {
  const index = new Map<string, T>()
  for (const b of bindings) {
    for (const raw of namesOf(b)) {
      const key = normalizeBindingName(raw)
      if (!key || index.has(key)) continue
      index.set(key, b)
    }
  }
  return index
}

/**
 * 归一化索引查找，带地点前缀归一：直接命中优先；否则若名字以索引内另一名字开头
 * （前缀 ≥2 字），剥掉前缀后剩余 ≥2 字且剩余本身也在索引内 → 命中剩余对应项。
 * 前缀候选按长度降序尝试（最长前缀优先）。
 */
export function matchNameIndexWithPrefix<T>(
  index: Map<string, T>,
  normalizedName: string,
): T | null {
  if (!normalizedName) return null
  const direct = index.get(normalizedName)
  if (direct) return direct ?? null
  const prefixes = [...index.keys()]
    .filter(
      (k) =>
        k.length >= PREFIX_MIN_LEN &&
        k.length < normalizedName.length &&
        normalizedName.startsWith(k),
    )
    .sort((a, b) => b.length - a.length)
  for (const prefix of prefixes) {
    const remainder = normalizedName.slice(prefix.length)
    if (remainder.length < PREFIX_REMAINDER_MIN_LEN) continue
    const hit = index.get(remainder)
    if (hit) return hit
  }
  return null
}

/** 角色：项目内按名归一化查找（standalone/override/alias；多命中取最早创建） */
export async function findCharacterBindingByName(
  ds: DataSource,
  projectId: string,
  name: string,
): Promise<CharacterBindingEntity | null> {
  const key = normalizeBindingName(name)
  if (!key) return null
  const all = await ds.getRepository(CharacterBindingEntity).find({
    where: { projectId },
    order: { createdAt: 'ASC' },
  })
  return buildBindingNameIndex(all, characterBindingNames).get(key) ?? null
}

/** 地点：项目内按名归一化查找（standalone/override/location_name + 前缀归一） */
export async function findLocationBindingByName(
  ds: DataSource,
  projectId: string,
  name: string,
): Promise<LocationBindingEntity | null> {
  const key = normalizeBindingName(name)
  if (!key) return null
  const all = await ds.getRepository(LocationBindingEntity).find({
    where: { projectId },
    order: { createdAt: 'ASC' },
  })
  return matchNameIndexWithPrefix(buildBindingNameIndex(all, locationBindingNames), key)
}

/**
 * 地点层级推断（2026-09-21）：新地点名归一化后以项目内另一地点名开头
 * （前缀 ≥2 字、剥掉前缀剩余 ≥2 字）→ 该地点即父级（如 "雪麓山庄闺房" → 父 "雪麓山庄"）。
 * 多候选取最长匹配（"雪麓山庄东院" 优于 "雪麓山庄"）。找不到返回 null。
 *
 * 与 matchNameIndexWithPrefix 的区别：那里要求剩余部分本身也是已有地点（去重归一），
 * 这里只要求前缀是已有地点（层级挂载），剩余部分是自由区域名。
 */
export async function inferLocationParentBinding(
  ds: DataSource,
  projectId: string,
  name: string,
  excludeId?: string,
): Promise<LocationBindingEntity | null> {
  const key = normalizeBindingName(name)
  if (!key) return null
  const all = await ds.getRepository(LocationBindingEntity).find({
    where: { projectId },
    order: { createdAt: 'ASC' },
  })
  const index = buildBindingNameIndex(all, locationBindingNames)
  if (excludeId) {
    for (const [k, b] of index) {
      if (b.id === excludeId) index.delete(k)
    }
  }
  const prefixes = [...index.keys()]
    .filter(
      (k) =>
        k.length >= PREFIX_MIN_LEN &&
        k.length < key.length &&
        key.startsWith(k),
    )
    .sort((a, b) => b.length - a.length)
  for (const prefix of prefixes) {
    if (key.length - prefix.length < PREFIX_REMAINDER_MIN_LEN) continue
    return index.get(prefix) ?? null
  }
  return null
}

/** 物品：项目内按名归一化查找（standalone/override/item_name） */
export async function findItemBindingByName(
  ds: DataSource,
  projectId: string,
  name: string,
): Promise<ItemBindingEntity | null> {
  const key = normalizeBindingName(name)
  if (!key) return null
  const all = await ds.getRepository(ItemBindingEntity).find({
    where: { projectId },
    order: { createdAt: 'ASC' },
  })
  return buildBindingNameIndex(all, itemBindingNames).get(key) ?? null
}
