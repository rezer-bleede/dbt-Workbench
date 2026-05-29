#!/usr/bin/env node

/**
 * E2E Test Runner Script
 * 
 * This script orchestrates the full E2E testing flow:
 * 1. Starts the docker compose stack
 * 2. Waits for services to be ready
 * 3. Runs Playwright tests
 * 4. Always tears down the stack
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

// Configuration
const BACKEND_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:3000';
const HEALTH_ENDPOINT = '/health';
const MAX_WAIT_TIME = 240000; // 4 minutes
const CHECK_INTERVAL = 2000; // 2 seconds
const DB_ARTIFACTS_DIR = join(repoRoot, 'data', 'artifacts');
const DB_REPOS_DIR = join(repoRoot, 'data', 'repos');

function ensureDir(path) {
  try {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  } catch (error) {
    throw new Error(`Failed to prepare directory ${path}: ${error.message}`);
  }
}

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step) {
  log(`\n${'='.repeat(60)}`, 'bright');
  log(step, 'blue');
  log('='.repeat(60), 'bright');
}

// Execute a command and return a promise
function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Executing: ${command} ${args.join(' ')}`, 'yellow');
    
    const proc = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      stdio: 'inherit',
      shell: true,
      ...options
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

// Wait for a URL to be accessible
async function waitForUrl(url, endpoint = '', maxWait = MAX_WAIT_TIME) {
  const fullUrl = endpoint ? `${url}${endpoint}` : url;
  const startTime = Date.now();

  log(`Waiting for ${fullUrl} to be ready...`, 'yellow');

  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(fullUrl);
      if (response.ok) {
        log(`\n✓ ${fullUrl} is ready!`, 'green');
        return true;
      } else {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (elapsed % 10 === 0) { // Log every 10 seconds
          log(`\n  Response status: ${response.status}`, 'yellow');
        }
      }
    } catch (error) {
      // Service not ready yet, continue waiting
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0) { // Log every 10 seconds
        log(`\n  Connection error: ${error.message}`, 'yellow');
      }
    }

    // Show progress
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  Elapsed: ${elapsed}s...`);

    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }

  throw new Error(`Timeout waiting for ${fullUrl} to be ready`);
}

async function waitForDockerHealth(service, maxWait = MAX_WAIT_TIME) {
  const startTime = Date.now();
  log(`Waiting for Docker service '${service}' to report healthy...`, 'yellow');

  while (Date.now() - startTime < maxWait) {
    try {
      const containerResult = await captureCommandOutput('docker', [
        'compose',
        '-f',
        'docker-compose.yml',
        'ps',
        '-q',
        service,
      ]);
      const containerId = (containerResult.stdout || '').trim();
      if (!containerId) {
        throw new Error(`No running container found for service '${service}'.`);
      }

      const inspectResult = await captureCommandOutput('docker', [
        'inspect',
        '-f',
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
        containerId,
      ]);

      const state = (inspectResult.stdout || '').trim();
      if (state === 'healthy' || state === 'running') {
        log(`✓ Docker service '${service}' is ${state}.`, 'green');
        return true;
      }
    } catch (error) {
      // Keep polling until timeout
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  Waiting on ${service}: ${elapsed}s...`);
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }

  throw new Error(`Timeout waiting for Docker service '${service}' to become healthy`);
}

function captureCommandOutput(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      ...options,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

// Main execution flow
async function main() {
  let testsPassed = false;
  
  try {
    ensureDir(DB_ARTIFACTS_DIR);
    ensureDir(DB_REPOS_DIR);

    logStep('Step 1: Starting Docker Compose Stack');
    await execCommand('docker', ['compose', '-f', 'docker-compose.yml', 'up', '-d', '--build']);
    
    logStep('Step 2: Waiting for Services to be Ready');
    await waitForDockerHealth('db');
    await waitForDockerHealth('backend');
    await waitForDockerHealth('frontend');
    await waitForUrl(BACKEND_URL, HEALTH_ENDPOINT);
    await waitForUrl(FRONTEND_URL);
    
    logStep('Step 3: Running Playwright E2E Tests');
    const frontendDir = join(repoRoot, 'frontend');
    
    // Set environment variables and run tests
    const testEnv = {
      ...process.env,
      E2E_BASE_URL: FRONTEND_URL,
    };
    
    await execCommand('npm', ['run', 'test:e2e'], {
      cwd: frontendDir,
      env: testEnv
    });
    
    testsPassed = true;
    log('\n✓ All E2E tests passed!', 'green');
    
  } catch (error) {
    log(`\n✗ Error: ${error.message}`, 'red');
    testsPassed = false;

    // Log container status for debugging
    log('\n=== Container Status ===', 'yellow');
    try {
      await execCommand('docker', ['compose', '-f', 'docker-compose.yml', 'ps']);
      log('\n=== Backend Logs (last 50 lines) ===', 'yellow');
      await execCommand('docker', ['compose', '-f', 'docker-compose.yml', 'logs', '--tail=50', 'backend']);
      log('\n=== Database Logs (last 50 lines) ===', 'yellow');
      await execCommand('docker', ['compose', '-f', 'docker-compose.yml', 'logs', '--tail=50', 'db']);
    } catch (logError) {
      log(`Failed to get logs: ${logError.message}`, 'yellow');
    }
  } finally {
    logStep('Step 4: Tearing Down Docker Compose Stack');
    try {
      await execCommand('docker', ['compose', '-f', 'docker-compose.yml', 'down', '-v']);
      log('✓ Docker stack stopped successfully', 'green');
    } catch (error) {
      log(`Warning: Failed to stop docker stack: ${error.message}`, 'yellow');
    }
    
    // Exit with appropriate code
    process.exit(testsPassed ? 0 : 1);
  }
}

// Run the script
main().catch(error => {
  log(`\n✗ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
