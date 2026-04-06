const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateTrendSummary = async (keywords, videoTitles) => {
  if (!process.env.OPENAI_API_KEY) {
    return "OpenAI API key is not configured. Please add it to your .env file.";
  }

  try {
    const prompt = `Based on the following YouTube trend data, provide a concise summary (around 3-4 sentences) of current trends and why they are popular.
    
Keywords: ${keywords.join(', ')}
    
Representative Video Titles:
${videoTitles.slice(0, 10).join('\n')}

Please write the summary in Korean.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // or "gpt-4"
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('Error generating trend summary:', err.message);
    return "Error generating AI trend summary.";
  }
};

module.exports = { generateTrendSummary };
