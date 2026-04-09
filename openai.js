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
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('Error generating trend summary:', err.message);
    return "Error generating AI trend summary.";
  }
};

const filterKeywords = async (keywordList) => {
  if (!process.env.OPENAI_API_KEY || keywordList.length === 0) {
    return keywordList;
  }

  try {
    const prompt = `다음은 유튜브 영상 제목에서 추출된 키워드들입니다. 
이 중에서 '특정 콘텐츠, 인물, 사건, 유행어, 브랜드, 게임명' 등 트렌드를 나타내는 구체적인 단어만 남기고, 
광범위하거나 의미가 모호한 일반 단어(예: NEW, WITH, 싶어, 어떻게, 오늘, 정말, 대박, 추천 등)는 제거해주세요.

결과는 다른 설명 없이 콤마(,)로 구분된 키워드 리스트만 보내주세요.

키워드 리스트: ${keywordList.join(', ')}`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    const filteredText = response.choices[0].message.content.trim();
    return filteredText.split(',').map(k => k.trim()).filter(k => k.length > 0);
  } catch (err) {
    console.error('Error filtering keywords via AI:', err.message);
    return keywordList; // 에러 발생 시 원래 리스트 반환
  }
};

module.exports = { generateTrendSummary, filterKeywords };
