/**
 * feedRankingService.js
 *
 * Smart feed ranking engine for GhostProtocol.
 * Inspired by EdgeRank / Instagram feed ranking principles.
 *
 * SCORE FORMULA:
 *   score = (followBoost)
 *         + (engagementScore)   — based on likes & comments (log-scaled, capped)
 *         + (recencyScore)      — exponential time decay
 *         + (jitter)            — small randomness to avoid identical ordering
 *
 * All weights are tunable without touching core logic.
 */

// ─── WEIGHTS (tune without changing core logic) ───────────────────────────────

const WEIGHTS = {
  // Flat bonus for posts from followed users
  FOLLOW_BOOST: 40,

  // Per reaction/like (log-scaled to prevent viral manipulation)
  LIKE_WEIGHT: 3,

  // Per comment (comments signal deeper engagement)
  COMMENT_WEIGHT: 5,

  // Engagement cap: max score from engagement alone (anti-spam)
  ENGAGEMENT_CAP: 60,

  // Recency: half-life in hours — score halves every N hours
  // 12h = fast-decaying feed (like Twitter)
  // 24h = balanced (like Instagram)
  // 48h = slow / evergreen (like Facebook groups)
  RECENCY_HALF_LIFE_HOURS: 20,

  // Maximum recency score
  RECENCY_MAX: 50,

  // Max random jitter added to each post score (±jitter/2)
  JITTER_MAX: 8,
};

/**
 * Exponential time decay score.
 * New posts score close to RECENCY_MAX; older posts decay toward 0.
 *
 * Formula: score = RECENCY_MAX * (0.5 ^ (ageInHours / halfLife))
 *
 * @param {Date} createdAt
 * @returns {number}
 */
const recencyScore = (createdAt) => {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const decay = Math.pow(0.5, ageHours / WEIGHTS.RECENCY_HALF_LIFE_HOURS);
  return WEIGHTS.RECENCY_MAX * decay;
};

/**
 * Engagement score: log-scaled to prevent viral posts from dominating
 * and naturally capped to ENGAGEMENT_CAP.
 *
 * log(1 + x) smooths the curve: 0 likes → 0, 10 likes → ~2.4, 1000 likes → ~7
 *
 * @param {number} likes
 * @param {number} comments
 * @returns {number}
 */
const engagementScore = (likes = 0, comments = 0) => {
  const raw =
    Math.log1p(likes) * WEIGHTS.LIKE_WEIGHT +
    Math.log1p(comments) * WEIGHTS.COMMENT_WEIGHT;
  return Math.min(raw, WEIGHTS.ENGAGEMENT_CAP);
};

/**
 * Small deterministic-ish jitter so the feed feels alive.
 * Uses Math.random() — call once per request to get consistent per-request jitter.
 *
 * @returns {number}
 */
const jitter = () => (Math.random() - 0.5) * WEIGHTS.JITTER_MAX;

/**
 * Calculate a ranking score for a single post given the viewer's follow list.
 *
 * @param {Object} post       - Raw Mongoose post document (or POJO)
 * @param {Set<string>} followingSet  - Set of authorId strings the viewer follows
 * @returns {number}
 */
export const scorePost = (post, followingSet) => {
  const followBoost =
    !post.isAnonymous &&
    post.authorId &&
    followingSet.has(post.authorId.toString())
      ? WEIGHTS.FOLLOW_BOOST
      : 0;

  const engagement = engagementScore(post.likes, post.commentCount);
  const recency = recencyScore(post.createdAt);
  const noise = jitter();

  return followBoost + engagement + recency + noise;
};

/**
 * Rank an array of posts for a specific viewer.
 *
 * @param {Array}  posts         - Array of Mongoose post documents
 * @param {Array}  followingIds  - Array of ObjectId/string IDs that the viewer follows
 * @returns {Array} Posts sorted by descending score
 */
export const rankFeed = (posts, followingIds = []) => {
  const followingSet = new Set(followingIds.map((id) => id.toString()));

  return posts
    .map((post) => ({
      post,
      score: scorePost(post, followingSet),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ post }) => post);
};

/**
 * FUTURE IMPROVEMENTS (production scalability)
 * ─────────────────────────────────────────────
 * 1. PRECOMPUTED SCORES
 *    - Store a `feedScore` field on each post document.
 *    - Recalculate via a background worker (cron / BullMQ job) every 15–30min.
 *    - Feed query becomes: Post.find().sort({ feedScore: -1 }) — O(index scan) only.
 *
 * 2. REDIS CACHING
 *    - Cache the ranked feed per user for 2–5 minutes.
 *    - Key: `feed:<userId>`, TTL: 120s.
 *    - Invalidate on new post creation or significant engagement changes.
 *
 * 3. PAGINATION / CURSOR
 *    - Use cursor-based pagination instead of skip/limit.
 *    - Store the score of the last seen post as the cursor.
 *
 * 4. SEGMENTED FETCH
 *    - Fetch followed-user posts and non-followed posts separately.
 *    - Interleave: every 5th post from non-followed, rest from followed.
 *    - Reduces personalization latency.
 *
 * 5. INTERACTION SIGNALS
 *    - Track per-user click-through / dwell-time for deeper personalization.
 *    - Add a `userInteractionScore` per (userId, postId) pair.
 */
