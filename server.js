const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { pool, initDb } = require('./db');
const { fetchMostPopularVideos, fetchRecentVideos, getRecentUploadCount } = require('./youtube');
const { generateTrendSummary, filterKeywords } = require('./openai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Scoring logic - Matches trend_score = log(growth_rate + 1) * 0.6 + (like_rate * 100) * 0.2 + (comment_rate * 100) * 0.2
const calculateTrendScore = (video) => {
  const stats = video.statistics || {};
  const currentViews = parseInt(stats.viewCount) || 0;
  const previousViews = parseInt(video.previous_views) || 0;
  const likes = parseInt(stats.likeCount) || 0;
  const comments = parseInt(stats.commentCount) || 0;

  const growthRate = Math.max(0, currentViews - previousViews);
  const likeRate = currentViews > 0 ? likes / currentViews : 0;
  const commentRate = currentViews > 0 ? comments / currentViews : 0;

  const score = Math.log10(growthRate + 1) * 0.6 + (likeRate * 100) * 0.2 + (commentRate * 100) * 0.2;
  return score;
};

// Data collection & analysis task
const collectAndAnalyzeData = async () => {
  console.log('Starting data collection and analysis...');
  try {
    // 1. Fetch Popular Videos (around 50)
    const popularVideos = await fetchMostPopularVideos();
    
    // 2. Sample Recent Videos (10-20 iterations to overcome API limits)
    let recentVideosSet = new Map();
    for (let i = 0; i < 15; i++) {
        const batch = await fetchRecentVideos();
        batch.forEach(v => {
            const vid = typeof v.id === 'string' ? v.id : v.id.videoId;
            recentVideosSet.set(vid, v);
        });
    }
    const recentVideos = Array.from(recentVideosSet.values());
    const allFetchedVideos = [...popularVideos, ...recentVideos];

    console.log(`Fetched ${popularVideos.length} popular and ${recentVideos.length} unique recent videos.`);

    // 3. Save videos to DB and calculate trend scores
    for (const video of allFetchedVideos) {
      const { id, snippet, statistics } = video;
      const videoId = typeof id === 'string' ? id : id.videoId;
      
      const existing = await pool.query('SELECT views FROM videos WHERE video_id = $1', [videoId]);
      const prevViews = existing.rows.length > 0 ? existing.rows[0].views : 0;
      
      const score = calculateTrendScore({ ...video, previous_views: prevViews });

      await pool.query(`
        INSERT INTO videos (video_id, title, thumbnail, views, likes, comments, published_at, previous_views, trend_score, last_checked)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (video_id) DO UPDATE SET
          previous_views = videos.views,
          views = EXCLUDED.views,
          likes = EXCLUDED.likes,
          comments = EXCLUDED.comments,
          trend_score = EXCLUDED.trend_score,
          last_checked = CURRENT_TIMESTAMP;
      `, [
        videoId,
        snippet.title,
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, // HQ thumbnail requirement
        statistics.viewCount || 0,
        statistics.likeCount || 0,
        statistics.commentCount || 0,
        snippet.publishedAt,
        prevViews,
        score
      ]);
    }

    // 4. Keyword Analysis
    const stopWords = ['[', ']', '(', ')', '-', '|', '의', '가', '이', '은', '는', '를', '에', '와', '과', '도', '으로', '에서', '합니다', '니다', '있습니다', '하는', '에서', '것입니다', '유튜브', '채널', '구독', '좋아요', '영상', '비디오'];
    const keywordMap = new Map();
    
    popularVideos.slice(0, 50).forEach(v => {
      const words = v.snippet.title.split(/\s+/);
      words.forEach(word => {
        const clean = word.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').trim();
        if (clean.length > 1 && !stopWords.includes(clean)) {
          keywordMap.set(clean, (keywordMap.get(clean) || 0) + 1);
        }
      });
    });

    const topRawKeywords = Array.from(keywordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40); // Initial top 40

    const rawKeywordList = topRawKeywords.map(k => k[0]);
    console.log('Filtering keywords via AI...');
    const filteredKeywords = await filterKeywords(rawKeywordList);
    console.log(`AI filtered keywords: ${filteredKeywords.length} remaining.`);

    // Clear old keywords to keep only fresh trends
    await pool.query('DELETE FROM keywords');

    for (const keyword of filteredKeywords) {
      const frequency = keywordMap.get(keyword) || 1;
      const recentCount = await getRecentUploadCount(keyword);
      
      const avgScoreRes = await pool.query(`
        SELECT AVG(trend_score) as avg_score FROM videos 
        WHERE title ILIKE $1
      `, [`%${keyword}%`]);
      const avgTrendScore = parseFloat(avgScoreRes.rows[0].avg_score) || 0;

      // keyword_score = (frequency * 0.5) + (recent_count * 0.3) + (avg_trend_score * 0.2)
      const normalizedRecent = Math.min(recentCount / 10, 100); 
      const score = (frequency * 0.5) + (normalizedRecent * 0.3) + (avgTrendScore * 0.2);

      await pool.query(`
        INSERT INTO keywords (keyword, score, last_updated)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (keyword) DO UPDATE SET
          score = EXCLUDED.score,
          last_updated = CURRENT_TIMESTAMP;
      `, [keyword, score]);
    }

    // 5. AI Summary
    const finalKeywords = filteredKeywords.slice(0, 15);
    const videoTitles = popularVideos.slice(0, 15).map(v => v.snippet.title);
    const summary = await generateTrendSummary(finalKeywords, videoTitles);
    
    await pool.query('INSERT INTO ai_summary (content) VALUES ($1)', [summary]);

    console.log('Analysis complete!');
  } catch (err) {
    console.error('Error during collection and analysis:', err);
  }
};

// Cron job: Every 30 minutes (Matches requirement: 10~30 min)
cron.schedule('*/30 * * * *', collectAndAnalyzeData);

// API Endpoints
app.get('/api/trends', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM keywords ORDER BY score DESC LIMIT 25');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const keyword = req.query.keyword;
    let result;
    if (keyword) {
      result = await pool.query(`
        SELECT * FROM videos 
        WHERE title ILIKE $1 
        ORDER BY trend_score DESC LIMIT 15
      `, [`%${keyword}%`]);
    } else {
      result = await pool.query('SELECT * FROM videos ORDER BY trend_score DESC LIMIT 20');
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    const result = await pool.query('SELECT content FROM ai_summary ORDER BY created_at DESC LIMIT 1');
    res.json(result.rows[0] || { content: "No summary available yet. Analysis is in progress..." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialization
initDb().then(() => {
  console.log('Starting server...');
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Run once on startup to have initial data
    collectAndAnalyzeData(); 
  });
});
