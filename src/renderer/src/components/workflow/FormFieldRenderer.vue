<template>
  <!-- 按 Schema 字段类型分发渲染 -->
  <!-- 单行文本：变量选择器内嵌输入框右侧（suffix） -->
  <div v-if="field.type === 'text'" class="field-with-picker">
    <el-input ref="inputRef" :model-value="modelValue as string" :placeholder="field.placeholder"
      @update:model-value="v => set(v)">
      <template v-if="fieldSupportsTemplate(field)" #suffix>
        <VariablePicker :nodes="pickerNodes.nodes" :edges="pickerNodes.edges" :exclude-node-id="pickerNodes.excludeNodeId" @insert="p => insertAtCursor(p)" />
      </template>
    </el-input>
  </div>
  <!-- 多行文本：变量选择器紧贴输入框右上角（textarea 的 suffix slot 不生效，用绝对定位） -->
  <div v-else-if="field.type === 'textarea'" class="field-textarea">
    <el-input ref="inputRef" :model-value="modelValue as string" :placeholder="field.placeholder"
      type="textarea" :rows="4" @update:model-value="v => set(v)" />
    <div v-if="fieldSupportsTemplate(field)" class="ta-picker">
      <VariablePicker :nodes="pickerNodes.nodes" :edges="pickerNodes.edges" :exclude-node-id="pickerNodes.excludeNodeId" @insert="p => insertAtCursor(p)" />
    </div>
  </div>
  <el-input-number v-else-if="field.type === 'number'" :model-value="num(modelValue)" :min="field.min" :max="field.max"
    :placeholder="field.placeholder" style="width: 100%" @update:model-value="v => set(v)" />
  <el-select v-else-if="field.type === 'select'" :model-value="modelValue" :placeholder="field.placeholder || '请选择'"
    clearable style="width: 100%" @update:model-value="v => set(v)">
    <el-option v-for="o in field.options" :key="String(o.value)" :label="o.label" :value="o.value" />
  </el-select>
  <el-select v-else-if="field.type === 'select-dynamic'" :model-value="modelValue"
    :placeholder="field.placeholder || '请选择'" clearable filterable :multiple="!!field.multi" style="width: 100%"
    @update:model-value="v => set(v)">
    <el-option v-for="o in dynamicOptions[field.source ?? ''] ?? []" :key="o.value" :label="o.label" :value="o.value" />
  </el-select>
  <el-switch v-else-if="field.type === 'switch'" :model-value="!!modelValue" @update:model-value="v => set(v)" />
  <div v-else-if="field.type === 'slider'" class="slider-row">
    <el-slider :model-value="num(modelValue) || field.min || 0" :min="field.min ?? 0" :max="field.max ?? 100"
      :step="field.step ?? 1" style="flex: 1; margin-right: 12px" @update:model-value="v => set(v)" />
    <span class="slider-value">{{ num(modelValue) }}</span>
  </div>

  <!-- Provider + 模型联动下拉 -->
  <div v-else-if="field.type === 'model-pair'" class="model-pair">
    <el-select :model-value="modelValue as string" placeholder="Provider" clearable filterable
      size="small" style="flex: 1" @update:model-value="v => { set(v); setKey('modelId', undefined) }">
      <el-option v-for="p in providers" :key="p.id" :label="p.name" :value="p.id" />
    </el-select>
    <el-select :model-value="props.model['modelId'] as string" placeholder="模型（留空自动）" clearable
      filterable size="small" style="flex: 1" @update:model-value="v => setKey('modelId', v)">
      <el-option v-for="m in currentProviderModels" :key="m.value" :label="m.label" :value="m.value" />
    </el-select>
  </div>

  <!-- 键值对列表 -->
  <div v-else-if="field.type === 'kv-list'" class="kv-list">
    <div v-for="(item, i) in kvList" :key="i" class="kv-row">
      <el-input v-model="item.key" :placeholder="field.keyPlaceholder || '键'" size="small" @change="syncKv" />
      <el-input v-model="item.value" :placeholder="field.valuePlaceholder || '值'" size="small" @change="syncKv" />
      <el-button text type="danger" size="small" @click="kvList.splice(i, 1); syncKv()">✕</el-button>
    </div>
    <el-button size="small" text type="primary" @click="kvList.push({ key: '', value: '' }); syncKv()">+ 添加</el-button>
  </div>

  <!-- 条件分支编辑器 -->
  <div v-else-if="field.type === 'branches'" class="branches-editor">
    <div v-for="(br, i) in branches" :key="i" class="branch-card">
      <div class="branch-head">
        <el-tag size="small" type="primary">{{ br.branchId }}</el-tag>
        <el-input v-model="br.label" placeholder="分支名" size="small" style="width: 120px" @change="syncBranches" />
        <el-button text type="danger" size="small" @click="branches.splice(i, 1); syncBranches()">删除</el-button>
      </div>
      <div v-for="(cond, j) in br.conditions" :key="j" class="cond-row">
        <el-input v-model="cond.left" placeholder="左值 {{节点.字段}}" size="small" @change="syncBranches" />
        <el-select v-model="cond.operator" size="small" style="width: 110px" @change="syncBranches">
          <el-option label="等于" value="eq" /><el-option label="不等于" value="ne" />
          <el-option label="大于" value="gt" /><el-option label="≥" value="gte" />
          <el-option label="小于" value="lt" /><el-option label="≤" value="lte" />
          <el-option label="包含" value="contains" /><el-option label="不包含" value="not_contains" />
          <el-option label="为空" value="is_empty" /><el-option label="非空" value="not_empty" />
          <el-option label="正则" value="regex" /><el-option label="开始为" value="starts_with" /><el-option label="结束为" value="ends_with" />
        </el-select>
        <el-input v-if="!['is_empty', 'not_empty'].includes(cond.operator)" v-model="cond.right"
          placeholder="右值" size="small" @change="syncBranches" />
        <el-button text type="danger" size="small"
          @click="br.conditions.splice(j, 1); syncBranches()">✕</el-button>
      </div>
      <el-button size="small" text type="primary" @click="br.conditions.push({ left: '', operator: 'eq', right: '' }); syncBranches()">+ 条件</el-button>
    </div>
    <el-button size="small" text type="primary"
      @click="branches.push({ branchId: `br${branches.length + 1}`, label: `分支${branches.length + 1}`, conditions: [] }); syncBranches()">+ 分支</el-button>
  </div>

  <!-- 开始节点输入参数编辑器（每个参数一张卡片：键/名/类型/必填/校验/默认值 归属清晰） -->
  <div v-else-if="field.type === 'inputs-list'" class="kv-list">
    <template v-for="(item, i) in inputs" :key="i">
      <div class="input-card">
        <div class="input-card-head">
          <el-input v-model="item.key" placeholder="参数键（{{start.键}}）" size="small" @change="syncInputs" />
          <el-input v-model="item.label" placeholder="显示名" size="small" @change="syncInputs" />
          <el-button text type="danger" size="small" title="删除参数" @click="inputs.splice(i, 1); syncInputs()">✕</el-button>
        </div>
        <div class="input-card-sub">
          <el-select v-model="item.type" size="small" style="width: 108px" @change="syncInputs">
            <el-option label="单行文本" value="string" /><el-option label="多行文本" value="textarea" />
            <el-option label="数字" value="number" /><el-option label="布尔" value="boolean" />
            <el-option label="JSON" value="json" /><el-option label="下拉" value="select" />
            <el-option label="文件" value="file" /><el-option label="模型" value="model" />
            <el-option label="动态下拉" value="select-dynamic" />
          </el-select>
          <el-checkbox v-model="item.required" size="small" @change="syncInputs">必填</el-checkbox>
          <el-button text size="small" :class="{ 'card-more-on': validationOpen[i] }" @click="validationOpen[i] = !validationOpen[i]">校验{{ validationOpen[i] ? ' ▾' : ' ▴' }}</el-button>
          <span class="card-spacer" />
        </div>
        <div v-if="item.type === 'model'" class="input-card-modeltypes">
          <span class="default-label">模型类型</span>
          <el-select v-model="item.modelTypes" size="small" multiple collapse-tags clearable placeholder="全部（含文本/音频/图像等）" style="width: 220px" @change="syncInputs">
            <el-option label="文本" value="text" /><el-option label="音频" value="audio" />
            <el-option label="图像" value="image" /><el-option label="多模态" value="multimodal" />
          </el-select>
          <span class="model-types-hint">{{ modelRefHint(item) }}</span>
        </div>
        <div v-if="item.type === 'select-dynamic'" class="input-card-modeltypes">
          <span class="default-label">数据源</span>
          <el-select v-model="item.source" size="small" placeholder="选择动态数据源" style="width: 220px" @change="syncInputs">
            <el-option label="模板资产（资产中心·模板）" value="assets:template" />
            <el-option label="信息来源类别" value="infoSourceCategories" />
            <el-option label="信息来源分组" value="infoSourceTopics" />
            <el-option label="信息来源库（可多选）" value="infoSources" />
            <el-option label="知识库" value="knowledgeBases" />
            <el-option label="搜索引擎（已配置）" value="searchEngineConfigs" />
            <el-option label="技能库" value="skills" />
            <el-option label="工具凭据（API Key）" value="credentials" />
          </el-select>
          <el-checkbox v-model="item.multi" size="small" @change="syncInputs" title="多选（提交值为数组）">多选</el-checkbox>
          <span class="model-types-hint">{{ dynamicRefHint(item) }}</span>
        </div>
        <!-- 级联（声明式联动）：跟随同表单某字段值，自动填充本字段中"选项元数据[匹配属性]==跟随值"的选项 -->
        <div v-if="item.type === 'select-dynamic' || item.type === 'select'" class="input-card-linkage">
          <span class="default-label">级联</span>
          <el-select :model-value="item.linkage?.watch ?? ''" size="small" placeholder="跟随字段（可选）" clearable style="width: 160px"
            @update:model-value="v => setLinkage(item, 'watch', v)" @clear="setLinkage(item, 'watch', '')">
            <el-option v-for="f in otherInputKeys(item.key)" :key="f.key" :label="f.label || f.key" :value="f.key" />
          </el-select>
          <el-input v-if="item.linkage?.watch" :model-value="item.linkage.matchBy ?? ''" size="small" placeholder="选项属性（如 topicId）" style="width: 170px"
            @update:model-value="v => setLinkage(item, 'matchBy', v)" />
          <span v-if="item.linkage?.watch" class="model-types-hint">
            联动：跟随「{{ inputLabel(item.linkage.watch) }}」自动填充选项属性 {{ item.linkage.matchBy || '?' }} 匹配的项（多选=全选）
          </span>
        </div>
        <!-- 数据来源（select 也可声明 source：选项由内置数据源加载；留空=手写下方选项） -->
        <div v-if="item.type === 'select'" class="input-card-modeltypes">
          <span class="default-label">数据来源</span>
          <el-select v-model="item.source" size="small" placeholder="静态选项（留空）" clearable style="width: 220px" @change="syncInputs">
            <el-option label="模板资产（资产中心·模板）" value="assets:template" />
            <el-option label="信息来源类别" value="infoSourceCategories" />
            <el-option label="信息来源分组" value="infoSourceTopics" />
            <el-option label="信息来源库（可多选）" value="infoSources" />
            <el-option label="知识库" value="knowledgeBases" />
            <el-option label="搜索引擎（已配置）" value="searchEngineConfigs" />
            <el-option label="技能库" value="skills" />
            <el-option label="工具凭据（API Key）" value="credentials" />
          </el-select>
          <span class="model-types-hint">选数据源后选项由系统加载（可与级联组合）；留空=手写下方选项</span>
        </div>
        <div v-if="item.type !== 'select' && item.type !== 'model'" class="input-card-default">
          <span class="default-label">默认值</span>
          <el-input :model-value="String(item.defaultValue ?? '')" placeholder="定时触发时用" size="small"
            @update:model-value="v => { item.defaultValue = v; syncInputs() }" />
        </div>
        <div v-if="item.type === 'select' && !item.source" class="options-table">
          <div class="options-table-row options-table-head">
            <span class="opt-idx">#</span>
            <span class="opt-label">选项</span>
            <span class="opt-value">值</span>
            <span class="opt-default">默认</span>
            <span class="opt-del"></span>
          </div>
          <div v-for="(opt, j) in item.options ?? []" :key="j" class="options-table-row">
            <span class="opt-idx">{{ j + 1 }}</span>
            <el-input v-model="opt.label" placeholder="选项" size="small" class="opt-label" @change="syncInputs" />
            <el-input v-model="opt.value" placeholder="值" size="small" class="opt-value" @change="syncInputs" />
            <el-radio v-model="item.defaultValue" :value="opt.value" class="opt-default" @change="syncInputs" />
            <el-button text type="danger" size="small" class="opt-del" @click="item.options!.splice(j, 1); syncInputs()">✕</el-button>
          </div>
          <div class="kv-row" style="padding-left: 4px; margin-bottom: 0">
            <el-checkbox v-model="item.multi" size="small" @change="syncInputs">多选</el-checkbox>
            <el-button size="small" text type="primary" @click="(item.options ??= []).push({ label: '', value: '' }); syncInputs()">+ 选项</el-button>
          </div>
        </div>
        <!-- 校验规则配置（除必填外；错误提示由系统按规则自动生成） -->
        <div v-if="validationOpen[i]" class="options-sub validation-sub">
          <template v-if="isTextInput(item)">
            <div class="kv-row" style="padding-left: 4px">
              <span class="default-label">最小长度</span>
              <el-input-number v-model="item.validation!.minLength" :min="0" size="small" controls-position="right" style="width: 90px" @change="syncInputs" />
              <span class="default-label">最大长度</span>
              <el-input-number v-model="item.validation!.maxLength" :min="0" size="small" controls-position="right" style="width: 90px" @change="syncInputs" />
            </div>
            <div class="kv-row" style="padding-left: 4px">
              <span class="default-label">正则</span>
              <el-input v-model="item.validation!.pattern" size="small" style="width: 180px" placeholder='如 ^\d{11}$' @change="syncInputs" />
            </div>
          </template>
          <template v-else-if="item.type === 'number'">
            <div class="kv-row" style="padding-left: 4px">
              <span class="default-label">最小值</span>
              <el-input-number v-model="item.validation!.min" size="small" controls-position="right" style="width: 110px" @change="syncInputs" />
              <span class="default-label">最大值</span>
              <el-input-number v-model="item.validation!.max" size="small" controls-position="right" style="width: 110px" @change="syncInputs" />
            </div>
          </template>
        </div>
      </div>
    </template>
    <el-button size="small" text type="primary" @click="inputs.push({ key: '', label: '', type: 'string', validation: {} }); syncInputs()">+ 添加参数</el-button>
  </div>

  <!-- 审核可编辑字段编辑器 -->
  <div v-else-if="field.type === 'fields-list'" class="kv-list">
    <div v-for="(item, i) in editableFields" :key="i" class="kv-row">
      <el-input v-model="item.key" placeholder="字段键（payload 顶层）" size="small" @change="syncFields" />
      <el-input v-model="item.label" placeholder="显示名" size="small" @change="syncFields" />
      <el-button text type="danger" size="small" @click="editableFields.splice(i, 1); syncFields()">✕</el-button>
    </div>
    <el-button size="small" text type="primary" @click="editableFields.push({ key: '', label: '', type: 'string' }); syncFields()">+ 字段</el-button>
  </div>

  <!-- OAS 接口下拉（从同节点 oasSpec 本地解析） -->
  <div v-else-if="field.type === 'oas-operations'" class="oas-ops">
    <el-select :model-value="String(modelValue ?? '')" placeholder="请先粘贴 OpenAPI JSON" clearable filterable
      style="width: 100%" @update:model-value="v => set(v)">
      <el-option v-for="op in oasOperations" :key="op.operationId"
        :label="`${op.method}  ${op.path}${op.summary ? ' — ' + op.summary : ''}`" :value="op.operationId" />
    </el-select>
    <div v-if="oasError" class="oas-error">{{ oasError }}</div>
    <div v-else-if="!oasOperations.length && model['oasSpec']" class="oas-hint">JSON 中没有可调用的接口</div>
  </div>

  <!-- OAS 参数编辑（kv-list + 按接口声明生成） -->
  <div v-else-if="field.type === 'oas-params'" class="kv-list">
    <div v-for="(item, i) in kvList" :key="i" class="kv-row">
      <el-input v-model="item.key" placeholder="参数名" size="small" @change="syncKv" />
      <el-input v-model="item.value" placeholder="值，支持变量模板" size="small" @change="syncKv" />
      <el-button text type="danger" size="small" @click="kvList.splice(i, 1); syncKv()">✕</el-button>
    </div>
    <div class="kv-row" style="justify-content: flex-start">
      <el-button size="small" text type="primary" @click="kvList.push({ key: '', value: '' }); syncKv()">+ 参数</el-button>
      <el-button size="small" text type="primary" @click="generateOasParams">⟳ 按接口定义生成</el-button>
    </div>
    <div v-if="oasParamHint" class="oas-hint">{{ oasParamHint }}</div>
  </div>

  <!-- P0 工具：工具下拉（预设 + 自定义，选中后按 schema 预生成参数） -->
  <div v-else-if="field.type === 'tool-select'" class="field-with-picker">
    <el-select :model-value="String(modelValue ?? '')" placeholder="选择工具" clearable filterable
      style="width: 100%" @update:model-value="onToolSelected">
      <el-option-group v-for="g in toolGroups" :key="g" :label="g">
        <el-option v-for="t in toolList.filter(x => x.group === g)" :key="t.id" :label="t.label" :value="t.id" />
      </el-option-group>
    </el-select>
    <div v-if="selectedTool?.description" class="oas-hint">{{ selectedTool.description }}</div>
  </div>

  <!-- P0 工具：凭据下拉 -->
  <div v-else-if="field.type === 'tool-credential-select'" class="field-with-picker">
    <el-select :model-value="String(modelValue ?? '')" placeholder="选择凭据（可选）" clearable filterable
      style="width: 100%" @update:model-value="v => set(v)">
      <el-option v-for="c in credentialList" :key="c.id" :label="c.name" :value="c.id" />
    </el-select>
    <div v-if="!credentialList.length" class="oas-hint">暂无凭据，请到「设置 → 工具」添加（API Key 加密存储）</div>
  </div>

  <!-- P0 工具：参数编辑（按选中工具 schema 生成行，值支持 {{模板}}） -->
  <div v-else-if="field.type === 'tool-params'" class="kv-list">
    <div v-for="(item, i) in toolParamRows" :key="i" class="kv-row">
      <span class="param-key">{{ item.label }}<span v-if="item.required" class="req">*</span></span>
      <el-input v-model="item.value" :placeholder="typeHint(item.type)" size="small" @change="syncToolParams" />
    </div>
    <div v-if="!toolParamRows.length" class="oas-hint">选择工具后按参数 schema 生成；值支持 {{模板}} 变量引用</div>
  </div>

  <!-- 技能：技能下拉（内置 + 用户，选中后按 inputs schema 预生成参数） -->
  <div v-else-if="field.type === 'skill-select'" class="field-with-picker">
    <el-select :model-value="String(modelValue ?? '')" placeholder="选择技能" clearable filterable
      style="width: 100%" @update:model-value="onSkillSelected">
      <el-option-group v-for="g in skillGroups" :key="g" :label="g">
        <el-option v-for="s in skillList.filter(x => x.group === g)" :key="s.id" :label="s.label" :value="s.id" />
      </el-option-group>
    </el-select>
    <div v-if="selectedSkill?.description" class="oas-hint">{{ selectedSkill.description }}</div>
  </div>

  <!-- 技能：参数编辑（按选中技能 inputs schema 生成行，值支持 {{模板}}） -->
  <div v-else-if="field.type === 'skill-params'" class="kv-list">
    <div v-for="(item, i) in skillParamRows" :key="i" class="kv-row skill-param-row">
      <span class="param-key" :title="item.help">{{ item.label }}<span v-if="item.required" class="req">*</span></span>
      <el-input v-if="item.type === 'string' || item.type === 'textarea'" v-model="item.value"
        :type="item.type === 'textarea' ? 'textarea' : undefined" :rows="item.type === 'textarea' ? 3 : undefined"
        :placeholder="item.help || '值，支持 {{模板}}'" size="small" @change="syncSkillParams" />
      <el-input-number v-else-if="item.type === 'number'" :model-value="Number(item.value) || undefined"
        size="small" style="width: 160px"
        @update:model-value="v => { item.value = v === undefined || v === null ? '' : String(v); syncSkillParams() }" />
      <el-switch v-else-if="item.type === 'boolean'" :model-value="item.booleanValue" size="small"
        @update:model-value="v => { item.booleanValue = !!v; syncSkillParams() }" />
      <el-select v-else-if="item.type === 'select'" v-model="item.value" size="small" style="width: 100%"
        @change="syncSkillParams">
        <el-option v-for="o in item.options" :key="String(o.value)" :label="o.label" :value="String(o.value)" />
      </el-select>
      <el-input v-else v-model="item.value" :placeholder="item.help || '值，支持 {{模板}}'" size="small" @change="syncSkillParams" />
    </div>
    <div v-if="!skillParamRows.length" class="oas-hint">选择技能后按参数 schema 自动带出；参数值支持 {{变量}} 引用</div>
  </div>

  <!-- agent 工具绑定编辑器（25 号 M2：多选 + 逐工具批准策略/上限/静态入参） -->
  <div v-else-if="field.type === 'tool-bindings'" class="bindings-editor">
    <el-select
      :model-value="bindings.map(b => b.tool)"
      multiple filterable collapse-tags clearable placeholder="选择工具（可多选）" style="width: 100%"
      @update:model-value="onBindingToolsChange"
    >
      <el-option v-for="o in dynamicOptions[field.source ?? ''] ?? []" :key="o.value" :label="o.label" :value="o.value" />
    </el-select>
    <div v-for="b in bindings" :key="b.tool" class="binding-card">
      <div class="binding-head">
        <span class="binding-name">{{ b.tool }}</span>
        <el-tag v-if="bindingRequiresApproval(b.tool)" size="small" type="warning" disable-transitions>默认需批准</el-tag>
        <span class="binding-spacer" />
        <el-button text type="danger" size="small" title="移除工具" @click="removeBinding(b.tool)">✕</el-button>
      </div>
      <div class="binding-row">
        <el-select v-model="b.approval" size="small" style="width: 150px" title="批准策略" @change="syncBindings">
          <el-option label="按危险级默认" value="inherit" />
          <el-option label="每次调用需批准" value="always" />
          <el-option label="免批准（放宽）" value="never" />
        </el-select>
        <el-input-number v-model="b.maxCalls" :min="1" size="small" controls-position="right"
          placeholder="调用上限" style="width: 120px" @change="syncBindings" />
        <span class="binding-hint">上限留空 = 不限</span>
      </div>
      <el-input v-model="b.configText" type="textarea" :rows="2" size="small"
        placeholder='静态入参 JSON（可选）。如 {"maxResults":5}；静态键优先，LLM 不可覆盖'
        @change="syncBindingConfig(b)" />
      <div v-if="b.configError" class="binding-err">{{ b.configError }}</div>
    </div>
    <div v-if="!bindings.length" class="oas-hint">未选择工具；Agent 将只能直接回答，无法调用外部能力</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 单字段渲染器：按 CatalogFormField.type 分发到 Element Plus 组件或专用编辑器
 */
import { fieldSupportsTemplate, type CatalogFormField } from '@shared/types/workflow-node-forms'
import { listOperations, listParameters } from '@shared/utils/openapi-parser'
import type { WorkflowConditionBranch, WorkflowStartInput } from '@shared/types/workflow.types'
import VariablePicker from './VariablePicker.vue'
import { computed, inject, onMounted, reactive, ref, unref, type ComponentPublicInstance, type Ref } from 'vue'

// 变量选择器数据（NodeConfigPanel provide；缺省退化为空）
const pickerCtx = inject<{ nodes: Ref<any[]>; edges?: Ref<any[]>; excludeNodeId: unknown }>('wfPickerContext', { nodes: ref([]), edges: ref([]), excludeNodeId: '' })
const pickerNodes = computed(() => ({ nodes: unref(pickerCtx.nodes), edges: unref(pickerCtx.edges), excludeNodeId: unref(pickerCtx.excludeNodeId) }))
const inputRef = ref<ComponentPublicInstance | null>(null)

/** 光标处插入 {{path}}（P10：拿不到原生 ref 时追加末尾兜底） */
function insertAtCursor(path: string) {
  const comp: any = inputRef.value
  const el: HTMLInputElement | HTMLTextAreaElement | undefined =
    comp?.textarea ?? comp?.input ?? comp?.$el?.querySelector?.('textarea, input')
  const text = String(props.model[props.field.key] ?? '')
  const snippet = `{{${path}}}`
  if (el && typeof el.selectionStart === 'number') {
    const start = el.selectionStart
    props.model[props.field.key] = text.slice(0, start) + snippet + text.slice(el.selectionEnd ?? start)
    emit('change')
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + snippet.length
      if (el.setSelectionRange) el.setSelectionRange(pos, pos)
    })
  } else {
    props.model[props.field.key] = text + snippet
    emit('change')
  }
}

const props = defineProps<{
  field: CatalogFormField
  model: Record<string, unknown>
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>
}>()
const emit = defineEmits<{ (e: 'change'): void }>()

const modelValue = computed(() => props.model[props.field.key])

function set(v: unknown) {
  props.model[props.field.key] = v
  emit('change')
}
function num(v: unknown): number | undefined {
  const n = Number(v)
  return v === undefined || v === null || v === '' || Number.isNaN(n) ? undefined : n
}

// ── model-pair ──
const providers = computed<any[]>(() => props.dynamicOptions.providers ?? [])
const currentProviderModels = computed(() =>
  providers.value.find(p => p.id === modelValue.value)?.models ?? []
)
function setKey(key: string, v: unknown) {
  props.model[key] = v
  emit('change')
}

// ── kv-list ──
const kvList = computed<any[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as any[]
  }
  return raw as any[]
})
function syncKv() { emit('change') }

// ── branches ──
const branches = computed<WorkflowConditionBranch[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as WorkflowConditionBranch[]
  }
  return raw as WorkflowConditionBranch[]
})
function syncBranches() { emit('change') }

// ── inputs-list ──
const inputs = computed<WorkflowStartInput[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as WorkflowStartInput[]
  }
  // 渲染前兜底初始化 validation（旧数据无此字段）
  for (const it of raw as WorkflowStartInput[]) {
    if (!it.validation) it.validation = {}
  }
  return raw as WorkflowStartInput[]
})
function syncInputs() { emit('change') }

/** 级联声明写入（watch 清空则删除 linkage，保持 JSON 干净） */
function setLinkage(item: WorkflowStartInput, key: 'watch' | 'matchBy', v: unknown): void {
  if (!item.linkage) item.linkage = { watch: '', matchBy: '' }
  if (key === 'watch') {
    const watch = String(v ?? '').trim()
    if (!watch) item.linkage = undefined // 未选跟随字段 → 无级联
    else item.linkage.watch = watch
  } else {
    item.linkage.matchBy = String(v ?? '').trim()
  }
  syncInputs()
}

/** 同表单其他字段（级联可选的被监听字段，排除自身） */
function otherInputKeys(excludeKey: string): Array<{ key: string; label: string }> {
  return inputs.value
    .filter(f => f.key && f.key !== excludeKey)
    .map(f => ({ key: f.key as string, label: f.label || f.key as string }))
}

/** 字段显示名（级联提示文案用） */
function inputLabel(key: string): string {
  const f = inputs.value.find(x => x.key === key)
  return f ? f.label || key : key
}

/** 校验配置面板展开状态（按行 index；简单场景删除错位可接受） */
const validationOpen = reactive<Record<number, boolean>>({})

/** 文本类输入（string/textarea）才有长度/正则校验 */
function isTextInput(item: WorkflowStartInput): boolean {
  return item.type === 'string' || item.type === 'textarea'
}

/** 模型字段的引用提示（用反引号规避模板里 {{}} 与插值歧义） */
function modelRefHint(item: WorkflowStartInput): string {
  const k = item.key || '键'
  return `节点用 \`{{start.${k}.providerConfigId}}\` / \`{{start.${k}.modelId}}\` 引用`
}

/** 动态下拉字段的引用提示（值=资产 ID/主题 id/知识库 id） */
function dynamicRefHint(item: WorkflowStartInput): string {
  const k = item.key || '键'
  return `运行表单下拉选择，值经 \`{{start.${k}}}\` 引用`
}

// ── fields-list ──
const editableFields = computed<any[]>(() => {
  const raw = props.model[props.field.key]
  if (!Array.isArray(raw)) {
    props.model[props.field.key] = []
    return props.model[props.field.key] as any[]
  }
  return raw as any[]
})
function syncFields() { emit('change') }

// ── OAS（C5 自定义接口）：解析纯函数来自 @shared，双端同源 ──
const oasSpecText = computed(() => String(props.model['oasSpec'] ?? ''))
const oasResult = computed(() => {
  if (!oasSpecText.value.trim()) return { operations: [] as Array<{ operationId: string; method: string; path: string; summary?: string }>, error: '' }
  const r = listOperations(oasSpecText.value)
  return r.ok ? { operations: r.operations, error: '' } : { operations: [], error: r.error }
})
const oasOperations = computed(() => oasResult.value.operations)
const oasError = computed(() => oasResult.value.error)

const oasParamHint = ref('')
/** 按所选 operationId 的 OAS 声明生成参数行（保留已填值；必填标记进 hint） */
function generateOasParams() {
  const opId = String(props.model['operationId'] ?? '')
  if (!oasSpecText.value.trim() || !opId) {
    oasParamHint.value = '请先粘贴 OpenAPI JSON 并选择接口'
    return
  }
  const declared = listParameters(oasSpecText.value, opId)
  if (declared.length === 0) {
    oasParamHint.value = '该接口没有声明参数（可手动添加自由参数进请求体）'
    return
  }
  const existing = new Map(kvList.value.map((x: any) => [String(x.key), x]))
  // F16：声明参数生成行 + 保留用户手动加的自由参数（进请求体的透传键）
  const declaredRows = declared.map(d => ({
    key: d.name,
    value: existing.get(d.name)?.value ?? '',
  }))
  const declaredNames = new Set(declared.map(d => d.name))
  const freeRows = kvList.value.filter((x: any) => x.key && !declaredNames.has(String(x.key)))
  props.model[props.field.key] = [...declaredRows, ...freeRows]
  const missing = declared.filter(d => d.required && !String(existing.get(d.name)?.value ?? '').trim()).map(d => d.name)
  oasParamHint.value = `已生成 ${declared.length} 个参数`
    + (freeRows.length ? `，保留 ${freeRows.length} 个自由参数` : '')
    + (missing.length ? `；必填未填：${missing.join('、')}` : '')
  emit('change')
}

// ── P0 工具（tool-call 节点：工具下拉 / 凭据下拉 / 参数按 schema 生成） ──
const toolList = ref<Array<Record<string, unknown> & { group: string }>>([])
const credentialList = ref<any[]>([])
const toolGroups = computed(() => [...new Set(toolList.value.map(t => t.group))])
const selectedTool = computed(() => toolList.value.find(t => t.id === String(props.model['toolId'] ?? '')))

async function loadTools() {
  try {
    const api = (window as never as { electronAPI: { tools: any } }).electronAPI.tools
    const [presets, customs, creds] = await Promise.all([
      api.presets(), api.listCustom(), api.listCredentials(),
    ])
    toolList.value = [
      ...(customs.data ?? []).map((t: any) => ({ ...t, group: '自定义工具', label: `[自定义] ${t.name}` })),
      ...(presets.data ?? []).map((t: any) => ({ ...t, group: '预设工具', label: `[预设] ${t.name}` })),
    ]
    credentialList.value = creds.data ?? []
  } catch {
    // 工具列表拉取失败静默（节点配置仍可手填）
  }
}

function onToolSelected(toolId: unknown) {
  set(toolId)
  const t = toolList.value.find(x => x.id === String(toolId ?? ''))
  const schema = t?.paramsSchema ?? []
  if (schema.length && !(props.model['params'] as any[] ?? []).length) {
    props.model['params'] = schema.map((f: any) => ({ key: f.key, value: '' }))
    emit('change')
  }
}

/** 参数行：schema 与已填值合并（label/required 来自工具定义） */
const toolParamRows = computed<Array<{ key: string; label: string; required: boolean; type: string; value: string }>>(() => {
  const schema = selectedTool.value?.paramsSchema ?? []
  const filled = new Map((props.model['params'] as Array<{ key: string; value: string }> ?? []).map(p => [p.key, p.value]))
  return schema.map((f: any) => ({
    key: f.key,
    label: f.label || f.key,
    required: !!f.required,
    type: f.type ?? 'string',
    value: filled.get(f.key) ?? '',
  }))
})

function syncToolParams() {
  props.model['params'] = toolParamRows.value.map(r => ({ key: r.key, value: r.value }))
  emit('change')
}

function typeHint(t: string): string {
  return { string: '文本，支持 {{模板}}', number: '数字', boolean: 'true/false', json: 'JSON', select: '下拉选项值' }[t] ?? '值，支持 {{模板}}'
}

// ── 技能（skill-call 节点：技能下拉 / 参数按 inputs schema 生成） ──
const skillList = ref<Array<Record<string, unknown> & { group: string; label: string }>>([])
const skillGroups = computed(() => [...new Set(skillList.value.map(s => s.group))])
const selectedSkill = computed(() => skillList.value.find(s => s.id === String(props.model['skillId'] ?? '')))

async function loadSkills() {
  try {
    const api = (window as never as { electronAPI: { skills: any } }).electronAPI.skills
    const r = await api.list()
    const all = r?.data ?? []
    skillList.value = all.map((s: any) => ({
      ...s,
      group: s.source === 'builtin' ? '内置技能' : '我的技能',
      label: `[${s.source === 'builtin' ? '内置' : '自定义'}] ${s.name}（${s.id}）`,
    }))
  } catch {
    // 技能列表拉取失败静默（节点配置仍可手填 skillId）
  }
}

function onSkillSelected(v: unknown) {
  set(v)
  const s = skillList.value.find(x => x.id === String(v ?? ''))
  const schema = (s as any)?.inputs ?? []
  if (schema.length && !(props.model['inputs'] as any[] ?? []).length) {
    props.model['inputs'] = schema.map((f: any) => ({
      key: f.key,
      value: f.defaultValue !== undefined ? String(f.defaultValue) : '',
    }))
    emit('change')
  }
}

/** 参数行：技能 inputs schema 与已填值合并（label/required/type/options 来自技能定义） */
const skillParamRows = computed<Array<{ key: string; label: string; required: boolean; type: string; value: string; booleanValue: boolean; options: Array<{ label: string; value: string | number }>; help: string }>>(() => {
  const schema = (selectedSkill.value as any)?.inputs ?? []
  const filled = new Map((props.model['inputs'] as Array<{ key: string; value: string }> ?? []).map(p => [p.key, p.value]))
  return schema.map((f: any) => {
    const raw = filled.get(f.key)
    const isBool = f.type === 'boolean'
    return {
      key: f.key,
      label: f.label || f.key,
      required: !!f.required,
      type: f.type ?? 'string',
      value: raw !== undefined ? String(raw) : (f.defaultValue !== undefined ? String(f.defaultValue) : ''),
      booleanValue: isBool ? (raw === 'true' || (raw === undefined && !!f.defaultValue)) : false,
      options: f.options ?? [],
      help: f.help ?? '',
    }
  })
})

function syncSkillParams() {
  props.model['inputs'] = skillParamRows.value.map(r => ({
    key: r.key,
    value: r.type === 'boolean' ? (r.booleanValue ? 'true' : 'false') : String(r.value ?? ''),
  }))
  emit('change')
}

// ── tool-bindings（agent-loop 工具白名单，25 号 M2 批3）──
interface BindingRow {
  tool: string
  approval: 'inherit' | 'always' | 'never'
  maxCalls: number | undefined
  configText: string
  configError: string
  /** 非 UI 编辑位但契约存在的字段原样透传（review C7：credentialId/descriptionOverride
   *  曾被全量重建抹掉——导入/手编 JSON 的存量配置一次普通编辑即失） */
  rest: Record<string, unknown>
}
/** 动态选项扩展位（NodeConfigPanel 映射时带出 requiresApproval） */
type ToolOption = { label: string; value: string; requiresApproval?: boolean }
const toolOptions = computed<ToolOption[]>(() => (props.dynamicOptions[props.field.source ?? ''] ?? []) as ToolOption[])

/** 兼容读：存量 string[] 与新 AgentToolBinding[] 归一为编辑行 */
const bindings = computed<BindingRow[]>(() => {
  const raw = props.model[props.field.key]
  const list = Array.isArray(raw) ? raw : []
  const rows: BindingRow[] = list.map((item: unknown): BindingRow => {
    if (typeof item === 'string') return { tool: item, approval: 'inherit', maxCalls: undefined, configText: '', configError: '', rest: {} }
    const b = (item ?? {}) as { tool?: string; approval?: BindingRow['approval']; maxCalls?: number; config?: Record<string, unknown>; configTextDraft?: string }
    const knownKeys = new Set(['tool', 'approval', 'maxCalls', 'config'])
    const rest: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
      if (!knownKeys.has(k)) rest[k] = v
    }
    let configText = ''
    let configError = ''
    if (b.config && typeof b.config === 'object' && Object.keys(b.config).length) {
      configText = JSON.stringify(b.config, null, 0)
    } else if (typeof b.configTextDraft === 'string') {
      // 未解析成功的 JSON 草稿回显（review C6：曾随行重建静默清空用户输入）
      configText = b.configTextDraft
      configError = 'JSON 未保存：请修正格式'
    }
    return {
      tool: String(b.tool ?? ''),
      approval: b.approval ?? 'inherit',
      maxCalls: b.maxCalls,
      configText,
      configError,
      rest,
    }
  }).filter(b => b.tool)
  return rows
})

function bindingRequiresApproval(tool: string): boolean {
  return !!toolOptions.value.find(o => o.value === tool)?.requiresApproval
}

/** 编辑行 → 持久化形态（缺省值不落 JSON，保持配置干净） */
function bindingToValue(b: BindingRow): Record<string, unknown> {
  const out: Record<string, unknown> = { ...b.rest, tool: b.tool }
  if (b.approval !== 'inherit') {
    out.approval = b.approval
    // never 放宽必须带显式确认位（review B3：引擎对无确认位的 never 降级 inherit）
    if (b.approval === 'never') out.approvalNeverConfirmed = true
  }
  if (b.maxCalls !== undefined && b.maxCalls !== null && Number(b.maxCalls) > 0) out.maxCalls = Number(b.maxCalls)
  if (b.configText.trim()) {
    try {
      const parsed = JSON.parse(b.configText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length) out.config = parsed
    } catch {
      // 非法草稿落 configTextDraft 占位（review C6：曾静默丢配置且错误提示消失）
      out.configTextDraft = b.configText
    }
  }
  return out
}

function syncBindings() {
  props.model[props.field.key] = bindings.value.map(bindingToValue)
  emit('change')
}

/** 多选变化：新增工具追加 inherit 空绑定；取消勾选移除（保持选择序） */
function onBindingToolsChange(names: unknown) {
  const selected = Array.isArray(names) ? names.map(String) : []
  props.model[props.field.key] = selected.map(tool => {
    const existing = bindings.value.find(b => b.tool === tool)
    return existing ? bindingToValue(existing) : { tool }
  })
  emit('change')
}

function removeBinding(tool: string) {
  props.model[props.field.key] = bindings.value.filter(b => b.tool !== tool).map(bindingToValue)
  emit('change')
}

/** 静态入参 JSON 校验 + 回写：合法即落 config；非法只标行内错误——
 *  不会清掉用户正在编辑的草稿（草稿经 configTextDraft 存续，review C6） */
function syncBindingConfig(b: BindingRow) {
  const text = b.configText.trim()
  if (!text) { b.configError = ''; syncBindings(); return }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      b.configError = '须是 JSON 对象（如 {"maxResults":5}）'
      return
    }
    b.configError = ''
    syncBindings()
  } catch {
    b.configError = 'JSON 解析失败，请检查格式'
  }
}

onMounted(() => { loadTools(); loadSkills() })
</script>

<style scoped>
.slider-row { display: flex; align-items: center; }
.slider-value { font-size: 12px; min-width: 30px; text-align: right; }
.kv-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
/* 键值对行：el-input 默认 width:100% 会占满整行——收窄为并排伸缩 */
.kv-list > .kv-row > .el-input { flex: 1 1 0; width: auto; min-width: 0; }
.kv-list > .kv-row > .el-select { flex: 0 0 auto; }
/* 开始节点输入参数：参数卡片（键/名/类型/必填/校验/默认值 归属清晰，一行并排） */
.input-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px; margin-bottom: 8px; background: var(--el-fill-color-lighter); transition: border-color .15s; }
.input-card:hover { border-color: var(--el-border-color); }
.input-card .el-input, .input-card .el-select { background: #fff; }
.input-card-head { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.input-card-head > .el-input { flex: 1 1 0; width: auto; min-width: 0; }
.input-card-sub { display: flex; gap: 8px; align-items: center; }
.card-spacer { flex: 1; }
/* 默认值独立一行：标签与输入框始终同行，避免 flex 换行分离 */
.input-card-default { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.input-card-default .el-input { flex: 1 1 0; width: auto; min-width: 0; }
.card-more-on { color: var(--el-color-primary); }
/* 下拉选项表格：# / 选项 / 值 / 默认值（单选） */
.options-table { margin-top: 6px; }
.options-table-row { display: grid; grid-template-columns: 24px 1fr 1fr 40px 24px; gap: 6px; align-items: center; margin-bottom: 4px; }
.options-table-head { font-size: 11px; color: var(--el-text-color-secondary); font-weight: 600; }
.options-table-row .el-input { width: 100%; }
.opt-idx, .opt-default, .opt-del { text-align: center; }
.options-table-row .no-absorber { text-align: center; }
.options-sub { margin: 6px 0 2px; }
.validation-sub { border-left: 2px solid var(--el-border-color-lighter); margin-bottom: 4px; padding-top: 2px; }
.default-label { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.model-pair { display: flex; gap: 6px; }
.field-with-picker { display: flex; align-items: center; gap: 4px; width: 100%; }
.field-with-picker > .el-input { flex: 1 1 0; width: auto; min-width: 0; }
/* 多行文本容器：变量按钮右上角贴边，textarea 右下留白避免遮挡 */
.field-textarea { position: relative; width: 100%; }
.field-textarea :deep(.el-textarea__inner) { padding-right: 40px; }
.ta-picker { position: absolute; top: 2px; right: 4px; z-index: 2; }
.branch-card { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.branch-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.cond-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.oas-error { color: var(--el-color-danger); font-size: 12px; margin-top: 4px; }
.oas-hint { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 4px; }
.param-key { font-size: 12px; min-width: 90px; color: var(--el-text-color-regular); }
.param-key .req { color: var(--el-color-danger); margin-left: 2px; }
/* 开始输入字段：数据来源 / 级联（联动）配置行 */
.input-card-linkage { display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.input-card-linkage .model-types-hint { width: 100%; }
/* agent 工具绑定卡片 */
.binding-card { border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px; margin-top: 6px; background: var(--el-fill-color-lighter); }
.binding-head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.binding-name { font-size: 12px; font-weight: 600; word-break: break-all; }
.binding-spacer { flex: 1; }
.binding-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.binding-hint { font-size: 11px; color: var(--el-text-color-secondary); }
.binding-err { color: var(--el-color-danger); font-size: 12px; margin-top: 4px; }
</style>
