# 🚀 Agile Kanban AI

An AI-powered Kanban board for Agile sprint planning. Built with Node.js/Express on the backend and plain HTML + Tailwind CSS on the frontend. The AI features are powered by OpenAI GPT-4o acting as an expert Agile Coach.

---

## Features

**Sprint 1 — Core Kanban**
- Three-column board: To Do / In Progress / Done
- Add, edit, and delete user story tickets
- Drag and drop cards between columns
- Data is persisted to `data/tickets.json` (survives server restarts)

**Sprint 2 — AI Integration (GPT-4o)**
- **Acceptance Criteria Generation** — paste a title and get 3–6 Given-When-Then criteria
- **Story Point Estimation** — Fibonacci scale (1, 2, 3, 5, 8, 13) with a one-line rationale
- **Priority Analysis** — classifies as `blocking`, `urgent`, or `normal` with reasoning
- **AI Auto-Fill All** — one-click to generate all three fields simultaneously

---

## Quick Start

### 1. Install dependencies
```bash
cd agile-kanban-ai
npm install
```

### 2. Add your OpenAI API key
Open `.env` and replace the placeholder with your real key:
```
OPENAI_API_KEY=sk-...your-actual-key...
PORT=3000
```

### 3. Start the server
```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

### 4. Open the app
Navigate to [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
agile-kanban-ai/
├── .env                  ← Your API key goes here (not committed)
├── .env.example          ← Template showing required variables
├── package.json
├── server.js             ← Express backend + AI route
├── data/
│   └── tickets.json      ← Auto-created; stores all ticket data
└── public/
    ├── index.html        ← UI (Tailwind CSS via CDN)
    └── app.js            ← Frontend logic (vanilla JS)
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets` | List all tickets |
| POST | `/api/tickets` | Create a ticket |
| PUT | `/api/tickets/:id` | Update a ticket |
| DELETE | `/api/tickets/:id` | Delete a ticket |
| POST | `/api/ai/generate` | AI generation (see below) |

### AI Generate — Request Body
```json
{
  "type": "acceptance_criteria | story_points | priority | all",
  "title": "Login Page",
  "description": "As a user I want to log in...",
  "acceptanceCriteria": []
}
```

---

## Prompt Engineering Notes

The AI is given a structured **system prompt** that establishes it as an expert Agile Coach. Key design decisions:

- **Persona**: 15+ years of Scrum/Kanban experience, output-focused.
- **Explicit rules** for each task (GWT format, Fibonacci scale definitions, priority taxonomy).
- **JSON-only output constraint**: `response_format: json_object` is set at the API level and reinforced in the prompt to ensure deterministic parsing.
- **Temperature 0.6**: balances creativity in criterion wording with consistency in estimates.
