/**
 * 重量级依赖的单例懒加载器
 * @module core/platform/workflow/datasource/drivers/lazy-module
 *
 * 用途：把"只有真用得到时才需要"的重型数据库驱动（mssql→tedious 3.9MB、
 * mysql2、pg）从启动路径上摘掉。启动装配只实例化 adapter（不碰依赖），
 * 首次真正连接/查询时才 import 并缓存。
 *
 * 注意：`import()` 的返回形态随依赖的 CJS/ESM 打包方式而异，调用方通过
 * `pick` 归一化（如 mssql 的 `m.default ?? m`）。
 */

/**
 * @param loader 动态 import（只在首次调用时执行一次）
 * @param pick 把 import 结果归一化成需要的形态（缺省原样返回）
 * @returns 单例加载器：首次调用才 import，之后复用同一 Promise
 */
export function lazyModule<M, T = M>(
  loader: () => Promise<M>,
  pick?: (mod: M) => T,
): () => Promise<T> {
  let cached: Promise<T> | null = null
  return () => {
    cached ??= loader().then((mod) => (pick ? pick(mod) : (mod as unknown as T)))
    return cached
  }
}