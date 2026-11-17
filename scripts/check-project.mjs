import {fileURLToPath} from 'node:url';
import {auditProject} from './lib/project-files.mjs';

try{
 const result=await auditProject(fileURLToPath(new URL('../',import.meta.url)),{checkIndex:process.argv.includes('--index')});
 console.log('Project source checked: '+JSON.stringify(result.summary));
}catch(error){console.error(error.message);process.exitCode=1;}
