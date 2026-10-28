const {readFileSync}=require('node:fs');
// Node's parser supports quoted values and comments without executing configuration.
exports.readSettings=file=>require('node:util').parseEnv(readFileSync(file,'utf8'));
