# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KeeWeb is a free, open-source, cross-platform password manager compatible with KeePass `.kdbx` files. It runs as a web app (single HTML file), desktop app (Electron), and browser extension. The codebase targets the last 2 versions of Firefox, Chrome, Safari, iOS, and Edge, plus Electron 13+.

## Build System

The project uses **Grunt** as the task runner with **Webpack** for bundling. All build orchestration is in [Gruntfile.js](Gruntfile.js), [grunt.tasks.js](grunt.tasks.js), and [grunt.entrypoints.js](grunt.entrypoints.js). Custom Grunt tasks live in [build/tasks/](build/tasks/).

### Key Commands

| Command | Description |
|---|---|
| `npm start` or `grunt` | Build the web app (output in `dist/`) |
| `npm run dev` or `grunt dev` | Build + start webpack-dev-server on port 8085 with file watching |
| `npm run lint` or `grunt eslint` | Lint all JS (app, desktop, build, plugins, util) |
| `npm test` or `grunt test` | Build test bundle and run via Puppeteer (headless) |
| `npm run electron` | Launch the Electron desktop app from `desktop/` |
| `grunt dev-desktop-win32 --skip-sign` | Build Windows desktop app for dev testing |
| `grunt dev-desktop-darwin --skip-sign` | Build macOS desktop app for dev testing |
| `grunt dev-desktop-linux --skip-sign` | Build Linux desktop app for dev testing |
| `grunt desktop` | Full build: test + web app + all desktop platforms |

### Output Locations

- Web build output: `dist/`
- Intermediate build files: `tmp/`
- Desktop build output: `tmp/desktop/` and `dist/desktop/`

## Architecture

### MVP (Model-View-Presenter) Pattern

The app uses a custom MVP framework in [app/scripts/framework/](app/scripts/framework/):

- **Model** ([model.js](app/scripts/framework/model.js)) - Proxy-based reactive models. Setting a property triggers `change:property` and `change` events. Models use `static defineModelProperties()` to declare their schema.
- **Collection** ([collection.js](app/scripts/framework/collection.js)) - Manages arrays of models with add/remove/change events.
- **View** ([views/view.js](app/scripts/framework/views/view.js)) - Renders Handlebars templates, manages DOM events via jQuery-style delegation, supports nested child views. Uses `morphdom` for efficient DOM updates.

### Module Structure

```
app/
├── index.html              # Web app entry point
├── scripts/
│   ├── app.js              # Main app bootstrap
│   ├── framework/          # MVP base classes (Model, Collection, View)
│   ├── models/             # Data models (entry, group, file, settings, etc.)
│   ├── collections/        # Collections (entry-collection, group-collection, etc.)
│   ├── views/              # View classes (one per UI area)
│   ├── presenters/         # Presenter classes (glue between views and models)
│   ├── comp/               # Components (browser, app, extension, format, i18n, settings, launcher)
│   ├── const/              # Constants (colors, timeouts, links, hardware, etc.)
│   ├── util/               # Utility functions
│   ├── locales/            # Translation JSON files
│   ├── plugins/            # Plugin system
│   ├── hbs-helpers/        # Handlebars template helpers
│   └── auto-type/          # Auto-type subsystem
├── styles/
│   ├── main.scss           # Root stylesheet
│   ├── base/               # Base styles (colors, typography, forms, icon font)
│   ├── areas/              # Per-area styles (list, details, settings, generator, etc.)
│   ├── themes/             # Theme definitions (light, dark, solarized, terminal, etc.)
│   ├── common/             # Shared component styles (modal, dropdown, dates, etc.)
│   └── utils/              # Utility styles (drag, selection, help, etc.)
├── templates/              # Handlebars (.hbs) templates for all UI views
├── content/                # Static assets served with the web build
├── icons/                  # Icon PNG/SVG files
├── manifest/              # Chrome extension manifest files
├── resources/              # Embedded resources (public key, etc.)
└── lib/                    # Third-party helpers (babel-helpers)

desktop/
├── main.js                 # Electron main process entry
├── package.json            # Desktop-specific dependencies
└── native-module-host.js   # Native messaging host bridge

test/
├── src/                    # Test specs (Mocha + Chai)
├── runner.html             # Test runner for Puppeteer
├── index.js                # Test entry point (auto-discovers all *.js in test/src/)
└── test.webpack.config.js  # Webpack config for test bundle

build/
├── webpack.config.js       # Main webpack config (app bundle)
├── tasks/                  # Custom Grunt tasks (csp-hashes, electron, nsis, osx-sign, etc.)
└── loaders/                # Custom webpack loaders (fontawesome, scss-add-icons)
```

### Webpack Resolution

Webpack resolves modules from three directories: `app/scripts/`, `app/styles/`, `node_modules/`. This means imports like `'models/app-model'` resolve to `app/scripts/models/app-model.js`. Templates are aliased to `app/templates/`.

### Code Style

- **ESLint**: Standard + Prettier + Import rules. Named exports only (no `export default`). `no-var`, `prefer-const`, `prefer-arrow-callback` all enforced.
- **Prettier**: 4-space indent (2 for YAML/JSON). LF line endings. Trailing whitespace trimmed. Final newline required.
- **app/scripts/**: Enforces `import/no-commonjs` (ES modules only).
- **Desktop/Build**: Allows CommonJS (`require()`).

### Key Design Decisions

- **No default exports** - all modules use named exports
- **Icon system**: Custom icon font generated from FontAwesome 6 + custom icons via [build/loaders/fontawesome-loader.js](build/loaders/fontawesome-loader.js)
- **Themes**: SCSS variable-based theming. Theme vars defined in [base/_theme-vars.scss](app/styles/base/_theme-vars.scss), overridden per-theme in [themes/](app/styles/themes/)
- **CSP**: Production build generates inline hash-based CSP headers ([build/tasks/grunt-csp-hashes.js](build/tasks/grunt-csp-hashes.js))
- **Storage**: Pluggable storage backends (local file, Dropbox, Google Drive, OneDrive, WebDAV) in [app/scripts/storage/](app/scripts/storage/)

## Running Tests

Tests are Mocha + Chai specs in `test/src/`. The test runner auto-discovers all `.js` files under `test/src/`. Tests run in a headless browser via Puppeteer.

```bash
# Run all tests
npm test

# Run a single test file by importing it directly
# (edit test/index.js to require only the target file)
```

## Pull Request Guidelines

- Target `develop` for new features, `master` for hotfixes
- Check the [Unsupported Features](https://github.com/keeweb/keeweb/wiki/Unsupported-Features) wiki page before adding features
- Respect existing code style and EditorConfig settings
- Don't add new dependencies without discussion
- Platform-specific code needs feature switches
- Run `grunt` to ensure the full build passes before submitting
