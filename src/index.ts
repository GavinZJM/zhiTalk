import { ChatOpenAI } from '@langchain/openai'

const model = new ChatOpenAI({
  model: 'moonshot-v1-8k',
  apiKey: process.env.MOONSHOT_API_KEY,
  configuration: {
    baseURL: 'https://api.moonshot.cn/v1',
  },
  streaming: true,
})