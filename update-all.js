import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const APP_DIR = path.join(DATA_DIR, "app");

const LEAGUES = {
    alemanha:    { id: 54,  name: "Alemanha" },
    alemanha2:   { id: 146, name: "Alemanha 2" },
    espanha:     { id: 87,  name: "Espanha" },
    espanha2:    { id: 140, name: "Espanha 2" },
    franca:      { id: 53,  name: "França" },
    franca2:     { id: 110, name: "França 2" },
    italia:      { id: 55,  name: "Itália" },
    italia2:     { id: 86,  name: "Itália 2" },
    inglaterra:  { id: 47,  name: "Inglaterra" },
    inglaterra2: { id: 48,  name: "Inglaterra 2" },
    belgica:     { id: 40,  name: "Bélgica" },
    holanda:     { id: 57,  name: "Holanda" },
    portugal:    { id: 61,  name: "Portugal" },
    turquia:     { id: 71,  name: "Turquia" },
    grecia:      { id: 135, name: "Grécia" },
    escocia:     { id: 64,  name: "Escócia" },
    dinamarca:   { id: 46,  name: "Dinamarca" },
    noruega:     { id: 59,  name: "Noruega" },
    suica:       { id: 69,  name: "Suíça" },
    suecia:      { id: 67,  name: "Suécia" },
    brasil:      { id: 268, name: "Brasil - Série A" },
    australia:   { id: 113, name: "Austrália" },
    china:       { id: 120, name: "China"}
};

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function seasonToFilePart(season) {
    return String(season || "temporada")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");
}

function runNode(script, args) {
    const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
        stdio: "inherit",
        cwd: __dirname,
        encoding: "utf8"
    });

    if (result.error) {
        throw result.error;
    }

    return result.status ?? 1;
}

ensureDir(APP_DIR);

const manifest = {};
const failures = [];

for (const [leagueKey, config] of Object.entries(LEAGUES)) {
    console.log("\n\n============================================================");
    console.log(`ATUALIZAÇÃO: ${config.name}`);
    console.log("============================================================\n");

    let fetchStatus = 1;

    try {
        fetchStatus = runNode("fetch-fotmob-multileague.js", [leagueKey]);
    } catch (error) {
        console.error(`Erro ao executar coleta de ${leagueKey}: ${error.message}`);
    }

    if (fetchStatus !== 0) {
        failures.push({ leagueKey, stage: "fetch", error: `Código de saída ${fetchStatus}` });
        continue;
    }

    const leagueJSON = path.join(RAW_DIR, leagueKey, "league.json");

    if (!fs.existsSync(leagueJSON)) {
        failures.push({ leagueKey, stage: "season", error: "league.json não foi criado" });
        continue;
    }

    let season = null;
    try {
        const leagueData = readJSON(leagueJSON);
        season = leagueData?.details?.selectedSeason ?? null;
    } catch (error) {
        failures.push({ leagueKey, stage: "season", error: error.message });
        continue;
    }

    if (!season) {
        failures.push({ leagueKey, stage: "season", error: "Temporada selecionada não encontrada na resposta do FotMob" });
        continue;
    }

    console.log(`\n🏆 Temporada detectada: ${season}`);

    let processStatus = 1;

    try {
        processStatus = runNode("process-stats-multileague.js", [leagueKey, String(season)]);
    } catch (error) {
        console.error(`Erro ao processar ${leagueKey}: ${error.message}`);
    }

    const seasonPart = seasonToFilePart(season);
    const statsFile = `${leagueKey}_stats_${seasonPart}.json`;
    const historyFile = `${leagueKey}_historico_${seasonPart}.json`;
    const statsPath = path.join(APP_DIR, statsFile);
    const historyPath = path.join(APP_DIR, historyFile);

    if (processStatus !== 0 || !fs.existsSync(statsPath)) {
        failures.push({ leagueKey, stage: "process", error: `Código de saída ${processStatus}` });
        continue;
    }

    manifest[leagueKey] = {
        key: leagueKey,
        name: config.name,
        league_id: config.id,
        season: String(season),
        stats_file: statsFile,
        history_file: fs.existsSync(historyPath) ? historyFile : null,
        updated_at: new Date().toISOString(),
        status: "ok"
    };
}

const manifestPath = path.join(APP_DIR, "manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    leagues: manifest,
    failures
}, null, 2), "utf8");

console.log("\n============================================================");
console.log("ATUALIZAÇÃO FINALIZADA");
console.log("============================================================");
console.log(`Ligas atualizadas: ${Object.keys(manifest).length}/${Object.keys(LEAGUES).length}`);
console.log(`Falhas: ${failures.length}`);
console.log(`Manifesto: ${manifestPath}`);

if (failures.length) {
    console.log("\nFalhas detectadas:");
    for (const failure of failures) {
        console.log(`- ${failure.leagueKey} (${failure.stage}): ${failure.error}`);
    }
}
