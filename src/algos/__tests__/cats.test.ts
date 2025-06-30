import { describe, expect, jest, test, beforeEach } from '@jest/globals'
import * as cats from '../cats'
import { BskyAgent } from '@atproto/api'
import { Database } from '../../db'
import { Post } from '../../db/schema'
import dbClient from '../../db/dbClient'

// Mock dependencies
jest.mock('../../db/dbClient')

describe('cats algorithm', () => {
  let mockAgent: jest.Mocked<BskyAgent>
  let mockDb: jest.Mocked<Database>
  let mockContext: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up mock functions with any type to bypass TypeScript errors
    // @ts-ignore - Ignore TypeScript error for mock function
    dbClient.getLatestPostsForTag = jest.fn().mockResolvedValue([]) as any

    mockAgent = {
      // Minimal mock implementation
    } as unknown as jest.Mocked<BskyAgent>

    mockDb = {
      removeTagFromOldPosts: jest.fn(),
    } as unknown as jest.Mocked<Database>

    mockContext = {
      db: mockDb,
    }

    // No need to reset mocks individually, jest.clearAllMocks() handles this
  })

  describe('handler', () => {
    test('should return feed items', async () => {
      // Arrange
      const params = {
        feed: cats.shortname,
        limit: 50,
        cursor: undefined,
      }
      const mockPosts = [
        {
          uri: 'at://did:plc:123/app.bsky.feed.post/1',
          cid: 'cid1',
          indexedAt: Date.now(),
        },
        {
          uri: 'at://did:plc:456/app.bsky.feed.post/2',
          cid: 'cid2',
          indexedAt: Date.now(),
        },
      ]

      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue(
        mockPosts,
      )

      // Act
      const result = await cats.handler(mockContext, params)

      // Assert
      expect(dbClient.getLatestPostsForTag).toHaveBeenCalledWith({
        tag: cats.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: false,
        nsfwOnly: false,
        excludeNSFW: true,
      })

      expect(result.feed).toHaveLength(2)
      expect(result.feed[0].post).toBe(mockPosts[0].uri)
      expect(result.feed[1].post).toBe(mockPosts[1].uri)
      expect(result.cursor).toBeDefined()
    })
  })

  describe('manager', () => {
    let managerInstance: cats.manager

    beforeEach(() => {
      managerInstance = new cats.manager(mockDb, mockAgent)
      // Create a mock function that returns a Promise<void>
      const mockStartFn = jest.fn().mockImplementation(() => Promise.resolve())
      managerInstance.start = mockStartFn as unknown as () => Promise<void>
    })

    test('should initialize with correct name', () => {
      expect(managerInstance.name).toBe(cats.shortname)
    })

    test('periodicTask should remove old posts', async () => {
      // Act
      await managerInstance.periodicTask()

      // Assert
      expect(mockDb.removeTagFromOldPosts).toHaveBeenCalledWith(
        cats.shortname,
        expect.any(Number),
      )
    })

    test('filter_post should reject posts from blocked DIDs', async () => {
      // Arrange
      const blockedPost: Post = {
        _id: null,
        uri: 'at://did:plc:mcb6n67plnrlx4lg35natk2b/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:mcb6n67plnrlx4lg35natk2b',
        text: 'Test post about cats',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
      }

      // Act
      const result = await managerInstance.filter_post(blockedPost)

      // Assert
      expect(result).toBe(false)
    })

    test('filter_post should reject reply posts', async () => {
      // Arrange
      const replyPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Test post about cats',
        indexedAt: Date.now(),
        replyRoot: 'at://did:plc:other/app.bsky.feed.post/1',
        replyParent: 'at://did:plc:other/app.bsky.feed.post/1',
        algoTags: null,
      }

      // Act
      const result = await managerInstance.filter_post(replyPost)

      // Assert
      expect(result).toBe(false)
    })

    test('filter_post should accept posts with cat-related content', async () => {
      // Arrange
      const catPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Look at my cute cat! #cats',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
        embed: {
          images: [{ alt: 'A cute cat playing with a toy' }],
        },
      }

      // Act
      const result = await managerInstance.filter_post(catPost)

      // Assert
      expect(result).toBe(true)
    })

    test('filter_post should accept posts with cat-related alt text', async () => {
      // Arrange
      const catAltTextPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Look at this!',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
        embed: {
          images: [{ alt: 'My cat sleeping on the couch' }],
        },
      }

      // Act
      const result = await managerInstance.filter_post(catAltTextPost)

      // Assert
      expect(result).toBe(true)
    })

    test('filter_post should reject posts with excluded terms', async () => {
      // Arrange
      const furryPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Check out my furry cat art! #furry #cats',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
      }

      // Act
      const result = await managerInstance.filter_post(furryPost)

      // Assert
      expect(result).toBe(false)
    })

    test('filter_post should reject posts without cat-related content', async () => {
      // Arrange
      const nonCatPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Just a regular post about my day',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
      }

      // Act
      const result = await managerInstance.filter_post(nonCatPost)

      // Assert
      expect(result).toBe(false)
    })
  })
})
