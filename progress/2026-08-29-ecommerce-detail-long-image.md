# 电商详情图（卖点宣传卡）2026-08-29

## 需求
电商商品介绍图：结合**卖点 + 规格**，先**规划需要多少张**，再**逐个生成**，每张 = 一个卖点/规格点，**卖点标题 + 说明文字 + 卖点特效图 + 参数表合到一张图里**（类似电商详情页的"卖点宣传卡"），**展示时用电商式浏览**（首图大图+缩略图切换）。不做合并长图。

## 实现（新建内置工作流）
`src/core/database/migrations/builtin-apps/ecommerce-detail-long-image.json`（id `builtin_def_ecommerce-detail-long-image`，appId `builtin_app_ecommerce_detail_long_image`）。

链路：start → detailPlan(llm-chat，卖点×规格→规划 N 张：每张 {title, desc, prompt, specs:[{label,value}]}) → loop1 逐张：
- img1(image-gen：卖点特效图，锁参考图商品，promptExtend=false)
- cardMd(code：拼 markdown = desc + `![卖点](imgUrl)` + 参数表)
- card1(report-image：`title=卖点标题`、`template=cardMd.result.markdown`、`templateId=ecommerceSellpoint`、`width=1080`，渲染一张深蓝科技风卖点卡)
- saveCard(save-asset：保存卡图，subCategory=电商详情)

**订单每张独立图文卡，不合并长图**（无 array-merge）。

## 新增模板
`document-tools/templates.ts` 新增 `DOCUMENT_TEMPLATES.ecommerceSellpoint`（电商卖点卡）：深蓝科技风（深蓝渐变底、白色大标题、说明文字、居中特效图、透明参数表，宽度 1080）。

## 修复
`a2-nodes.ts` `report-image` 节点长图落盘文件名按 `iterationIndex` 区分（循环内多迭代不覆盖，`_i{n}` 后缀；非循环 iteration=0 无变化）。

## 测试
`tests/unit/migrations/builtin-app-ecommerce-detail.spec.ts`（6 例）：图结构校验、start 含 maxSlides/specPreset、详情规划含卖点×规格+specs+编辑指令+禁文字+风格一致、loop 按规划清单、image-gen 锁商品关扩写、code 拼装（imgUrl/sellPoint）+ report-image 用 ecommerceSellpoint 模板、每张独立保存（无 array-merge）。与套图一致性、图片格式测试全绿。

## 实测（Seedream-4.5，戴森吹风机，maxSlides=4）
`wfrun_1788017032685_mafcz47ou` 跑通 4 张独立卖点卡：
- 磁吸风嘴秒换（参数：接口设计/换嘴方式/操作体验）
- 每秒百次智能温控 不伤发（温控频率/风温档位/功能）
- 千万级负离子 抚平毛躁（负离子浓度/功效/适合发质）
- （另有第 4 张）

深蓝科技风、大标题+说明+特效图+参数表，图文合一，商品一致，风格统一。匹配用户附件的"卖点宣传卡"形态。

## 显示
套图/详情图在资产中心以电商式浏览展示（首图大图+缩略图切换，见 AssetCenter.vue）。

## 备注
- 商品外观一致性经编辑指令（Keep the product... unchanged）+ Seedream 保障（见 2026-08-29-ecommerce-poster-consistency.md）。
- 配图尺寸当前固定 1080×1080；后续可让 img 宽高跟随 specPreset（竖版平台用竖版比例）。
