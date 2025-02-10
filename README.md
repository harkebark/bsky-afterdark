# After Dark Feeds

This code was originally a fork of https://github.com/Bossett/bsky-feeds by Bossett, which was originally a fork of [the official Bluesky feed generator starter kit](https://github.com/bluesky-social/feed-generator). Both repos contain lots of information about the mechanics of feed generation and how to publish feeds.

The feeds in this repo store all media posts off the firehose to a database and use authentication to provide user-specific feeds. This allows for users to only see posts from people they are following in the feed without manually setting up a feed.

# Hosting

This feed is hosted on [Digital Ocean](https://m.do.co/c/a838c8f1e33a) which was achieved by [following the guide written by Bossett.](https://bossett.io/setting-up-bossetts-bluesky-feed-generator/) It walks you through setup of the app and gives Bossett some affiliate credit for putting all of this together. Given the high volume of image posts I recommend using the $10 application tier instead of the $5 testing tier recommended in the guide, but ymmv.

# Feeds

## After Dark Feed

Shows the user all NSFW media from people they follow.

Feed at https://bsky.app/profile/did:plc:bfuck3vwwacatltdmnilloym/feed/mutuals-ad

## After Dark Videos Feed

Shows the user all NSFW videos from people they follow. This is a Video Feed, meaning it will display in the Video content mode.

Feed at https://bsky.app/profile/did:plc:bfuck3vwwacatltdmnilloym/feed/mutuals-ad-vid


# Usage

I run this with Digital Ocean App Platform, with their MongoDB as an attached service. Instructions for setting this up can be found in the above guide.

To run a test feed locally I modified Bossett's original .devcontainer file to activate docker's internal host gateway and set up a connection to a local MongoDB instance by exposing more ports. Uncomment lines 26-31 to do this. I use [ngrok](https://ngrok.com/) to create a tunnel between my local docker instance's exposed IP and a hosted domain for feed publishing. 

## Database

The DB could feasibly be swapped out for any other, and there are lots of changes that could make it more efficient. However, if you're new I recommend using the provided dbClient.


## Adding Feeds

The tool is built to have each algorithm self-contained within a file in [src/algos](src/algos). Each algorithm should export both a handler function and manager class (that can inherit from algoManager). The _manager_ is expected to implement filter methods (e.g. filter_post) that will match events that the algorithm will later deal with.

Where there's a match, the post will be stored in the database, tagged for the algorithm that matched. This can be used later in the handler function to identify posts that the algorithm should return.

Feeds will have periodicTask called every X minutes from the environment setting in FEEDGEN_TASK_INTEVAL_MINS - this is for things like list updates, or time consuming tasks that shouldn't happen interactively.

Labels are fetched periodically via the batchUpdate function.

## Major TODOs

- TODO: Add feed for "Home+" which shows posts from "friends of friends" and aggregates popular posts within a user's personal network for curation.
