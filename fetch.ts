import fs from 'fs';
fetch('https://tailwindcss.com/docs/dark-mode')
  .then(r => r.text())
  .then(t => {
    const lines = t.split('\n');
    lines.forEach(line => {
      if (line.includes('@custom-variant')) {
        console.log(line.substring(0, 200));
      }
    });
  });
