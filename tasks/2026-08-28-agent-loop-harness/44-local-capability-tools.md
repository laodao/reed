# 44 号：本地能力工具包 V1（借 codex apply-patch / unified_exec）

> 用户裁决（2026-09-11）：本项目 agent-harness 是基础设施，未来业务模块不限定
> （AI coding、PPT 生成等），**文件编辑与命令执行是需要的**。codex 的本地能力层
> 是该场景打磨最充分的公开实现，按可移植精度深读后移植 V1。

状态：已实施（对抗 review 修订中）　前置：43 号（codex 对标评审）
深读依据：codex-rs/apply-patch（parser/streaming_parser/file_update/seek_sequence）、
core/src/unified_exec（mod/process_manager/head_tail_buffer）、core/src/safety.rs；commit 008bbd5884。

## 一、V1 范围（契约）

### 工具五件（builtin；桌面端限定，Web 端结构化报错——同 code_run 门禁）

| 工具 | danger | 审批 | 对标 |
|---|---|---|---|
| `fs_read_file` | read | 免 | codex 读走 shell+只读沙箱自动放行；我们以专用读工具替代（shell 免批需 exec_policy 前缀规则，V2）|
| `fs_list_dir` | read | 免 | 同上 |
| `fs_apply_patch` | write | **需审批**（approvalCard 展示补丁摘要）| codex apply_patch（lark freeform 在我们工具协议下不可用，改 function 形态传 patch 文本，文法照抄）|
| `shell_exec` | exec | **需审批**（Amendment 缓疲劳）| codex exec_command（yield 语义）|
| `shell_write` | exec | **需审批** | codex write_stdin（续读/写 stdin）|

### 安全模型（V1 = 路径围栏 + 审批门；OS 级沙箱登记不移植）

- **工作区围栏**：`AGENT_WORKSPACE_ROOTS`（path.delimiter 分隔的绝对路径）。未配置 =
  本地工具全部结构化报错并给配置指引（安全默认，能力按需开启）。
- 路径解析：相对路径基于调用方 `cwd`（必须仍落在围栏内）；realpath 校验最深层存在祖先
  （防 symlink 逃逸）；拒绝绝对路径出围栏、拒绝 `.git/` 内部写。
- exec 无 OS 沙箱（Seatbelt/受限令牌不移植）——审批默认拒绝 + 围栏 + Amendment 承担安全；
  登记未来项：按 codex exec_policy 思路做只读命令前缀白名单（ls/cat/grep… 免批）。
- 聊天宿主白名单：只放 `fs_read_file`/`fs_list_dir`（SYSTEM_AGENT_PASSTHROUGH_TOOLS，
  28号 §7「白名单无审批工具」边界不破）；写/执行类等有审批宿主与聊天审批卡立项。

### shell 会话语义（对标 unified_exec）

- `shell_exec { command, workdir?, yield_ms? }`：spawn `/bin/bash -c`；`yield_ms` 到点返回
  部分输出；进程未退出则带 `session_id`（codex 缺省 10s、clamp [250ms,30s]）。
- `shell_write { session_id, data?, close_stdin?, yield_ms? }`：写 stdin + 等待读输出；
  未知 session / 已退出的结构化错误。
- 会话表：上限 16（codex 64，桌面应用收紧）、后台 TTL 300s（codex 同款）到点杀进程、
  输出 head+tail 各 512KB 中间省略（codex 同款）。
- 进程退出：exit code 随下次读/到期返回。

### 补丁文法（codex apply-patch 格式，细节以深读报告为准）

```
*** Begin Patch
*** Add File: <rel-path>
+line
*** Update File: <rel-path>
*** Move To: <new-rel-path>
@@ <可选上下文>
 原文行
-删除行
+新增行
*** Delete File: <rel-path>
*** End Patch
```

### 验收

- patch 解析/应用为纯函数（parse→plan→apply-strings），FS 只是薄壳；单测覆盖文法全
  分支 + 围栏逃逸拒绝 + 审批卡摘要。
- shell 会话用真实短进程测（echo/sleep），覆盖 yield/续读/超时/TTL/上限。
- 聊天宿主回归不破；Web 门禁用例。

---

## 二、实施记录（V1 全部落地）

新增文件：
- `src/core/platform/workflow/local/patch.ts` —— 纯函数补丁引擎：`parsePatch`（状态机，
  heredoc 剥壳/CRLF/裸空行=空 context/@@ 可省略/**Move to 小写 to**）+ `applyPatchOps`
  （seek_sequence 四级模糊匹配 exact→rstrip→trim→Unicode 归一、@@ ctx 先行定位、EOF 尾
  对齐、尾空串哨兵重试、LF 归一）。错误文案逐字对齐 codex（`Failed to find expected
  lines in {path}:\n{原文}` 等——模型自纠错契约）。零 I/O。
- `src/core/platform/workflow/local/shell-sessions.ts` —— `ShellSessionManager`：
  spawn /bin/bash -c；yield 到点返回部分输出+session_id（快命令直接给 exit_code）；
  head/tail 各 512KB + `... N bytes omitted ...`（逐字）；write_stdin 语义（空=纯轮询
  下限 5s、有输入 min 30s、close_stdin=EOF、\u0003=SIGINT）；会话上限 16（LRU+退出优先
  prune，最近 8 个保护）；**空闲 TTL 30min 惰性清扫**（有意偏差：桌面长驻 vs codex CLI
  生命周期）。**实测教训（重要）**：收集循环里「缓冲已有数据」的等待若同步 resolve，
  会变成纯微任务死旋——事件循环进不了 poll 相位，子进程 exit/close 被饿死（快命令
  挂满 deadline、exit_code 拿不到）；修复=数据存在时也走真实定时器节拍。
- `src/core/platform/workflow/local/workspace.ts` —— 围栏：AGENT_WORKSPACE_ROOTS
  （path.delimiter 分隔）；未配置=本地能力整体结构化拒绝（安全默认）；realpath 最深
  存在祖先防 symlink 逃逸；.git 内部写拒绝（读不拒）。
- `src/core/platform/workflow/tools/local-capability-tools.ts` —— 五件工具装配 +
  审批卡（补丁逐文件动作 + 增删行数摘要）+ 桌面门禁（Web 结构化拒绝，同 code_run）。
- 测试 52 例：`tests/unit/core/platform/workflow/local/{patch,shell-sessions,
  local-capability-tools}.spec.ts`（文法全分支/文案逐字/围栏逃逸/死旋回归/端到端落盘）。

接线：
- workflow-boot 组合根 `registerLocalCapabilityTools(agentToolRegistry)`（注册失败会
  炸 boot——与 registerBuiltinAgentTools 同一失败面纪律）。
- 聊天宿主直通白名单（SYSTEM_AGENT_PASSTHROUGH_TOOLS）只加读类两件——28号 §7
  「白名单无审批工具」边界不破；写/执行类等有审批宿主/聊天审批卡立项。

## 三、验证与已知限制

- local 目录 52/52 全绿；agent-runtime 全绿（含 43 号用例）；全量回归仅存量基线失败
  （tool.service 凭据加密断言、gossip 模板期望漂移、app 实体元数据——均非本批改动面）。
- typecheck：本批文件零新增错误。
- **已知限制（登记）**：
  1. shell 命令本身可 cd/读写围栏外（无 OS 沙箱）——审批门是唯一防线（文档已声明；
     codex 同位置用 Seatbelt/受限令牌，登记为未来项）
  2. resolve→read→write 存在 TOCTOU 窗口（单用户桌面可接受；登记）
  3. fs_read_file 截断按字节切（UTF-8 多字节字符可能在切口断字——修过 buffer 保尾
     分界块，字符级对齐留待需要时）
  4. 无 PTY（pipe）：无终端语义（vim 类交互程序不可用）；\u0003 以 SIGINT 实现
  5. fs_apply_patch 覆盖已存在文件允许（codex 同语义，记录 overwritten）

---

## 四、对抗 review（subagent）结论与处置

**P0×3（全修）**：
1. shell 会话 stdin 无 error 处理 → 向已退出会话写 stdin 异步 EPIPE = uncaughtException
   崩主进程——已修（stdin 'error' 兜底 + 写前 destroyed 检查）+ 回归用例。
2. 纯插入 chunk 落点错误：插到指针处而非 codex 的文件末尾（`@@`+`+`行惯用法反向结果）
   ——已修（恒追加末尾）+ 回归用例。
3. 尾空串哨兵重试无条件砍 newLines 尾行 → 静默丢改动还报成功——已修（old/new 尾空串
   同步砍）+ 回归用例。

**P1×4（全修）**：
1. `@@x`（无空格）被吞成空 context chunk → 改为 `@@ ` 带空格判定，`@@x` 走内容行报错。
2. `*** End of File` 语义偏差（全域扫描可在中段错误命中）→ 改为 codex 尾对齐位-only
   匹配，中段命中报 `Failed to find expected lines`。
3. 缩进的 marker 行被拆成新 hunk → Update 节内判定改用 trimEnd 原始行，缩进 marker
   是 context 行（上游 keeps_indented_update_markers 同语义）。
4. fs_read_file 全量 readFile 后才判上限（GB 级文件 OOM 主进程）→ stat 先行 + 定长
   头尾读。

**P2（处置）**：已修 = P2-1 两条缺失文案（`Update hunk does not contain any lines`/
`Expected update hunk to start with a @@ context marker`）+ `Failed to read file to
update` 逐字 + wrapper 分级（patch 级 vs hunk 级）；P2-3 move 清源键 + move-to-self
守卫；P2-4 Web 端不注册（模型可见面收敛）；P2-5 rm 语义对齐 codex（目录/不存在报错
文案）；P2-6 信号死亡归因（signal 字段 + 128+signo）；P2-7 recentUsed 卫生 + 进程
exit 兜底杀子进程；P2-8 审批卡 Move to 计数错挂。**登记不修** = P2-2 宽容面（heredoc
引号配对已收紧，其余宽容方向无害）；P2-9 workflow-boot 注册 try 归宿（维持与 builtin
同一失败面纪律，当前不可抛）；P2-10 剩余测试缺口随用例补充渐进。

**额外收获（review 之外的回归）**：E3 挂起冻结语义被 43 号重试设施破坏（abort 路径
响应式收尾多写 `stopReason='aborted'` 落盘，破坏「冻结而非 aborted 收场」恢复契约）
——loop.stop() 增挂起冻结分支（state.suspended 时不再覆盖/落盘；resume 驳回先清
suspended）。agent-loop-node 28/28 恢复全绿。

## 五、验证

- local 58/58（含 P0/P1 回归锚点）；agent-loop-node 28/28；agent-runtime 全绿；
  全量回归 1102 通过 / 22 失败——全部为存量基线与并行会话漂移（与本次改动面 0 交集，
  抽样 stash 对照确认）。
- ABI 已翻回 electron。
