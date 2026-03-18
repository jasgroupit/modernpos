import fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix double darks
content = content.replace(/dark:bg-slate-800 dark:bg-slate-100/g, 'dark:bg-slate-800');
content = content.replace(/dark:bg-slate-900 dark:bg-slate-50/g, 'dark:bg-slate-900');
content = content.replace(/dark:bg-slate-700 dark:bg-slate-200/g, 'dark:bg-slate-700');
content = content.replace(/dark:text-slate-50 dark:text-slate-900/g, 'dark:text-slate-50');
content = content.replace(/dark:text-slate-200 dark:text-slate-700/g, 'dark:text-slate-200');
content = content.replace(/dark:text-slate-300 dark:text-slate-600/g, 'dark:text-slate-300');
content = content.replace(/dark:text-slate-400 dark:text-slate-500/g, 'dark:text-slate-400');
content = content.replace(/dark:text-slate-500 dark:text-slate-400/g, 'dark:text-slate-500');
content = content.replace(/dark:border-slate-700 dark:border-slate-200/g, 'dark:border-slate-700');
content = content.replace(/dark:border-slate-800 dark:border-slate-100/g, 'dark:border-slate-800');

fs.writeFileSync(filePath, content);
console.log('Fixes done!');
