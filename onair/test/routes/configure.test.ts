import { test } from 'node:test'
import * as assert from 'node:assert'
import { build } from '../helper.js'

test('configure serves the Stremio configuration page', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    url: '/configure'
  })

  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'] ?? '', /^text\/html/)
  assert.match(res.payload, /name="username"/)
  assert.match(res.payload, /name="timezone"/)
  assert.match(res.payload, /name="countries"/)
  assert.match(res.payload, /name="categories"/)
  assert.match(res.payload, /stremio:\/\//)
})
