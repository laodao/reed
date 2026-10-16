/**
 * 跨进程传输前的数据纯化工具
 * @module renderer/utils/plain-data
 *
 * Vue reactive / ref 取出的数组与对象仍是 Proxy。Electron IPC
 * （V8 structured clone，ipcRenderer.invoke 内部使用）无法克隆 Proxy，
 * 直接传输会抛 "An object could not be cloned"（例如运行「每日热点早报」
 * 这类含多选数组 / 对象输入的工作流时 startRun 报错）。
 *
 * 本工具把（可能含 reactive 代理的）值转回普通 JSON 数据，供 IPC 参数、
 * 跨进程消息等传输使用；原始值（字符串/数字/布尔/null/undefined）原样返回。
 */

/** 把可能含 Vue reactive 代理的值转为普通 JSON 数据 */
export function toPlainData<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}
