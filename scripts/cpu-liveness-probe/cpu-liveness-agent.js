#!/usr/bin/env node
// scripts/cpu-liveness-probe/cpu-liveness-agent.js
// Build/derleme işlemini başlat + CPU-liveness ile izle + asılıysa tree-kill.
//
// Bu script bir ABSRACT ajans değil, tek dosyalık SOMUT bir runner: verilen
// bir komutu spawn eder, çıktısını stream eder, ve aynı anda
// cpu-liveness-probe ile PID'in CPU zamanını izler. `onStall` tetiklenince
// otomatik öldürmez — değerlendirmeyi `--allow-kill` + stall süresi üzerinden
// yapar ve I/O-bekleme riskine karşı bir ön-uyarı loglar.
//
// Kullanım:
//   node cpu-liveness-agent.js -- <build cmd>...  [--intervalMs N] [--stallThreshold N]
//   node cpu-liveness-agent.js -- <build cmd>...  --allow-kill
//   node cpu-liveness-agent.js -- <build cmd>...  --intervalMs 1000 --stallThreshold 10
//   Not: <build cmd>... tek bir shell komutu olarak birleştirilip /bin/bash -c
//   ile koşulur (TASK-115 orphan regresyonu korunur). Boşluklu argümanlar
//   tırnak içinde verilmeli: `-- node -e "let x=0;while(1){x}"`
//
// Davranış:
//   - Komut spawn edilir (shell: /bin/bash — TASK-115 orphan regresyonu korunur).
//   - Her `intervalMs`'te çocuğun CPU zamanı + canlı torunların toplamı
//     (includeTree — işi yapan npm→tsc gibi torunlardır, tek PID flat görünür)
//     ölçülür; trend loglanır.
//   - `stallThreshold` ardışık delta=0 → onStall.
//   - onStall: `--allow-kill` VERİLMİŞSE ve stall süresi eşiği aşmışsa tree-kill.
//     Aksi halde yalnızca uyarı loglar, öldürmez (I/O-bekleme false positive riski).
//   - Exit code: 0=temiz, 1=stall algılandı ama öldürülmedi (tüketici karar verir),
//     2=allow-kill + gerçek stall → tree-kill uygulandı, 3=komut kendisi hatalı.

import { spawn } from "node:child_process";
import { watchLiveness } from "./cpu-liveness-probe.js";
import { treeKill } from "./tree-kill.js";

const args = process.argv.slice(2);
const sep = args.indexOf("--");
const cmdArgs = sep >= 0 ? args.slice(sep + 1) : args;
const flags = {};

for (let i = 0; i < sep; i++) {
  const a = args[i];
  if (a === "--allow-kill") flags.allowKill = true;
  else if (a.startsWith("--intervalMs=")) flags.intervalMs = Number(a.split("=")[1]) || 2000;
  else if (a.startsWith("--stallThreshold=")) flags.stallThreshold = Number(a.split("=")[1]) || 3;
  else if (a === "--") continue;
}

if (cmdArgs.length === 0) {
  console.error("Usage: node cpu-liveness-agent.js -- <build cmd...> [--allow-kill] [--intervalMs=N] [--stallThreshold=N]");
  process.exit(3);
}

const intervalMs = flags.intervalMs ?? 2000;
const stallThreshold = flags.stallThreshold ?? 3;

const child = spawn(cmdArgs.join(" "), {
  shell: "/bin/bash",
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

let stats = { samples: 0, up: 0, down: 0, lastDelta: 0 };
let stallInfo = null;

const watch = watchLiveness(child.pid, {
  intervalMs,
  stallThreshold,
  includeTree: true, // probe default'u zaten true; burada AÇIK yazıldı ki karar
  // çağrı noktasında da keşfedilebilir olsun (sessiz default'a güvenme).
  onProgress: (info) => {
    if (info.up === null) return; // process bitti, aşağıda ele alınır
    stats.samples += 1;
    if (info.up) stats.up += 1;
    else stats.down += 1;
    stats.lastDelta = info.delta;
    process.stdout.write(
      `[liveness] sample=${stats.samples} cpuTime=${info.cpuTime?.toFixed ? info.cpuTime.toFixed(2) : info.cpuTime} delta=${info.delta?.toFixed ? info.delta.toFixed(2) : info.delta} up=${info.up}\n`,
    );
  },
  onStall: (info) => {
    stallInfo = info;
    const stallDurationMs = info.stallSamples * intervalMs;
    // Karar gerekçesi: I/O bekleme riski vs gerçek asılma.
    // Bu tool CPU-bound DERLEME araçları içindir; genel bash exec katmanına UYGULANMAZ.
    if (flags.allowKill) {
      process.stdout.write(
        `\n[stall] Asılı olabilir: CPU ${info.stallSamples} ardışık ölçümde artmadı (${stallDurationMs}ms). ` +
          `--allow-kill VERİLDİ → tree-kill(SIGTERM, pid=${child.pid}) uygulanıyor. ` +
          `Not: bu I/O beklemesi ise false positive olabilir.\n`,
      );
      treeKill(child.pid, "SIGTERM", (err) => {
        if (err) process.exitCode = 2;
      });
    } else {
      process.stdout.write(
        `\n[stall] UYARI: CPU ${info.stallSamples} ardışık ölçümde artmadı (${stallDurationMs}ms). ` +
          `Öldürmedim — I/O beklemesi olabilir (false positive). --allow-kill eklersen SIGTERM atar.\n`,
      );
    }
  },
});

child.on("exit", (code, signal) => {
  watch.stop();
  process.stdout.write(
    `\n[agent] Çıktı: exit=${code} signal=${signal} || ölçüm=${stats.samples} (up=${stats.up}, down=${stats.down}) sonDelta=${stats.lastDelta}\n`,
  );
  if (stallInfo && flags.allowKill) process.exitCode = 2; // tree-kill uygulandı (veya denendi)
  else if (stallInfo) process.exitCode = 1; // stall algılandı, öldürülmedi
  else process.exitCode = code ?? 0;
});
