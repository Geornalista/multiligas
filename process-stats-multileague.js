import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ============================================================
   CONFIGURAÇÃO
============================================================ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const RAW_ROOT_DIR = path.join(DATA_DIR, "raw");
const PROCESSED_ROOT_DIR = path.join(DATA_DIR, "processed");
const APP_DIR = path.join(DATA_DIR, "app");

const LEAGUES = {
  alemanha:    { id: 54,  name: "Alemanha" },
  alemanha2:   { id: 146, name: "Alemanha 2a Div" },
  espanha:     { id: 87,  name: "Espanha" },
  espanha2:    { id: 140, name: "Espanha 2a Div" },
  franca:      { id: 53,  name: "França" },
  franca2:     { id: 110, name: "França 2a Div" },
  italia:      { id: 55,  name: "Itália" },
  italia2:     { id: 86,  name: "Itália 2a Div" },
  inglaterra:  { id: 47,  name: "Inglaterra" },
  inglaterra2: { id: 48,  name: "Inglaterra 2a Div" },
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
  mexico:      { id: 230, name: "México" }
};

const LEAGUE_KEY = (process.argv[2] || "brasil").toLowerCase();
const LEAGUE_CONFIG = LEAGUES[LEAGUE_KEY];

if (!LEAGUE_CONFIG) {
  console.error(`Liga desconhecida: ${LEAGUE_KEY}`);
  console.error(`Use: ${Object.keys(LEAGUES).join(", ")}`);
  process.exit(1);
}

const SEASON = process.argv[3] || 2026;
const RAW_DIR = path.join(RAW_ROOT_DIR, LEAGUE_KEY);
const PROCESSED_DIR = path.join(PROCESSED_ROOT_DIR, LEAGUE_KEY);
const MATCHES_DIR = path.join(RAW_DIR, "matches");
const MATCHES_FILE = path.join(PROCESSED_DIR, "matches.json");

const SEASON_FILE = String(SEASON).replace(/\//g, "-").replace(/\s+/g, "_");
const OUTPUT_STATS = path.join(APP_DIR, `${LEAGUE_KEY}_stats_${SEASON_FILE}.json`);
const OUTPUT_HISTORY = path.join(APP_DIR, `${LEAGUE_KEY}_historico_${SEASON_FILE}.json`);

/* ============================================================
   UTILITÁRIOS
============================================================ */

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJSON(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Erro ao ler ${file}:`, error.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function toNumber(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "-"
  ) {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(
    String(value)
      .replace(",", ".")
      .replace(/[^\d.-]/g, "")
  );

  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}

function percent(part, total) {
  if (!total || total <= 0) {
    return 0;
  }

  return round((part / total) * 100, 1);
}

function average(total, games) {
  if (!games || games <= 0) {
    return 0;
  }

  return round(total / games, 2);
}

function normalizeName(name) {
  if (!name) return "";

  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getNestedValue(obj, paths = []) {
  for (const pathString of paths) {
    const parts = pathString.split(".");
    let value = obj;

    for (const part of parts) {
      if (value === undefined || value === null) {
        break;
      }

      value = value[part];
    }

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

/* ============================================================
   NORMALIZAÇÃO DE EQUIPES
============================================================ */

const TEAM_ALIASES = {
  "athletico paranaense": "Athletico Paranaense",
  "athletico-pr": "Athletico Paranaense",
  "atletico paranaense": "Athletico Paranaense",

  "atletico mineiro": "Atlético-MG",
  "atlético mineiro": "Atlético-MG",
  "atletico-mg": "Atlético-MG",

  "red bull bragantino": "RB Bragantino",
  "bragantino": "RB Bragantino",

  "vasco": "Vasco da Gama",

  "coritiba": "Coritiba",

  "gremio": "Grêmio",

  "sao paulo": "São Paulo",

  "vitoria": "Vitória"
};

function canonicalTeamName(name) {
  if (!name) return "";

  const original = String(name).trim();
  const normalized = normalizeName(original);

  if (TEAM_ALIASES[normalized]) {
    return TEAM_ALIASES[normalized];
  }

  return original;
}

/* ============================================================
   ESTRUTURA DE ESTATÍSTICAS
============================================================ */

function createEmptyStats() {
  return {
    games: 0,

    wins: 0,
    draws: 0,
    losses: 0,

    goals_for: 0,
    goals_against: 0,
    total_goals: 0,

    avg_goals_for: 0,
    avg_goals_against: 0,
    avg_total_goals: 0,

    over_05_count: 0,
    over_15_count: 0,
    over_25_count: 0,
    over_35_count: 0,

    over_05: 0,
    over_15: 0,
    over_25: 0,
    over_35: 0,

    under_05: 0,
    under_15: 0,
    under_25: 0,
    under_35: 0,

    btts_count: 0,
    btts: 0,

    zero_zero_count: 0,
    zero_zero: 0,

    clean_sheets_count: 0,
    clean_sheets: 0,

    failed_to_score_count: 0,
    failed_to_score: 0,

    // Gols Esperados (xG Detalhado)
    xg_total: 0,
    xga_total: 0,
    xgd_total: 0,
    xg: 0,
    xga: 0,
    xgd: 0,
    xg_open_play_total: 0,
    xg_open_play: 0,
    xg_set_play_total: 0,
    xg_set_play: 0,
    xg_non_penalty_total: 0,
    xg_non_penalty: 0,
    xgot_total: 0,
    xgot: 0,
    xgot_conceded_total: 0,
    xgot_conceded: 0,

    // Finalizações & Chutes
    shots_total_sum: 0,
    shots_total_avg: 0,
    shots_on_target_sum: 0,
    shots_on_target_avg: 0,
    shots_off_target_sum: 0,
    shots_off_target_avg: 0,
    shots_blocked_sum: 0,
    shots_blocked_avg: 0,
    shots_woodwork_sum: 0,
    shots_woodwork_avg: 0,
    shots_inside_box_sum: 0,
    shots_inside_box_avg: 0,
    shots_outside_box_sum: 0,
    shots_outside_box_avg: 0,
    shots_conceded_total_sum: 0,
    shots_conceded_avg: 0,
    shots_on_target_conceded_sum: 0,
    shots_on_target_conceded_avg: 0,
    shots_inside_box_conceded_sum: 0,
    shots_inside_box_conceded_avg: 0,

    // Posse de Bola, Passes & Criação
    possession_sum: 0,
    possession_avg: 0,
    passes_accurate_sum: 0,
    passes_accurate_avg: 0,
    passes_accuracy_pct_sum: 0,
    passes_accuracy_pct_count: 0,
    passes_accuracy_pct_avg: 0,
    passes_own_half_sum: 0,
    passes_own_half_avg: 0,
    passes_opp_half_sum: 0,
    passes_opp_half_avg: 0,
    long_balls_accurate_sum: 0,
    long_balls_accurate_avg: 0,
    crosses_accurate_sum: 0,
    crosses_accurate_avg: 0,
    crosses_accuracy_pct_sum: 0,
    crosses_accuracy_pct_count: 0,
    crosses_accuracy_pct_avg: 0,
    touches_opp_box_sum: 0,
    touches_opp_box_avg: 0,
    touches_opp_box_conceded_sum: 0,
    touches_opp_box_conceded_avg: 0,
    offsides_sum: 0,
    offsides_avg: 0,
    big_chances_sum: 0,
    big_chances_avg: 0,
    big_chances_missed_sum: 0,
    big_chances_missed_avg: 0,

    // Defesa
    tackles_sum: 0,
    tackles_avg: 0,
    interceptions_sum: 0,
    interceptions_avg: 0,
    blocks_sum: 0,
    blocks_avg: 0,
    clearances_sum: 0,
    clearances_avg: 0,
    keeper_saves_sum: 0,
    keeper_saves_avg: 0,

    // Duelos
    duels_won_sum: 0,
    duels_won_avg: 0,
    ground_duels_won_sum: 0,
    ground_duels_won_avg: 0,
    aerial_duels_won_sum: 0,
    aerial_duels_won_avg: 0,
    dribbles_won_sum: 0,
    dribbles_won_avg: 0,

    // Escanteios & Disciplina
    corners_sum: 0,
    corners_avg: 0,
    corners_conceded_sum: 0,
    corners_conceded_avg: 0,
    corners_total_avg: 0,
    yellow_cards_sum: 0,
    yellow_cards_avg: 0,
    red_cards_sum: 0,
    red_cards_avg: 0,
    fouls_sum: 0,
    fouls_avg: 0,

    points: 0,
    points_per_game: 0
  };
}

function finalizeStats(stats) {
  const games = stats.games;

  stats.avg_goals_for = average(stats.goals_for, games);
  stats.avg_goals_against = average(stats.goals_against, games);
  stats.avg_total_goals = average(stats.total_goals, games);

  stats.over_05 = percent(stats.over_05_count, games);
  stats.over_15 = percent(stats.over_15_count, games);
  stats.over_25 = percent(stats.over_25_count, games);
  stats.over_35 = percent(stats.over_35_count, games);

  stats.under_05 = round(100 - stats.over_05, 1);
  stats.under_15 = round(100 - stats.over_15, 1);
  stats.under_25 = round(100 - stats.over_25, 1);
  stats.under_35 = round(100 - stats.over_35, 1);

  stats.btts = percent(stats.btts_count, games);

  stats.zero_zero = percent(
    stats.zero_zero_count,
    games
  );

  stats.clean_sheets = percent(
    stats.clean_sheets_count,
    games
  );

  stats.failed_to_score = percent(
    stats.failed_to_score_count,
    games
  );

  stats.xg_total = round(stats.xg_total, 2);
  stats.xga_total = round(stats.xga_total, 2);
  stats.xgd_total = round(stats.xgd_total, 2);

  stats.xg = average(stats.xg_total, games);
  stats.xga = average(stats.xga_total, games);
  stats.xgd = average(stats.xgd_total, games);

  // xG detalhado
  stats.xg_open_play = average(stats.xg_open_play_total, games);
  stats.xg_set_play = average(stats.xg_set_play_total, games);
  stats.xg_non_penalty = average(stats.xg_non_penalty_total, games);
  stats.xgot = average(stats.xgot_total, games);
  stats.xgot_conceded = average(stats.xgot_conceded_total, games);

  // Finalizações
  stats.shots_total_avg = average(stats.shots_total_sum, games);
  stats.shots_on_target_avg = average(stats.shots_on_target_sum, games);
  stats.shots_off_target_avg = average(stats.shots_off_target_sum, games);
  stats.shots_blocked_avg = average(stats.shots_blocked_sum, games);
  stats.shots_woodwork_avg = average(stats.shots_woodwork_sum, games);
  stats.shots_inside_box_avg = average(stats.shots_inside_box_sum, games);
  stats.shots_outside_box_avg = average(stats.shots_outside_box_sum, games);
  stats.shots_conceded_avg = average(stats.shots_conceded_total_sum, games);
  stats.shots_on_target_conceded_avg = average(stats.shots_on_target_conceded_sum, games);
  stats.shots_inside_box_conceded_avg = average(stats.shots_inside_box_conceded_sum, games);

  // Posse, Passes e Criação
  stats.possession_avg = average(stats.possession_sum, games);
  stats.passes_accurate_avg = average(stats.passes_accurate_sum, games);
  stats.passes_accuracy_pct_avg = stats.passes_accuracy_pct_count > 0
    ? round(stats.passes_accuracy_pct_sum / stats.passes_accuracy_pct_count, 1)
    : 0;
  stats.passes_own_half_avg = average(stats.passes_own_half_sum, games);
  stats.passes_opp_half_avg = average(stats.passes_opp_half_sum, games);
  stats.long_balls_accurate_avg = average(stats.long_balls_accurate_sum, games);
  stats.crosses_accurate_avg = average(stats.crosses_accurate_sum, games);
  stats.crosses_accuracy_pct_avg = stats.crosses_accuracy_pct_count > 0
    ? round(stats.crosses_accuracy_pct_sum / stats.crosses_accuracy_pct_count, 1)
    : 0;
  stats.touches_opp_box_avg = average(stats.touches_opp_box_sum, games);
  stats.touches_opp_box_conceded_avg = average(stats.touches_opp_box_conceded_sum, games);
  stats.offsides_avg = average(stats.offsides_sum, games);
  stats.big_chances_avg = average(stats.big_chances_sum, games);
  stats.big_chances_missed_avg = average(stats.big_chances_missed_sum, games);

  // Defesa
  stats.tackles_avg = average(stats.tackles_sum, games);
  stats.interceptions_avg = average(stats.interceptions_sum, games);
  stats.blocks_avg = average(stats.blocks_sum, games);
  stats.clearances_avg = average(stats.clearances_sum, games);
  stats.keeper_saves_avg = average(stats.keeper_saves_sum, games);

  // Duelos
  stats.duels_won_avg = average(stats.duels_won_sum, games);
  stats.ground_duels_won_avg = average(stats.ground_duels_won_sum, games);
  stats.aerial_duels_won_avg = average(stats.aerial_duels_won_sum, games);
  stats.dribbles_won_avg = average(stats.dribbles_won_sum, games);

  // Escanteios & Disciplina
  stats.corners_avg = average(stats.corners_sum, games);
  stats.corners_conceded_avg = average(stats.corners_conceded_sum, games);
  stats.corners_total_avg = round(stats.corners_avg + stats.corners_conceded_avg, 2);

  stats.yellow_cards_avg = average(stats.yellow_cards_sum, games);
  stats.red_cards_avg = average(stats.red_cards_sum, games);
  stats.fouls_avg = average(stats.fouls_sum, games);

  stats.points_per_game = average(
    stats.points,
    games
  );

  return stats;
}

/* ============================================================
   EXTRAÇÃO DOS CAMPOS DAS PARTIDAS
============================================================ */

function getHomeTeam(match) {
  return canonicalTeamName(
    getNestedValue(match, [
      "homeTeam.name",
      "home.name",
      "home_team.name",
      "homeTeam",
      "home",
      "home_name",
      "homeTeamName"
    ])
  );
}

function getAwayTeam(match) {
  return canonicalTeamName(
    getNestedValue(match, [
      "awayTeam.name",
      "away.name",
      "away_team.name",
      "awayTeam",
      "away",
      "away_name",
      "awayTeamName"
    ])
  );
}

function getHomeGoals(match) {
  const v = getNestedValue(match, [
    "score.home",
    "home.goals",
    "homeScore",
    "home_score",
    "score.homeScore.current",
    "result.home",
    "goals.home"
  ]);

  if (v === null || v === undefined || v === "") {
    return null;
  }

  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

function getAwayGoals(match) {
  const v = getNestedValue(match, [
    "score.away",
    "away.goals",
    "awayScore",
    "away_score",
    "score.awayScore.current",
    "result.away",
    "goals.away"
  ]);

  if (v === null || v === undefined || v === "") {
    return null;
  }

  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

function isMatchFinished(match) {
  if (!match) return false;
  if (match.cancelled === true) return false;
  if (match.finished === true) return true;
  if (match.status && (match.status.finished === true || match.status.type === "finished")) return true;
  const h = getHomeGoals(match);
  const a = getAwayGoals(match);
  return h !== null && a !== null;
}

function getRound(match) {
  return toNumber(
    getNestedValue(match, [
      "round",
      "roundNumber",
      "leagueRound",
      "roundInfo.round"
    ]),
    0
  );
}

function getDate(match) {
  const timestamp = getNestedValue(match, [
    "date",
    "matchDate",
    "startTime",
    "time",
    "timestamp"
  ]);

  if (!timestamp) {
    return null;
  }

  if (
    typeof timestamp === "number" &&
    timestamp > 1000000000
  ) {
    return new Date(timestamp * 1000).toISOString();
  }

  return timestamp;
}

/* ============================================================
   EXTRAÇÃO DE xG
============================================================ */

function getHomeXG(match, details = null) {
  const val = getNestedValue(details || {}, [
    "home.xg",
    "home_xg",
    "homeXg",
    "xg.home"
  ]) ?? getNestedValue(match, [
    "home.xg",
    "home_xg",
    "homeXg",
    "xg.home",
    "stats.home.xg",
    "statistics.home.xg",
    "expectedGoals.home",
    "homeExpectedGoals"
  ]);

  return toNumber(val, 0);
}

function getAwayXG(match, details = null) {
  const val = getNestedValue(details || {}, [
    "away.xg",
    "away_xg",
    "awayXg",
    "xg.away"
  ]) ?? getNestedValue(match, [
    "away.xg",
    "away_xg",
    "awayXg",
    "xg.away",
    "stats.away.xg",
    "statistics.away.xg",
    "expectedGoals.away",
    "awayExpectedGoals"
  ]);

  return toNumber(val, 0);
}

/* ============================================================
   ATUALIZAÇÃO DE ESTATÍSTICAS
============================================================ */

function updateAdvancedStats(stats, teamStats, oppStats) {
  if (!teamStats) return;

  stats.possession_sum += toNumber(teamStats.possession);
  stats.xg_open_play_total += toNumber(teamStats.xg_open_play);
  stats.xg_set_play_total += toNumber(teamStats.xg_set_play);
  stats.xg_non_penalty_total += toNumber(teamStats.xg_non_penalty);
  stats.xgot_total += toNumber(teamStats.xgot);

  stats.shots_total_sum += toNumber(teamStats.shots_total);
  stats.shots_on_target_sum += toNumber(teamStats.shots_on_target);
  stats.shots_off_target_sum += toNumber(teamStats.shots_off_target);
  stats.shots_blocked_sum += toNumber(teamStats.shots_blocked);
  stats.shots_woodwork_sum += toNumber(teamStats.shots_woodwork);
  stats.shots_inside_box_sum += toNumber(teamStats.shots_inside_box);
  stats.shots_outside_box_sum += toNumber(teamStats.shots_outside_box);

  stats.passes_accurate_sum += toNumber(teamStats.passes_accurate);
  if (teamStats.passes_accuracy_pct !== null && teamStats.passes_accuracy_pct !== undefined) {
    stats.passes_accuracy_pct_sum += toNumber(teamStats.passes_accuracy_pct);
    stats.passes_accuracy_pct_count++;
  }
  stats.passes_own_half_sum += toNumber(teamStats.passes_own_half);
  stats.passes_opp_half_sum += toNumber(teamStats.passes_opp_half);
  stats.long_balls_accurate_sum += toNumber(teamStats.long_balls_accurate);
  stats.crosses_accurate_sum += toNumber(teamStats.crosses_accurate);
  if (teamStats.crosses_accuracy_pct !== null && teamStats.crosses_accuracy_pct !== undefined) {
    stats.crosses_accuracy_pct_sum += toNumber(teamStats.crosses_accuracy_pct);
    stats.crosses_accuracy_pct_count++;
  }
  stats.touches_opp_box_sum += toNumber(teamStats.touches_opp_box);
  stats.offsides_sum += toNumber(teamStats.offsides);
  stats.big_chances_sum += toNumber(teamStats.big_chances);
  stats.big_chances_missed_sum += toNumber(teamStats.big_chances_missed);

  stats.tackles_sum += toNumber(teamStats.tackles);
  stats.interceptions_sum += toNumber(teamStats.interceptions);
  stats.blocks_sum += toNumber(teamStats.blocks);
  stats.clearances_sum += toNumber(teamStats.clearances);
  stats.keeper_saves_sum += toNumber(teamStats.keeper_saves);

  stats.duels_won_sum += toNumber(teamStats.duels_won);
  stats.ground_duels_won_sum += toNumber(teamStats.ground_duels_won);
  stats.aerial_duels_won_sum += toNumber(teamStats.aerial_duels_won);
  stats.dribbles_won_sum += toNumber(teamStats.dribbles_won);

  stats.corners_sum += toNumber(teamStats.corners);
  stats.yellow_cards_sum += toNumber(teamStats.yellow_cards);
  stats.red_cards_sum += toNumber(teamStats.red_cards);
  stats.fouls_sum += toNumber(teamStats.fouls);

  if (oppStats) {
    stats.shots_conceded_total_sum += toNumber(oppStats.shots_total);
    stats.shots_on_target_conceded_sum += toNumber(oppStats.shots_on_target);
    stats.shots_inside_box_conceded_sum += toNumber(oppStats.shots_inside_box);
    stats.corners_conceded_sum += toNumber(oppStats.corners);
    stats.touches_opp_box_conceded_sum += toNumber(oppStats.touches_opp_box);
    stats.xgot_conceded_total += toNumber(oppStats.xgot);
  }
}

function updateStats(
  stats,
  goalsFor,
  goalsAgainst,
  xgFor = 0,
  xgAgainst = 0,
  teamStats = null,
  oppStats = null
) {
  stats.games++;

  stats.goals_for += goalsFor;
  stats.goals_against += goalsAgainst;

  const totalGoals =
    goalsFor + goalsAgainst;

  stats.total_goals += totalGoals;

  if (goalsFor > goalsAgainst) {
    stats.wins++;
    stats.points += 3;
  } else if (goalsFor === goalsAgainst) {
    stats.draws++;
    stats.points += 1;
  } else {
    stats.losses++;
  }

  if (totalGoals >= 1) {
    stats.over_05_count++;
  }

  if (totalGoals >= 2) {
    stats.over_15_count++;
  }

  if (totalGoals >= 3) {
    stats.over_25_count++;
  }

  if (totalGoals >= 4) {
    stats.over_35_count++;
  }

  if (
    goalsFor > 0 &&
    goalsAgainst > 0
  ) {
    stats.btts_count++;
  }

  if (
    goalsFor === 0 &&
    goalsAgainst === 0
  ) {
    stats.zero_zero_count++;
  }

  if (goalsAgainst === 0) {
    stats.clean_sheets_count++;
  }

  if (goalsFor === 0) {
    stats.failed_to_score_count++;
  }

  stats.xg_total += xgFor;
  stats.xga_total += xgAgainst;
  stats.xgd_total += xgFor - xgAgainst;

  if (teamStats) {
    updateAdvancedStats(stats, teamStats, oppStats);
  }
}

/* ============================================================
   ESTRUTURA DAS EQUIPES
============================================================ */

function getTeamId(team) {
  if (!team || typeof team !== "object") return null;
  return getNestedValue(team, ["id", "teamId", "team_id", "uid", "entityId"]);
}

function createTeam(name, id = null) {
  return {
    team: name,
    id: id ?? null,

    geral: createEmptyStats(),
    mandante: createEmptyStats(),
    visitante: createEmptyStats()
  };
}

/* ============================================================
   HISTÓRICO DAS PARTIDAS
============================================================ */

function createHistoryRecord(
  match,
  team,
  isHome,
  opponent,
  goalsFor,
  goalsAgainst,
  xg,
  xga,
  teamStats = null,
  oppStats = null
) {
  return {
    rodada: getRound(match),
    data: getDate(match),

    local: isHome
      ? "Casa"
      : "Fora",

    adversario: opponent,

    gols_pro: goalsFor,
    gols_contra: goalsAgainst,

    placar: `${goalsFor} x ${goalsAgainst}`,

    xg: round(xg, 2),
    xga: round(xga, 2),
    xgd: round(xg - xga, 2),

    posse: teamStats ? toNumber(teamStats.possession) : null,
    chutes: teamStats ? toNumber(teamStats.shots_total) : null,
    chutes_no_gol: teamStats ? toNumber(teamStats.shots_on_target) : null,
    escanteios: teamStats ? toNumber(teamStats.corners) : null,
    desarmes: teamStats ? toNumber(teamStats.tackles) : null
  };
}

/* ============================================================
   MÉDIA MÓVEL
============================================================ */

function calculateRollingAverage(
  records,
  field,
  window = 5
) {
  return records.map((record, index) => {
    const start = Math.max(
      0,
      index - window + 1
    );

    const slice = records.slice(
      start,
      index + 1
    );

    const total = slice.reduce(
      (sum, item) =>
        sum + toNumber(item[field]),
      0
    );

    return round(
      total / slice.length,
      2
    );
  });
}

function enrichHistory(records) {
  const sorted = [...records].sort(
    (a, b) => {
      const roundA = toNumber(a.rodada);
      const roundB = toNumber(b.rodada);

      return roundA - roundB;
    }
  );

  const rollingXG = calculateRollingAverage(
    sorted,
    "xg",
    5
  );

  const rollingXGA = calculateRollingAverage(
    sorted,
    "xga",
    5
  );

  const rollingXGD = calculateRollingAverage(
    sorted,
    "xgd",
    5
  );

  return sorted.map((record, index) => ({
    ...record,

    xg_movel_5: rollingXG[index],
    xga_movel_5: rollingXGA[index],
    xgd_movel_5: rollingXGD[index]
  }));
}

/* ============================================================
   CÁLCULO DA TENDÊNCIA RECENTE
============================================================ */

function calculateTrend(records) {
  if (!records || records.length === 0) {
    return {
      ataque: {
        status: "Sem dados",
        variacao: 0
      },

      defesa: {
        status: "Sem dados",
        variacao: 0
      },

      equilibrio: {
        status: "Sem dados",
        variacao: 0
      }
    };
  }

  const lastFive = records.slice(-5);

  const avgSeasonXG =
    records.reduce(
      (sum, item) =>
        sum + toNumber(item.xg),
      0
    ) / records.length;

  const avgRecentXG =
    lastFive.reduce(
      (sum, item) =>
        sum + toNumber(item.xg),
      0
    ) / lastFive.length;

  const avgSeasonXGA =
    records.reduce(
      (sum, item) =>
        sum + toNumber(item.xga),
      0
    ) / records.length;

  const avgRecentXGA =
    lastFive.reduce(
      (sum, item) =>
        sum + toNumber(item.xga),
      0
    ) / lastFive.length;

  const avgSeasonXGD =
    records.reduce(
      (sum, item) =>
        sum + toNumber(item.xgd),
      0
    ) / records.length;

  const avgRecentXGD =
    lastFive.reduce(
      (sum, item) =>
        sum + toNumber(item.xgd),
      0
    ) / lastFive.length;

  function variation(recent, season) {
    if (season === 0) return 0;

    return round(
      ((recent - season) / Math.abs(season)) *
        100,
      1
    );
  }

  function trendStatus(
    variationValue,
    inverse = false
  ) {
    const value = inverse
      ? -variationValue
      : variationValue;

    if (value > 5) {
      return "Melhorando";
    }

    if (value < -5) {
      return "Piorando";
    }

    return "Estável";
  }

  const attackVariation = variation(
    avgRecentXG,
    avgSeasonXG
  );

  const defenseRawVariation = variation(
    avgRecentXGA,
    avgSeasonXGA
  );

  const balanceVariation = variation(
    avgRecentXGD,
    avgSeasonXGD
  );

  return {
    ataque: {
      status: trendStatus(attackVariation),
      variacao: attackVariation,

      temporada: round(avgSeasonXG, 2),
      ultimos_5: round(avgRecentXG, 2)
    },

    defesa: {
      status: trendStatus(
        defenseRawVariation,
        true
      ),

      variacao: round(
        -defenseRawVariation,
        1
      ),

      temporada: round(avgSeasonXGA, 2),
      ultimos_5: round(avgRecentXGA, 2)
    },

    equilibrio: {
      status: trendStatus(balanceVariation),
      variacao: balanceVariation,

      temporada: round(avgSeasonXGD, 2),
      ultimos_5: round(avgRecentXGD, 2)
    }
  };
}

/* ============================================================
   LEITURA DOS DADOS
============================================================ */

console.log("");
console.log("========================================");
console.log(" PROCESSAMENTO ${LEAGUE_CONFIG.name.toUpperCase()} STATS");
console.log("========================================");
console.log("");

console.log(
  "Lendo partidas:",
  MATCHES_FILE
);

let matchesData = readJSON(
  MATCHES_FILE,
  []
);

let matches = [];

/*
  Aceita diferentes formatos possíveis do
  matches.json.
*/

if (Array.isArray(matchesData)) {
  matches = matchesData;
} else if (Array.isArray(matchesData.matches)) {
  matches = matchesData.matches;
} else if (
  Array.isArray(matchesData.data)
) {
  matches = matchesData.data;
} else if (
  Array.isArray(matchesData.events)
) {
  matches = matchesData.events;
}

console.log(
  `Partidas encontradas: ${matches.length}`
);

if (matches.length === 0) {
  console.error("");
  console.error(
    "ERRO: Nenhuma partida encontrada."
  );

  console.error(
    "Verifique o arquivo data/processed/matches.json"
  );

  process.exit(1);
}

/* ============================================================
   PROCESSAMENTO DAS EQUIPES
============================================================ */

const teams = {};
const history = {};

let processedMatches = 0;
const validFinishedMatches = [];

for (const match of matches) {
  if (!isMatchFinished(match)) {
    continue;
  }

  const homeTeam = getHomeTeam(match);
  const awayTeam = getAwayTeam(match);
  const homeTeamObject = getNestedValue(match, ["homeTeam", "home", "home_team"]);
  const awayTeamObject = getNestedValue(match, ["awayTeam", "away", "away_team"]);
  const homeTeamId = getTeamId(homeTeamObject);
  const awayTeamId = getTeamId(awayTeamObject);

  if (!homeTeam || !awayTeam) {
    continue;
  }

  const homeGoals = getHomeGoals(match);
  const awayGoals = getAwayGoals(match);

  /*
    Ignora partidas sem placar válido.
  */
  if (homeGoals === null || awayGoals === null) {
    continue;
  }

  const matchId = match.match_id || match.id;
  let details = null;
  if (matchId) {
    const detailsPath = path.join(MATCHES_DIR, `${matchId}.json`);
    details = readJSON(detailsPath, null);
  }

  const homeXG = getHomeXG(match, details);
  const awayXG = getAwayXG(match, details);

  const homeStats = details?.home?.stats || null;
  const awayStats = details?.away?.stats || null;

  if (!teams[homeTeam]) {
    teams[homeTeam] = createTeam(homeTeam, homeTeamId);
  }

  if (!teams[awayTeam]) {
    teams[awayTeam] = createTeam(awayTeam, awayTeamId);
  }

  if (!teams[homeTeam].id && homeTeamId) teams[homeTeam].id = homeTeamId;
  if (!teams[awayTeam].id && awayTeamId) teams[awayTeam].id = awayTeamId;

  if (!history[homeTeam]) {
    history[homeTeam] = [];
  }

  if (!history[awayTeam]) {
    history[awayTeam] = [];
  }

  /*
    HOME TEAM
  */

  updateStats(
    teams[homeTeam].geral,
    homeGoals,
    awayGoals,
    homeXG,
    awayXG,
    homeStats,
    awayStats
  );

  updateStats(
    teams[homeTeam].mandante,
    homeGoals,
    awayGoals,
    homeXG,
    awayXG,
    homeStats,
    awayStats
  );

  /*
    AWAY TEAM
  */

  updateStats(
    teams[awayTeam].geral,
    awayGoals,
    homeGoals,
    awayXG,
    homeXG,
    awayStats,
    homeStats
  );

  updateStats(
    teams[awayTeam].visitante,
    awayGoals,
    homeGoals,
    awayXG,
    homeXG,
    awayStats,
    homeStats
  );

  /*
    HISTÓRICO HOME
  */

  history[homeTeam].push(
    createHistoryRecord(
      match,
      homeTeam,
      true,
      awayTeam,
      homeGoals,
      awayGoals,
      homeXG,
      awayXG,
      homeStats,
      awayStats
    )
  );

  /*
    HISTÓRICO AWAY
  */

  history[awayTeam].push(
    createHistoryRecord(
      match,
      awayTeam,
      false,
      homeTeam,
      awayGoals,
      homeGoals,
      awayXG,
      homeXG,
      awayStats,
      homeStats
    )
  );

  validFinishedMatches.push({
    match,
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals,
    homeXG,
    awayXG,
    homeStats,
    awayStats
  });

  processedMatches++;
}

console.log(
  `Partidas processadas: ${processedMatches}`
);

console.log(
  `Equipes encontradas: ${Object.keys(teams).length}`
);

/* ============================================================
   FINALIZAÇÃO DAS ESTATÍSTICAS
============================================================ */

Object.values(teams).forEach((team) => {
  finalizeStats(team.geral);
  finalizeStats(team.mandante);
  finalizeStats(team.visitante);
});

/* ============================================================
   PROCESSAMENTO DO HISTÓRICO
============================================================ */

const historyOutput = {};

Object.entries(history).forEach(
  ([teamName, records]) => {
    const enrichedRecords =
      enrichHistory(records);

    historyOutput[teamName] = {
      team: teamName,

      partidas: enrichedRecords,

      tendencia: calculateTrend(
        enrichedRecords
      ),

      resumo: {
        jogos: enrichedRecords.length,

        xg_medio: average(
          enrichedRecords.reduce(
            (sum, item) =>
              sum + toNumber(item.xg),
            0
          ),
          enrichedRecords.length
        ),

        xga_medio: average(
          enrichedRecords.reduce(
            (sum, item) =>
              sum + toNumber(item.xga),
            0
          ),
          enrichedRecords.length
        ),

        xgd_medio: average(
          enrichedRecords.reduce(
            (sum, item) =>
              sum + toNumber(item.xgd),
            0
          ),
          enrichedRecords.length
        )
      }
    };
  }
);

/* ============================================================
   ESTATÍSTICAS DA LIGA
============================================================ */

const leagueStats = createEmptyStats();

for (const item of validFinishedMatches) {
  const { homeGoals, awayGoals, homeXG, awayXG, homeStats, awayStats } = item;

  leagueStats.games++;

  const totalGoals = homeGoals + awayGoals;

  leagueStats.total_goals += totalGoals;
  leagueStats.goals_for += totalGoals;

  if (totalGoals >= 1) {
    leagueStats.over_05_count++;
  }

  if (totalGoals >= 2) {
    leagueStats.over_15_count++;
  }

  if (totalGoals >= 3) {
    leagueStats.over_25_count++;
  }

  if (totalGoals >= 4) {
    leagueStats.over_35_count++;
  }

  if (homeGoals > 0 && awayGoals > 0) {
    leagueStats.btts_count++;
  }

  if (homeGoals === 0 && awayGoals === 0) {
    leagueStats.zero_zero_count++;
  }

  leagueStats.xg_total += homeXG + awayXG;
  leagueStats.xga_total += homeXG + awayXG;

  if (homeStats) updateAdvancedStats(leagueStats, homeStats, awayStats);
  if (awayStats) updateAdvancedStats(leagueStats, awayStats, homeStats);
}

finalizeStats(leagueStats);

/* ============================================================
   RANKINGS
============================================================ */

const teamList = Object.values(teams);

function ranking(metric, context = "geral", order = "desc") {
  return [...teamList]
    .map((team) => ({
      team: team.team,
      value: toNumber(
        team[context][metric]
      )
    }))
    .sort((a, b) => order === "asc" ? a.value - b.value : b.value - a.value);
}

const rankings = {
  over_05: ranking("over_05"),
  over_15: ranking("over_15"),
  over_25: ranking("over_25"),
  over_35: ranking("over_35"),

  btts: ranking("btts"),

  zero_zero: ranking("zero_zero"),

  avg_total_goals: ranking(
    "avg_total_goals"
  ),

  avg_goals_for: ranking(
    "avg_goals_for"
  ),

  avg_goals_against: ranking(
    "avg_goals_against"
  ),

  xg: ranking("xg"),

  xga: ranking("xga"),

  xgd: ranking("xgd"),

  // Métricas Avançadas
  possession_avg: ranking("possession_avg"),
  shots_total_avg: ranking("shots_total_avg"),
  shots_on_target_avg: ranking("shots_on_target_avg"),
  shots_inside_box_avg: ranking("shots_inside_box_avg"),
  xgot: ranking("xgot"),
  touches_opp_box_avg: ranking("touches_opp_box_avg"),
  big_chances_avg: ranking("big_chances_avg"),
  passes_accuracy_pct_avg: ranking("passes_accuracy_pct_avg"),
  corners_avg: ranking("corners_avg"),
  corners_total_avg: ranking("corners_total_avg"),
  tackles_avg: ranking("tackles_avg"),
  interceptions_avg: ranking("interceptions_avg"),
  keeper_saves_avg: ranking("keeper_saves_avg"),
  shots_conceded_avg: ranking("shots_conceded_avg", "geral", "asc")
};

/* ============================================================
   OBJETO FINAL DO APP
============================================================ */

const output = {
  season: SEASON,

  updated_at: new Date().toISOString(),

  league: {
    name: LEAGUE_CONFIG.name,
    season: SEASON,
    league_id: LEAGUE_CONFIG.id,

    teams: Object.keys(teams).length,

    stats: leagueStats
  },

  teams,

  rankings
};

/* ============================================================
   GRAVAÇÃO DOS ARQUIVOS
============================================================ */

ensureDir(APP_DIR);

writeJSON(
  OUTPUT_STATS,
  output
);

writeJSON(
  OUTPUT_HISTORY,
  {
    season: SEASON,

    updated_at: new Date().toISOString(),

    teams: historyOutput
  }
);

console.log("");
console.log("========================================");
console.log(" PROCESSAMENTO CONCLUÍDO");
console.log("========================================");
console.log("");

console.log(
  `Arquivo principal: ${OUTPUT_STATS}`
);

console.log(
  `Arquivo histórico: ${OUTPUT_HISTORY}`
);

console.log("");

console.log(
  "Resumo da liga:"
);

console.log(
  `Jogos: ${leagueStats.games}`
);

console.log(
  `Média de gols: ${leagueStats.avg_total_goals}`
);

console.log(
  `Over 2.5: ${leagueStats.over_25}%`
);

console.log(
  `BTTS: ${leagueStats.btts}%`
);

console.log(
  `0 x 0: ${leagueStats.zero_zero}%`
);

console.log("");
