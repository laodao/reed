/**
 * narrative/ai · barrel
 * @module platform/episode-production/narrative/ai
 */
export * from './types'
export { EpisodeScriptGenerator } from './script-generator'
export { EpisodeStoryboardGenerator } from './storyboard-generator'
export { EpisodeScenePolisher } from './scene-polisher'
export type { PolishStoryContext, ScenePolishResult } from './scene-polisher'
export {
  buildCogenPrompt,
  validateCogenOutput,
  generateCogenForScene,
} from './storyboard-cogen'
export type {
  CogenExistingAsset,
  CogenOutput,
  CogenShot,
  CogenAssetCharacter,
  CogenAssetLocation,
  CogenAssetItem,
} from './storyboard-cogen'
