const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const initDb = async () => {
  try {
    // Create videos table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        video_id VARCHAR(255) PRIMARY KEY,
        title TEXT NOT NULL,
        thumbnail TEXT,
        views BIGINT DEFAULT 0,
        likes BIGINT DEFAULT 0,
        comments BIGINT DEFAULT 0,
        published_at TIMESTAMP,
        previous_views BIGINT DEFAULT 0,
        trend_score FLOAT DEFAULT 0,
        last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create keywords table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS keywords (
        keyword VARCHAR(255) PRIMARY KEY,
        score FLOAT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create a table for the latest AI summary
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_summary (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

module.exports = { pool, initDb };
