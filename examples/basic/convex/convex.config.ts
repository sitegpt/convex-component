import sitegpt from '@sitegpt/convex/convex.config.js'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: {
    SITEGPT_API_TOKEN: v.string(),
    SITEGPT_API_BASE: v.optional(v.string()),
  },
})

app.use(sitegpt, {
  env: {
    SITEGPT_API_TOKEN: app.env.SITEGPT_API_TOKEN,
    SITEGPT_API_BASE: app.env.SITEGPT_API_BASE,
  },
})

export default app
