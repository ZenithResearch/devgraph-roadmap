import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {root} from './inputs.mjs';
for(const dir of ['src','adapters','scripts'])for(const file of await readdir(path.join(root,dir)))if(/\.(js|mjs)$/.test(file))run(['--check',path.join(dir,file)]);
run(['--test','tests/model.test.mjs','tests/adapters.test.mjs','tests/journey.test.mjs','tests/live.test.mjs']);run(['scripts/build.mjs']);
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
