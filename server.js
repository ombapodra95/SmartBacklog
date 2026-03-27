require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── File-based persistence ────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tickets.json');

if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));

function loadTickets() {
  try   { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function saveTickets(tickets) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2));
}

// ── CRUD Routes ───────────────────────────────────────────────────────────────

// GET all tickets
app.get('/api/tickets', (req, res) => {
  res.json(loadTickets());
});

// POST create ticket
app.post('/api/tickets', (req, res) => {
  const tickets = loadTickets();
  const ticket = {
    id:                 uuidv4(),
    title:              (req.body.title || '').trim() || 'Untitled',
    description:        (req.body.description || '').trim(),
    acceptanceCriteria: Array.isArray(req.body.acceptanceCriteria) ? req.body.acceptanceCriteria : [],
    storyPoints:        req.body.storyPoints || null,
    priority:           req.body.priority || 'normal',
    status:             req.body.status   || 'todo',
    createdAt:          new Date().toISOString(),
  };
  tickets.push(ticket);
  saveTickets(tickets);
  res.status(201).json(ticket);
});

// PUT update ticket
app.put('/api/tickets/:id', (req, res) => {
  const tickets = loadTickets();
  const idx = tickets.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });

  const t = tickets[idx];
  tickets[idx] = {
    ...t,
    title:              (req.body.title              !== undefined ? req.body.title              : t.title).trim(),
    description:        (req.body.description        !== undefined ? req.body.description        : t.description).trim(),
    acceptanceCriteria:  req.body.acceptanceCriteria !== undefined ? req.body.acceptanceCriteria  : t.acceptanceCriteria,
    storyPoints:         req.body.storyPoints        !== undefined ? req.body.storyPoints         : t.storyPoints,
    priority:            req.body.priority           !== undefined ? req.body.priority            : t.priority,
    status:              req.body.status             !== undefined ? req.body.status              : t.status,
    updatedAt:          new Date().toISOString(),
  };

  saveTickets(tickets);
  res.json(tickets[idx]);
});

// DELETE ticket
app.delete('/api/tickets/:id', (req, res) => {
  const tickets = loadTickets();
  const idx = tickets.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });
  tickets.splice(idx, 1);
  saveTickets(tickets);
  res.json({ success: true });
});

// ── AI Route ──────────────────────────────────────────────────────────────────

/**
 * System Prompt — Expert Agile Coach
 *
 * This prompt is the core of the "Prompt Engineering" requirement.
 * It gives the model a clear persona, explicit decision rules for each task,
 * and strict output constraints (JSON only) so the frontend can parse
 * responses deterministically.
 */
const AGILE_COACH_SYSTEM_PROMPT = `You are an expert Agile Coach and Software Development Consultant with 15+ years of experience in Scrum, Kanban, and iterative product delivery. Your sole purpose is to help development teams write excellent user stories and plan sprints effectively.

Your three areas of expertise:

1. ACCEPTANCE CRITERIA
   - Write criteria that are clear, specific, and independently testable.
   - Use the Given-When-Then (GWT) format: "Given [context], When [action], Then [outcome]."
   - Each criterion must describe a single, verifiable behaviour.
   - Generate between 3 and 6 criteria per story — no more, no less.

2. STORY POINT ESTIMATION (Fibonacci)
   - Use ONLY these values: 1, 2, 3, 5, 8, 13.
   - 1  = Trivial change, under an hour.
   - 2  = Simple task, roughly half a day.
   - 3  = Small feature, about one day.
   - 5  = Medium feature, 2–3 days of effort.
   - 8  = Large or complex feature, nearly a full sprint.
   - 13 = Very large or highly uncertain; recommend splitting.
   - Base your estimate on effort, technical complexity, uncertainty, and risk.

3. PRIORITY CLASSIFICATION
   - "blocking" : This ticket prevents other team members from progressing, OR it is a critical system defect.
   - "urgent"   : This ticket has a hard deadline, regulatory requirement, or direct customer-facing business impact requiring this sprint's attention.
   - "normal"   : Standard backlog item; can be planned in upcoming sprints without penalty.

IMPORTANT: Respond ONLY with a valid JSON object in the exact schema requested. Output NO text, markdown code fences, or commentary outside the JSON object.`;

app.post('/api/ai/generate', async (req, res) => {
  const { type, title, description, acceptanceCriteria } = req.body;

  // Guard: API key
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    return res.status(500).json({
      error: 'OpenAI API key not configured. Open the .env file, replace "your_openai_api_key_here" with your real key, then restart the server.',
    });
  }

  // Guard: title required
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'A ticket title is required for AI generation.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const criteriaBlock = (acceptanceCriteria && acceptanceCriteria.length)
    ? acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join('\n')
    : '  (none provided)';

  const storyContext = `Title: "${title.trim()}"
Description: "${(description || '').trim() || 'Not provided'}"`;

  let userPrompt;

  switch (type) {
    case 'acceptance_criteria':
      userPrompt = `${storyContext}

Generate acceptance criteria for this user story.
Return ONLY this JSON schema:
{
  "acceptanceCriteria": ["Given ... When ... Then ...", "..."]
}`;
      break;

    case 'story_points':
      userPrompt = `${storyContext}
Existing Acceptance Criteria:
${criteriaBlock}

Estimate the story points for this user story using the Fibonacci sequence (1, 2, 3, 5, 8, 13).
Return ONLY this JSON schema:
{
  "storyPoints": <number>,
  "reasoning": "<one concise sentence explaining your estimate>"
}`;
      break;

    case 'priority':
      userPrompt = `${storyContext}
Existing Acceptance Criteria:
${criteriaBlock}

Classify the priority of this user story as one of: blocking, urgent, normal.
Return ONLY this JSON schema:
{
  "priority": "<blocking|urgent|normal>",
  "reasoning": "<one concise sentence explaining your classification>"
}`;
      break;

    case 'all':
      userPrompt = `${storyContext}

Perform a full Agile analysis of this user story: generate acceptance criteria, estimate story points, and classify priority.
Return ONLY this JSON schema:
{
  "acceptanceCriteria": ["Given ... When ... Then ...", "..."],
  "storyPoints": <number from 1,2,3,5,8,13>,
  "storyPointsReasoning": "<one concise sentence>",
  "priority": "<blocking|urgent|normal>",
  "priorityReasoning": "<one concise sentence>"
}`;
      break;

    default:
      return res.status(400).json({ error: 'Invalid type. Accepted values: acceptance_criteria, story_points, priority, all.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model:           'gpt-4o',
      messages: [
        { role: 'system', content: AGILE_COACH_SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature:     0.6,
      max_tokens:      1000,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);
  } catch (err) {
    console.error('[AI Error]', err.message);
    res.status(500).json({ error: `AI generation failed: ${err.message}` });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const keyOk = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';
  console.log(`
🚀  Agile Kanban AI is running
📋  http://localhost:${PORT}
🤖  AI: ${keyOk ? 'Connected ✅' : 'Not configured ⚠️  — add OPENAI_API_KEY to .env and restart'}
`);
});
