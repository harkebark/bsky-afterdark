import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'

import * as cats from './cats'
import * as afterdark from './afterdark'
import * as afterdarkvid from './afterdarkvid'
import { BskyAgent } from '@atproto/api'


type AlgoHandler = (ctx: AppContext, params: QueryParams, agent: BskyAgent, requesterDID?: string | null) => Promise<AlgoOutput>

const algos = {

  [cats.shortname]: {
    handler: <AlgoHandler>cats.handler,
    manager: cats.manager,
  },
  [afterdark.shortname]: {
    handler: <AlgoHandler>afterdark.handler,
    manager: afterdark.manager,
  },
  [afterdarkvid.shortname]: {
    handler: <AlgoHandler>afterdarkvid.handler,
    manager: afterdarkvid.manager,
  },
  
}

export default algos
