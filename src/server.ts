import http from 'http'
import events from 'events'
import express from 'express'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import dbClient from './db/dbClient'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import { AtpAgent, BskyAgent } from '@atproto/api'
import algos from './algos'

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

    // Read HTML templates
    const indexTemplatePath = path.join(__dirname, 'templates', 'index.html')
    const algoItemTemplatePath = path.join(
      __dirname,
      'templates',
      'algorithm-item.html',
    )

    let indexTemplate: string
    let algoItemTemplate: string

    try {
      indexTemplate = fs.readFileSync(indexTemplatePath, 'utf8')
      algoItemTemplate = fs.readFileSync(algoItemTemplatePath, 'utf8')
    } catch (err) {
      console.error('Error reading template files:', err)
      // Fallback to simple HTML if templates can't be read
      indexTemplate =
        '<!DOCTYPE html><html><head><title>Available Feed Algorithms</title></head><body><h1>Available Feed Algorithms</h1>{{ALGORITHMS_LIST}}</body></html>'
      algoItemTemplate =
        '<div><h2>{{SHORTNAME}}</h2><p>{{FEED_URI}}</p><p>{{ENDPOINT}}</p></div>'
    }

    // Add route handler for root path to display available algorithms
    app.get('/', (req, res) => {
      const algoList = Object.keys(algos).map((shortname) => {
        const feedUri = `at://${cfg.publisherDid}/app.bsky.feed.generator/${shortname}`
        const endpoint = `https://${
          cfg.hostname
        }/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(
          feedUri,
        )}`
        return { shortname, feedUri, endpoint }
      })

      // Check if the request accepts HTML
      const acceptsHtml = req.headers.accept?.includes('text/html')

      if (acceptsHtml) {
        // Generate HTML for each algorithm using the template
        const algorithmsHtml = algoList
          .map((algo) => {
            return algoItemTemplate
              .replace('{{SHORTNAME}}', algo.shortname)
              .replace('{{FEED_URI}}', algo.feedUri)
              .replace('{{ENDPOINT}}', algo.endpoint)
              .replace('{{ENDPOINT}}', algo.endpoint) // Replace twice for the link text and href
          })
          .join('')

        // Insert the algorithms list into the main template
        const html = indexTemplate.replace(
          '{{ALGORITHMS_LIST}}',
          algorithmsHtml,
        )

        // Return HTML response
        res.setHeader('Content-Type', 'text/html')
        res.send(html)
      } else {
        // Return JSON response
        res.json({ algorithms: algoList })
      }
    })

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

  async stop(): Promise<void> {
    // Stop all algorithm managers
    if (this.firehose.algoManagers) {
      for (const manager of this.firehose.algoManagers) {
        if (manager.stop) {
          await manager.stop()
        }
      }
    }

    // Stop the firehose subscription
    await this.firehose.stop()

    // Close the server if it exists
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }
  }
}

export default FeedGenerator
