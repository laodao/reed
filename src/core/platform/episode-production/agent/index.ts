/**
 * 剧集制作 Agent barrel
 * @module platform/episode-production/agent
 */
export * from './ep-agent.types'
export * from './ep-agent-events'
export * from './ep-agent-deps'
export * from './ep-agent-context'
export * from './ep-agent-actions'
export { EpisodeProductionAgentService, normalizeEpDecision, epAgentConversationId } from './ep-agent-workflow.service'
export { EpAgentHarnessService, epAgentSystemPrompt } from './ep-agent-harness.service'
export { registerEpAgentTools, buildEpAgentToolDefs, EP_AGENT_PACK_ID, EP_TOOL_MAX_CALLS } from './ep-agent-tools'
