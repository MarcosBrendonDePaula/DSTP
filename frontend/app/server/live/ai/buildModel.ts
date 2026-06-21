// Shared provider/model builder for the AI SDK. Used by the ai_agent node
// (executeAIAgent) and the AI flow generator (generateFlow). One place that knows
// how to turn a provider string + key into a LanguageModel.
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export function buildModel(provider: string, model: string, apiKey: string) {
  switch (provider) {
    case 'anthropic': return createAnthropic({ apiKey })(model)
    case 'openai': return createOpenAI({ apiKey })(model)
    case 'google': return createGoogleGenerativeAI({ apiKey })(model)
    default: throw new Error(`unknown AI provider: ${provider}`)
  }
}
