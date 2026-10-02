import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const dir of ['src','scripts','tests'])for(const file of readdirSync(dir).filter(f=>/\.(js|mjs|cjs)$/.test(f))){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log('JavaScript syntax checks passed');
