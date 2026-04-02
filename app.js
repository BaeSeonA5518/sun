/* TMDB: 로컬은 .env의 VITE_TMDB_API_KEY / 배포·프록시 테스트는 /api/tmdb */
const TMDB_ORIGIN = 'https://api.themoviedb.org/3';
const PROXY_PATH = '/api/tmdb';
const IMG_BASE = 'https://image.tmdb.org/t/p/';
const TMDB_API_SIGNUP = 'https://www.themoviedb.org/settings/api';

const useProxy = import.meta.env?.PROD || import.meta.env?.VITE_FORCE_TMDB_PROXY === 'true';
const devKey = import.meta.env?.VITE_TMDB_API_KEY;

function missingDevKeyMessage() {
  return [
    'TMDB API 키가 필요합니다.',
    '1) ' + TMDB_API_SIGNUP + ' 에서 키 발급',
    '2) .env.example 을 복사해 .env 로 저장',
    '3) VITE_TMDB_API_KEY=발급받은키 입력 후 npm run dev 재실행',
    '(README.md 의 「처음 받은 분」 참고)',
  ].join('\n');
}

async function tmdbFetch(path, params = {}) {
  const sp = new URLSearchParams({ language: 'ko-KR', ...params });
  let url;
  if (useProxy) {
    sp.set('path', path);
    url = `${PROXY_PATH}?${sp}`;
  } else {
    if (!devKey) {
      console.warn(missingDevKeyMessage());
      throw new Error('TMDB API 키 없음: .env 에 VITE_TMDB_API_KEY 를 설정하세요.');
    }
    sp.set('api_key', devKey);
    url = `${TMDB_ORIGIN}/${path}?${sp}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ===== 가로 스크롤 대응 Lazy Load =====
// 모바일은 margin을 줄여 한 번에 로드되는 이미지 수를 제한 (스크롤 끊김 완화)
function posterObserverMargin() {
  if (window.matchMedia('(max-width: 900px)').matches) {
    return '0px 160px 0px 160px';
  }
  return '0px 600px 0px 600px';
}

const posterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    if (img.dataset.src) {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    }
    posterObserver.unobserve(img);
  });
}, { rootMargin: posterObserverMargin() });

let allMovies = [];   // 영화 검색용
let allTV = [];       // TV 검색용
let currentTab = 'home';
let currentHeroMovie = null;
let currentModalMovie = null;
let tvLoaded = false;

// ===== 데이터 정규화 =====
// TV와 영화 모두 동일한 필드명으로 통일
function normalizeMovie(item) {
  return { ...item, media_type: 'movie' };
}

function normalizeTV(item) {
  return {
    ...item,
    media_type: 'tv',
    title: item.name || item.original_name,
    original_title: item.original_name,
    release_date: item.first_air_date || '',
  };
}

// ===== API 호출 =====
async function fetchMovies(endpoint) {
  const data = await tmdbFetch(`movie/${endpoint}`, { page: '1' });
  return data.results.map(normalizeMovie);
}

async function fetchTV(endpoint) {
  const data = await tmdbFetch(`tv/${endpoint}`, { page: '1' });
  return data.results.map(normalizeTV);
}

// ===== 기분 · 계절 추천 (TMDB Discover, 장르 OR) =====
const RECO_MOODS = {
  excited: { label: '신나요', movie: '35|10402|16', tv: '35|10402|16' },
  sad: { label: '울고 싶어요', movie: '18|10749', tv: '18|10751' },
  thrill: { label: '스릴 넘치게', movie: '53|28|80|9648', tv: '9648|10759|80' },
  romance: { label: '설레고 싶어요', movie: '10749', tv: '10749' },
  chill: { label: '편하게 쉬고 싶어요', movie: '99|36|10751', tv: '99|10751' },
  thinking: { label: '생각하고 싶어요', movie: '18|9648|99', tv: '18|9648' },
  adventure: { label: '모험하고 싶어요', movie: '12|28|14', tv: '10759|12|9648' },
  dark: { label: '어둡고 진하게', movie: '27|53|80|9648', tv: '27|9648|80' },
};

const RECO_SEASONS = {
  spring: { label: '봄', movie: '10749|35|10751|10402', tv: '10749|35|10751' },
  summer: { label: '여름', movie: '12|28|35|10751', tv: '10759|35|10751' },
  autumn: { label: '가을', movie: '18|53|9648|80', tv: '18|9648|80' },
  winter: { label: '겨울', movie: '14|10751|16|10402', tv: '14|10751|16' },
};

function seasonKeyFromDate() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

function resolveSeasonGenres(seasonVal, kind) {
  if (!seasonVal) return '';
  const key = seasonVal === 'auto' ? seasonKeyFromDate() : seasonVal;
  const s = RECO_SEASONS[key];
  return s ? s[kind] : '';
}

function mergeGenreOr(a, b) {
  const ids = new Set();
  [a, b].forEach(str => {
    if (!str) return;
    str.split('|').forEach(id => { if (id.trim()) ids.add(id.trim()); });
  });
  return [...ids].join('|');
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function discoverMedia(kind, withGenres, limit) {
  const page = Math.floor(Math.random() * 12) + 1;
  const path = kind === 'movie' ? 'discover/movie' : 'discover/tv';
  const params = {
    sort_by: 'popularity.desc',
    page: String(page),
    'vote_average.gte': '5.5',
    'vote_count.gte': '40',
  };
  if (withGenres) params.with_genres = withGenres;
  let data;
  try {
    data = await tmdbFetch(path, params);
  } catch {
    return [];
  }
  const raw = data.results || [];
  const mapped = kind === 'movie' ? raw.map(normalizeMovie) : raw.map(normalizeTV);
  return mapped.slice(0, limit);
}

function getSelectedRecoMood() {
  const el = document.querySelector('#recoStepForm .reco-pill.is-selected');
  return el ? el.dataset.recoMood : '';
}

function getSelectedRecoSeason() {
  const el = document.querySelector('#recoStepForm .reco-season.is-selected');
  return el ? el.dataset.recoSeason : '';
}

function getSelectedRecoType() {
  const el = document.querySelector('#recoStepForm .reco-type.is-selected');
  return el ? el.dataset.recoType : 'both';
}

function resetRecoModalToForm() {
  const form = document.getElementById('recoStepForm');
  const results = document.getElementById('recoStepResults');
  const row = document.getElementById('recommendRow');
  const wrap = document.getElementById('recommendResultsWrap');
  const summary = document.getElementById('recommendSummary');
  const loading = document.getElementById('recommendLoading');
  if (form) form.hidden = false;
  if (results) results.hidden = true;
  if (row) row.innerHTML = '';
  if (wrap) wrap.hidden = true;
  if (summary) summary.textContent = '';
  if (loading) loading.hidden = true;
}

function openRecoModal() {
  resetRecoModalToForm();
  const bd = document.getElementById('recoModalBackdrop');
  bd.classList.add('active');
  bd.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeRecoModal() {
  resetRecoModalToForm();
  const bd = document.getElementById('recoModalBackdrop');
  bd.classList.remove('active');
  bd.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function runRecommendation() {
  const mood = getSelectedRecoMood();
  const season = getSelectedRecoSeason();
  const type = getSelectedRecoType();
  const btn = document.getElementById('recoModalSubmit');
  const loading = document.getElementById('recommendLoading');
  const wrap = document.getElementById('recommendResultsWrap');
  const summary = document.getElementById('recommendSummary');
  const row = document.getElementById('recommendRow');
  const stepForm = document.getElementById('recoStepForm');
  const stepResults = document.getElementById('recoStepResults');

  const noMood = mood === '';
  const noSeason = season === '';
  const randomMode = noMood && noSeason;

  let movieGenres = '';
  let tvGenres = '';
  if (!randomMode) {
    const mMov = noMood ? '' : (RECO_MOODS[mood]?.movie || '');
    const mTv = noMood ? '' : (RECO_MOODS[mood]?.tv || '');
    const sMov = noSeason ? '' : resolveSeasonGenres(season, 'movie');
    const sTv = noSeason ? '' : resolveSeasonGenres(season, 'tv');
    movieGenres = mergeGenreOr(mMov, sMov);
    tvGenres = mergeGenreOr(mTv, sTv);
  }

  const parts = [];
  if (randomMode) parts.push('완전 랜덤');
  else {
    if (!noMood) parts.push(`기분: ${RECO_MOODS[mood].label}`);
    if (!noSeason) parts.push(`계절: ${RECO_SEASONS[season]?.label || season}`);
  }
  const typeLabel = type === 'both' ? '영화 + TV' : type === 'movie' ? '영화만' : 'TV만';
  parts.push(typeLabel);

  btn.disabled = true;
  stepForm.hidden = true;
  stepResults.hidden = false;
  loading.hidden = false;
  wrap.hidden = true;
  summary.textContent = '';
  document.querySelector('.reco-modal')?.scrollTo({ top: 0, behavior: 'smooth' });

  try {
    let items = [];
    const n = 14;

    if (type === 'movie') {
      items = await discoverMedia('movie', randomMode ? '' : movieGenres, n);
    } else if (type === 'tv') {
      items = await discoverMedia('tv', randomMode ? '' : tvGenres, n);
    } else {
      const half = Math.ceil(n / 2);
      const [movies, tvs] = await Promise.all([
        discoverMedia('movie', randomMode ? '' : movieGenres, half),
        discoverMedia('tv', randomMode ? '' : tvGenres, n - half),
      ]);
      items = shuffleArray([...movies, ...tvs]);
    }

    row.innerHTML = '';
    if (items.length === 0) {
      summary.textContent = '조건에 맞는 작품을 찾지 못했어요. 조건을 바꿔 다시 눌러보세요.';
      wrap.hidden = true;
    } else {
      summary.textContent = `추천 기준 — ${parts.join(' · ')}`;
      items.forEach(item => row.appendChild(createMovieCard(item)));
      wrap.hidden = false;
    }
  } catch (e) {
    console.error(e);
    summary.textContent = '추천을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    wrap.hidden = true;
  } finally {
    loading.hidden = true;
    btn.disabled = false;
  }
}

// ===== 예고편 키 가져오기 (영화 & TV 공통) =====
// TV는 TMDB에서 type이 Trailer가 아닌 Teaser/Clip인 경우가 많음 → 우선순위로 통합 선택
const YOUTUBE_TYPE_ORDER = ['Trailer', 'Teaser', 'Clip', 'Opening Credits', 'Featurette', 'Behind the Scenes'];

function pickYoutubeVideo(results) {
  if (!results || !results.length) return null;
  const yt = results.filter(v => v.site === 'YouTube' && v.key);
  if (!yt.length) return null;
  for (const t of YOUTUBE_TYPE_ORDER) {
    const found = yt.find(v => v.type === t);
    if (found) return found;
  }
  return yt[0];
}

/** @returns {{ site: 'YouTube'|'Vimeo', key: string } | null} */
async function fetchTrailerVideo(item) {
  const prefix = item.media_type === 'tv' ? 'tv' : 'movie';
  const vidPath = `${prefix}/${item.id}/videos`;

  const [koData, enData] = await Promise.all([
    tmdbFetch(vidPath, { language: 'ko-KR' }),
    tmdbFetch(vidPath, { language: 'en-US' }),
  ]);
  const ko = koData.results || [];
  const en = enData.results || [];

  const seen = new Set();
  const merged = [];
  for (const v of [...ko, ...en]) {
    if (!v.key || (v.site !== 'YouTube' && v.site !== 'Vimeo')) continue;
    const id = `${v.site}:${v.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(v);
  }

  const yt = pickYoutubeVideo(merged);
  if (yt) return { site: 'YouTube', key: yt.key };

  const vm = merged.find(v => v.site === 'Vimeo');
  return vm ? { site: 'Vimeo', key: vm.key } : null;
}

// ===== 예고편 미리 불러오기 (모달 열자마자 → 재생 탭 시 캐시로 즉시 iframe 연결) =====
const trailerPromiseByKey = new Map();
const trailerResolvedByKey = new Map();

function trailerCacheKey(item) {
  return `${item.media_type}-${item.id}`;
}

function prefetchTrailer(item) {
  const k = trailerCacheKey(item);
  if (trailerPromiseByKey.has(k)) return trailerPromiseByKey.get(k);
  const p = fetchTrailerVideo(item).catch(() => null);
  trailerPromiseByKey.set(k, p);
  p.then(v => trailerResolvedByKey.set(k, v));
  return p;
}

function isMobileLikeDevice() {
  return window.matchMedia('(max-width: 900px)').matches
    || window.matchMedia('(pointer: coarse)').matches;
}

function embedSrcForVideo(video) {
  if (!video) return null;
  if (video.site === 'YouTube') {
    const mute = isMobileLikeDevice() ? '&mute=1' : '';
    return `https://www.youtube.com/embed/${video.key}?autoplay=1&playsinline=1&rel=0${mute}`;
  }
  if (video.site === 'Vimeo') {
    return `https://player.vimeo.com/video/${video.key}?autoplay=1`;
  }
  return null;
}

// ===== 상세 모달 포스터 영역에서 재생 =====
function resetPosterVideoState() {
  const frame = document.getElementById('modalPosterFrame');
  const img = document.getElementById('modalPoster');
  const loading = document.getElementById('modalPosterLoading');
  const fail = document.getElementById('modalPosterFail');
  const back = document.getElementById('modalPosterBack');
  if (frame) {
    frame.src = '';
    frame.style.display = 'none';
  }
  if (img) img.style.display = 'block';
  if (loading) loading.style.display = 'none';
  if (fail) fail.style.display = 'none';
  if (back) back.style.display = 'none';
}

function showTrailerInPoster(video) {
  const frame = document.getElementById('modalPosterFrame');
  const img = document.getElementById('modalPoster');
  const loading = document.getElementById('modalPosterLoading');
  const fail = document.getElementById('modalPosterFail');
  const back = document.getElementById('modalPosterBack');
  loading.style.display = 'none';
  const src = embedSrcForVideo(video);
  if (!src) {
    fail.style.display = 'flex';
    return;
  }
  img.style.display = 'none';
  frame.style.display = 'block';
  back.style.display = 'block';
  frame.src = src;
}

function startTrailerInPoster(item) {
  const k = trailerCacheKey(item);
  prefetchTrailer(item);

  if (trailerResolvedByKey.has(k)) {
    showTrailerInPoster(trailerResolvedByKey.get(k));
    return;
  }

  document.getElementById('modalPosterLoading').style.display = 'flex';
  document.getElementById('modalPosterFail').style.display = 'none';
  trailerPromiseByKey.get(k).then(video => {
    document.getElementById('modalPosterLoading').style.display = 'none';
    showTrailerInPoster(video);
  });
}

function backToPosterInModal() {
  resetPosterVideoState();
}

// ===== 히어로용 별도 영상 모달 (iframe) =====
async function openVideoModal(item) {
  prefetchTrailer(item);
  const backdrop = document.getElementById('videoBackdrop');
  const frame = document.getElementById('videoFrame');
  const loading = document.getElementById('videoLoading');
  const unavailable = document.getElementById('videoUnavailable');
  const titleEl = document.getElementById('videoModalTitle');

  titleEl.textContent = item.title;
  frame.style.display = 'none';
  unavailable.style.display = 'none';
  loading.style.display = 'flex';
  frame.src = '';

  backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';

  const k = trailerCacheKey(item);
  const video = trailerResolvedByKey.has(k)
    ? trailerResolvedByKey.get(k)
    : await trailerPromiseByKey.get(k);

  loading.style.display = 'none';

  const src = embedSrcForVideo(video);
  if (src) {
    frame.src = src;
    frame.style.display = 'block';
  } else {
    unavailable.style.display = 'flex';
  }
}

// ===== 영상 모달 닫기 =====
function closeVideoModal() {
  const frame = document.getElementById('videoFrame');
  frame.src = '';
  document.getElementById('videoBackdrop').classList.remove('active');
  document.body.style.overflow = '';
}

// ===== 히어로 배너 설정 =====
function setHero(item) {
  currentHeroMovie = item;
  prefetchTrailer(item);
  const hero = document.getElementById('hero');
  if (item.backdrop_path) {
    hero.style.backgroundImage = `url(${IMG_BASE}original${item.backdrop_path})`;
  }
  document.getElementById('heroTag').textContent =
    item.media_type === 'tv' ? '지금 방영 중' : '지금 상영 중';
  document.getElementById('heroTitle').textContent = item.title;
  document.getElementById('heroDesc').textContent = item.overview || '줄거리 정보가 없습니다.';
}

// ===== 영화 카드 생성 =====
function createMovieCard(item) {
  const card = document.createElement('div');
  card.className = 'movie-card';

  const label = item.media_type === 'tv' ? '📺' : '🎬';

  if (item.poster_path) {
    card.innerHTML = `
      <img
        class="movie-card__poster"
        data-src="${IMG_BASE}w342${item.poster_path}"
        alt="${item.title}"
      />
      <div class="movie-card__info">
        <p class="movie-card__title">${item.title}</p>
        <div class="movie-card__rating">
          ★ ${item.vote_average.toFixed(1)}
          <span>(${item.vote_count.toLocaleString()})</span>
        </div>
        <div class="movie-card__date">📅 ${item.release_date || '미정'}</div>
      </div>
    `;
    // IntersectionObserver로 뷰포트 근처에 오면 로딩
    posterObserver.observe(card.querySelector('img'));
  } else {
    card.innerHTML = `
      <div class="movie-card__no-poster">
        <span class="icon">${label}</span>
        <span>포스터 없음</span>
      </div>
      <div class="movie-card__always-title">${item.title}</div>
    `;
  }

  card.addEventListener('mouseenter', () => {
    // 모달용 w500 이미지를 미리 캐싱
    if (item.poster_path) {
      const img = new Image();
      img.src = `${IMG_BASE}w500${item.poster_path}`;
    }
  });
  card.addEventListener('click', () => openModal(item));
  return card;
}

// ===== 가로 행 렌더링 =====
function renderRow(items, rowId) {
  const row = document.getElementById(rowId);
  row.innerHTML = '';
  items.forEach(item => row.appendChild(createMovieCard(item)));
}

// ===== 검색 결과 렌더링 =====
function renderSearchResults(items) {
  const grid = document.getElementById('searchGrid');
  const searchSection = document.getElementById('searchSection');

  document.getElementById('movieSections').style.display = 'none';
  document.getElementById('tvSections').style.display = 'none';
  searchSection.style.display = 'block';

  if (items.length === 0) {
    grid.innerHTML = '<p class="no-results">검색 결과가 없습니다.</p>';
  } else {
    grid.innerHTML = '';
    items.forEach(item => grid.appendChild(createMovieCard(item)));
  }
}

function clearSearch() {
  document.getElementById('searchSection').style.display = 'none';
  const movieEl = document.getElementById('movieSections');
  const tvEl = document.getElementById('tvSections');
  if (currentTab === 'home') {
    movieEl.style.display = 'block';
    tvEl.style.display = 'block';
  } else if (currentTab === 'movie') {
    movieEl.style.display = 'block';
    tvEl.style.display = 'none';
  } else {
    movieEl.style.display = 'none';
    tvEl.style.display = 'block';
  }
}

// ===== 모달 열기 =====
function openModal(item) {
  resetPosterVideoState();
  prefetchTrailer(item);

  const backdrop = document.getElementById('modalBackdrop');
  const poster = document.getElementById('modalPoster');
  const title = document.getElementById('modalTitle');
  const meta = document.getElementById('modalMeta');
  const desc = document.getElementById('modalDesc');

  title.textContent = item.title;

  const releaseYear = item.release_date ? item.release_date.split('-')[0] : '미정';
  const typeLabel = item.media_type === 'tv'
    ? '<span class="badge badge--tv">TV</span>'
    : '<span class="badge badge--movie">영화</span>';
  meta.innerHTML = `
    ${typeLabel}
    <span class="badge">${releaseYear}</span>
    <span class="rating">★ ${item.vote_average.toFixed(1)}</span>
    <span class="badge">투표 수 ${item.vote_count.toLocaleString()}</span>
    ${item.original_language ? `<span class="badge">${item.original_language.toUpperCase()}</span>` : ''}
  `;
  desc.textContent = item.overview || '줄거리 정보가 제공되지 않습니다.';

  poster.classList.remove('loaded');
  poster.alt = item.title;

  const newSrc = item.poster_path ? `${IMG_BASE}w500${item.poster_path}` : null;
  if (newSrc) {
    const img = new Image();
    img.onload = () => {
      poster.src = newSrc;
      requestAnimationFrame(() => poster.classList.add('loaded'));
    };
    img.onerror = () => { poster.src = newSrc; poster.classList.add('loaded'); };
    img.src = newSrc;
  } else {
    poster.src = '';
    poster.classList.add('loaded');
  }

  currentModalMovie = item;
  backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// ===== 모달 닫기 =====
function closeModal() {
  resetPosterVideoState();
  document.getElementById('modalBackdrop').classList.remove('active');
  document.body.style.overflow = '';
}

// ===== 검색 대상 풀 =====
function getSearchPool() {
  if (currentTab === 'movie') return allMovies;
  if (currentTab === 'tv') return allTV;
  const seen = new Set();
  const out = [];
  for (const m of [...allMovies, ...allTV]) {
    const key = `${m.media_type}-${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// ===== 검색 필터 =====
function handleSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  if (!query) { clearSearch(); return; }

  const filtered = getSearchPool().filter(m =>
    (m.title && m.title.toLowerCase().includes(query)) ||
    (m.original_title && m.original_title.toLowerCase().includes(query))
  );
  renderSearchResults(filtered);
}

// ===== TV 데이터 반영 (행 렌더 + allTV) =====
function applyTVResults(onAir, popular, topRated) {
  const seen = new Set();
  allTV = [...onAir, ...popular, ...topRated].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  renderRow(onAir,    'tvOnAirRow');
  renderRow(popular,  'tvPopularRow');
  renderRow(topRated, 'tvTopRatedRow');
  tvLoaded = true;
}

// ===== TV만 지연 로딩 (초기화 실패 등 예외 시) =====
async function ensureTVLoaded() {
  if (tvLoaded) return;
  const loading = document.getElementById('loading');
  loading.style.display = 'flex';
  const [onAir, popular, topRated] = await Promise.all([
    fetchTV('on_the_air'),
    fetchTV('popular'),
    fetchTV('top_rated'),
  ]);
  loading.style.display = 'none';
  applyTVResults(onAir, popular, topRated);
  document.getElementById('tvSections').style.display = 'block';
}

// ===== 탭 전환 =====
async function switchTab(tab) {
  if (currentTab === tab && document.getElementById('searchSection').style.display === 'none') return;

  currentTab = tab;
  document.getElementById('searchInput').value = '';
  document.getElementById('searchSection').style.display = 'none';

  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });

  const movieEl = document.getElementById('movieSections');
  const tvEl = document.getElementById('tvSections');

  if (tab === 'home') {
    await ensureTVLoaded();
    movieEl.style.display = 'block';
    tvEl.style.display = 'block';
    const heroPool = [
      ...allMovies.filter(m => m.backdrop_path),
      ...allTV.filter(m => m.backdrop_path),
    ];
    const pick = heroPool[Math.floor(Math.random() * heroPool.length)] || allMovies[0] || allTV[0];
    if (pick) setHero(pick);
  } else if (tab === 'movie') {
    movieEl.style.display = 'block';
    tvEl.style.display = 'none';
    const heroPool = allMovies.filter(m => m.backdrop_path);
    const pick = heroPool[Math.floor(Math.random() * heroPool.length)] || allMovies[0];
    if (pick) setHero(pick);
  } else {
    await ensureTVLoaded();
    movieEl.style.display = 'none';
    tvEl.style.display = 'block';
    const heroPool = allTV.filter(m => m.backdrop_path);
    const pick = heroPool[Math.floor(Math.random() * heroPool.length)] || allTV[0];
    if (pick) setHero(pick);
  }
}

// ===== 헤더 스크롤 효과 (rAF로 프레임당 1회만 갱신 + passive) =====
let headerScrollPending = false;
function handleHeaderScroll() {
  if (headerScrollPending) return;
  headerScrollPending = true;
  requestAnimationFrame(() => {
    const header = document.querySelector('.header');
    header.classList.toggle('scrolled', window.scrollY > 50);
    headerScrollPending = false;
  });
}

// ===== 초기화 (홈: 영화 + TV 동시 로드) =====
async function init() {
  const loading = document.getElementById('loading');
  const errorEl = document.getElementById('error');

  try {
    loading.style.display = 'flex';
    errorEl.style.display = 'none';

    const [[nowPlaying, popular, topRated], [tvOnAir, tvPopular, tvTopRated]] = await Promise.all([
      Promise.all([
        fetchMovies('now_playing'),
        fetchMovies('popular'),
        fetchMovies('top_rated'),
      ]),
      Promise.all([
        fetchTV('on_the_air'),
        fetchTV('popular'),
        fetchTV('top_rated'),
      ]),
    ]);

    loading.style.display = 'none';

    const seenM = new Set();
    allMovies = [...nowPlaying, ...popular, ...topRated].filter(m => {
      if (seenM.has(m.id)) return false;
      seenM.add(m.id);
      return true;
    });

    applyTVResults(tvOnAir, tvPopular, tvTopRated);

    document.getElementById('movieSections').style.display = 'block';
    document.getElementById('tvSections').style.display = 'block';

    renderRow(nowPlaying, 'nowPlayingRow');
    renderRow(popular,    'popularRow');
    renderRow(topRated,   'topRatedRow');

    const heroCandidates = [
      ...popular.filter(m => m.backdrop_path),
      ...tvPopular.filter(m => m.backdrop_path),
    ];
    const heroPick = heroCandidates[Math.floor(Math.random() * heroCandidates.length)]
      || popular[0] || tvPopular[0];
    setHero(heroPick);

    currentTab = 'home';
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.tab === 'home');
    });

  } catch (err) {
    console.error(err);
    loading.style.display = 'none';
    const msgEl = document.getElementById('errorMessage');
    const noDevKey =
      !import.meta.env.PROD &&
      import.meta.env.VITE_FORCE_TMDB_PROXY !== 'true' &&
      !import.meta.env.VITE_TMDB_API_KEY;
    if (msgEl && noDevKey) {
      msgEl.innerHTML =
        '<strong>TMDB API 키가 필요합니다.</strong><br><br>' +
        '1. <a href="' +
        TMDB_API_SIGNUP +
        '" target="_blank" rel="noopener">themoviedb.org/settings/api</a>에서 키 발급<br>' +
        '2. 프로젝트 루트에 <code>.env.example</code>을 복사해 <code>.env</code>로 저장<br>' +
        '3. <code>VITE_TMDB_API_KEY=</code> 뒤에 키를 넣고 <code>npm run dev</code> 다시 실행<br><br>' +
        '<small>README.md 「처음 받은 분」에도 같은 안내가 있습니다.</small>';
    } else if (msgEl) {
      msgEl.textContent = '😢 영화 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    }
    errorEl.style.display = 'block';
  }
}

// ===== 가로 행 화살표 스크롤 =====
function initRowArrows() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.arrow-btn');
    if (!btn) return;
    const row = document.getElementById(btn.dataset.row);
    if (!row) return;
    const useSmooth = window.matchMedia('(min-width: 901px)').matches;
    row.scrollBy({
      left: parseInt(btn.dataset.dir, 10) * 700,
      behavior: useSmooth ? 'smooth' : 'auto',
    });
  });
}

// ===== 이벤트 리스너 =====
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.getElementById('heroPlayBtn').addEventListener('click', () => {
  if (currentHeroMovie) openVideoModal(currentHeroMovie);
});
document.getElementById('heroDetailBtn').addEventListener('click', () => {
  if (currentHeroMovie) openModal(currentHeroMovie);
});
document.getElementById('modalPlayBtn').addEventListener('click', () => {
  if (currentModalMovie) startTrailerInPoster(currentModalMovie);
});
document.getElementById('modalPosterBack').addEventListener('click', () => {
  backToPosterInModal();
});
document.getElementById('videoClose').addEventListener('click', closeVideoModal);
document.getElementById('videoBackdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeVideoModal();
});
document.getElementById('searchInput').addEventListener('input', handleSearch);
window.addEventListener('scroll', handleHeaderScroll, { passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('recoModalBackdrop').classList.contains('active')) {
      closeRecoModal();
    } else {
      closeVideoModal();
      closeModal();
    }
  }
});

// 네비게이션 탭 클릭
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(link.dataset.tab);
  });
});

document.querySelector('.header__logo').addEventListener('click', () => {
  switchTab('home');
  window.scrollTo(0, 0);
});

document.getElementById('recoFab').addEventListener('click', () => {
  openRecoModal();
});

document.getElementById('recoModalClose').addEventListener('click', () => {
  closeRecoModal();
});

document.getElementById('recoModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'recoModalBackdrop') closeRecoModal();
});

document.getElementById('recoBackToForm').addEventListener('click', () => {
  resetRecoModalToForm();
});

document.querySelector('.reco-modal').addEventListener('click', (e) => {
  const pill = e.target.closest('.reco-pill');
  if (pill) {
    const wasSelected = pill.classList.contains('is-selected');
    document.querySelectorAll('.reco-pill').forEach(p => p.classList.remove('is-selected'));
    if (!wasSelected) pill.classList.add('is-selected');
    return;
  }
  const seasonBtn = e.target.closest('.reco-season');
  if (seasonBtn) {
    const wasSelected = seasonBtn.classList.contains('is-selected');
    document.querySelectorAll('.reco-season').forEach(p => p.classList.remove('is-selected'));
    if (!wasSelected) seasonBtn.classList.add('is-selected');
    return;
  }
  const typeBtn = e.target.closest('.reco-type');
  if (typeBtn) {
    document.querySelectorAll('.reco-type').forEach(p => p.classList.remove('is-selected'));
    typeBtn.classList.add('is-selected');
  }
});

document.getElementById('recoModalSubmit').addEventListener('click', () => {
  runRecommendation();
});

// 실행
initRowArrows();
init();
