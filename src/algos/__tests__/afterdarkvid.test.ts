// @ts-nocheck - Disable TypeScript type checking for this file
import { describe, expect, jest, test, beforeEach } from '@jest/globals'
import * as afterdarkvid from '../afterdarkvid'
import { BskyAgent } from '@atproto/api'
import { Database } from '../../db'
import { Post } from '../../db/schema'
import dbClient from '../../db/dbClient'

// Mock dependencies
jest.mock('../../db/dbClient')
jest.mock('@atproto/api')

describe('afterdarkvid algorithm', () => {
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
  })

  describe('handler', () => {
    test('should return feed items without requesterDID', async () => {
      // Arrange
      const params = {
        feed: afterdarkvid.shortname,
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
      const result = await afterdarkvid.handler(mockContext, params, mockAgent)

      // Assert
      expect(dbClient.getLatestPostsForTag).toHaveBeenCalledWith({
        tag: afterdarkvid.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: true,
        nsfwOnly: true,
        excludeNSFW: false,
        authors: [],
      })

      expect(result.feed).toHaveLength(2)
      expect(result.feed[0].post).toBe(mockPosts[0].uri)
      expect(result.feed[1].post).toBe(mockPosts[1].uri)
      expect(result.cursor).toBeDefined()
    })

    test('should fetch follows when requesterDID is provided', async () => {
      // Arrange
      const params = {
        feed: afterdarkvid.shortname,
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

      ;(
        mockAgent.api.app.bsky.graph.getFollows as jest.Mock<any>
      ).mockResolvedValue(mockFollows)
      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue(
        mockPosts,
      )

      // Act
      const result = await afterdarkvid.handler(
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
        tag: afterdarkvid.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: true,
        nsfwOnly: true,
        excludeNSFW: false,
        authors: [requesterDID, 'did:plc:follow1', 'did:plc:follow2'],
      })

      expect(result.feed).toHaveLength(1)
      expect(result.feed[0].post).toBe(mockPosts[0].uri)
    })

    test('should handle pagination of follows', async () => {
      // Arrange
      const params = {
        feed: afterdarkvid.shortname,
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

      ;(mockAgent.api.app.bsky.graph.getFollows as jest.Mock<any>)
        .mockResolvedValueOnce(mockFollowsPage1)
        .mockResolvedValueOnce(mockFollowsPage2)
      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue(
        mockPosts,
      )

      // Act
      const result = await afterdarkvid.handler(
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
        tag: afterdarkvid.shortname,
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

    test('should handle API errors gracefully', async () => {
      // Arrange
      const params = {
        feed: afterdarkvid.shortname,
        limit: 50,
        cursor: undefined,
      }
      const requesterDID = 'did:plc:requester'

      ;(
        mockAgent.api.app.bsky.graph.getFollows as jest.Mock<any>
      ).mockRejectedValue(new Error('API error'))
      ;(dbClient.getLatestPostsForTag as jest.Mock<any>).mockResolvedValue([])

      // Act
      const result = await afterdarkvid.handler(
        mockContext,
        params,
        mockAgent,
        requesterDID,
      )

      // Assert
      expect(dbClient.getLatestPostsForTag).toHaveBeenCalledWith({
        tag: afterdarkvid.shortname,
        limit: params.limit,
        cursor: params.cursor,
        mediaOnly: true,
        nsfwOnly: true,
        excludeNSFW: false,
        authors: [requesterDID],
      })

      expect(result.feed).toEqual([])
    })
  })

  describe('manager', () => {
    let managerInstance: afterdarkvid.manager

    beforeEach(() => {
      managerInstance = new afterdarkvid.manager(mockDb, mockAgent)
      // Create a mock function that returns a Promise<void>
      const mockStartFn = jest.fn().mockImplementation(() => Promise.resolve())
      managerInstance.start = mockStartFn as unknown as () => Promise<void>
    })

    test('should initialize with correct name', () => {
      expect(managerInstance.name).toBe(afterdarkvid.shortname)
    })

    test('periodicTask should remove old posts', async () => {
      // Act
      await managerInstance.periodicTask()

      // Assert
      expect(mockDb.removeTagFromOldPosts).toHaveBeenCalledWith(
        afterdarkvid.shortname,
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

    test('filter_post should reject posts without video embeds', async () => {
      // Arrange
      const nonVideoPost: Post = {
        _id: null,
        uri: 'at://did:plc:valid/app.bsky.feed.post/1',
        cid: 'cid1',
        author: 'did:plc:valid',
        text: 'Test post without video',
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
      const result = await managerInstance.filter_post(nonVideoPost)

      // Assert
      expect(result).toBe(false)
    })

    test('filter_post should call start if agent is null', async () => {
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

      // Use 'as any' to bypass type checking for this test
      managerInstance.agent = null as any

      // Act
      await managerInstance.filter_post(videoPost)

      // Assert
      expect(managerInstance.start).toHaveBeenCalled()
    })
  })
})
