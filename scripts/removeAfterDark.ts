import dotenv from 'dotenv'
import { AtpAgent, BlobRef } from '@atproto/api'
import fs from 'fs/promises'
import { ids } from '../src/lexicon/lexicons'

const run = async () => {
  dotenv.config()

  // YOUR bluesky handle
  // Ex: user.bsky.social
  const handle = `${process.env.FEEDGEN_HANDLE}`

  // YOUR bluesky password, or preferably an App Password (found in your client settings)
  // Ex: abcd-1234-efgh-5678
  const password = `${process.env.FEEDGEN_PASSWORD}`

  // A short name for the record that will show in urls
  // Lowercase with no spaces.
  // Ex: whats-hot
  const recordName = 'ad-test'

  // A display name for your feed
  // Ex: What's Hot
  const displayName = "After Dark WIP"

  // (Optional) A description of your feed
  // Ex: Top trending content from the whole network
  const description = `NSFW media from people you follow. Includes all posts with NSFW labels or #nsfw in the post body.`

  // (Optional) The path to an image to be used as your feed's avatar
  // Ex: ~/path/to/avatar.jpeg
  const avatar: string = 'images/ad.png'

  // -------------------------------------
  // NO NEED TO TOUCH ANYTHING BELOW HERE
  // -------------------------------------

  if (!process.env.FEEDGEN_SERVICE_DID && !process.env.FEEDGEN_HOSTNAME) {
    throw new Error('Please provide a hostname in the .env file')
  }
  const feedGenDid =
    process.env.FEEDGEN_SERVICE_DID ?? `did:web:${process.env.FEEDGEN_HOSTNAME}`

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password: password })

  try {
    await agent.api.app.bsky.feed.describeFeedGenerator()
  } catch (err) {
    throw new Error(
      'The bluesky server is not ready to accept published custom feeds yet',
    )
  }

  let avatarRef: BlobRef | undefined
  if (avatar) {
    let encoding: string
    if (avatar.endsWith('png')) {
      encoding = 'image/png'
    } else if (avatar.endsWith('jpg') || avatar.endsWith('jpeg')) {
      encoding = 'image/jpeg'
    } else {
      throw new Error('expected png or jpeg')
    }
    const img = await fs.readFile(avatar)
    const blobRes = await agent.api.com.atproto.repo.uploadBlob(img, {
      encoding,
    })
    avatarRef = blobRes.data.blob
  }

  console.log(feedGenDid)

  const res = await agent.api.com.atproto.repo.deleteRecord({
    repo: agent.session?.did ?? '',
    collection: ids.AppBskyFeedGenerator,
    rkey: recordName,
    record: {
      did: feedGenDid,
      displayName: displayName,
      description: description,
      avatar: avatarRef,
      createdAt: new Date().toISOString(),
    },
  })

  console.log(res)

  console.log('All done 🎉')
}

run()
