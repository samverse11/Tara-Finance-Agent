import 'dotenv/config';
import express from 'express';
import { askQuestion } from './services/ask';
import { pool } from './db/connection';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'tara' });
});

app.post('/ask', async (req, res) => {
  const question =
    typeof req.body?.question === 'string' ? req.body.question.trim() : '';

  if (!question) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  const result = await askQuestion(question);

  if (result.status === 'error') {
    res.status(500).json(result);
    return;
  }

  res.json({
    answer: result.answer,
    tools_called: result.tools_called,
    latency_ms: result.latency_ms,
  });
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Tara listening on http://localhost:${port}`);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
