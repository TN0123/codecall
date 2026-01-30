import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { streamText } from 'ai'

const app = new Hono()

app.post('/api/chat', async (c) => {
  const { messages } = await c.req.json()

  const result = streamText({
    model: 'anthropic/claude-sonnet-4.5',
    messages,
  })

  return result.toUIMessageStreamResponse()
})

serve({ fetch: app.fetch, port: 3000 })
console.log('Server running on http://localhost:3000')
