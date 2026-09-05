// @vitest-environment happy-dom
/**
 * 前端业务包注册表单测
 * 覆盖：isPackUsable 纯函数（启用态/依赖/降级分支）、registerPack fail-fast、
 *       applyPacks 路由动态注册与菜单锚点合入、installBuiltinPackages 的 IPC 失败降级。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import type { PackInfo, PackManifest } from '@shared/types/pack.types'
import {
  applyPacks,
  enabledPacks,
  isPackUsable,
  listRegisteredPacks,
  registerPack,
  setPackInfos,
  __resetPackRegistryForTests,
  type RendererPackDefinition,
} from '@/packs/registry'
import { mainMenuItems, flattenMenuItems, __resetMainMenuForTests } from '@/config/menu'

/** 造一个最小可用包定义（组件用空 stub，不触发视图加载） */
function makePack(id: string, overrides: {
  manifest?: Partial<PackManifest>
  routes?: RendererPackDefinition['routes']
  menuItems?: RendererPackDefinition['menuItems']
  menuInsertBefore?: string
} = {}): RendererPackDefinition {
  return {
    manifest: { id, name: id, version: '1.0.0', ...overrides.manifest },
    routes: overrides.routes ?? [
      { path: `/${id}`, name: id, component: { template: '<div />' }, meta: { title: id } },
    ],
    menuItems: overrides.menuItems,
    menuInsertBefore: overrides.menuInsertBefore,
  }
}

function makeInfo(id: string, patch: Partial<PackInfo> = {}): PackInfo {
  return { id, name: id, version: '1.0.0', state: 'enabled', enabled: true, dependencies: [], ...patch }
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'Home', component: { template: '<div />' } }],
  })
}

beforeEach(() => {
  __resetPackRegistryForTests()
  __resetMainMenuForTests()
})

describe('isPackUsable（纯函数：启用态 + 依赖就绪）', () => {
  const manifest: PackManifest = { id: 'demo', name: 'Demo', version: '1.0.0' }

  it('启用态未拉到（infos 为 null）→ 降级全启用', () => {
    expect(isPackUsable(manifest, null)).toBe(true)
  })

  it('后端尚未感知该包（infos 中无此 id）→ 按 manifest 默认启用', () => {
    expect(isPackUsable(manifest, {})).toBe(true)
    expect(isPackUsable({ ...manifest, defaultEnabled: false }, {})).toBe(false)
  })

  it('后端已感知：enabled=false 或 state 非可用态 → 不可用', () => {
    expect(isPackUsable(manifest, { demo: makeInfo('demo') })).toBe(true)
    expect(isPackUsable(manifest, { demo: makeInfo('demo', { enabled: false }) })).toBe(false)
    expect(isPackUsable(manifest, { demo: makeInfo('demo', { state: 'pending' }) })).toBe(false)
    expect(isPackUsable(manifest, { demo: makeInfo('demo', { state: 'disabled' }) })).toBe(false)
    expect(isPackUsable(manifest, { demo: makeInfo('demo', { state: 'failed' }) })).toBe(false)
  })

  it('依赖未就绪（依赖包 pending/disabled）→ 本包视同 pending 不可用', () => {
    const dep: PackManifest = { ...manifest, dependencies: ['voice-design'] }
    // 依赖启用 → 可用
    expect(isPackUsable(dep, {
      demo: makeInfo('demo'),
      'voice-design': makeInfo('voice-design'),
    })).toBe(true)
    // 依赖 pending → 不可用
    expect(isPackUsable(dep, {
      demo: makeInfo('demo'),
      'voice-design': makeInfo('voice-design', { state: 'pending', missingDependencies: ['x'] }),
    })).toBe(false)
    // 依赖被禁用 → 不可用
    expect(isPackUsable(dep, {
      demo: makeInfo('demo'),
      'voice-design': makeInfo('voice-design', { enabled: false, state: 'disabled' }),
    })).toBe(false)
    // 依赖未被后端感知（P4 迁移完成前的前端自治期）→ 视为就绪
    expect(isPackUsable(dep, { demo: makeInfo('demo') })).toBe(true)
  })
})

describe('registerPack（登记期 fail-fast）', () => {
  it('非法 manifest 抛 PackManifestError，不入表', () => {
    expect(() => registerPack(makePack('BAD_ID'))).toThrowError(/非法/)
    expect(listRegisteredPacks()).toHaveLength(0)
  })

  it('重复注册同一 id 抛错', () => {
    registerPack(makePack('demo'))
    expect(() => registerPack(makePack('demo'))).toThrowError(/重复注册/)
    expect(listRegisteredPacks()).toHaveLength(1)
  })

  it('enabledPacks 响应式：禁用后从可用列表消失', () => {
    registerPack(makePack('demo'))
    expect(enabledPacks.value.map(p => p.manifest.id)).toEqual(['demo'])
    setPackInfos([makeInfo('demo', { enabled: false, state: 'disabled' })])
    expect(enabledPacks.value).toHaveLength(0)
  })
})

describe('applyPacks（路由动态注册 + 菜单锚点合入）', () => {
  it('启用包注册路由，禁用包不注册（直连 URL 无匹配）', () => {
    registerPack(makePack('pack-a'))
    registerPack(makePack('pack-b'))
    setPackInfos([
      makeInfo('pack-a'),
      makeInfo('pack-b', { enabled: false, state: 'disabled' }),
    ])
    const router = makeRouter()
    applyPacks(router)
    expect(router.resolve('/pack-a').name).toBe('pack-a')
    expect(router.resolve('/pack-b').matched).toHaveLength(0)
  })

  it('菜单按锚点插入，保持壳条目与包条目的相对顺序', () => {
    registerPack(makePack('pack-a', {
      menuItems: [{ path: '/pack-a', label: 'A', icon: null }],
      menuInsertBefore: '/knowledge-base',
    }))
    registerPack(makePack('pack-b', {
      menuItems: [{ path: '/pack-b', label: 'B', icon: null }],
      menuInsertBefore: '/knowledge-base',
    }))
    registerPack(makePack('pack-c', {
      menuItems: [{ path: '/pack-c', label: 'C', icon: null }],
    }))
    applyPacks(makeRouter())
    const paths = flattenMenuItems(mainMenuItems).map(i => i.path)
    // 壳首位保持，锚点相同的包按注册序插入，无锚点追加末尾
    expect(paths).toEqual(['/', '/pack-a', '/pack-b', '/knowledge-base', '/workflow', '/apps', '/assets', '/pack-c'])
  })

  it('幂等：重复 applyPacks 不重复挂路由/菜单', () => {
    registerPack(makePack('pack-a', { menuItems: [{ path: '/pack-a', label: 'A', icon: null }] }))
    const router = makeRouter()
    applyPacks(router)
    applyPacks(router)
    expect(router.getRoutes().filter(r => r.name === 'pack-a')).toHaveLength(1)
    expect(flattenMenuItems(mainMenuItems).filter(i => i.path === '/pack-a')).toHaveLength(1)
  })
})

describe('installBuiltinPackages（内置包装配）', () => {
  afterEach(() => {
    delete (window as any).electronAPI
    __resetPackRegistryForTests()
    __resetMainMenuForTests()
  })

  it('IPC 不可用（无 electronAPI）→ 降级全启用：7 个包路由全部挂上', async () => {
    const { installBuiltinPackages } = await import('@/packs/index')
    const router = makeRouter()
    await installBuiltinPackages(router)
    for (const path of [
      '/chat', '/assistant',
      '/portrait', '/portrait/geometry', '/portrait-templates',
      '/longwriting', '/story-editor/s1', '/comment-editor/c1',
      '/diary', '/skills', '/voice/design',
      '/episode-production', '/episode-production/all', '/episode-production/p1/creator',
    ]) {
      expect(router.resolve(path).matched.length, `路由 ${path} 应已注册`).toBeGreaterThan(0)
    }
    // 菜单顺序与原静态菜单一致
    const paths = flattenMenuItems(mainMenuItems).map(i => i.path)
    expect(paths).toEqual([
      '/', '/chat', '/portrait', '/longwriting', '/episode-production',
      '/knowledge-base', '/workflow', '/apps', '/diary', '/assets', '/skills',
    ])
  })

  it('后端启用态生效：voice-design 禁用 → episode-production 级联不注册', async () => {
    const infos: PackInfo[] = [
      makeInfo('voice-design', { enabled: false, state: 'disabled' }),
    ]
    ;(window as any).electronAPI = { pack: { list: async () => ({ success: true, data: infos }) } }
    const { installBuiltinPackages } = await import('@/packs/index')
    const router = makeRouter()
    await installBuiltinPackages(router)
    // 依赖被禁用 → voice-design 自身与 episode-production 均不注册
    expect(router.resolve('/voice/design').matched).toHaveLength(0)
    expect(router.resolve('/episode-production').matched).toHaveLength(0)
    // 其余包不受影响
    expect(router.resolve('/diary').name).toBe('Diary')
    expect(flattenMenuItems(mainMenuItems).map(i => i.path)).not.toContain('/episode-production')
  })
})
