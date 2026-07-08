const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/analyze-restaurant',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk.toString().substring(0, 50)}...`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify({ name: 'McDonalds', place_id: 'ChIJc_yX3HhYwokRs8eX_j456-Q' }));
req.end();
