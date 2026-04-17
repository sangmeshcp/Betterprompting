import { getDb, getDbPath } from "./index.js";

const db = getDb();
console.log(`Initialized database at ${getDbPath()}`);
db.close();
