const https = require('https');

https.get('https://tailwindcss.com/docs/dark-mode', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const regex = /custom-variant[^<]*/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
      console.log(match[0]);
    }
  });
});
