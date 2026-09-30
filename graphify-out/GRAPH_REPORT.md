# Graph Report - StreamPulse  (2026-09-30)

## Corpus Check
- 90 files · ~91,450 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .example 1, .lock 1)

## Summary
- 427 nodes · 760 edges · 47 communities (21 shown, 26 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.86)
- Token cost: 150 input · 100 output

## Community Hubs (Navigation)
- Core UI & Expo Libraries
- Movie Details & Theme
- Navigation & User Views
- Expo Runtime Dependencies
- Playback & Continue Watching
- Project Metadata & Packages
- App Configuration & Android
- Platform Screen & Storage
- Movie Carousel & Sections
- TypeScript Configuration
- Featured Carousel Component
- Path Aliases & JSConfig
- Search & Content Caching
- Metadata & Formatting Utils
- NPM Build Scripts
- Metro Bundler Config
- Development Dependencies
- ESLint Configuration
- Graph-First Agent Rules
- Claude & Expo Guidelines
- Device Pairing & Sync Plan
- Expo Symbol Asset
- Grid Graphic Asset
- Android Icon Background
- Android Icon Foreground
- Android Icon Monochrome
- Expo Badge Graphic
- Expo White Badge Graphic
- Expo Logo Graphic
- Favicon Graphic
- App Icon Graphic
- Logo Glow Graphic
- App Logo Graphic
- React Logo 2X Asset
- React Logo 3X Asset
- React Logo Asset
- Splash Icon Asset
- Explore Tab 2X Icon
- Explore Tab 3X Icon
- Explore Tab Icon
- Home Tab 2X Icon
- Home Tab 3X Icon
- Home Tab Icon
- Tutorial Web Graphic
- Continue Watching UI Spec
- Direct Downloader Service

## God Nodes (most connected - your core abstractions)
1. `react-native` - 43 edges
2. `@react-native-vector-icons/ionicons` - 31 edges
3. `react` - 30 edges
4. `expo-router` - 25 edges
5. `react-native-safe-area-context` - 16 edges
6. `Index()` - 15 edges
7. `expo-image` - 14 edges
8. `expo` - 13 edges
9. `paths` - 12 edges
10. `useThemeContext()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Progress Tracking Logic (10s threshold)` --conceptually_related_to--> `VideoPlayer()`  [INFERRED]
  CONTINUE_WATCHING_PLAN.md → src/components/player/VideoPlayer.jsx
- `Continue Watching Feature Plan` --conceptually_related_to--> `PlayerScreen()`  [INFERRED]
  CONTINUE_WATCHING_PLAN.md → src/app/(app)/player.jsx
- `StreamPulse Expo Application` --conceptually_related_to--> `Expo SDK 56 Version Constraint`  [INFERRED]
  README.md → AGENTS.md
- `Claude Agent Guidelines` --references--> `Expo SDK 56 Version Constraint`  [EXTRACTED]
  CLAUDE.md → AGENTS.md
- `DownloadsScreen()` --calls--> `getDownloads()`  [EXTRACTED]
  src/app/(app)/downloads.jsx → src/utils/storage.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Continue Watching End-to-End Pipeline** — continue_watching_plan_feature, continue_watching_plan_progress_tracking, src_utils_storage, src_components_player_videoplayer_videoplayer, src_app_app_player_playerscreen [INFERRED 0.85]

## Communities (47 total, 26 thin omitted)

### Community 0 - "Core UI & Expo Libraries"
Cohesion: 0.07
Nodes (27): expo-image, expo-image-picker, expo-linear-gradient, expo-router, @expo/ui, react-native, react-native-safe-area-context, @react-native-vector-icons/ionicons (+19 more)

### Community 1 - "Movie Details & Theme"
Cohesion: 0.09
Nodes (29): ref_context_themecontext, expo-web-browser, react, MovieDetailsScreen(), styles, ActionButtons(), styles, CastSection() (+21 more)

### Community 2 - "Navigation & User Views"
Cohesion: 0.12
Nodes (32): DownloadsScreen(), Index(), initPlatform(), styles, EditProfile(), ProfileScreen(), styles, { width } (+24 more)

### Community 3 - "Expo Runtime Dependencies"
Cohesion: 0.06
Nodes (36): dependencies, expo, expo-blur, expo-constants, expo-dev-client, expo-device, expo-font, expo-glass-effect (+28 more)

### Community 4 - "Playback & Continue Watching"
Cohesion: 0.08
Nodes (31): Continue Watching Data Model, Episode Auto-Continue Logic, Continue Watching Feature Plan, Progress Tracking Logic (10s threshold), expo-screen-orientation, react-native-video, PlayerScreen(), styles (+23 more)

### Community 5 - "Project Metadata & Packages"
Cohesion: 0.07
Nodes (28): main, name, private, version, babel-plugin-module-resolver, expo-blur, expo-constants, expo-dev-client (+20 more)

### Community 6 - "App Configuration & Android"
Cohesion: 0.08
Nodes (25): backgroundColor, foregroundImage, adaptiveIcon, intentFilters, package, predictiveBackGestureEnabled, reactCompiler, typedRoutes (+17 more)

### Community 7 - "Platform Screen & Storage"
Cohesion: 0.13
Nodes (16): @react-native-async-storage/async-storage, PlatformScreen(), styles, SectionHeader(), SettingItem(), SettingsScreen(), styles, BottomTabInset (+8 more)

### Community 8 - "Movie Carousel & Sections"
Cohesion: 0.16
Nodes (17): MovieCategorySection(), loadCategoryMovies(), styles, HorizontalMovieCard(), CategoryMovieSection(), loadCategoryMovies(), PlatformScreenComponent(), loadCategories() (+9 more)

### Community 9 - "TypeScript Configuration"
Cohesion: 0.12
Nodes (16): expo/tsconfig.base, compilerOptions, paths, strict, extends, include, @assets/*, @components/* (+8 more)

### Community 10 - "Featured Carousel Component"
Cohesion: 0.14
Nodes (10): FeaturedCarousel(), getLayout(), MovieCard, styles, styles, CATEGORIES, FEATURED_MOVIES, POPULAR_MOVIES (+2 more)

### Community 11 - "Path Aliases & JSConfig"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, @assets/*, @components/*, @constants/*, @context/*, @hooks/* (+6 more)

### Community 12 - "Search & Content Caching"
Cohesion: 0.35
Nodes (10): resetSearchMemoryCache(), searchMemoryCache, SearchScreen(), styles, searchContent(), searchPluginContent(), addToSearchHistory(), clearSearchHistory() (+2 more)

### Community 13 - "Metadata & Formatting Utils"
Cohesion: 0.44
Nodes (9): MetadataSection(), styles, formatContentType(), formatRating(), formatRuntime(), formatStatus(), formatVoteCount(), formatYear() (+1 more)

### Community 14 - "NPM Build Scripts"
Cohesion: 0.25
Nodes (8): scripts, android, clean-start, ios, lint, reset-project, start, web

### Community 15 - "Metro Bundler Config"
Cohesion: 0.33
Nodes (5): config, { getDefaultConfig }, path, expo, ref_path

### Community 16 - "Development Dependencies"
Cohesion: 0.33
Nodes (6): devDependencies, babel-plugin-module-resolver, eslint, eslint-config-expo, @types/react, typescript

### Community 17 - "ESLint Configuration"
Cohesion: 0.40
Nodes (4): { defineConfig }, expoConfig, eslint, eslint-config-expo

### Community 18 - "Graph-First Agent Rules"
Cohesion: 0.67
Nodes (3): Golden Retrieval Principle, Graph-First Retrieval Rule, Targeted Reading Budget Constraint

### Community 19 - "Claude & Expo Guidelines"
Cohesion: 0.67
Nodes (3): Expo SDK 56 Version Constraint, Claude Agent Guidelines, StreamPulse Expo Application

### Community 20 - "Device Pairing & Sync Plan"
Cohesion: 0.67
Nodes (3): Device Pairing & QR Code, Device Sync Plan, Watch Progress Sync

## Knowledge Gaps
- **222 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+217 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 242 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react-native` connect `Core UI & Expo Libraries` to `Movie Details & Theme`, `Navigation & User Views`, `Playback & Continue Watching`, `Project Metadata & Packages`, `Platform Screen & Storage`, `Movie Carousel & Sections`, `Featured Carousel Component`, `Search & Content Caching`, `Metadata & Formatting Utils`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Expo Runtime Dependencies` to `Project Metadata & Packages`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `react` connect `Movie Details & Theme` to `Core UI & Expo Libraries`, `Navigation & User Views`, `Playback & Continue Watching`, `Project Metadata & Packages`, `Platform Screen & Storage`, `Movie Carousel & Sections`, `Featured Carousel Component`, `Search & Content Caching`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _222 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core UI & Expo Libraries` be split into smaller, more focused modules?**
  _Cohesion score 0.07227891156462585 - nodes in this community are weakly interconnected._
- **Should `Movie Details & Theme` be split into smaller, more focused modules?**
  _Cohesion score 0.09102564102564102 - nodes in this community are weakly interconnected._
- **Should `Navigation & User Views` be split into smaller, more focused modules?**
  _Cohesion score 0.12312312312312312 - nodes in this community are weakly interconnected._