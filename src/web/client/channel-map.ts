/**
 * Channel 别名覆盖表
 * @module web/client/channel-map
 * @description preload 中部分方法名与 IPC channel 不是简单的"namespace.method"
 *              kebab 化，需要在此显式映射。键是 `<namespace>.<method>`，值是
 *              IPC channel 全名。
 *
 *              这张表只列与 default 规则不一致的项；其余按 default 自动生成。
 */

export const CHANNEL_OVERRIDES: Record<string, string> = {
  // --- settings ---
  'settings.get': 'settings:get',
  'settings.set': 'settings:set',

  // --- apiKey ---
  'apiKey.list': 'api-key:list',
  'apiKey.set': 'api-key:set',
  'apiKey.delete': 'api-key:delete',
  'apiKey.test': 'api-key:test',

  // --- providerTemplate ---
  'providerTemplate.list': 'provider-template:list',

  // --- providerConfig ---
  'providerConfig.list': 'provider-config:list',
  'providerConfig.get': 'provider-config:get',
  'providerConfig.create': 'provider-config:create',
  'providerConfig.update': 'provider-config:update',
  'providerConfig.delete': 'provider-config:delete',
  'providerConfig.test': 'provider-config:test',
  'providerConfig.setDefault': 'provider-config:set-default',
  'providerConfig.onChanged': 'provider-config:changed',

  // --- chat ---
  'chat.send': 'chat:send',
  'chat.stop': 'chat:stop',
  'chat.onStream': 'chat:stream',

  // --- 其余命名空间通常匹配 default 规则（dialog:list / message:create 等），
  //     若发现不匹配再加到本表 ---
}
