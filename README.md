# Vision Board PWA

비전 보드 앱 - 목표와 꿈을 시각화하는 Progressive Web App입니다.

## 기능

- 📱 PWA (Progressive Web App) 지원
- 🔄 자동 업데이트 알림
- 📲 홈 화면 설치 가능
- 🌐 오프라인 지원
- 🎨 캔버스 기반 비전 보드 편집
- 💾 로컬 데이터 저장 (IndexedDB)

## PWA 기능

이 앱은 다음과 같은 PWA 기능을 제공합니다:

### 설치 가능
- 브라우저에서 "홈 화면에 추가" 또는 "설치" 옵션을 통해 네이티브 앱처럼 설치 가능
- 설치 프롬프트가 자동으로 표시됨

### 오프라인 지원
- 서비스 워커를 통한 캐싱으로 오프라인에서도 사용 가능
- 네트워크 연결이 없어도 기본 기능 이용 가능

### 자동 업데이트
- 새 버전이 배포되면 자동으로 감지하고 업데이트 알림 표시
- 사용자가 선택적으로 업데이트 가능

## 개발 및 빌드

### 개발 서버 실행
```bash
npm run dev
```

### 프로덕션 빌드
```bash
npm run build
```

### 빌드 미리보기 (PWA 테스트)
```bash
npm run preview
```

## PWA 테스트

PWA 기능을 테스트하려면:

1. `npm run build`로 프로덕션 빌드 생성
2. `npm run preview`로 프리뷰 서버 실행
3. 브라우저에서 `http://localhost:4173` 접속
4. 개발자 도구 > Application > Manifest 탭에서 PWA 설정 확인
5. 브라우저 주소창의 설치 아이콘 클릭하여 설치 테스트

## 기술 스택

- **React 19** - UI 라이브러리
- **Vite** - 빌드 도구
- **Tailwind CSS** - 스타일링
- **Vite PWA Plugin** - PWA 기능
- **Workbox** - 서비스 워커 관리
- **IndexedDB** - 로컬 데이터 저장

## PWA 설정

PWA 설정은 `vite.config.js`에서 관리됩니다:

- **Manifest**: 앱 이름, 아이콘, 테마 색상 등
- **Service Worker**: 캐싱 전략 및 오프라인 지원
- **Icons**: 192x192, 512x512 크기의 PWA 아이콘

## 브라우저 지원

- Chrome/Edge: 완전 지원
- Firefox: 기본 PWA 기능 지원
- Safari: iOS 14.3+ 에서 PWA 설치 지원
