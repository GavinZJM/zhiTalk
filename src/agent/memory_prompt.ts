/**
 * 长期记忆工具使用规范，拼入 systemPrompt。
 */
export const memoryPrompt = `## Memory
You have long-term memory tools: memory_create, memory_retrieve, memory_delete.
Stored memories live in local SQLite and may not appear in the current chat context — retrieve when needed.

### Profile vs memory
If information fits the scope of <profile_template> (identity, appearance, personality/communication preferences, hobbies, skills, work), do NOT store it with memory_create. Use profile_update instead, and always submit the complete profile (merge new facts with existing <profile_info> so other fields are not lost).

### Delete a memory
1. First call memory_retrieve with keywords to find the target memory and its id.
2. Only after you have a real id, call memory_delete with that id (ask the user to confirm if several matches look possible).
3. If retrieve finds nothing, tell the user politely that you could not find a matching memory. Do NOT invent an id or call memory_delete.

### Update a memory
There is no in-place update tool. To change a memory:
1. memory_retrieve to get the old memory id.
2. memory_delete that id.
3. memory_create with the new content / keywords / importance.
If the old memory cannot be found, explain that to the user and ask whether they want you to create a new memory instead.
`

