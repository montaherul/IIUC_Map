require('dotenv').config();
const { migrate } = require('../src/db/migrate');

migrate()
  .then(() => {
    console.log('Migration complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
