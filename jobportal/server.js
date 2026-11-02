const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = false;
const hostname = 'localhost';
const port = process.env.port || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const logFile = path.join(__dirname, 'error.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

logStream.write(`[${new Date().toISOString()}] Log stream initialized.\n`);

app.prepare().then(() => {
    createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            const { pathname, query } = parsedUrl;

            if (pathname === '/a') {
                await app.render(req, res, '/a', query);
            } else if (pathname === '/b') {
                await app.render(req, res, '/b', query);
            } else {
                await handle(req, res, parsedUrl);
            }
        } catch (err) {
            const errorMessage = `[${new Date().toISOString()}] Error handling ${req.url}: ${err.stack}\n`;
            console.error(errorMessage);
            logStream.write(errorMessage);
            res.statusCode = 500;
            res.end('Internal Server Error');
        }
    })
        .once('error', (err) => {
            const serverErrorMessage = `[${new Date().toISOString()}] Server error: ${err.stack}\n`;
            console.error(serverErrorMessage);
            logStream.write(serverErrorMessage);
            process.exit(1);
        })
        .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
        });
});
