import {fileURLToPath} from 'node:url';
import {buildSourceArchive} from './lib/source-archive.mjs';
try{console.log('Source archive created: '+JSON.stringify(await buildSourceArchive(fileURLToPath(new URL('../',import.meta.url)))));}
catch(error){console.error(error.message);process.exitCode=1;}
