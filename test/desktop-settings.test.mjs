import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {readSettings}=createRequire(import.meta.url)('../desktop/settings.cjs');
test('desktop settings preserves quoted password and ignores comments without execution',()=>{const dir=mkdtempSync(join(tmpdir(),'desktop-env-'));try{const file=join(dir,'.env');writeFileSync(file,'# settings\nADMIN_PASSWORD="abc!# 123"\nTOKEN_ENCRYPTION_KEY=first\nTOKEN_ENCRYPTION_KEY=second\nAPP_URL=http://localhost:3000\n');const env=readSettings(file);assert.equal(env.ADMIN_PASSWORD,'abc!# 123');assert.equal(env.TOKEN_ENCRYPTION_KEY,'second');assert.equal(env.APP_URL,'http://localhost:3000');}finally{rmSync(dir,{recursive:true,force:true});}});
