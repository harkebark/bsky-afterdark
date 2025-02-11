import http from 'http'
import events from 'events'
import express from 'express'
import dotenv from 'dotenv'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import dbClient from './db/dbClient'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import { AtpAgent, BskyAgent } from '@atproto/api'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public firehose: FirehoseSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    firehose: FirehoseSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.firehose = firehose
    this.cfg = cfg
  }

  static async create(cfg: Config) {
    const app = express()
    const db = dbClient
    const firehose = new FirehoseSubscription(db, cfg.subscriptionEndpoint)

    const agent = new BskyAgent({ service: 'https://public.api.bsky.app' })
    // await agent.login({
    //   identifier: process.env.FEEDGEN_HANDLE as string,
    //   password: process.env.FEEDGEN_PASSWORD as string,
    // })

    const didCache = new MemoryCache()
    const didResolver = new DidResolver({
      plcUrl: 'https://plc.directory',
      didCache,
    })

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })
    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
    }
    feedGeneration(server, ctx, agent)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    return new FeedGenerator(app, firehose, cfg)
  }

  async start(): Promise<http.Server> {
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
