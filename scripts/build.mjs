import {cpSync,mkdirSync,rmSync} from 'node:fs';
rmSync('dist',{recursive:true,force:true});mkdirSync('dist');
for(const path of ['index.html','sword-motion.html','src','vendor'])cpSync(path,`dist/${path}`,{recursive:true});
console.log('Static game generated in dist/');
