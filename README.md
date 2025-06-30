# After Dark Feeds

This code was originally a fork of https://github.com/Bossett/bsky-feeds by Bossett, which was originally a fork of [the official Bluesky feed generator starter kit](https://github.com/bluesky-social/feed-generator). Both repos contain lots of information about the mechanics of feed generation and how to publish feeds.

The feeds in this repo store all media posts off the firehose to a database and use authentication to provide user-specific feeds. This allows for users to only see posts from people they are following in the feed without manually setting up a feed.

Posts can be pinned to feeds using the mechanism defined in src/algos/afterdark.ts. When a user likes a pinned post and refreshes the feed the pinned post vanishes, making it very useful for announcements or instructional guides. Please don't abuse this :)

# Hosting

This feed is hosted on [Digital Ocean](https://m.do.co/c/a838c8f1e33a) which was achieved by [following the guide written by Bossett.](https://bossett.io/setting-up-bossetts-bluesky-feed-generator/) It walks you through setup of the app and gives Bossett some affiliate credit for putting all of this together. The After Dark feed gets a lot of requests and indexes every media post on the site before batch updating labels so my monthly costs end up being around $100 between the database and the main server. YMMV, start with the smallest tier you can get away with and scale up as necessary.

# Feeds

## After Dark Feed

Shows the user all NSFW media from people they follow.

Feed at https://bsky.app/profile/did:plc:bfuck3vwwacatltdmnilloym/feed/mutuals-ad

## After Dark Videos Feed

Shows the user all NSFW videos from people they follow. This is a Video Feed, meaning it will display in the Video content mode.

Feed at https://bsky.app/profile/did:plc:bfuck3vwwacatltdmnilloym/feed/mutuals-ad-vid

# Usage

I run this with Digital Ocean App Platform, with their MongoDB as an attached service. Instructions for setting this up can be found in the above guide.

# Docker and Ngrok Testing

For development and testing purposes, there is a docker-compose setup using Visual Studio Codes DevContainers. Start by using ngrok to create a temporary endpoint, add that to the `docker.env` file that references that endpoint as well as adding in your various configuration to publish the feed.

An example:

```Shell
$ ngrok http http://localhost:3000
ngrok                                                        (Ctrl+C to quit)
�  Using ngrok for OSS? Request a community license: https://ngrok.com/r/oss
Session Status                online
Account                       John Doe (Plan: Basic)
Version                       3.23.3
Region                        Europe (eu)
Latency                       24ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://xyz.ngrok-free -> http://localhost:3000
Connections                   ttl     opn     rt1     rt5     p50       p90
                              19      0       0.00    0.00    5.15      5.29
```

Then, test these local and forwarded URLs to make sure the server is running correctly:

- <http://localhost:3000/.well-known/did.json>
- <https://xyz.ngrok-free.app/.well-known/did.json> (update "xyz." with the generated ngrok subdomain)

```Shell
$ curl http://localhost:3000/.well-known/did.json
{
  "@context": [
    "https://www.w3.org/ns/did/v1"
  ],
  "id": "did:web:xyz.ngrok-free.app",
  "service": [
    {
      "id": "#bsky_fg",
      "type": "BskyFeedGenerator",
      "serviceEndpoint": "https://xyz.ngrok-free.app"
    }
  ]
}
$ curl https://xyz.ngrok-free.app/.well-known/did.json | jq
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100   177  100   177    0     0    621      0 --:--:-- --:--:-- --:--:--   618
{
  "@context": [
    "https://www.w3.org/ns/did/v1"
  ],
  "id": "did:web:xyz.ngrok-free.app",
  "service": [
    {
      "id": "#bsky_fg",
      "type": "BskyFeedGenerator",
      "serviceEndpoint": "https://xyz.ngrok-free.app"
    }
  ]
}
```

From there you can publish to BSky with the yarn commands, but all database requests will be sent to your local MongoDB instance.

And since we have the MongoDB extension installed in our dev instance, we can easily connect and see that the posts are being added to our database:

![Image](https://github.com/user-attachments/assets/d2120d4b-484b-4b0d-8e34-e72769cb7114)

Remember to unpublish afterwards!

## Database

The DB could feasibly be swapped out for any other, and there are lots of changes that could make it more efficient. However, if you're new I recommend using the provided dbClient.

## Adding Feeds

The tool is built to have each algorithm self-contained within a file in [src/algos](src/algos). Each algorithm should export both a handler function and manager class (that can inherit from algoManager). The _manager_ is expected to implement filter methods (e.g. filter_post) that will match events that the algorithm will later deal with.

Where there's a match, the post will be stored in the database, tagged for the algorithm that matched. This can be used later in the handler function to identify posts that the algorithm should return.

Feeds will have periodicTask called every X minutes from the environment setting in FEEDGEN_TASK_INTEVAL_MINS - this is for things like list updates, or time consuming tasks that shouldn't happen interactively.

Labels are fetched periodically via the batchUpdate function.

## Major TODOs

- TODO: Add feed for "Home+" which shows posts from "friends of friends" and aggregates popular posts within a user's personal network for curation.
