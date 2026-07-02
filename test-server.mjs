import http from 'node:http';
const s = http.createServer((q, r) => { r.writeHead(200, {'content-type':'text/plain'}); r.end('ok') });
s.listen(3000, () => console.log('listening 3000'));