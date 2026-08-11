import { defineComponent } from 'convex/server'
import { v } from 'convex/values'

const component = defineComponent('sitegpt', {
  env: {
    // A SiteGPT API token (create one in the dashboard, or with
    // `sitegpt tokens create`). The scopes the token needs depend on which
    // methods you call; see the README's scope table.
    SITEGPT_API_TOKEN: v.string(),
    // Override the API origin. Defaults to https://sitegpt.ai.
    SITEGPT_API_BASE: v.optional(v.string()),
  },
})

export default component
