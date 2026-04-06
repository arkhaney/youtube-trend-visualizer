const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

const fetchMostPopularVideos = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/videos`, {
      params: {
        part: 'snippet,statistics',
        chart: 'mostPopular',
        maxResults: 50,
        regionCode: 'KR', // User can change this for specific countries
        key: API_KEY
      }
    });
    return response.data.items;
  } catch (err) {
    console.error('Error fetching most popular videos:', err.response?.data || err.message);
    return [];
  }
};

const fetchRecentVideos = async () => {
  const randomChars = 'abcdefghijklmnopqrstuvwxyz';
  const query = randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  
  try {
    const response = await axios.get(`${BASE_URL}/search`, {
      params: {
        part: 'snippet',
        q: query,
        type: 'video',
        order: 'date',
        maxResults: 50,
        key: API_KEY
      }
    });
    
    const videoIds = response.data.items.map(item => item.id.videoId).join(',');
    return await getVideoDetails(videoIds);
  } catch (err) {
    console.error('Error searching recent videos:', err.response?.data || err.message);
    return [];
  }
};

const getVideoDetails = async (videoIds) => {
  if (!videoIds) return [];
  try {
    const response = await axios.get(`${BASE_URL}/videos`, {
      params: {
        part: 'snippet,statistics',
        id: videoIds,
        key: API_KEY
      }
    });
    return response.data.items;
  } catch (err) {
    console.error('Error getting video details:', err.response?.data || err.message);
    return [];
  }
};

const getRecentUploadCount = async (keyword) => {
  try {
    const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const response = await axios.get(`${BASE_URL}/search`, {
      params: {
        part: 'snippet',
        q: keyword,
        type: 'video',
        publishedAfter: publishedAfter,
        maxResults: 50,
        key: API_KEY
      }
    });
    return response.data.pageInfo.totalResults;
  } catch (err) {
    console.error(`Error getting recent upload count for keyword ${keyword}:`, err.response?.data || err.message);
    return 0;
  }
};

module.exports = { fetchMostPopularVideos, fetchRecentVideos, getVideoDetails, getRecentUploadCount };
