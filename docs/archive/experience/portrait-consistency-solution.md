# 多角度人像生成人物一致性问题解决方案

## 问题背景

在使用 AI 图像生成服务（如阿里云 DashScope qwen-image）进行多角度人像生成时，经常出现以下问题：

1. **人物性别变化**：原始正面照是男性，生成的侧面/背面变成女性
2. **人物特征变化**：发型、服装、面部特征在不同角度之间不一致
3. **内容审核触发**：使用中文提示词容易触发云服务商的内容审核机制
4. **参考图片未被使用**：虽然传入了参考图片，但 API 调用时未实际使用

## 根本原因分析

### 1. 参考图片未传递给 API

在 `dashscope-image.provider.ts` 的 `generateImageMultimodal` 方法中，原本只发送了文本提示词，没有将参考图片添加到多模态消息的 `content` 数组中：

```typescript
// 错误的实现
content: [
  {
    text: request.prompt
  }
]
```

### 2. 提示词过于简单

原本的提示词只有角度信息：
```typescript
const fullPrompt = `${anglePrompt}, ${FULL_BODY_SUFFIX}, same person as reference image`
```

缺少基本人物特征描述，模型无法理解应该生成什么样的人。

### 3. 中文内容审核问题

用户保存的角色提示词可能包含敏感中文词汇（如"警察"、"刑侦"、"压迫感"等），直接使用会触发阿里云内容审核。

## 解决方案

### 1. 修复参考图片传递

修改 `dashscope-image.provider.ts`，在多模态消息中正确添加参考图片：

```typescript
// 构建content数组
const content: Array<{ text?: string; image?: string }> = []

// 如果有参考图片，先添加图片（图生图）
if (request.referenceImage) {
  content.push({
    image: request.referenceImage
  })
  console.log('[DashScope] 使用参考图片进行图生图')
}

// 添加文本提示词
content.push({
  text: request.prompt
})

const body: Record<string, any> = {
  model: model,
  input: {
    messages: [
      {
        role: 'user',
        content: content
      }
    ]
  },
  parameters: {
    size: `${request.width}*${request.height}`,
    watermark: false
  }
}

// 添加种子（保持一致性）
if (request.seed !== undefined && request.seed >= 0) {
  body.parameters.seed = request.seed
}
```

### 2. 重写提示词策略

#### 2.1 提取基本人物特征

新增 `extractBasicCharacterInfo` 函数，从角色信息中提取基本特征：

```typescript
function extractBasicCharacterInfo(character: PortraitCharacter): string {
  const parts: string[] = []

  // 性别
  if (character.gender === 'male') {
    parts.push('adult male')
  } else if (character.gender === 'female') {
    parts.push('adult female')
  }

  // 年龄范围
  if (character.age) {
    if (character.age < 20) {
      parts.push('young')
    } else if (character.age < 40) {
      parts.push('adult')
    } else if (character.age < 60) {
      parts.push('middle-aged')
    } else {
      parts.push('senior')
    }
  }

  // 种族
  if (character.race === 'asian') {
    parts.push('Asian')
  } else if (character.race === 'caucasian') {
    parts.push('Caucasian')
  } else if (character.race === 'african') {
    parts.push('African')
  }

  return parts.join(' ')
}
```

#### 2.2 优化角度提示词

```typescript
const ANGLE_PROMPT_MAP: Record<PortraitAngle, string> = {
  front: 'front view, facing the camera directly',
  left: 'left side profile view, showing the left side of the face and body',
  right: 'right side profile view, showing the right side of the face and body',
  back: 'back view, showing the back of the person'
}
```

#### 2.3 构建完整提示词

```typescript
// 提取基本人物特征
const basicInfo = extractBasicCharacterInfo(character)

// 构建完整提示词
const fullPrompt = `${CONSISTENCY_PREFIX}. ${basicInfo}. ${anglePrompt}. ${FULL_BODY_SUFFIX}. Keep the same facial features, hairstyle, clothing, and posture as in the reference image.`
```

其中：
- `CONSISTENCY_PREFIX = 'generate the exact same person as shown in the reference image'`
- `FULL_BODY_SUFFIX = 'full body shot, standing upright, complete figure from head to toe'`

#### 2.4 增强负面提示词

```typescript
const DEFAULT_NEGATIVE_PROMPT = 'cropped, half body, close-up, missing feet, missing head, multiple people, different person, different face, different clothes, different hairstyle, low quality, blurry, distorted'
```

### 3. 避免中文内容审核

1. **所有提示词使用英文**：避免触发中文敏感词审核
2. **不使用原始中文提示词**：多角度生成时完全依赖参考图片和提取的基本特征
3. **前端提示**：在输入框添加提示建议用户使用英文描述

## 关键代码修改文件

### 后端

1. **`src/main/image-providers/dashscope-image.provider.ts`**
   - 修改 `generateImageMultimodal` 方法
   - 添加参考图片到 content 数组
   - 添加 seed 参数支持

2. **`src/main/services/portrait.service.ts`**
   - 新增 `extractBasicCharacterInfo` 函数
   - 重写 `ANGLE_PROMPT_MAP`
   - 增强 `DEFAULT_NEGATIVE_PROMPT`
   - 修改 `generateAngles` 方法中的提示词构建逻辑

### 前端

1. **`src/renderer/src/components/portrait/CharacterEditor.vue`**
   - 默认提示词改为英文格式
   - 添加使用英文的建议提示

2. **`src/renderer/src/components/portrait/ChangeClothesDialog.vue`**
   - placeholder 改为英文示例

3. **`src/renderer/src/components/portrait/ChangeBackgroundDialog.vue`**
   - 自定义描述 placeholder 改为英文示例

## 效果验证

修改后，多角度生成能够：

1. ✅ 正确传递参考图片给 API
2. ✅ 保持人物性别一致
3. ✅ 保持发型、服装、面部特征一致
4. ✅ 避免触发内容审核
5. ✅ 生成正确的角度（左侧、右侧、背面）

## 经验总结

### 图生图（Image-to-Image）关键点

1. **参考图片必须正确传递**：检查 API 调用时是否真正发送了参考图片
2. **提示词辅助参考图片**：不能完全依赖参考图片，需要文字描述基本特征
3. **一致性强调**：明确要求"same person"、"same facial features"等

### 多模态 API 使用注意

1. **消息格式**：content 数组可以包含多个元素（图片 + 文本）
2. **顺序问题**：通常先放图片，再放文本描述
3. **seed 参数**：使用相同 seed 有助于保持一致性

### 避免内容审核

1. **使用英文提示词**：中文敏感词容易触发审核
2. **避开敏感词汇**：职业、制服等可能触发审核
3. **简化描述**：过于详细的描述可能意外触发审核

## 参考资料

- [阿里云 DashScope 多模态 API 文档](https://help.aliyun.com/zh/model-studio/)
- [图像生成一致性最佳实践](https://civitai.com/articles)