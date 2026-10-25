import { test } from 'node:test'
import * as assert from 'node:assert'
import Fastify from 'fastify'
import prismaPlugin from '../../src/plugins/prisma'
import { db } from '../../src/prisma/db'

test('prisma plugin exposes the db singleton', async (t) => {
  const app = Fastify()

  t.after(() => app.close())

  await app.register(prismaPlugin)
  await app.ready()

  assert.equal(app.db, db)
})
