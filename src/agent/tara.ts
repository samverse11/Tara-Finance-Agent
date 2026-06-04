import { Agent } from '@mastra/core/agent';
import { createModel } from '../config/model';
import { TARA_SYSTEM_PROMPT } from './prompt';
import { taraTools } from '../tools';

const model = await createModel();

export const taraAgent = new Agent({
  id: 'tara',
  name: 'Tara',
  instructions: TARA_SYSTEM_PROMPT,
  model,
  tools: taraTools,
});
