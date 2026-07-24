import { Annotation, MessagesAnnotation } from '@langchain/langgraph'

/**
 * Agent 图状态：
 * - messages：完整对话（checkpointer 持久化；默认 append）
 * - summary：可选摘要；存在时 buildModelContext 会优先用它压缩上下文
 */
export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  summary: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
})

export type AgentStateType = typeof AgentState.State
