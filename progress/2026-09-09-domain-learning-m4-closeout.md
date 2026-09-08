# 领域共学空间 M4 收口:重启真机走查复核(2026-09-09)

分支 feat/domain-learning。M4 = 架构合规整改(M4-A)+ 知识库关联三重源(M4-B)+ 用户 UX 8 条(M4-UX)+ 收口(M4-C)。
本记录为重启 dev:debug(新 preload/主进程/Renderer)后 M4 全特性真机走查的收口汇总。

## 里程碑回放(每项均单测+真机)
- M4-A 整改基线(`d713afea`):P0=0,P1×6,P2×12 择优,P3 记录。
  - P1-1 写路径空间属主校验服务化(`09d2641b`)、P1-3 聚合收敛 aggregation.rules(`b0aa3f49`)、P1-4 三方键护栏 spec(`b0aa3f49`)、P1-5 平台通知 dl:card-ready/research-failed/review-due(`07692e74`)、P1-2 平台 registry byBare 别名+dl 回归 packId(`480ec6a8`)、P1-6 巨型组件按需拆分(导出工具 `c9c70159`/SpaceStatsPopover `63604a0f`/as-any 清零 `cca33fcb`,SpaceSettingsPanel 独立组件按用户口径记后续)。
  - P2 择优:常量单源(`0f25f02f`)、store 封装(`da019f01`)、stats 契约补齐(`34b32866`)、日志补齐(`d79b50d7`/`d2d674bd`)等。
- M4-B KB 关联三重源:`d10552b3`(后端建绑/改绑+宿主 KB id 注入)+ `c5613de0`(设置 UI 关联组)+ `0da181c8`(讲义证据/KB 出处展示)。
- M4-UX1 选区提问/笔记+答疑收藏(`8c5264e6`/`3ef6ffea`/`2d15f438`)、UX2 后端自动核验(`b94c8e7c`/`50dce2a1`)、UX3 HTML 幻灯片(`871a0090`)、UX4 文案收敛(`e0ff981b`)。

## 收口真机复核(本记录,CDP 9222,重启后新构建)
### 走查一:讲义空间页(Space 路由)
- 概念行选中 → 讲义正文程序化选区 mouseup → `.sel-bar` 浮层出现(「提问/做笔记」),点「提问」后右侧答疑输入框已填入选区文字(与选区内容一致),输入框聚焦;
- 笔记 IPC 快速往返:createNote(selection)→ listNotes(countBefore=1)→ deleteNote 全链路 {success:true},无报错;
- 答疑气泡区已答轮次含「收藏为笔记」按钮(favVisible=true)。

### 走查二:Atlas 页(设置/KB/统计/导出)
- 「空间设置」弹层打开成功,四组齐全:领域画像(侧重→Atlas 增强视图)/自动推进(周期研究)/关联知识库(研究资料源)/间隔复习;
- 「关联知识库」组下拉打开后列出系统知识库选项(理论体系/法规标准/实践技能/前沿研究/自定义领域/…共 10 个,含既有库),绑定/解除经 dl:set-space-kb(saveKbOf) 已在前序 UI 提交中验证;
- 「统计」popover 打开,5 行统计行(概念/讲义/关系/问答/复习到期);
- 顶栏「导出讲义」「导出 PNG」按钮均在(讲义 md 下载与 PNG 下载已在 M3-C 真机捕获通过,M4 保持按钮在位)。

## 回归基线
dl 全套 + 护栏 ~57+、agent-runtime 244、system-agent 20、graph/view/rules/note 相关全绿;tsc/vue-tsc 相关零新增(最近提交 `cca33fcb` 基线)。

## 遗留与后续(如实)
1. M4-A P1-6 收口口径(用户确认):接受当前拆分程度,「空间设置面板独立 SpaceSettingsPanel.vue」与 DomainLearningSpace 拆分记入后续/P2;
2. 少量 P2:导出改走系统 utils/file-saver(现状 anchor 下载可工作,差异记录)、N+1 批量取卡边界记录、部分魔法串收尾;
3. 已知环境限制:M2-F 联网出卡/自动核验 legs 需可出网环境复验;本地无可用 KB 时 KB 命中出卡亦待有 KB 环境复验。

## 变更
- 仅收口验收脚本/截图于 progress/(不入库):_m4c_walk.js、_m4c_walk2.js 等。

## 结论
M4-A/M4-B/M4-UX 全部实现并提交,重启真机走查(两步)全部达成;M4 完成,待用户指令后 push。
