import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";

function checkBinary(cmd: string): boolean {
  try {
    execSync(cmd + " --version", { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

const backupDir = path.join(process.cwd(), "tor_service_backup");

function restoreTorBackup(torDir: string): boolean {
  if (fs.existsSync(backupDir)) {
    const files = ["hostname", "hs_ed25519_public_key", "hs_ed25519_secret_key"];
    const allExist = files.every(file => fs.existsSync(path.join(backupDir, file)));
    if (allExist) {
      console.log("📂 [Tor Builder] Restoring persistent onion keys from backup...");
      files.forEach(file => {
        const src = path.join(backupDir, file);
        const dest = path.join(torDir, file);
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, 0o600);
      });
      return true;
    }
  }
  return false;
}

function saveTorBackup(torDir: string) {
  const secretKeyPath = path.join(torDir, "hs_ed25519_secret_key");
  if (fs.existsSync(secretKeyPath)) {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const files = ["hostname", "hs_ed25519_public_key", "hs_ed25519_secret_key"];
    files.forEach(file => {
      const src = path.join(torDir, file);
      const dest = path.join(backupDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`💾 [Tor Builder] Backed up ${file} to persist same onion address.`);
      }
    });
  }
}

function run() {
  console.log("🧅 [Tor Builder] Initializing Tor build-time configuration...");

  const torrcPath = path.join(process.cwd(), "torrc");
  const torDir = path.join(process.cwd(), "tor_service");

  try {
    if (!fs.existsSync(torDir)) {
      fs.mkdirSync(torDir, { recursive: true });
    }
    // Tor strictly requires 700 permissions on the hidden service directory
    fs.chmodSync(torDir, 0o700);

    const torrcContent = `SocksPort 0\nHiddenServiceDir ${torDir}\nHiddenServicePort 80 127.0.0.1:3000\n`;
    fs.writeFileSync(torrcPath, torrcContent, "utf8");

    // Try restoring backup first
    if (restoreTorBackup(torDir)) {
      const hostnameFile = path.join(torDir, "hostname");
      if (fs.existsSync(hostnameFile)) {
        const address = fs.readFileSync(hostnameFile, "utf8").trim();
        console.log("\n====================================================");
        console.log("🧅 PERSISTENT ONION ADDRESS RESTORED SUCCESSFULLY:");
        console.log(`🔗 http://${address}`);
        console.log("====================================================\n");
      }
      return;
    }

    if (!checkBinary("tor")) {
      console.log("⚠️ [Tor Builder] 'tor' executable not found in this environment. Skipping pre-generation of onion keys.");
      console.log("💡 Note: Tor will be initialized on startup or during Render build in your Docker container.");
      return;
    }

    console.log("🚀 [Tor Builder] Executing Tor briefly to generate persistent Onion Address keys...");
    
    const torProcess = spawn("tor", ["-f", torrcPath]);
    torProcess.on("error", (err) => {
      console.log("ℹ️ [Tor Builder] Could not execute tor:", err.message);
    });
    const hostnameFile = path.join(torDir, "hostname");

    let addressPrinted = false;

    const interval = setInterval(() => {
      if (fs.existsSync(hostnameFile)) {
        const address = fs.readFileSync(hostnameFile, "utf8").trim();
        console.log("\n====================================================");
        console.log("🧅 PERSISTENT ONION ADDRESS GENERATED:");
        console.log(`🔗 http://${address}`);
        console.log("====================================================\n");
        addressPrinted = true;
        
        // Save to backup
        saveTorBackup(torDir);

        // Kill Tor process immediately since we got what we came for
        torProcess.kill("SIGTERM");
        clearInterval(interval);
      }
    }, 250);

    // If it takes more than 10 seconds, timeout and exit gracefully
    setTimeout(() => {
      if (!addressPrinted) {
        console.log("⏱️ [Tor Builder] Generation timed out. Tor process might still be running or directory permission issue.");
        torProcess.kill("SIGKILL");
        clearInterval(interval);
      }
    }, 10000);

  } catch (err: any) {
    console.warn("⚠️ [Tor Builder] Tor build-time checks skipped:", err.message);
  }
}

run();
