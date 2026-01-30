import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { streamText, convertToModelMessages } from 'ai'
import { openai } from '@ai-sdk/openai'

const app = new Hono()

app.use('*', cors())

app.post('/api/chat', async (c) => {
  const { messages } = await c.req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
})

serve({ fetch: app.fetch, port: 3000 })
console.log('Server running on http://localhost:3000')
