import 'dotenv/config';
import { createModel } from '../src/config/model';

async function main() {
  const model = await createModel();

  console.log('Model loaded successfully');
  console.log(model);
}

main().catch(console.error);