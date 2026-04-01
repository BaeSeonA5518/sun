/* ===================== CONFIG ===================== */
const TMDB_ORIGIN = 'https://api.themoviedb.org/3';
const PROXY_PATH  = '/api/tmdb';
const IMG_BASE    = 'https://image.tmdb.org/t/p/';

/** 프로덕션 빌드: 키 없이 /api/tmdb 프록시만 사용 (서버 환경변수 TMDB_API_KEY) */
const useProxy = import.meta.env.PROD || import.meta.env.VITE_FORCE_TMDB_PROXY === 'true';
const devKey     = import.meta.env.VITE_TMDB_API_KEY;

function isTmdbConfigured() {
  return useProxy || !!devKey;
}

/**
 * TMDB v3 GET — 개발: 직접 호출(+VITE 키) / 배포: 프록시(키는 서버만)
 */
async function tmdbFetch(path, params = {}) {
  const sp = new URLSearchParams({ language: 'ko-KR', ...params });
  let url;
  if (useProxy) {
    sp.set('path', path);
    url = `${PROXY_PATH}?${sp}`;
  } else {
    if (!devKey) throw new Error('VITE_TMDB_API_KEY 없음');
    sp.set('api_key', devKey);
    url = `${TMDB_ORIGIN}/${path}?${sp}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 포스터 없음 / 로드 실패 시 (외부 placeholder 대신 data URL — 항상 표시됨)
const NO_POSTER_DATA_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
      <rect fill="#1c1c1c" width="500" height="750"/>
      <rect fill="#2a2a2a" x="120" y="260" width="260" height="200" rx="8"/>
      <circle fill="#3a3a3a" cx="250" cy="340" r="28"/>
      <path fill="none" stroke="#555" stroke-width="4" d="M210 380 L290 380"/>
    </svg>`
  );

/* ===================== CATEGORY CONFIG ===================== */
const MOVIE_CATEGORIES = [
  { key: 'now_playing', label: '지금 상영 중', type: 'movie' },
  { key: 'popular',     label: '인기 영화',    type: 'movie' },
  { key: 'top_rated',   label: '최고 평점',    type: 'movie' },
  { key: 'upcoming',    label: '개봉 예정',    type: 'movie' },
];

const TV_CATEGORIES = [
  { key: 'airing_today', label: '오늘 방영',       type: 'tv' },
  { key: 'on_the_air',   label: '현재 방영 중',     type: 'tv' },
  { key: 'popular',      label: '인기 TV 프로그램', type: 'tv' },
  { key: 'top_rated',    label: '최고 평점 TV',     type: 'tv' },
];

const CATEGORIES = [...MOVIE_CATEGORIES, ...TV_CATEGORIES];

/* ===================== STATE ===================== */
let currentHeroMovie = null;
let heroPool         = [];   // 영화 + TV 통합 히어로 풀
let heroIndex        = 0;
let isSearchMode     = false;

/* ===================== DOM ===================== */
const heroEl        = document.getElementById('hero');
const heroTitle     = document.getElementById('heroTitle');
const heroDesc      = document.getElementById('heroDesc');
const heroLabel     = document.getElementById('heroLabel');
const searchInput        = document.getElementById('searchInput');
const headerSearchToggle = document.getElementById('headerSearchToggle');
const headerSearch       = headerSearchToggle.closest('.header__search');
const searchResultSection = document.getElementById('searchResultSection');
const searchGrid    = document.getElementById('searchGrid');
const rowsContainer = document.getElementById('rowsContainer');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose    = document.getElementById('modalClose');
const modalHero     = document.getElementById('modalHero');
const modalTitle    = document.getElementById('modalTitle');
const modalOverview = document.getElementById('modalOverview');
const modalRating   = document.getElementById('modalRating');
const modalYear     = document.getElementById('modalYear');
const modalLang     = document.getElementById('modalLang');

/* ===================== HEADER SCROLL ===================== */
window.addEventListener('scroll', () => {
  document.querySelector('.header').classList.toggle('scrolled', window.scrollY > 50);
});

/* ===================== HERO ===================== */
function setHero(item) {
  if (!item) return;
  currentHeroMovie = item;

  const bg = item.backdrop_path
    ? `${IMG_BASE}original${item.backdrop_path}`
    : (item.poster_path ? `${IMG_BASE}w1280${item.poster_path}` : '');

  if (bg) heroEl.style.backgroundImage = `url('${bg}')`;
  heroTitle.textContent = item.title || item.name || '제목 없음';
  heroDesc.textContent  = item.overview || '';
  heroLabel.textContent = item._mediaType === 'tv' ? '지금 방영 중' : '지금 상영 중';
}

document.getElementById('heroPlayBtn').addEventListener('click', () => {
  if (currentHeroMovie) openModal(currentHeroMovie, true, currentHeroMovie._mediaType || 'movie');
});

document.getElementById('heroInfoBtn').addEventListener('click', () => {
  if (currentHeroMovie) openModal(currentHeroMovie, false, currentHeroMovie._mediaType || 'movie');
});

/* ===================== FETCH ===================== */
async function fetchMovies(category, page = 1, type = 'movie') {
  return tmdbFetch(`${type}/${category}`, { page: String(page) });
}

/* ===================== MAKE CARD ===================== */
function makeCard(movie, badge = '', showRating = true, mediaType = 'movie', badgeCls = '') {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.dataset.mediaType = mediaType; // 카드에 타입 저장

  const path = movie.poster_path && String(movie.poster_path).trim();
  const posterSrc = path ? `${IMG_BASE}w500${path}` : NO_POSTER_DATA_URL;

  const rating    = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const titleText = movie.title || movie.name || '제목 없음';
  const rawDate   = movie.release_date || movie.first_air_date || '';
  const releaseDate = rawDate ? rawDate.slice(2, 7).replace(/-/g, '.') : '';

  card.innerHTML = `
    <img src="${posterSrc}" alt="" loading="lazy" decoding="async" />
    <div class="movie-card__info">
      <p class="movie-card__title">${titleText}</p>
      <div class="movie-card__meta">
        ${showRating ? `<p class="movie-card__rating">${rating}</p>` : ''}
        ${releaseDate ? `<p class="movie-card__date">${releaseDate}</p>` : ''}
      </div>
    </div>
    ${badge ? `<span class="movie-card__badge ${badgeCls}">${badge}</span>` : ''}
  `;

  const img = card.querySelector('img');
  img.alt = titleText;
  img.addEventListener('error', function onPosterErr() {
    this.removeEventListener('error', onPosterErr);
    if (this.src !== NO_POSTER_DATA_URL) this.src = NO_POSTER_DATA_URL;
  });

  card.addEventListener('click', () => openModal(movie, false, mediaType));
  return card;
}

/* ===================== BUILD ROW SECTION ===================== */
function buildRowSection(section, category, label, movies, type = 'movie') {
  const badgeMap = {
    now_playing:  { text: '상영 중',   cls: 'movie-card__badge--now'      },
    upcoming:     { text: '개봉 예정', cls: 'movie-card__badge--upcoming'  },
    airing_today: { text: '오늘 방영', cls: 'movie-card__badge--airing'    },
    on_the_air:   { text: '방영 중',   cls: 'movie-card__badge--on-air'    },
  };
  const badgeInfo = badgeMap[category] || null;
  const badge     = badgeInfo ? badgeInfo.text : '';
  const badgeCls  = badgeInfo ? badgeInfo.cls  : '';
  const showRating = category !== 'upcoming';
  let expanded   = false;
  let extraMovies = [];

  section.innerHTML = `
    <div class="row__header">
      <h3 class="row__title">${label}</h3>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="row__pagination"></div>
        <span class="row__see-all">전체 보기 ›</span>
      </div>
    </div>
    <div class="row__scroll-wrap">
      <button class="row__arrow row__arrow--left hidden" aria-label="이전">
        <span class="row__arrow-icon">&#8249;</span>
      </button>
      <div class="row__track"></div>
      <button class="row__arrow row__arrow--right" aria-label="다음">
        <span class="row__arrow-icon">&#8250;</span>
      </button>
    </div>
    <div class="row__grid" style="display:none"></div>
  `;

  const track      = section.querySelector('.row__track');
  const arrowLeft  = section.querySelector('.row__arrow--left');
  const arrowRight = section.querySelector('.row__arrow--right');
  const pagination = section.querySelector('.row__pagination');
  const seeAllBtn  = section.querySelector('.row__see-all');
  const gridEl     = section.querySelector('.row__grid');

  movies.forEach(movie => track.appendChild(makeCard(movie, badge, showRating, type, badgeCls)));

  // 페이지 계산
  function getPageInfo() {
    const cardWidth  = (track.firstElementChild?.offsetWidth || 160) + 10;
    const pageSize   = Math.floor(track.clientWidth / cardWidth);
    const totalPages = Math.ceil(movies.length / pageSize);
    const currentPage = Math.round(track.scrollLeft / (pageSize * cardWidth));
    return { totalPages: Math.max(totalPages, 1), currentPage, pageWidth: pageSize * cardWidth };
  }

  // 인디케이터 렌더
  function renderPagination() {
    const { totalPages, currentPage } = getPageInfo();
    pagination.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('span');
      dot.className = 'row__page-dot' + (i === currentPage ? ' active' : '');
      pagination.appendChild(dot);
    }
    arrowLeft.classList.toggle('hidden', track.scrollLeft <= 10);
    arrowRight.classList.toggle('hidden',
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 10
    );
  }

  track.addEventListener('scroll', renderPagination);
  window.addEventListener('resize', renderPagination);
  setTimeout(renderPagination, 100); // 카드 렌더 후

  // 화살표 클릭
  arrowLeft.addEventListener('click', () => {
    const { pageWidth } = getPageInfo();
    track.scrollBy({ left: -pageWidth, behavior: 'smooth' });
  });
  arrowRight.addEventListener('click', () => {
    const { pageWidth } = getPageInfo();
    track.scrollBy({ left: pageWidth, behavior: 'smooth' });
  });

  // 전체 보기 토글
  seeAllBtn.addEventListener('click', async () => {
    expanded = !expanded;

    if (expanded) {
      seeAllBtn.textContent              = '접기 ↑';
      section.querySelector('.row__scroll-wrap').style.display = 'none';
      gridEl.style.display               = 'grid';

      if (gridEl.children.length === 0) {
        gridEl.innerHTML = Array(8).fill('<div class="skeleton-card grid-skeleton"></div>').join('');
        try {
          const today = new Date().toISOString().slice(0, 10);
          const [d1, d2] = await Promise.all([fetchMovies(category, 1, type), fetchMovies(category, 2, type)]);
          const merged = [...d1.results, ...d2.results];
          extraMovies = category === 'upcoming'
            ? merged.filter(m => m.release_date && m.release_date > today)
            : merged;
          gridEl.innerHTML = '';
          extraMovies.forEach(m => gridEl.appendChild(makeCard(m, badge, showRating, type, badgeCls)));
        } catch {
          gridEl.innerHTML = '<p style="color:var(--muted);padding:20px">불러오기 실패</p>';
        }
      }
    } else {
      seeAllBtn.textContent              = '전체 보기 ›';
      section.querySelector('.row__scroll-wrap').style.display = '';
      gridEl.style.display               = 'none';
    }
  });
}

/* ===================== SKELETON ROW ===================== */
function makeSkeletonRow(label, id) {
  const section = document.createElement('section');
  section.className = 'row';
  section.id = `row-${id}`;
  section.innerHTML = `
    <div class="row__header">
      <h3 class="row__title">${label}</h3>
    </div>
    <div class="row__scroll-wrap">
      <div class="row__track">
        ${Array(10).fill('<div class="skeleton-card"></div>').join('')}
      </div>
    </div>
  `;
  return section;
}

/* ===================== SECTION DIVIDER ===================== */
function makeDivider(title) {
  const div = document.createElement('div');
  div.className = 'section-divider';
  div.innerHTML = `<span>${title}</span>`;
  return div;
}

/* ===================== INIT ===================== */
async function init() {
  const today = new Date().toISOString().slice(0, 10);

  // 영화 섹션 헤더 + 스켈레톤
  rowsContainer.appendChild(makeDivider('🎬 영화'));
  MOVIE_CATEGORIES.forEach(({ key, label }) => rowsContainer.appendChild(makeSkeletonRow(label, `movie-${key}`)));

  // TV 섹션 헤더 + 스켈레톤
  rowsContainer.appendChild(makeDivider('📺 TV 프로그램'));
  TV_CATEGORIES.forEach(({ key, label }) => rowsContainer.appendChild(makeSkeletonRow(label, `tv-${key}`)));

  // 영화 + TV 동시 fetch
  const [movieResults, tvResults] = await Promise.all([
    Promise.allSettled(
      MOVIE_CATEGORIES.map(({ key }) =>
        key === 'upcoming'
          ? Promise.all([fetchMovies(key, 1, 'movie'), fetchMovies(key, 2, 'movie')]).then(([d1, d2]) => ({
              results: [...d1.results, ...d2.results]
            }))
          : fetchMovies(key, 1, 'movie')
      )
    ),
    Promise.allSettled(
      TV_CATEGORIES.map(({ key }) => fetchMovies(key, 1, 'tv'))
    ),
  ]);

  // 히어로 풀: 영화(now_playing) + TV(airing_today) 섞기
  const heroMovies = movieResults[0].status === 'fulfilled'
    ? movieResults[0].value.results.slice(0, 10).map(m => ({ ...m, _mediaType: 'movie' }))
    : [];
  const heroTV = tvResults[0].status === 'fulfilled'
    ? tvResults[0].value.results.slice(0, 10).map(m => ({ ...m, _mediaType: 'tv' }))
    : [];

  // 교대로 섞기 (영화1, TV1, 영화2, TV2 ...)
  heroPool = [];
  const maxLen = Math.max(heroMovies.length, heroTV.length);
  for (let i = 0; i < maxLen; i++) {
    if (heroMovies[i]) heroPool.push(heroMovies[i]);
    if (heroTV[i])     heroPool.push(heroTV[i]);
  }

  if (heroPool.length) {
    setHero(heroPool[0]);
  }

  // 영화 행 교체
  movieResults.forEach((result, i) => {
    const { key, label } = MOVIE_CATEGORIES[i];
    const existingSection = document.getElementById(`row-movie-${key}`);
    if (!existingSection) return;

    if (result.status === 'fulfilled') {
      const movies = key === 'upcoming'
        ? result.value.results.filter(m => m.release_date && m.release_date > today)
        : result.value.results;

      const newSection = document.createElement('section');
      newSection.className = 'row';
      newSection.id = `row-movie-${key}`;
      existingSection.replaceWith(newSection);
      buildRowSection(newSection, key, label, movies, 'movie');
    } else {
      existingSection.innerHTML = `<p style="color:var(--muted);padding:20px 0">${label}을 불러오지 못했습니다.</p>`;
    }
  });

  // TV 행 교체
  tvResults.forEach((result, i) => {
    const { key, label } = TV_CATEGORIES[i];
    const existingSection = document.getElementById(`row-tv-${key}`);
    if (!existingSection) return;

    if (result.status === 'fulfilled') {
      const newSection = document.createElement('section');
      newSection.className = 'row';
      newSection.id = `row-tv-${key}`;
      existingSection.replaceWith(newSection);
      buildRowSection(newSection, key, label, result.value.results, 'tv');
    } else {
      existingSection.innerHTML = `<p style="color:var(--muted);padding:20px 0">${label}을 불러오지 못했습니다.</p>`;
    }
  });
}

/* ===================== HERO AUTO ROTATE ===================== */
setInterval(() => {
  if (!heroPool.length || isSearchMode) return;
  heroIndex = (heroIndex + 1) % heroPool.length;
  setHero(heroPool[heroIndex]);
}, 8000);

/* ===================== SEARCH ===================== */
let searchTimer = null;

async function doSearch() {
  const query = searchInput.value.trim();

  if (!query) {
    isSearchMode = false;
    searchResultSection.style.display = 'none';
    rowsContainer.style.display = 'block';
    return;
  }

  isSearchMode = true;
  rowsContainer.style.display = 'none';
  searchResultSection.style.display = 'block';
  searchGrid.innerHTML = Array(8).fill('<div class="skeleton-card"></div>').join('');

  try {
    const data = await tmdbFetch('search/multi', { query, page: '1' });

    // movie / tv 만 필터 (person 제외)
    const results = (data.results || []).filter(m => m.media_type === 'movie' || m.media_type === 'tv');

    searchGrid.innerHTML = '';
    if (results.length === 0) {
      searchGrid.innerHTML = `<div class="no-results"><span>🎬</span>"${query}" 검색 결과가 없습니다.</div>`;
    } else {
      results.forEach(m => searchGrid.appendChild(makeCard(m, '', true, m.media_type)));
    }
  } catch {
    searchGrid.innerHTML = `<div class="no-results"><span>⚠️</span>검색 중 오류가 발생했습니다.</div>`;
  }
}

// 검색 아이콘 클릭 → 입력창 토글
headerSearchToggle.addEventListener('click', () => {
  const isOpen = headerSearch.classList.toggle('open');
  if (isOpen) {
    searchInput.focus();
  } else {
    searchInput.value = '';
    doSearch(); // 닫으면 결과 초기화
  }
});

// 바깥 클릭 시 닫기
document.addEventListener('click', e => {
  if (!headerSearch.contains(e.target)) {
    headerSearch.classList.remove('open');
  }
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    headerSearch.classList.remove('open');
    searchInput.value = '';
    doSearch();
  }
  if (e.key === 'Enter') doSearch();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 400);
});

/* ===================== FETCH TRAILER ===================== */
async function fetchTrailerKey(id, mediaType = 'movie') {
  const pick = (results) =>
    results?.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
    results?.find(v => v.site === 'YouTube');

  const data = await tmdbFetch(`${mediaType}/${id}/videos`, { language: 'ko-KR' });
  let video = pick(data.results);

  if (!video) {
    const enData = await tmdbFetch(`${mediaType}/${id}/videos`, { language: 'en-US' });
    video = pick(enData.results);
  }
  return video ? video.key : null;
}

/* ===================== MODAL ===================== */
async function openModal(movie, autoPlay = false, mediaType = 'movie') {
  const pPath = movie.poster_path && String(movie.poster_path).trim();
  const backdropSrc = movie.backdrop_path
    ? `${IMG_BASE}w1280${movie.backdrop_path}`
    : (pPath ? `${IMG_BASE}w500${pPath}` : NO_POSTER_DATA_URL);

  const yearRaw = movie.release_date || movie.first_air_date || '';

  modalTitle.textContent    = movie.title || movie.name || '제목 없음';
  modalOverview.textContent = movie.overview || '줄거리 정보가 없습니다.';
  modalRating.textContent   = movie.vote_average ? `★ ${movie.vote_average.toFixed(1)} / 10` : '';
  modalYear.textContent     = yearRaw ? yearRaw.slice(0, 4) : '';
  modalLang.textContent     = (movie.original_language || '').toUpperCase();

  modalBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';

  const iframeHTML = (key) =>
    `<iframe src="https://www.youtube.com/embed/${key}?autoplay=1&rel=0"
       allow="autoplay; encrypted-media" allowfullscreen
       style="width:100%;height:100%;border:none;position:absolute;inset:0;"></iframe>`;

  const noTrailerHTML = `<div class="no-trailer"><span>🎬</span><p>영상 정보가 없습니다</p></div>`;

  if (autoPlay) {
    modalHero.innerHTML = `<div class="no-trailer"><span>⏳</span><p>영상 불러오는 중...</p></div>`;
    const key = await fetchTrailerKey(movie.id, mediaType);
    modalHero.innerHTML = key ? iframeHTML(key) : noTrailerHTML;
  } else {
    modalHero.innerHTML = `
      <div class="trailer-thumb" style="background-image:url('${backdropSrc}')">
        <div class="trailer-thumb__overlay"></div>
        <button class="trailer-play-btn" id="trailerPlayBtn">
          <svg viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="34" cy="34" r="34" fill="rgba(0,0,0,0.6)"/>
            <polygon points="26,20 54,34 26,48" fill="white"/>
          </svg>
        </button>
        <span class="trailer-loading" id="trailerLoading" style="display:none">영상 불러오는 중...</span>
      </div>
    `;

    document.getElementById('trailerPlayBtn').addEventListener('click', async () => {
      document.getElementById('trailerPlayBtn').style.display  = 'none';
      document.getElementById('trailerLoading').style.display = 'block';
      const key = await fetchTrailerKey(movie.id, mediaType);
      modalHero.innerHTML = key ? iframeHTML(key) : noTrailerHTML;
    });
  }
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  document.body.style.overflow = '';
  modalHero.innerHTML = '';
}

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ===================== RECOMMENDATION ===================== */

// TMDB 장르 ID — 영화용
const GENRE = {
  action: 28, adventure: 12, animation: 16, comedy: 35,
  crime: 80, documentary: 99, drama: 18, family: 10751,
  fantasy: 14, horror: 27, mystery: 9648, romance: 10749,
  scifi: 878, thriller: 53, war: 10752,
};

// TMDB 장르 ID — TV용 (movie ID → TV ID 변환 테이블)
const TV_GENRE_MAP = {
  [GENRE.action]:      10759, // Action & Adventure
  [GENRE.adventure]:   10759,
  [GENRE.thriller]:    80,    // Crime (TV엔 thriller 없음)
  [GENRE.horror]:      9648,  // Mystery (TV엔 horror 없음)
  [GENRE.scifi]:       10765, // Sci-Fi & Fantasy
  [GENRE.fantasy]:     10765,
  [GENRE.war]:         10768, // War & Politics
  [GENRE.romance]:     18,    // Drama
};

function toTvGenres(movieGenreIds) {
  return [...new Set(movieGenreIds.map(id => TV_GENRE_MAP[id] ?? id))];
}

// 기분 → 장르 매핑
const MOOD_MAP = {
  happy:     [GENRE.comedy, GENRE.animation, GENRE.family],
  sad:       [GENRE.drama, GENRE.romance],
  thrill:    [GENRE.thriller, GENRE.horror, GENRE.crime],
  relax:     [GENRE.documentary, GENRE.family, GENRE.animation],
  love:      [GENRE.romance, GENRE.drama],
  think:     [GENRE.mystery, GENRE.scifi, GENRE.documentary],
  adventure: [GENRE.adventure, GENRE.scifi, GENRE.action],
  dark:      [GENRE.crime, GENRE.thriller, GENRE.war],
};

// 계절 → 장르 매핑
const WEATHER_MAP = {
  spring: [GENRE.romance, GENRE.comedy, GENRE.animation],
  summer: [GENRE.action, GENRE.adventure, GENRE.scifi, GENRE.horror, GENRE.thriller],
  autumn: [GENRE.drama, GENRE.mystery, GENRE.thriller],
  winter: [GENRE.family, GENRE.fantasy, GENRE.romance],
};

// 기분 + 날씨 교집합 우선, 없으면 합집합
function resolveGenres(mood, weather) {
  const a = MOOD_MAP[mood]    || [];
  const b = WEATHER_MAP[weather] || [];
  const intersection = a.filter(g => b.includes(g));
  return intersection.length ? intersection : [...new Set([...a, ...b])];
}

async function fetchDiscover(type, genreIds) {
  const data = await tmdbFetch(`discover/${type}`, {
    with_genres: genreIds.join(','),
    sort_by:     'popularity.desc',
    page:        '1',
  });
  return data.results || [];
}

// 추천 모달 상태
const recBackdrop    = document.getElementById('recBackdrop');
const recClose       = document.getElementById('recClose');
const recSubmit      = document.getElementById('recSubmit');
const recRandom      = document.getElementById('recRandom');
const recResult      = document.getElementById('recResult');
const recGrid        = document.getElementById('recGrid');
const recResultTitle = document.getElementById('recResultTitle');

// 모든 장르 목록 (랜덤 추천용)
const ALL_GENRES = Object.values(GENRE);

let selectedMood    = null;
let selectedWeather = null;
let selectedType    = 'both';

// 칩 선택/취소 토글 (이미 선택된 칩 누르면 해제)
function setupChips(containerId, onSelect, onDeselect) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.rec-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const isActive = chip.classList.contains('active');
      container.querySelectorAll('.rec-chip').forEach(c => c.classList.remove('active'));

      if (isActive) {
        // 이미 선택된 것 → 취소
        if (onDeselect) onDeselect();
      } else {
        // 새로 선택
        chip.classList.add('active');
        onSelect(chip.dataset[Object.keys(chip.dataset)[0]]);
      }
    });
  });
}

setupChips('moodChips',    val => { selectedMood    = val; }, () => { selectedMood    = null; });
setupChips('weatherChips', val => { selectedWeather = val; }, () => { selectedWeather = null; });
setupChips('typeChips',    val => { selectedType    = val; }); // 타입은 항상 하나 선택 유지

// 추천 버튼
document.getElementById('recommendBtn').addEventListener('click', () => {
  recBackdrop.classList.add('open');
  recResult.style.display = 'none';
  document.body.style.overflow = 'hidden';
});

function closeRecModal() {
  recBackdrop.classList.remove('open');
  document.body.style.overflow = '';
}

recClose.addEventListener('click', closeRecModal);
recBackdrop.addEventListener('click', e => { if (e.target === recBackdrop) closeRecModal(); });

// 랜덤 추천
recRandom.addEventListener('click', async () => {
  // 기분·계절 칩 모두 해제
  document.querySelectorAll('#moodChips .rec-chip, #weatherChips .rec-chip')
    .forEach(c => c.classList.remove('active'));
  selectedMood = null;
  selectedWeather = null;

  // 랜덤 장르 2~3개 뽑기
  const shuffled = [...ALL_GENRES].sort(() => Math.random() - .5);
  const randomGenres = shuffled.slice(0, 3);

  recRandom.disabled = true;
  recSubmit.disabled = true;
  recRandom.textContent = '🎲 뽑는 중...';

  await runRecommend(randomGenres, '🎲 랜덤 추천 결과');

  recRandom.disabled = false;
  recSubmit.disabled = false;
  recRandom.textContent = '🎲 랜덤 추천';
});

// 추천 실행
recSubmit.addEventListener('click', async () => {
  if (!selectedMood && !selectedWeather) {
    alert('기분이나 계절을 하나 이상 선택해 주세요!\n(또는 🎲 랜덤 추천을 눌러보세요)');
    return;
  }

  recSubmit.disabled = true;
  recRandom.disabled = true;
  recSubmit.textContent = '추천 중...';

  const genres = resolveGenres(selectedMood, selectedWeather);
  const moodLabel    = selectedMood    ? document.querySelector(`[data-mood="${selectedMood}"]`)?.textContent    : '';
  const weatherLabel = selectedWeather ? document.querySelector(`[data-weather="${selectedWeather}"]`)?.textContent : '';
  const parts = [moodLabel, weatherLabel].filter(Boolean);
  const title = `${parts.join(' · ')} 분위기에 어울리는 추천`;

  await runRecommend(genres, title);

  recSubmit.disabled = false;
  recRandom.disabled = false;
  recSubmit.textContent = '추천 받기 →';
});

async function runRecommend(genres, title) {
  recResult.style.display = 'none';
  recGrid.innerHTML = Array(6).fill('<div class="skeleton-card grid-skeleton"></div>').join('');
  recResult.style.display = 'block';
  recResult.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    let movies = [], tvs = [];
    if (selectedType === 'movie' || selectedType === 'both') {
      movies = await fetchDiscover('movie', genres);
    }
    if (selectedType === 'tv' || selectedType === 'both') {
      tvs = await fetchDiscover('tv', toTvGenres(genres));
    }

    const merged = [];
    const max = Math.max(movies.length, tvs.length);
    for (let i = 0; i < max; i++) {
      if (movies[i]) merged.push({ ...movies[i], _mediaType: 'movie' });
      if (tvs[i])    merged.push({ ...tvs[i],    _mediaType: 'tv'    });
    }

    recResultTitle.textContent = title;
    recGrid.innerHTML = '';

    if (merged.length === 0) {
      recGrid.innerHTML = `<div class="no-results"><span>🎬</span>결과가 없습니다. 다른 조합을 선택해 보세요.</div>`;
    } else {
      merged.slice(0, 20).forEach(m => {
        const card = makeCard(m, '', true, m._mediaType);
        card.addEventListener('click', () => {
          closeRecModal();
          openModal(m, false, m._mediaType);
        }, { capture: true });
        recGrid.appendChild(card);
      });
    }
  } catch {
    recGrid.innerHTML = `<div class="no-results"><span>⚠️</span>추천을 불러오지 못했습니다.</div>`;
  }
}

/* ===================== START ===================== */
if (isTmdbConfigured()) {
  init();
} else {
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc  = document.getElementById('heroDesc');
  if (heroTitle) heroTitle.textContent = 'API 설정이 필요합니다';
  if (heroDesc) {
    heroDesc.textContent = useProxy
      ? '배포 서버에 TMDB_API_KEY가 설정됐는지 확인하세요.'
      : '로컬에서는 .env에 VITE_TMDB_API_KEY를 넣거나 VITE_FORCE_TMDB_PROXY=true 로 프록시를 쓰세요.';
  }
  const rc = document.getElementById('rowsContainer');
  if (rc) {
    rc.innerHTML = `<p class="no-results" style="padding:40px 4%"><span>🔑</span>README의 환경 변수 안내를 확인하세요.</p>`;
  }
}
