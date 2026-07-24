/**
 * 图像生成模型加载 composable
 * @module portrait/workbench/useImageModels
 * @description 加载已配置的图像 Provider/模型，按 Provider 分组，支持搜索过滤与项目默认模型记忆。
 *              抽取自 CharacterEditor 的模型加载逻辑，供新版工作台各面板复用（严禁复制粘贴）。
 */
import { ref, computed, type Ref } from 'vue'
import type { PortraitProject } from '../../../../../shared/types/portrait.types'

export interface ImageModelItem {
  key: string            // providerId:modelId
  label: string
  providerId: string
  modelId: string
  supportedSizes: string[]
}

export interface ProviderModelGroup {
  id: string
  name: string
  models: { id: string; name: string; maxResolution?: string; supportedSizes?: string[] }[]
}

export function useImageModels(project?: Ref<PortraitProject | undefined>) {
  const providerModels = ref<ProviderModelGroup[]>([])
  const availableModels = ref<ImageModelItem[]>([])
  const selectedModelKey = ref<string>('')
  const modelSearchKeyword = ref('')

  /** 按关键字过滤后的分组列表（匹配模型名/模型ID/Provider名） */
  const filteredProviderModels = computed(() => {
    if (!modelSearchKeyword.value) return providerModels.value
    const keyword = modelSearchKeyword.value.toLowerCase()
    return providerModels.value
      .map(provider => ({
        ...provider,
        models: provider.models.filter(model =>
          model.name.toLowerCase().includes(keyword) ||
          model.id.toLowerCase().includes(keyword) ||
          provider.name.toLowerCase().includes(keyword)
        )
      }))
      .filter(provider => provider.models.length > 0)
  })

  /** 当前选中模型（扁平项） */
  const selectedModel = computed(() =>
    availableModels.value.find(m => m.key === selectedModelKey.value)
  )

  /** 当前模型的 supportedSizes（透传给 SizeSelect） */
  const modelSizes = computed<string[]>(() => selectedModel.value?.supportedSizes ?? [])

  function filterModels(keyword: string): void {
    modelSearchKeyword.value = keyword
  }

  async function load(): Promise<void> {
    try {
      const result = await window.electronAPI.image.getProviders()
      if (!result.success || !result.data) return
      const providers = result.data.filter((p: any) => p.configured && p.models?.length > 0)

      // 按 Provider 分组（maxResolution / supportedSizes 在 model.features 下）
      providerModels.value = providers.map((provider: any) => ({
        id: provider.id,
        name: provider.name,
        models: (provider.models || []).map((model: any) => ({
          id: model.id,
          name: model.name,
          maxResolution: model.features?.maxResolution,
          supportedSizes: model.features?.supportedSizes ?? []
        }))
      }))

      // 扁平列表
      availableModels.value = []
      for (const provider of providers) {
        for (const model of provider.models || []) {
          availableModels.value.push({
            key: `${provider.id}:${model.id}`,
            label: `${provider.name} - ${model.name}`,
            providerId: provider.id,
            modelId: model.id,
            supportedSizes: model.features?.supportedSizes ?? []
          })
        }
      }

      // 优先项目默认模型
      if (project?.value?.defaultProviderId && project?.value?.defaultModelId) {
        const projectDefaultKey = `${project.value.defaultProviderId}:${project.value.defaultModelId}`
        if (availableModels.value.some(m => m.key === projectDefaultKey)) {
          selectedModelKey.value = projectDefaultKey
          return
        }
      }
      // 否则选中第一个
      if (availableModels.value.length > 0) {
        selectedModelKey.value = availableModels.value[0].key
      }
    } catch (error) {
      console.error('[useImageModels] 加载模型失败:', error)
    }
  }

  /** 模型变更：更新选中并（有项目时）保存为项目默认 */
  function onModelChange(key: string): void {
    const model = availableModels.value.find(m => m.key === key)
    if (!model) return
    if (project?.value?.id) {
      window.electronAPI.portrait.updateProject({
        id: project.value.id,
        defaultProviderId: model.providerId,
        defaultModelId: model.modelId
      }).then(result => {
        if (!result.success) console.error('[useImageModels] 保存模型设置失败:', result.error)
      })
    }
  }

  return {
    providerModels,
    availableModels,
    filteredProviderModels,
    selectedModelKey,
    selectedModel,
    modelSizes,
    filterModels,
    load,
    onModelChange
  }
}
