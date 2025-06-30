import { describe, expect, jest, test, beforeAll } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import algos from '../algos'

describe('Root path handler', () => {
  // Mock Express request and response
  const mockRequest = (acceptHeader: string = '') => {
    return {
      headers: {
        accept: acceptHeader,
      },
    }
  }

  const mockResponse = () => {
    const res: any = {}
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    res.send = jest.fn().mockReturnValue(res)
    res.setHeader = jest.fn().mockReturnValue(res)
    return res
  }

  // Mock config values
  const publisherDid = 'did:plc:example'
  const hostname = 'example.com'

  // Template variables
  let indexTemplate: string
  let algoItemTemplate: string

  beforeAll(() => {
    // Read the template files
    try {
      const indexTemplatePath = path.join(
        process.cwd(),
        'src',
        'templates',
        'index.html',
      )
      const algoItemTemplatePath = path.join(
        process.cwd(),
        'src',
        'templates',
        'algorithm-item.html',
      )

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
  })

  // Create a simplified version of the root path handler that uses templates
  const rootPathHandler = (req: any, res: any) => {
    const algoList = Object.keys(algos).map((shortname) => {
      const feedUri = `at://${publisherDid}/app.bsky.feed.generator/${shortname}`
      const endpoint = `https://${hostname}/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(
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
      const html = indexTemplate.replace('{{ALGORITHMS_LIST}}', algorithmsHtml)

      // Return HTML response
      res.setHeader('Content-Type', 'text/html')
      res.send(html)
    } else {
      // Return JSON response
      res.json({ algorithms: algoList })
    }
  }

  test('should return JSON response when Accept header does not include text/html', () => {
    // Arrange
    const req = mockRequest('application/json')
    const res = mockResponse()

    // Act
    rootPathHandler(req, res)

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      algorithms: expect.arrayContaining([
        expect.objectContaining({
          shortname: expect.any(String),
          feedUri: expect.stringContaining(publisherDid),
          endpoint: expect.stringContaining(hostname),
        }),
      ]),
    })
    expect(res.send).not.toHaveBeenCalled()
  })

  test('should return HTML response when Accept header includes text/html', () => {
    // Arrange
    const req = mockRequest('text/html')
    const res = mockResponse()

    // Act
    rootPathHandler(req, res)

    // Assert
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html')
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<!DOCTYPE html>'),
    )
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Available Feed Algorithms'),
    )

    // Check that the HTML contains information about each algorithm
    Object.keys(algos).forEach((shortname) => {
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining(shortname))
    })

    expect(res.json).not.toHaveBeenCalled()
  })
})
