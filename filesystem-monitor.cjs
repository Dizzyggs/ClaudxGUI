#!/usr/bin/env node

/**
 * Filesystem Monitor - Real-time file change detection
 * Used by claude-secure-wrapper.sh to monitor unauthorized file operations
 */

const fs = require('fs');
const path = require('path');

// Get command line arguments
const [,, projectDir, claudePidFile] = process.argv;

if (!projectDir) {
    console.error('Usage: node filesystem-monitor.js <project-directory> [claude-pid-file]');
    process.exit(1);
}

console.log(`[${new Date().toISOString()}] 🔒 Starting filesystem monitor for: ${projectDir}`);

let violationDetected = false;

// Function to kill Claude and create violation flag
function handleViolation(filePath, eventType) {
    if (violationDetected) return; // Avoid multiple violations
    violationDetected = true;
    
    console.log(`[${new Date().toISOString()}] 🚨 SECURITY VIOLATION: ${eventType} detected on ${filePath}`);
    
    // Create security violation flag
    const violationFlag = `/tmp/claude-security-violation.flag`;
    const violationData = `SECURITY_VIOLATION:${filePath}:${eventType}:${new Date().toISOString()}`;
    
    try {
        fs.writeFileSync(violationFlag, violationData);
        console.log(`[${new Date().toISOString()}] 📝 Created violation flag: ${violationFlag}`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to create violation flag:`, error);
    }
    
    // Find and kill Claude process
    try {
        const { execSync } = require('child_process');
        const claudeCmd = 'pgrep -f "/usr/local/bin/claude.*--verbose.*--model.*sonnet"';
        
        let claudePid;
        try {
            claudePid = execSync(claudeCmd, { encoding: 'utf8' }).trim();
        } catch (error) {
            // pgrep returns exit code 1 when no processes found
            claudePid = null;
        }
        
        if (claudePid) {
            console.log(`[${new Date().toISOString()}] 🛑 Terminating Claude process PID: ${claudePid}`);
            try {
                execSync(`kill -KILL ${claudePid}`, { stdio: 'ignore' });
                console.log(`[${new Date().toISOString()}] ✅ Claude process terminated successfully`);
            } catch (killError) {
                // Process might have already finished
                console.log(`[${new Date().toISOString()}] ℹ️  Claude process already terminated (PID: ${claudePid})`);
            }
        } else {
            console.log(`[${new Date().toISOString()}] ℹ️  Claude process already finished - no termination needed`);
        }
    } catch (error) {
        console.log(`[${new Date().toISOString()}] ℹ️  Claude process monitoring: ${error.message}`);
    }
    
    // Exit monitor
    process.exit(1);
}

// Recursive directory watcher
function watchDirectory(dir) {
    console.log(`[${new Date().toISOString()}] 👀 Watching directory: ${dir}`);
    
    try {
        // Watch the directory for changes
        const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            
            const fullPath = path.join(dir, filename);
            console.log(`[${new Date().toISOString()}] 📁 File change detected: ${eventType} - ${fullPath}`);
            
            // Filter out temporary files and system files
            if (filename.includes('.git/') || 
                filename.includes('node_modules/') || 
                filename.includes('.tmp') ||
                filename.includes('~') ||
                filename.endsWith('.log')) {
                console.log(`[${new Date().toISOString()}] ℹ️  Ignoring system/temp file: ${filename}`);
                return;
            }
            
            // Check if this is a file modification/creation/deletion
            if (eventType === 'change' || eventType === 'rename') {
                handleViolation(fullPath, eventType);
            }
        });
        
        // Handle watcher errors
        watcher.on('error', (error) => {
            console.error(`[${new Date().toISOString()}] ❌ Watcher error:`, error);
        });
        
        console.log(`[${new Date().toISOString()}] ✅ Filesystem monitor active`);
        
        // Keep the process running
        process.on('SIGTERM', () => {
            console.log(`[${new Date().toISOString()}] 🔚 Monitor shutting down`);
            watcher.close();
            process.exit(0);
        });
        
        process.on('SIGINT', () => {
            console.log(`[${new Date().toISOString()}] 🔚 Monitor interrupted`);
            watcher.close();
            process.exit(0);
        });
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Failed to watch directory:`, error);
        process.exit(1);
    }
}

// Start monitoring
watchDirectory(projectDir);

// Log periodic status
setInterval(() => {
    if (!violationDetected) {
        console.log(`[${new Date().toISOString()}] 💚 Monitor active - no violations detected`);
    }
}, 30000); // Every 30 seconds