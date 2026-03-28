import express from 'express';
import { authenticateToken, requireTester } from '../middleware/auth.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSTANTS_PATH = path.join(__dirname, '../../scripts/constants.cjs');

// Registry of running processes
const runningProcesses = new Map();

// GET /api/tests/config - Read constants.cjs
router.get('/config', authenticateToken, requireTester, async (req, res) => {
    try {
        const fileUrl = `file://${CONSTANTS_PATH}?t=${Date.now()}`;
        const { default: constants } = await import(fileUrl);
        res.json(constants);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tests/config - Update constants.cjs
router.post('/config', authenticateToken, requireTester, async (req, res) => {
    try {
        const newConfig = req.body;
        const fileContent = `/**\n * CENTRALIZED TEST CONSTANTS\n * Managed via Stress Dashboard\n */\nmodule.exports = ${JSON.stringify(newConfig, null, 4)};\n`;
        await fs.writeFile(CONSTANTS_PATH, fileContent);
        res.json({ message: 'Configuration updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tests/run - Execute a script (streaming)
router.post('/run', authenticateToken, requireTester, async (req, res) => {
    const { script, runId } = req.body;
    const validScripts = ['race-test.cjs', 'unified-stress-test.cjs', 'stress-test.cjs', 'failure-simulation.cjs'];

    if (!validScripts.includes(script)) {
        return res.status(400).json({ error: 'Invalid script' });
    }

    const scriptPath = path.join(__dirname, '../../scripts/', script);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const child = spawn('node', [scriptPath], {
        cwd: path.join(__dirname, '../../'),
        env: { ...process.env, NODE_ENV: 'test' }
    });

    if (runId) runningProcesses.set(runId, child);

    child.stdout.on('data', (data) => { res.write(data); });
    child.stderr.on('data', (data) => { res.write(`[ERROR] ${data}`); });

    child.on('close', (code) => {
        if (runId) runningProcesses.delete(runId);
        res.write(`\n--- SCRIPT EXITED WITH CODE ${code} ---\n`);
        res.end();
    });
});

// POST /api/tests/kill - Terminate a running process
router.post('/kill', authenticateToken, requireTester, async (req, res) => {
    const { runId } = req.body;
    const child = runningProcesses.get(runId);
    if (child) {
        child.kill('SIGTERM');
        runningProcesses.delete(runId);
        res.json({ message: 'Process terminated.' });
    } else {
        res.status(404).json({ error: 'No running process found with that ID.' });
    }
});

export default router;
