/**
 * render/keyframe barrel
 * @module platform/episode-production/render/keyframe
 */

export { buildImagePrompt, PRESET_STYLES } from './keyframe-prompt-builder'
export type { StyleConfig } from './keyframe-prompt-builder'
export { KeyframeGeneratorService } from './keyframe-generator.service'
export { ReferenceBoardService } from './reference-board.service'
export type { ReferenceBoardMemberInput, ReferenceBoardResult } from './reference-board.service'
export { runKeyframeMachineChecks } from './keyframe-machine-checks'
export type { MachineCheckResult, MachineCheckFailure } from './keyframe-machine-checks'
export { isVisionCapable } from './keyframe-review.service'
