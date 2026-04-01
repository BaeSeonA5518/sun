# SEONAFLIX (sun)

TMDB 기반 영화·TV 탐색 페이지. **배포 시 API 키는 서버(프록시)에만 두고**, 브라우저 JS 번들에는 넣지 않습니다.

## 로컬 개발

```bash
npm install
npm run dev
```

`.env`에 `VITE_TMDB_API_KEY`만 있으면 `npm run dev`에서 TMDB로 직접 요청합니다.

프록시와 동일하게 테스트하려면:

```bash
npm i -g vercel
vercel link   # 한 번 연결
vercel dev
```

`.env`에 `TMDB_API_KEY`와 (선택) `VITE_FORCE_TMDB_PROXY=true`를 두면 로컬에서도 `/api/tmdb` 경로로 갑니다.

## 프로덕션 빌드

```bash
npm run build
```

빌드 결과(`dist/`)만으로는 TMDB를 호출할 수 없습니다. **반드시 아래 호스팅 중 하나**에서 정적 파일 + API를 함께 배포하고, 대시보드에 **`TMDB_API_KEY`**(VITE_ 없음)를 등록하세요.

### Vercel

1. GitHub 저장소 연결
2. Build Command: `npm run build`, Output Directory: `dist`
3. Environment Variables: `TMDB_API_KEY` = TMDB API 키
4. 루트의 `api/tmdb.js`가 자동으로 `/api/tmdb`로 동작합니다.

### Netlify

1. `netlify.toml` 포함된 저장소 연결
2. Site settings → Environment variables → `TMDB_API_KEY`
3. 빌드 후 `/api/tmdb` → `netlify/functions/tmdb.mjs`로 연결됩니다.

### GitHub Pages만 쓰는 경우

Pages에는 서버리스가 없어 **키를 숨길 수 없습니다.** Vercel/Netlify/Cloudflare Pages(Functions) 사용을 권장합니다.

## 보안 요약

| 변수 | 어디에 두나 | 브라우저 노출 |
|------|-------------|----------------|
| `TMDB_API_KEY` | Vercel/Netlify 환경 변수 + 로컬 `.env` | ❌ |
| `VITE_TMDB_API_KEY` | 로컬 개발용만 | dev 번들에만 (배포 빌드에서는 사용 안 함) |

`.env`는 `.gitignore`에 있으므로 GitHub에 올라가지 않습니다.

## 원격 저장소

```bash
git remote add origin https://github.com/BaeSeonA5518/sun.git
```

GitHub Pages용 서브경로 배포 시 `vite.config.js`의 `base: '/sun/'` 주석을 해제한 뒤 다시 빌드하세요.
