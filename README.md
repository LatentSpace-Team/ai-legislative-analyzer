# VidhiSetu AI — AI Legislative Analyzer
### Built for ScaleDown Hackathon · Community: ScaleDown

---

## What it does
A Citizen's Dashboard that makes Indian parliamentary bills understandable for every citizen — regardless of education, language, or legal background. Powered by **ScaleDown token compression** + **Claude AI**.

**Core pipeline:**
1. Citizen pastes a bill (100k+ tokens) and asks a question in any Indian language
2. ScaleDown compresses the bill against that specific question → ~800 relevant tokens from 100,000
3. Claude answers in plain language, zero jargon, in the citizen's chosen language

**Bonus A — Personalized alerts:**
- Register interest areas (health, agriculture, taxation, etc.)
- Batch-compress any new bill against each topic
- Know instantly which bills affect you

**Bonus B — Bill comparison:**
- Paste old act + new bill
- ScaleDown compresses both against the same question
- Plain-language diff: "The 2019 law said X. The 2025 bill changes it to Y."

---

## Setup

### 1. Clone & install backend
```bash
cd backend
pip install -r requirements.txt
```

### 2. Set environment variables
```bash
export SCALEDOWN_API_KEY="your_scaledown_key_here"
export ANTHROPIC_API_KEY="your_anthropic_key_here"
```

### 3. Run backend
```bash
uvicorn main:app --reload --port 8000
```

### 4. Open frontend
Open `frontend/index.html` in your browser (or serve with any static server).

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/analyze` | Core Q&A pipeline |
| POST | `/alerts/match` | Bonus A: topic matching |
| POST | `/compare` | Bonus B: bill comparison |
| GET  | `/health` | Health check |

---

## Why ScaleDown wins here
| Problem | Without ScaleDown | With ScaleDown |
|---------|------------------|---------------|
| 100k token bill | Hits context window limit | Compressed to ~800 relevant tokens |
| Cost per question | ~$0.30 | ~$0.002 |
| Cross-references | Breaks RAG chunks | Resolved in compression |
| Multilingual | Extra translation step | Compression + answer in one pass |
| 200k token comparison | Impossible | Handled cleanly |

---

## Languages supported
Hindi · Marathi · Tamil · Telugu · Bengali · Gujarati · Kannada · Malayalam · Punjabi · Odia · Assamese  · English
