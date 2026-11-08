const config = require('./config/env');
const createApp = require('./app');
const { db } = require('./config/db');

const app = createApp();
app.listen(config.port, config.host, () => {
  console.log(`listening on http://${config.host}:${config.port}`);
  console.log('db connected:', !!db);
});
