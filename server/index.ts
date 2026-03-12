import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[mission-control] API listening on http://127.0.0.1:${config.port}`);
});
