# Instagram AI Commenter Bot

An advanced Instagram bot that automatically monitors target profiles for new posts and uses Google's Gemini AI to generate and post context-aware, human-like comments. It is built with Playwright for robust browser automation and incorporates advanced techniques to mimic human behavior and evade detection.

## ⚠️ Disclaimer

This project is for educational purposes only. Automating interactions on Instagram is against their Terms of Service. Using this bot can result in your account being temporarily or permanently blocked. The developers of this project are not responsible for any consequences of its use. Use it at your own risk.

---

## Features

-   **AI-Powered Comments**: Utilizes Google Gemini's multimodal capabilities to analyze post captions, images, and even videos to generate highly relevant and natural-sounding comments.
-   **Multi-Account Management**: Configure and run the bot for multiple Instagram accounts, each with its own set of targets and settings.
-   **Continuous Monitoring**: Runs in a loop to monitor a list of target profiles, detecting new posts as soon as they are published.
-   **Human Behavior Emulation**: Simulates realistic human actions, including:
    -   Natural, non-linear mouse movements.
    -   Human-like typing with variable delays and simulated typos.
    -   Randomized delays between actions to avoid predictability.
    -   Jittery movements, unpredictable scrolling, and simulated "reading" time.
-   **Advanced Fingerprint Spoofing**: Generates and applies realistic browser fingerprints (User Agent, viewport, locale, timezone, WebGL, etc.) for each account to reduce the risk of detection.
-   **Persistent Sessions & Logging**:
    -   Saves and reuses cookies for persistent login sessions.
    -   Logs all comment interactions to a global CSV file (`interaction_log.csv`).
    -   Tracks post/follower counts for each target in a separate CSV (`profile_stats.csv`) to detect new posts.
-   **Per-Account Configuration**: Each account defines its own login method, post-discovery mode, skills file, URL/hashtag files, and hashtag search settings.
-   **Unified Runtime**: `npm start` runs all enabled accounts — URL lists once, then a continuous monitor loop for target monitoring and hashtag scanning.
-   **Multiple Operational Modes**:
    -   `start` (default): Unified mode — URL list accounts run once, then monitor + hashtag accounts loop.
    -   `test-comment`: Tests one enabled account according to its `sourceMode`.
    -   `check-accounts`: Non-headless mode to inspect each enabled account (login, CAPTCHAs, 2FA).
    -   `comment-urls` / `hashtag-comment`: Deprecated shortcuts for `url_list` / `hashtag_list` accounts only.
-   **Robust Error Handling**: Designed to handle common issues like private profiles, missing posts, and failed actions, with screenshotting on error for easier debugging.

## Prerequisites

Before you begin, ensure you have the following installed:
-   [Node.js](https://nodejs.org/) (v18 or higher recommended)
-   [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

## Setup & Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/dzeveckij/instagram-ai-commenter-bot.git
    cd instagram-ai-commenter-bot
    ```

2.  **Install Dependencies**
    This will also download the necessary Playwright browser binaries.
    ```bash
    npm install
    ```

3.  **Configure the Bot**
    The main configuration is done in the `src/config.ts` file. Open this file and edit it according to your needs.

    -   **Google AI API Key**: Add your Google Gemini API key to the `googleAiApiKey` string. You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey).
    -   **Headless Mode**: Set `headless: true` to run the browser in the background or `false` to see the browser window.
    -   **Accounts**: Add your Instagram accounts to the `accounts` array. Each account is self-contained:
        -   `enabled`: `true` to use this account, `false` to disable it.
        -   `loginMethod`: `'credentials'` (username/password) or `'manual'` (log in via browser; cookies saved).
        -   `sourceMode`: How this account finds posts to comment on:
            -   `new_post_added_to_account` — monitor `targets` for new posts (continuous loop).
            -   `url_list` — comment on URLs from per-account `postUrlsFile` (once per `npm start`).
            -   `hashtag_list` — scan per-account `hashtags` array each monitor cycle.
        -   `skillsFile` (required) — one comment style file per Instagram account, shared across all source modes.
        -   Post filter only: `targets` (monitor), `postUrlsFile` (url_list), `hashtags` array (hashtag_list).

    *See the [Configuration](#configuration) section below for more details.*

## Usage (Running the Bot)

**1. Unified Mode (Default — `npm start`)**

Runs all enabled accounts in two phases:

1. **URL phase** — each `url_list` account comments on its URL file once, then exits.
2. **Monitor loop** — `new_post_added_to_account` accounts watch targets for new posts; `hashtag_list` accounts scan hashtags each cycle.

```bash
npm start
```

**2. Test Comment Mode**

Tests the first enabled account (or a specific one) according to its `sourceMode`.

```bash
npm test
npx ts-node src/main.ts test-comment your_username
```

**3. Check Accounts Mode**

Non-headless. Opens each enabled account for manual inspection. Press `ENTER` to proceed to the next account.

```bash
npm run checker
```

**4. Shortcut modes (deprecated)**

```bash
npm run comment-urls          # url_list accounts only
npm run hashtag-comment       # hashtag_list accounts, one cycle
```

### In-Script Controls
- **CTRL+C**: Stop the bot at any time.
- **`i` key**: Request a pause. The script will enter debug mode at the next available opportunity, allowing you to use the Playwright Inspector.

---

## Configuration (`src/config.ts`)

Global `settings` provide defaults; each account can override files and hashtag search behavior.

```typescript
// Per-account enums
type LoginMethod = 'credentials' | 'manual';
type PostSourceMode = 'new_post_added_to_account' | 'url_list' | 'hashtag_list';

// One Instagram account — skillsFile is per user, sourceMode is only the post filter
accounts: [
    {
        enabled: true,
        username: 'studybo.app',
        loginMethod: 'credentials',
        password: 'YOUR_PASSWORD_HERE',
        sourceMode: 'new_post_added_to_account',  // or 'url_list' | 'hashtag_list'
        skillsFile: 'data/accounts/studybo.app/skills.txt',
        targets: ['instagram', 'playwright'],     // new_post_added_to_account
        // postUrlsFile: 'data/accounts/studybo.app/urls.txt',  // url_list
        // hashtags: ['studygram', 'productivity'],              // hashtag_list
    },
]
```

`sourceMode` only changes how posts are discovered. Comment skills stay in one `skillsFile` per Instagram account. Global defaults in `settings`: `hashtagSearch`, `monitoringIntervalSeconds`.

---

## License

This project is open-source and available to everyone. Please see the LICENSE file for more details.
