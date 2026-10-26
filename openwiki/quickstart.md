---
type: guide
title: DocuBrain AI Quickstart & Deployment
description: Quickstart tutorial for launching DocuBrain AI locally with Vite and deploying to GitHub Pages with GitHub Actions.
tags: [quickstart, installation, deployment, github-pages, webgpu]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-26T09:17:38.820Z
sources:
  - id: openwiki-source-6766b7a0c14857435d2077c9
    resource: repo://.github/workflows/deploy.yml
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-54631e6ebf1d3b815c4a5eed
    resource: repo://src/App.tsx
  - id: openwiki-source-26a04cd79dd1c5eabee1375d
    resource: repo://src/lib/sampleDocs.ts
generated: { by: "antigravity", at: "2026-10-26T09:17:38.820Z" }
---

# DocuBrain AI Quickstart & Deployment

This guide walks through setting up DocuBrain AI locally on your development machine and publishing it as a live, free **GitHub Pages** web application.

---

## 1. Prerequisites & Browser Support

DocuBrain AI executes neural models directly in the browser via **WebGPU**:
- **Supported Browsers**:
  - Google Chrome 113+ (Windows, macOS, Linux, Android)
  - Microsoft Edge 113+ (Windows, macOS)
  - Safari 18+ (macOS, iOS with WebGPU flag enabled)
  - Firefox Nightly / Developer Edition (with `dom.webgpu.enabled` set to `true`)
- **Hardware Acceleration**: Ensure hardware acceleration is enabled in your browser settings (`chrome://settings/system`).
- **Development Tooling**: Node.js v18+ and npm installed.

---

## 2. Local Development Setup

To run the application locally:

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 3. Quick 1-Click Verification Flow

1. **Initialize AI Engine**:
   - In the top header bar, click **"Initialize"** next to the selected model (default: `Qwen 2.5 (0.5B)`).
   - An animated progress bar tracks model parameter downloading and shader compilation.
   - Once initialized, the badge displays **"Ready"**.
2. **Load Sample Documentation**:
   - In the left sidebar, click **"Load RAG Guide"**.
   - The application ingests the complete RAG handbook, splits text into chunks, and computes 768-dimensional dense vectors using **EmbeddingGemma 2 (270M)** in IndexedDB.
3. **Ask Grounded Questions**:
   - Navigate to **Chat & Q&A**.
   - Submit: `"What is the difference between dense and sparse search?"`
   - Observe the live streaming response and click on the **Source 1** citation pill to verify the cited chunk.
4. **Test the Learning Suite**:
   - Click **AI Summaries** and trigger **"Generate Summary"** to watch the Map-Reduce pipeline.
   - Click **Quiz Arena** and click **"Start Quiz"** to experience progressive 4-choice questions with celebratory confetti.

---

## 4. Publishing to GitHub Pages

DocuBrain AI is a pure client-side application and includes a pre-configured GitHub Actions workflow ([`.github/workflows/deploy.yml`](file:///E:/0-Antigravity/0-webllm/.github/workflows/deploy.yml)).

### Deployment Steps:
1. Initialize git and commit your project:
   ```bash
   git init
   git add .
   git commit -m "Deploy DocuBrain AI to GitHub Pages"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. In your repository on GitHub:
   - Navigate to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, choose **GitHub Actions**.
3. Push any commit to `main`. The GitHub Actions workflow will:
   - Run `npm ci`
   - Run `npm run build`
   - Automatically deploy the `./dist` folder to your live URL (`https://<your-username>.github.io/<your-repo-name>/`).
