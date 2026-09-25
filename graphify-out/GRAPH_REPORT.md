# Graph Report - StreamPulse  (2026-09-26)

## Corpus Check
- 84 files · ~85,781 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 401 nodes · 664 edges · 41 communities (16 shown, 25 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.86)
- Token cost: 1,200 input · 800 output

## Community Hubs (Navigation)
- Theme Context & Navigation Foundations
- Metro Bundler & ESLint Configuration
- Discover Screen & UI Layouts
- Core Expo Dependencies & Plugins
- Settings & Local Storage State
- Profile Screen & Image Management
- Movie Details & Platform Catalog
- Expo App Configuration & Android Icons
- Continue Watching Feature & Progress Logic
- TypeScript Configuration
- JavaScript Path Aliases
- Content Metadata & Formatters
- Package Scripts & Native Run Targets
- Offline Download & Cloudstream Pipeline
- Project Rules & Architecture Constraints
- Multi-Device Sync & QR Pairing
- Static Asset (Community 16)
- Static Asset (Community 17)
- Static Asset (Community 18)
- Static Asset (Community 19)
- Static Asset (Community 20)
- Static Asset (Community 21)
- Static Asset (Community 22)
- Static Asset (Community 23)
- Static Asset (Community 24)
- Static Asset (Community 25)
- Static Asset (Community 26)
- Static Asset (Community 27)
- Static Asset (Community 28)
- Static Asset (Community 29)
- Static Asset (Community 30)
- Static Asset (Community 31)
- Static Asset (Community 32)
- Static Asset (Community 33)
- Static Asset (Community 34)
- Static Asset (Community 35)
- Static Asset (Community 36)
- Static Asset (Community 37)
- Static Asset (Community 38)
- Continue Watching UI Component Spec

## God Nodes (most connected - your core abstractions)
1. `react-native` - 38 edges
2. `@react-native-vector-icons/ionicons` - 25 edges
3. `react` - 25 edges
4. `expo-router` - 23 edges
5. `expo` - 13 edges
6. `react-native-safe-area-context` - 13 edges
7. `paths` - 12 edges
8. `expo-image` - 11 edges
9. `paths` - 11 edges
10. `MetadataSection()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Progress Tracking Logic (10s threshold)` --conceptually_related_to--> `VideoPlayer()`  [INFERRED]
  CONTINUE_WATCHING_PLAN.md → src/components/player/VideoPlayer.jsx
- `Continue Watching Feature Plan` --conceptually_related_to--> `PlayerScreen()`  [INFERRED]
  CONTINUE_WATCHING_PLAN.md → src/app/(app)/player.jsx
- `StreamPulse Expo Application` --conceptually_related_to--> `Expo SDK 56 Version Constraint`  [INFERRED]
  README.md → AGENTS.md
- `DownloadContext & Queue` --references--> `DirectDownloader Service`  [INFERRED]
  OFFLINE_DOWNLOAD_PLAN.md → D:/Projeler/ReactNative/OFFLINE_DOWNLOAD_PLAN.md
- `Claude Agent Guidelines` --references--> `Expo SDK 56 Version Constraint`  [EXTRACTED]
  CLAUDE.md → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Continue Watching End-to-End Pipeline** — continue_watching_plan_feature, continue_watching_plan_progress_tracking, src_utils_storage, src_components_player_videoplayer_videoplayer, src_app_app_player_playerscreen [INFERRED 0.85]
- **Offline Download & Playback Pipeline** — offline_download_plan_download_item, offline_download_plan_hls_downloader, offline_download_plan_download_context, offline_download_plan_offline_playback [INFERRED 0.85]

## Communities (41 total, 25 thin omitted)

### Community 0 - "Theme Context & Navigation Foundations"
Cohesion: 0.07
Nodes (33): ref_context_themecontext, expo-linear-gradient, expo-router, expo-web-browser, react-native, @react-native-vector-icons/ionicons, styles, styles (+25 more)

### Community 1 - "Metro Bundler & ESLint Configuration"
Cohesion: 0.04
Nodes (43): { defineConfig }, expoConfig, config, { getDefaultConfig }, path, devDependencies, babel-plugin-module-resolver, eslint (+35 more)

### Community 2 - "Discover Screen & UI Layouts"
Cohesion: 0.08
Nodes (23): expo-image, react, react-native-safe-area-context, styles, styles, BottomNavigation(), styles, FeaturedCarousel() (+15 more)

### Community 3 - "Core Expo Dependencies & Plugins"
Cohesion: 0.06
Nodes (36): dependencies, expo, expo-blur, expo-constants, expo-dev-client, expo-device, expo-font, expo-glass-effect (+28 more)

### Community 4 - "Settings & Local Storage State"
Cohesion: 0.08
Nodes (29): @react-native-async-storage/async-storage, SectionHeader(), SettingItem(), SettingsScreen(), styles, BG_STYLE_OPTIONS, COLOR_OPTIONS, DEFAULT_LANG_OPTIONS (+21 more)

### Community 5 - "Profile Screen & Image Management"
Cohesion: 0.12
Nodes (28): expo-image-picker, @expo/ui, Index(), loadProfile(), EditProfile(), styles, ProfileScreen(), styles (+20 more)

### Community 6 - "Movie Details & Platform Catalog"
Cohesion: 0.12
Nodes (21): MovieDetailsScreen(), PlatformList(), loadPlatforms(), styles, HorizontalMovieCard(), styles, CategoryMovieSection(), loadCategoryMovies() (+13 more)

### Community 7 - "Expo App Configuration & Android Icons"
Cohesion: 0.08
Nodes (25): backgroundColor, foregroundImage, adaptiveIcon, intentFilters, package, predictiveBackGestureEnabled, reactCompiler, typedRoutes (+17 more)

### Community 8 - "Continue Watching Feature & Progress Logic"
Cohesion: 0.15
Nodes (16): Continue Watching Data Model, Episode Auto-Continue Logic, Continue Watching Feature Plan, Progress Tracking Logic (10s threshold), expo-screen-orientation, react-native-video, PlayerScreen(), styles (+8 more)

### Community 9 - "TypeScript Configuration"
Cohesion: 0.12
Nodes (16): expo/tsconfig.base, compilerOptions, paths, strict, extends, include, @assets/*, @components/* (+8 more)

### Community 10 - "JavaScript Path Aliases"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, @assets/*, @components/*, @constants/*, @context/*, @hooks/* (+6 more)

### Community 11 - "Content Metadata & Formatters"
Cohesion: 0.44
Nodes (9): MetadataSection(), styles, formatContentType(), formatRating(), formatRuntime(), formatStatus(), formatVoteCount(), formatYear() (+1 more)

### Community 12 - "Package Scripts & Native Run Targets"
Cohesion: 0.25
Nodes (8): scripts, android, clean-start, ios, lint, reset-project, start, web

### Community 13 - "Offline Download & Cloudstream Pipeline"
Cohesion: 0.33
Nodes (7): Cloudstream Download Architecture, DirectDownloader Service, DownloadContext & Queue, DownloadItem Schema, HlsDownloader Service, Offline Download Plan, Offline Playback (VideoPlayer)

### Community 14 - "Project Rules & Architecture Constraints"
Cohesion: 0.67
Nodes (3): Expo SDK 56 Version Constraint, Claude Agent Guidelines, StreamPulse Expo Application

### Community 15 - "Multi-Device Sync & QR Pairing"
Cohesion: 0.67
Nodes (3): Device Pairing & QR Code, Device Sync Plan, Watch Progress Sync

## Knowledge Gaps
- **215 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+210 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 232 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react-native` connect `Theme Context & Navigation Foundations` to `Metro Bundler & ESLint Configuration`, `Discover Screen & UI Layouts`, `Settings & Local Storage State`, `Profile Screen & Image Management`, `Movie Details & Platform Catalog`, `Continue Watching Feature & Progress Logic`, `Content Metadata & Formatters`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Core Expo Dependencies & Plugins` to `Metro Bundler & ESLint Configuration`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `react` connect `Discover Screen & UI Layouts` to `Theme Context & Navigation Foundations`, `Metro Bundler & ESLint Configuration`, `Settings & Local Storage State`, `Profile Screen & Image Management`, `Movie Details & Platform Catalog`, `Continue Watching Feature & Progress Logic`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _215 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Theme Context & Navigation Foundations` be split into smaller, more focused modules?**
  _Cohesion score 0.07390648567119155 - nodes in this community are weakly interconnected._
- **Should `Metro Bundler & ESLint Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Discover Screen & UI Layouts` be split into smaller, more focused modules?**
  _Cohesion score 0.08108108108108109 - nodes in this community are weakly interconnected._