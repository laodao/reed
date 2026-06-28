export type PromptSyncReason = 'initialize' | 'user-edit' | 'save'

export const FORM_PROMPT_DIVIDER = '\n\n---\n'

export type MetadataPromptKey = 'lensFocalMm' | 'aperture' | 'cameraStyle' | 'lighting'

export function mergeFormPromptDescription(options: {
  currentText: string
  nextFormPrompt: string
  previousFormPrompt?: string
}): string {
  const currentText = options.currentText.trim()
  const nextFormPrompt = options.nextFormPrompt.trim()
  const previousFormPrompt = options.previousFormPrompt?.trim() ?? ''

  if (!currentText) return nextFormPrompt
  if (!nextFormPrompt) return currentText
  if (currentText === nextFormPrompt) return nextFormPrompt

  if (!currentText.includes(FORM_PROMPT_DIVIDER)) {
    if (previousFormPrompt && currentText === previousFormPrompt) return nextFormPrompt
    if (previousFormPrompt && currentText.startsWith(`${previousFormPrompt}\n`)) {
      const manualText = currentText.slice(previousFormPrompt.length).trim()
      return manualText ? `${nextFormPrompt}${FORM_PROMPT_DIVIDER}${manualText}` : nextFormPrompt
    }
    return `${nextFormPrompt}${FORM_PROMPT_DIVIDER}${currentText}`
  }

  const parts = currentText.split(FORM_PROMPT_DIVIDER)
  const currentFormPrompt = parts[0].trim()
  const manualText = parts.slice(1).join(FORM_PROMPT_DIVIDER).trim()

  if (!previousFormPrompt || currentFormPrompt === previousFormPrompt) {
    return manualText ? `${nextFormPrompt}${FORM_PROMPT_DIVIDER}${manualText}` : nextFormPrompt
  }

  const preservedText = manualText
    ? `${currentFormPrompt}${FORM_PROMPT_DIVIDER}${manualText}`
    : currentFormPrompt
  return `${nextFormPrompt}${FORM_PROMPT_DIVIDER}${preservedText}`
}

export function shouldResetStoryboardDraft(options: {
  currentStoryboardId: string | null
  nextStoryboardId: string
  dirtyFieldCount: number
}): boolean {
  return options.currentStoryboardId !== options.nextStoryboardId || options.dirtyFieldCount === 0
}

export function shouldMarkSyncedPromptDirty(options: {
  syncReason: PromptSyncReason
  syncedText: string
  savedText: string
}): boolean {
  return options.syncReason !== 'initialize' && options.syncedText.trim() !== options.savedText.trim()
}

export function metadataRefKey(key: string): MetadataPromptKey | null {
  if (key === 'lensFocalMm' || key === 'aperture' || key === 'cameraStyle' || key === 'lighting') return key
  return null
}
