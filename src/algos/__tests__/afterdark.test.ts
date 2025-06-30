// @ts-nocheck - Disable TypeScript type checking for this file
import { describe, expect, jest, test, beforeEach } from '@jest/globals'
import * as afterdark from '../afterdark'
import { BskyAgent } from '@atproto/api'
import { Database } from '../../db'
import { Post } from '../../db/schema'
import dbClient from '../../db/dbClient'

// Mock dependencies
jest.mock('../../db/dbClient')
jest.mock('@atproto/api')

// Mock environment variables
process.env.FEEDGEN_PUBLISHER_DID = 'did:plc:publisher'

describe('afterdark algorithm', () => {
  let mockAgent: jest.Mocked<BskyAgent>
  let mockDb: jest.Mocked<Database>
  let mockContext: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up mock functions with any type to bypass TypeScript errors
    // @ts-ignore - Ignore TypeScript error for mock function
    dbClient.getLatestPostsForTag = jest.fn().mockResolvedValue([]) as any

    mockAgent = new BskyAgent({
      service: 'https://example.com',
    }) as jest.Mocked<BskyAgent>

    // Set up mock API methods using any type to bypass TypeScript errors
    const mockApi = {
      app: {
        bsky: {
          graph: {
            // @ts-ignore - Ignore TypeScript error for mock function
            getFollows: jest
              .fn()
              .mockResolvedValue({ data: { follows: [] } }) as any,
          },
          feed: {
            // @ts-ignore - Ignore TypeScript error for mock function
            getLikes: jest
              .fn()
              .mockResolvedValue({ data: { likes: [] } }) as any,
          },
        },
      },
    }

    // Use type assertion to bypass readonly property
    Object.defineProperty(mockAgent, 'api', {
      value: mockApi,
      writable: true,
    })

    mockDb = {
      removeTagFromOldPosts: jest.fn(),
    } as unknown as jest.Mocked<Database>

    mockContext = {
      db: mockDb,
    }

    // No need to reset mocks individually, jest.clearAllMocks() handles this
  })

  describe('handler', () => {
    test('should return feed items without requesterDID', async () => {
      // Arrange
      const params = {
        feed: afterdark.shortname,
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
      ;(
        mockAgent.api.app.bsky.feed.getLikes as jest.Mock<any>
      ).mockResolvedValue({
        data: {
          likes: [],
          cursor: undefined,
        },
      })

      // Act
      const result = await afterdark.handler(mockContext, params, mockAgent)

      // Assert
      expect(dbClient.getLatestPostsForTag).toHaveBeenCalledWith({
        tag: afterdark.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: true,
        nsfwOnly: true,
        excludeNSFW: false,
        authors: [],
      })

      expect(result.feed).toHaveLength(2) // 2 posts (no pinned post when requesterDID is not provided)
      expect(result.feed[0].post).toBe(mockPosts[0].uri)
      expect(result.feed[1].post).toBe(mockPosts[1].uri)
      expect(result.cursor).toBeDefined()
    })

    test('should fetch follows when requesterDID is provided', async () => {
      // Arrange
      const params = {
        feed: afterdark.shortname,
        limit: 50,
        cursor: undefined,
      }
      const requesterDID = 'did:plc:requester'
      const mockFollows = {
        data: {
          follows: [{ did: 'did:plc:follow1' }, { did: 'did:plc:follow2' }],
          cursor: undefined,
        },
      }

      const mockPosts = [
        {
          uri: 'at://did:plc:123/app.bsky.feed.post/1',
          cid: 'cid1',
          indexedAt: Date.now(),
        },
      ]

      const mockLikes = {
        data: {
          likes: [{ actor: { did: 'did:plc:other' } }],
          cursor: undefined,
        },
      }

      ;(
        mockAgent.api.app.bsky.graph.getFollows as jest.Mock<any>
      ).mockResolvedValue(mockFollows)
      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue(
        mockPosts,
      )
      ;(
        mockAgent.api.app.bsky.feed.getLikes as jest.Mock<any>
      ).mockResolvedValue(mockLikes)

      // Act
      const result = await afterdark.handler(
        mockContext,
        params,
        mockAgent,
        requesterDID,
      )

      // Assert
      expect(mockAgent.api.app.bsky.graph.getFollows).toHaveBeenCalledWith({
        actor: requesterDID,
        limit: 100,
      })

      expect(dbClient.getLatestPostsForTag).toHaveBeenCalledWith({
        tag: afterdark.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: true,
        nsfwOnly: true,
        excludeNSFW: false,
        authors: [requesterDID, 'did:plc:follow1', 'did:plc:follow2'],
      })

      expect(result.feed.length).toBeGreaterThan(1) // At least the post and pinned post
      expect(result.feed[0].post).toContain(process.env.FEEDGEN_PUBLISHER_DID) // Pinned post
      expect(result.feed.some((item) => item.post === mockPosts[0].uri)).toBe(
        true,
      )
    })

    test('should handle pagination of follows', async () => {
      // Arrange
      const params = {
        feed: afterdark.shortname,
        limit: 50,
        cursor: undefined,
      }
      const requesterDID = 'did:plc:requester'

      // First page of follows
      const mockFollowsPage1 = {
        data: {
          follows: [{ did: 'did:plc:follow1' }, { did: 'did:plc:follow2' }],
          cursor: 'next-page',
        },
      }

      // Second page of follows
      const mockFollowsPage2 = {
        data: {
          follows: [{ did: 'did:plc:follow3' }, { did: 'did:plc:follow4' }],
          cursor: undefined,
        },
      }

      const mockPosts = [
        {
          uri: 'at://did:plc:123/app.bsky.feed.post/1',
          cid: 'cid1',
          indexedAt: Date.now(),
        },
      ]

      const mockLikes = {
        data: {
          likes: [{ actor: { did: 'did:plc:other' } }],
          cursor: undefined,
        },
      }

      ;(mockAgent.api.app.bsky.graph.getFollows as jest.Mock<any>)
        .mockResolvedValueOnce(mockFollowsPage1)
        .mockResolvedValueOnce(mockFollowsPage2)
      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue(
        mockPosts,
      )
      ;(
        mockAgent.api.app.bsky.feed.getLikes as jest.Mock<any>
      ).mockResolvedValue(mockLikes)

      // Act
      const result = await afterdark.handler(
        mockContext,
        params,
        mockAgent,
        requesterDID,
      )

      // Assert
      expect(mockAgent.api.app.bsky.graph.getFollows).toHaveBeenCalledTimes(2)
      expect(mockAgent.api.app.bsky.graph.getFollows).toHaveBeenNthCalledWith(
        1,
        {
          actor: requesterDID,
          limit: 100,
        },
      )
      expect(mockAgent.api.app.bsky.graph.getFollows).toHaveBeenNthCalledWith(
        2,
        {
          actor: requesterDID,
          limit: 100,
          cursor: 'next-page',
        },
      )

      expect(dbClient.getLatestPostsForTag).toHaveBeenCalledWith({
        tag: afterdark.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: true,
        nsfwOnly: true,
        excludeNSFW: false,
        authors: [
          requesterDID,
          'did:plc:follow1',
          'did:plc:follow2',
          'did:plc:follow3',
          'did:plc:follow4',
        ],
      })
    })

    test('should not show pinned post if requester has liked it', async () => {
      // Arrange
      const params = {
        feed: afterdark.shortname,
        limit: 50,
        cursor: undefined,
      }
      const requesterDID = 'did:plc:requester'
      const mockFollows = {
        data: {
          follows: [{ did: 'did:plc:follow1' }],
          cursor: undefined,
        },
      }

      const mockPosts = [
        {
          uri: 'at://did:plc:123/app.bsky.feed.post/1',
          cid: 'cid1',
          indexedAt: Date.now(),
        },
      ]

      const mockLikes = {
        data: {
          likes: [{ actor: { did: requesterDID } }],
          cursor: undefined,
        },
      }

      ;(
        mockAgent.api.app.bsky.graph.getFollows as jest.Mock<any>
      ).mockResolvedValue(mockFollows)
      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue(
        mockPosts,
      )
      ;(
        mockAgent.api.app.bsky.feed.getLikes as jest.Mock<any>
      ).mockResolvedValue(mockLikes)

      // Act
      const result = await afterdark.handler(
        mockContext,
        params,
        mockAgent,
        requesterDID,
      )

      // Assert
      // The pinned post should not be at the beginning of the feed
      expect(result.feed[0].post).not.toContain(
        process.env.FEEDGEN_PUBLISHER_DID,
      )
      expect(result.feed[0].post).toBe(mockPosts[0].uri)
    })

    test('should handle API errors gracefully', async () => {
      // Arrange
      const params = {
        feed: afterdark.shortname,
        limit: 50,
        cursor: undefined,
      }
      const requesterDID = 'did:plc:requester'

      ;(
        mockAgent.api.app.bsky.graph.getFollows as jest.Mock<any>
      ).mockRejectedValue(new Error('API error'))
      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue([])
      ;(
        mockAgent.api.app.bsky.feed.getLikes as jest.Mock<any>
      ).mockResolvedValue({
        data: {
          likes: [],
          cursor: undefined,
        },
      })

      // Act
      const result = await afterdark.handler(
        mockContext,
        params,
        mockAgent,
        requesterDID,
      )

      // Assert
      expect(dbClient.getLatestPostsForTag).toHaveBeenCalledWith({
        tag: afterdark.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: true,
        nsfwOnly: true,
        excludeNSFW: false,
        authors: [requesterDID],
      })

      // Should still have the pinned post
      expect(result.feed.length).toBeGreaterThan(0)
      expect(result.feed[0].post).toContain(process.env.FEEDGEN_PUBLISHER_DID)
    })
  })

  describe('manager', () => {
    let managerInstance: afterdark.manager

    beforeEach(() => {
      managerInstance = new afterdark.manager(mockDb, mockAgent)
      // Create a mock function that returns a Promise<void>
      const mockStartFn = jest.fn().mockImplementation(() => Promise.resolve())
      managerInstance.start = mockStartFn as unknown as () => Promise<void>
    })

    test('should initialize with correct name', () => {
      expect(managerInstance.name).toBe(afterdark.shortname)
    })

    test('periodicTask should remove old posts', async () => {
      // Act
      await managerInstance.periodicTask()

      // Assert
      expect(mockDb.removeTagFromOldPosts).toHaveBeenCalledWith(
        afterdark.shortname,
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
        text: 'Test post',
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

    test('filter_post should accept posts with image embeds', async () => {
      // Arrange
      const imagePost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Test post with image',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
        embed: {
          images: [{ alt: 'Image description' }],
        },
      }

      managerInstance.agent = mockAgent

      // Act
      const result = await managerInstance.filter_post(imagePost)

      // Assert
      expect(result).toBe(true)
    })

    test('filter_post should accept posts with video embeds', async () => {
      // Arrange
      const videoPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Test post with video',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
        embed: {
          video: {
            alt: 'Video description',
          },
        },
      }

      managerInstance.agent = mockAgent

      // Act
      const result = await managerInstance.filter_post(videoPost)

      // Assert
      expect(result).toBe(true)
    })

    test('filter_post should accept posts with media embeds', async () => {
      // Arrange
      const mediaPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Test post with media',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
        embed: {
          media: {
            alt: 'Media description',
          },
        },
      }

      managerInstance.agent = mockAgent

      // Act
      const result = await managerInstance.filter_post(mediaPost)

      // Assert
      expect(result).toBe(true)
    })

    test('filter_post should reject posts without embeds', async () => {
      // Arrange
      const textPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Test post without embeds',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
      }

      managerInstance.agent = mockAgent

      // Act
      const result = await managerInstance.filter_post(textPost)

      // Assert
      expect(result).toBe(false)
    })

    test('filter_post should call start if agent is null', async () => {
      // Arrange
      const imagePost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Test post with image',
        indexedAt: Date.now(),
        replyRoot: null,
        replyParent: null,
        algoTags: null,
        embed: {
          images: [{ alt: 'Image description' }],
        },
      }

      // Use 'as any' to bypass type checking for this test
      managerInstance.agent = null as any

      // Act
      await managerInstance.filter_post(imagePost)

      // Assert
      expect(managerInstance.start).toHaveBeenCalled()
    })
  })
})
