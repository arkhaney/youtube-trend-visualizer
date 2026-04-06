document.addEventListener('DOMContentLoaded', () => {
    fetchTrends();
    fetchSummary();
    fetchVideos();

    // Modal close logic
    const modal = document.getElementById('modal');
    const span = document.getElementsByClassName('close')[0];
    span.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) modal.style.display = 'none';
    };
});

async function fetchTrends() {
    try {
        const response = await fetch('/api/trends');
        const trends = await response.json();
        renderWordCloud(trends);
    } catch (err) {
        console.error('Error fetching trends:', err);
    }
}

async function fetchSummary() {
    try {
        const response = await fetch('/api/summary');
        const data = await response.json();
        document.getElementById('ai-summary').innerText = data.content;
    } catch (err) {
        console.error('Error fetching summary:', err);
    }
}

async function fetchVideos() {
    try {
        const response = await fetch('/api/videos');
        const videos = await response.json();
        renderVideos(videos, 'video-grid');
    } catch (err) {
        console.error('Error fetching videos:', err);
    }
}

function renderWordCloud(trends) {
    const cloud = document.getElementById('word-cloud');
    cloud.innerHTML = '';
    if (trends.length === 0) return;

    // Sort by score to place largest in the center
    trends.sort((a, b) => b.score - a.score);

    const maxScore = Math.max(...trends.map(t => t.score));
    const containerWidth = cloud.offsetWidth;
    const containerHeight = cloud.offsetHeight;
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    const placedRects = [];

    trends.forEach(trend => {
        const span = document.createElement('span');
        span.className = 'keyword';
        span.innerText = trend.keyword.toUpperCase();

        // 글자 간 크기 차이를 줄이고 작은 글자를 키움 (1.1rem ~ 5.1rem)
        // 지수(pow)를 낮춰서 인기도 격차를 시각적으로 완만하게 조절
        const ratio = trend.score / maxScore;
        const size = 1.1 + Math.pow(ratio, 1.4) * 4.0;
        span.style.fontSize = `${size}rem`;

        const colors = ['#000', '#1a1a1a', '#4285F4', '#EA4335', '#FBBC05', '#34A853'];        span.style.color = colors[Math.floor(Math.random() * colors.length)];

        // Initial check: append to measure actual size
        cloud.appendChild(span);
        const rect = {
            width: span.offsetWidth,
            height: span.offsetHeight
        };

        // Spiral Algorithm to find position
        let angle = 0;
        let radius = 0;
        let placed = false;
        const step = 0.1; // 더 세밀한 탐색 (0.2 -> 0.1)
        const spread = 2; // 회전당 간격 축소 (4 -> 2)

        while (!placed && radius < Math.max(containerWidth, containerHeight)) {
            const x = centerX + Math.cos(angle) * radius - rect.width / 2;
            const y = centerY + Math.sin(angle) * radius - rect.height / 2;

            const currentRect = { x, y, w: rect.width, h: rect.height };
            const margin = 1; // 뭉쳐 보이도록 마진 최소화 (5 -> 1)

            // 경계선 체크: 여백 5px 추가
            const isOutOfBounds = (
                currentRect.x < 5 || 
                currentRect.y < 5 || 
                currentRect.x + currentRect.w > containerWidth - 5 || 
                currentRect.y + currentRect.h > containerHeight - 5
            );
            
            // Overlap detection with margin
            const overlap = placedRects.some(r => {
                return !(currentRect.x + currentRect.w + margin < r.x || 
                         currentRect.x > r.x + r.w + margin || 
                         currentRect.y + currentRect.h + margin < r.y || 
                         currentRect.y > r.y + r.h + margin);
            });

            if (!overlap && !isOutOfBounds) {
                span.style.left = `${x}px`;
                span.style.top = `${y}px`;
                placedRects.push(currentRect);
                placed = true;
            } else {
                angle += step;
                radius = spread * angle / (2 * Math.PI);
            }
        }

        if (!placed) cloud.removeChild(span); // Remove if no space found
        span.onclick = () => showKeywordVideos(trend.keyword);
    });
}

function renderVideos(videos, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    videos.forEach(video => {
        const growth = Math.max(0, video.views - video.previous_views);
        const card = document.createElement('a');
        card.className = 'video-card';
        card.href = `https://www.youtube.com/watch?v=${video.video_id}`;
        card.target = '_blank';

        card.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="video-info">
                <h3>${video.title}</h3>
                <p class="video-stats">
                    조회수 ${formatNumber(video.views)}회 
                    <span style="color: #d93025; font-weight: bold;">(+${formatNumber(growth)})</span>
                </p>
            </div>
        `;
        container.appendChild(card);
    });
}

async function showKeywordVideos(keyword) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    modalTitle.innerText = `'${keyword}' 관련 영상`;
    modal.style.display = 'block';

    try {
        const response = await fetch(`/api/videos?keyword=${encodeURIComponent(keyword)}`);
        const videos = await response.json();
        renderVideos(videos, 'modal-video-grid');
    } catch (err) {
        console.error('Error fetching keyword videos:', err);
    }
}

function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '만';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + '천';
    }
    return num.toString();
}
