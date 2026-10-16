import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/landlords',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data, 'StatusCode:', res.statusCode));
});

req.on('error', e => console.error('Error:', e));
req.write(JSON.stringify({ action: 'signup', phone: '077999888', name: 'Test' }));
req.end();
