const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const http = require('http');
const axios = require('axios');

const logging = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warning: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`)
};

const userState = {};
const userTemp = {};
const userSessions = {};
const userPendingBets = {};
const userWaitingForResult = {};
const userSkippedBets = {};
const userShouldSkipNext = {};
const userBalanceWarnings = {};
const userSkipResultWait = {};
const userAllResults = {};
const userStopInitiated = {};
const userSLSkipWaitingForWin = {};
const userPlatforms = {};
const userCredentials = {};
let userSettings = {};
let userGameInfo = {};
let userStats = {};
let userLastResults = {};
let userManualBet = {};
let userManualBets = {}; 

let allowedsixlotteryIds = new Set();

const activeUsers = new Set();

let adminSet = new Set(); 

const PLATFORMS = {
  "6LOTTERY": {
    name: "6LOTTERY",
    baseUrl: "https://6lotteryapi.com/api/webapi/",
    color: "🔴"
  },
  "777BIGWIN": {
    name: "777BIGWIN",
    baseUrl: "https://api.bigwinqaz.com/api/webapi/",
    color: "🟢"
  },
  "CKLOTTERY": {
    name: "CKLOTTERY",
    baseUrl: "https://ckygjf6r.com/api/webapi/",
    color: "🔵"
  }
};

const COLORS = {
  GREEN: { name: 'Green', id: 11, numbers: [1, 3, 7, 9] },
  VIOLET: { name: 'Violet', id: 12, numbers: [0, 5] },
  RED: { name: 'Red', id: 10, numbers: [2, 4, 6, 8] }
};

const EMOJI = {
  WIN: '💚',
  LOSS: '💔',
  RESULT: '📋',
  SKIP: '⏭️',
  BET: '🤹‍♂️',
  BETWRAGER: '🤹‍♂️',
  BALANCE: '🛍',
  PROFIT: '🧾',
  LOSS_ICON: '♦️',
  START: '▶️',
  STOP: '⏸️',
  SETTINGS: '🛠',
  STATS: '🔖',
  LOGIN: '🖲',
  LOGOUT: '🕹',
  BACK: '🔙',
  MENU: '🔖',
  GAME: '🎮',
  STRATEGY: '🧬',
  RISK: '🩰',
  TARGET: '🎯',
  LAYER: '📥',
  MODE: '🎛',
  INFO: '📑',
  ADMIN: '🏂',
  USER: '🎭',
  ADD: '➕',
  REMOVE: '➖',
  BROADCAST: '🎙',
  CHECK: '🔍',
  ENABLE: '⛓️',
  DISABLE: '⛓',
  WARNING: '❗️',
  ERROR: '🚫',
  LOADING: '🎞',
  SUCCESS: '📟',
  WAIT: '🔜',
  VIRTUAL: '🖥',
  REAL: '💵',
  TREND: '🧲',
  ALTERNATE: '🔁',
  PATTERN: '🎶',
  COLOR: '🖼',
  GREEN: '🟢',
  VIOLET: '🟣',
  RED: '🔴',
  MARTINGALE: '📹',
  ANTI_MARTINGALE: '🎥',
  DALEMBERT: '📽',
  CUSTOM: '📠',
  TIME: '⌛️',
  RESULTSBS: '📊',
  DRAGON: '🐉',
  SUPER: '⚡'
};

const STYLE = {
  SEPARATOR: '─'.repeat(15),
  BOLD: (text) => `*${text}*`,
  CODE: (text) => `\`${text}\``,
  HEADER: (text) => `🔥 *${text}* 🔥`,
  SUBHEADER: (text) => `📌 *${text}*`,
  SECTION: (text) => `📁 *${text}*`,
  ITEM: (text) => `├─ ${text}`,
  LAST_ITEM: (text) => `└─ ${text}`,
  INFO: (text) => `ℹ️ ${text}`
};

function loadAdmins() {
  try {
    if (fs.existsSync('admins.json')) {
      const data = JSON.parse(fs.readFileSync('admins.json', 'utf8'));
      adminSet = new Set(data.admin_ids || []);
    } else {
      adminSet = new Set();
    }

    adminSet.add(ADMIN_ID);
    saveAdmins();
    logging.info(`Loaded ${adminSet.size} admins (including owner)`);
  } catch (error) {
    logging.error(`Error loading admins: ${error}`);
    adminSet = new Set([ADMIN_ID]);
  }
}

function saveAdmins() {
  try {
    fs.writeFileSync('admins.json', JSON.stringify({ admin_ids: Array.from(adminSet) }, null, 4));
    logging.info(`Saved ${adminSet.size} admins`);
  } catch (error) {
    logging.error(`Error saving admins: ${error}`);
  }
}

function isAdmin(userId) {
  return userId === ADMIN_ID || adminSet.has(userId);
}

function saveUserSettings() {
  try {
    const settingsData = {
      userSettings: userSettings,
      userGameInfo: userGameInfo,
      userStats: userStats,
      userLastResults: userLastResults
    };
    fs.writeFileSync('user_settings.json', JSON.stringify(settingsData, null, 4));
    logging.info("User settings saved to file");
  } catch (error) {
    logging.error(`Error saving user settings: ${error}`);
  }
}

function loadUserSettings() {
  try {
    if (fs.existsSync('user_settings.json')) {
      const data = JSON.parse(fs.readFileSync('user_settings.json', 'utf8'));
      
      Object.assign(userSettings, data.userSettings || {});
      Object.assign(userGameInfo, data.userGameInfo || {});
      Object.assign(userStats, data.stats || {});
      
      if (data.userLastResults && Array.isArray(data.userLastResults)) {
        userLastResults.length = 0;
        data.userLastResults.forEach(item => userLastResults.push(item));
      }
      
      logging.info("User settings loaded from file");
    } else {
      logging.info("user_settings.json not found. Starting with empty settings");
    }
  } catch (error) {
    logging.error(`Error loading user settings: ${error}`);
  }
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ 
      rejectUnauthorized: false,
      keepAlive: true,
      keepAliveMsecs: 1000
    });
    
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Connection': 'Keep-Alive',
        'Ar-Origin': 'https://6win598.com',
        'Origin': 'https://6win598.com',
        'Referer': 'https://6win598.com/',
      },
      timeout: 12000
    };
    
    const requestOptions = {
      ...defaultOptions,
      ...options,
      agent
    };
    
    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ data: jsonData });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

function loadAllowedUsers() {
  try {
    if (fs.existsSync('users_6lottery.json')) {
      const data = JSON.parse(fs.readFileSync('users_6lottery.json', 'utf8'));
      allowedsixlotteryIds = new Set(data.allowed_ids || []);
      logging.info(`Loaded ${allowedsixlotteryIds.size} users`);
    } else {
      logging.warning("users_6lottery.json not found. Starting new");
      allowedsixlotteryIds = new Set();
    }
  } catch (error) {
    logging.error(`Error loading users_6lottery.json: ${error}`);
    allowedsixlotteryIds = new Set();
  }
}

function saveAllowedUsers() {
  try {
    fs.writeFileSync('users_6lottery.json', JSON.stringify({ 
      allowed_ids: Array.from(allowedsixlotteryIds) 
    }, null, 4));
    logging.info(`Saved ${allowedsixlotteryIds.size} users`);
  } catch (error) {
    logging.error(`Error saving user list: ${error}`);
  }
}

function normalizeText(text) {
  return text.normalize('NFKC').trim();
}

function signMd5(data) {
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== "signature" && key !== "timestamp") {
      filtered[key] = value;
    }
  }
  const sorted = Object.keys(filtered).sort().reduce((acc, key) => {
    acc[key] = filtered[key];
    return acc;
  }, {});
  const jsonStr = JSON.stringify(sorted).replace(/\s+/g, '');
  return crypto.createHash('md5').update(jsonStr).digest('hex').toUpperCase();
}

function computeUnitAmount(amt) {
  if (amt <= 0) return 1;
  const amtStr = String(amt);
  const trailingZeros = amtStr.length - amtStr.replace(/0+$/, '').length;
  
  if (trailingZeros >= 4) return 10000;
  if (trailingZeros === 3) return 1000;
  if (trailingZeros === 2) return 100;
  if (trailingZeros === 1) return 10;
  return Math.pow(10, amtStr.length - 1);
}

function getSelectMap(gameType, betType) {
  if (betType === 'COLOR') {
    return { 
      "G": 11,
      "V": 12,
      "R": 10
    };
  } else {
    return { 
      "B": 13,
      "S": 14
    };
  }
}

function numberToBS(num) {
  return num >= 5 ? 'B' : 'S';
}

function numberToColor(num) {
  if (COLORS.GREEN.numbers.includes(num)) return 'G';
  if (COLORS.VIOLET.numbers.includes(num)) return 'V';
  if (COLORS.RED.numbers.includes(num)) return 'R';
  return 'G';
}

function getColorName(colorCode) {
  switch(colorCode) {
    case 'G': return COLORS.GREEN.name;
    case 'V': return COLORS.VIOLET.name;
    case 'R': return COLORS.RED.name;
    default: return 'Unknown';
  }
}

function getValidDalembertBetAmount(unitSize, currentUnits, balance, minBet) {
  let amount = unitSize * currentUnits;
  
  while (amount > balance && currentUnits > 1) {
    currentUnits--;
    amount = unitSize * currentUnits;
  }
  
  if (amount > balance) {
    amount = balance;
  }
  
  if (amount < minBet) {
    amount = minBet;
  }
  
  return { amount, adjustedUnits: currentUnits };
}

function computeBetDetails(desiredAmount) {
  if (desiredAmount <= 0) {
    return { unitAmount: 0, betCount: 0, actualAmount: 0 };
  }
  
  const unitAmount = computeUnitAmount(desiredAmount);
  const betCount = Math.max(1, Math.floor(desiredAmount / unitAmount));
  const actualAmount = unitAmount * betCount;
  
  return { unitAmount, betCount, actualAmount };
}

function calculateBetAmount(settings, currentBalance) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const betSizes = settings.bet_sizes || [100];
  const minBetSize = Math.min(...betSizes);
  
  logging.debug(`Calculating bet amount - Strategy: ${bettingStrategy}, Bet Sizes: [${betSizes.join(', ')}]`);
  
  if (bettingStrategy === "D'Alembert") {
    if (betSizes.length > 1) {
      throw new Error("D'Alembert strategy requires only ONE Bet_Wrager");
    }
    
    const unitSize = betSizes[0];
    let units = settings.dalembert_units || 1;
    
    const { amount: validAmount, adjustedUnits } = getValidDalembertBetAmount(unitSize, units, currentBalance, minBetSize);
    
    if (adjustedUnits !== units) {
      settings.dalembert_units = adjustedUnits;
      units = adjustedUnits;
      logging.info(`D'Alembert: Adjusted units to ${units} due to balance constraints`);
    }
    
    logging.info(`D'Alembert: Betting ${validAmount} (${units} units of ${unitSize})`);
    return validAmount;
    
  } else if (bettingStrategy === "Custom") {
    const customIndex = settings.custom_index || 0;
    const adjustedIndex = Math.min(customIndex, betSizes.length - 1);
    const amount = betSizes[adjustedIndex];
    logging.info(`Custom: Betting ${amount} at index ${adjustedIndex}`);
    return amount;
    
  } else {
    const martinIndex = settings.martin_index || 0;
    const adjustedIndex = Math.min(martinIndex, betSizes.length - 1);
    const amount = betSizes[adjustedIndex];
    logging.info(`${bettingStrategy}: Betting ${amount} at index ${adjustedIndex}`);
    return amount;
  }
}

function updateBettingStrategy(settings, isWin, betAmount) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const betSizes = settings.bet_sizes || [100];
  
  logging.debug(`Updating betting strategy - Strategy: ${bettingStrategy}, Result: ${isWin ? 'WIN' : 'LOSS'}, Bet Amount: ${betAmount}`);
  
  if (bettingStrategy === "Martingale") {
    if (isWin) {
      settings.martin_index = 0;
      logging.info("Martingale: Win - Reset to index 0");
    } else {
      settings.martin_index = Math.min((settings.martin_index || 0) + 1, betSizes.length - 1);
      logging.info(`Martingale: Loss - Move to index ${settings.martin_index}`);
    }
    
  } else if (bettingStrategy === "Anti-Martingale") {
    if (isWin) {
      settings.martin_index = Math.min((settings.martin_index || 0) + 1, betSizes.length - 1);
      logging.info(`Anti-Martingale: Win - Move to index ${settings.martin_index}`);
    } else {
      settings.martin_index = 0;
      logging.info("Anti-Martingale: Loss - Reset to index 0");
    }
    
  } else if (bettingStrategy === "D'Alembert") {
    if (isWin) {
      settings.dalembert_units = Math.max(1, (settings.dalembert_units || 1) - 1);
      logging.info(`D'Alembert: Win - Decrease units to ${settings.dalembert_units}`);
    } else {
      settings.dalembert_units = (settings.dalembert_units || 1) + 1;
      logging.info(`D'Alembert: Loss - Increase units to ${settings.dalembert_units}`);
    }
    
  } else if (bettingStrategy === "Custom") {
    const currentIndex = settings.custom_index || 0;
    
    let actualIndex = 0;
    for (let i = 0; i < betSizes.length; i++) {
      if (betSizes[i] === betAmount) {
        actualIndex = i;
        break;
      }
    }
    
    if (isWin) {
      if (actualIndex > 0) {
        settings.custom_index = actualIndex - 1;
      } else {
        settings.custom_index = 0;
      }
      logging.info(`Custom: Win - Move to index ${settings.custom_index}`);
    } else {
      if (actualIndex < betSizes.length - 1) {
        settings.custom_index = actualIndex + 1;
      } else {
        settings.custom_index = betSizes.length - 1;
      }
      logging.info(`Custom: Loss - Move to index ${settings.custom_index}`);
    }
  }
}

function generateSignature(data) {
  const f = {};
  const exclude = ["signature", "track", "xosoBettingData"];
  
  Object.keys(data).sort().forEach(function(k) {
    const v = data[k];
    if (v !== null && v !== '' && !exclude.includes(k)) {
      f[k] = v === 0 ? 0 : v;
    }
  });
  
  const jstr = JSON.stringify(f);
  return crypto.createHash('md5').update(jstr).digest('hex').toUpperCase();
}

async function loginRequest(phone, password, baseUrl = PLATFORMS["CKLOTTERY"].baseUrl) {
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  const loginData = {
    username: "95" + phone,
    pwd: password,
    phonetype: 1,
    logintype: "mobile",
    packId: "",
    deviceId: "5dcab3e06db88a206975e91ea6ac7c87",
    language: 7,
    random: crypto.randomBytes(16).toString('hex'),
  };
  
  const signature = generateSignature(loginData);
  loginData.signature = signature;
  loginData.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await axios.post(
      baseUrl + "Login",
      loginData,
      {
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "Ar-Origin": "https://6win598.com",
          "Origin": "https://6win598.com",
          "Referer": "https://6win598.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
        },
        timeout: 15000,
      }
    );
    
    const res = response.data;
    if (res.code === 0 && res.data) {
      const tokenHeader = res.data.tokenHeader || "Bearer ";
      const token = res.data.token || "";
      
      const session = {
        post: async (endpoint, data) => {
          const url = baseUrl + endpoint;
          const options = {
            method: 'POST',
            headers: {
              "Authorization": `${tokenHeader}${token}`,
              "Content-Type": "application/json; charset=UTF-8",
              "Ar-Origin": "https://6win598.com",
              "Origin": "https://6win598.com",
              "Referer": "https://6win598.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0"
            },
            body: data
          };
          return makeRequest(url, options);
        }
      };
      return { response: res, session };
    }
    return { response: res, session: null };
  } catch (error) {
    logging.error(`Login error: ${error.message}`);
    return { response: { error: error.message }, session: null };
  }
}

async function getUserInfo(session, userId) {
  const body = {
    "language": 7,
    "random": "4fc9f8f8d6764a5f934d4c6a468644e0"
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post("GetUserInfo", body);
    const res = response.data;
    if (res.code === 0 && res.data) {
      const info = {
        "user_id": res.data.userId,
        "username": res.data.userName,
        "nickname": res.data.nickName,
        "balance": res.data.amount,
        "photo": res.data.userPhoto,
        "login_date": res.data.userLoginDate,
        "withdraw_count": res.data.withdrawCount,
        "is_allow_withdraw": res.data.isAllowWithdraw === 1
      };
      userGameInfo[userId] = info;
      return info;
    }
    return null;
  } catch (error) {
    logging.error(`Get user info error: ${error.message}`);
    return null;
  }
}

async function getBalance(session, userId) {
  const platformKey = userSettings[userId]?.platform || "CKLOTTERY";
  const platform = PLATFORMS[platformKey];
  const body = {
    "language": 7,
    "random": "71ebd56cff7d4679971c482807c33f6f"
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  
  try {
    const response = await session.post("GetBalance", body);
    const res = response.data;
    logging.info(`Balance check response for user ${userId}`);
    
    if (res.code === 0 && res.data) {
      const data = res.data;
      const amount = data.Amount || data.amount || data.balance;
      if (amount !== undefined && amount !== null) {
        const balance = parseFloat(amount);
        if (userGameInfo[userId]) {
          userGameInfo[userId].balance = balance;
        }
        if (!userStats[userId]) {
          userStats[userId] = { start_balance: balance, profit: 0.0 };
        }
        return balance;
      }
      logging.warning(`No balance amount found for user ${userId}`);
    } else {
      logging.error(`Get balance failed for user ${userId}: ${res.msg || 'Unknown error'}`);
    }
    return null;
  } catch (error) {
    logging.error(`Balance check error for user ${userId}: ${error.message}`);
    return null;
  }
}

async function getGameIssueRequest(session, gameType) {
  let typeId, endpoint;
  
  if (gameType === "TRX") {
    typeId = 13;
    endpoint = "GetTrxGameIssue";
  } else if (gameType === "WINGO_30S") {
    typeId = 30;
    endpoint = "GetGameIssue";
  } else if (gameType === "WINGO_3MIN") {
    typeId = 2;
    endpoint = "GetGameIssue";
  } else if (gameType === "WINGO_5MIN") {
    typeId = 3;
    endpoint = "GetGameIssue";
  } else {
    typeId = 1;
    endpoint = "GetGameIssue";
  }
  
  const body = {
    "typeId": typeId,
    "language": 7,
    "random": "7d76f361dc5d4d8c98098ae3d48ef7af"
  };
  body.signature = signMd5(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  
  const maxRetries = 3;
  const retryDelay = 2000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await session.post(endpoint, body);
      logging.info(`Game issue request for ${gameType}, attempt ${attempt + 1}`);
      
      if (response.data && response.data.code === 0) {
        return response.data;
      } else if (response.data && response.data.code !== 0) {
        logging.error(`Game issue error for ${gameType}: ${response.data.msg || 'Unknown error'}`);
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        return response.data;
      }
      
      return response.data;
    } catch (error) {
      logging.error(`Game issue error for ${gameType}, attempt ${attempt + 1}: ${error.message}`);
      
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      return { error: error.message };
    }
  }
  
  return { error: "Failed after retries" };
}

async function placeBetRequest(session, issueNumber, selectType, unitAmount, betCount, gameType, userId) {
  let typeId, endpoint;
  
  if (gameType === "TRX") {
    typeId = 13;
    endpoint = "GameTrxBetting";
  } else if (gameType === "WINGO_30S") {
    typeId = 30;
    endpoint = "GameBetting";
  } else if (gameType === "WINGO_3MIN") {
    typeId = 2;
    endpoint = "GameBetting";
  } else if (gameType === "WINGO_5MIN") {
    typeId = 3;
    endpoint = "GameBetting";
  } else {
    typeId = 1;
    endpoint = "GameBetting";
  }
  
  const settings = userSettings[userId] || {};
  const betType = settings.bet_type || "BS";
  const actualGameType = betType === "COLOR" ? 0 : 2;
  
  if (!selectType || isNaN(selectType)) {
    logging.error(`Invalid selectType: ${selectType} for user ${userId}`);
    return { error: "Invalid bet selection type" };
  }
  
  const betBody = {
    "typeId": typeId,
    "issuenumber": issueNumber,
    "language": 7,
    "gameType": actualGameType,
    "amount": unitAmount,
    "betCount": betCount,
    "selectType": parseInt(selectType),
    "random": "f9ec46840a374a65bb2abad44dfc4dc3"
  };
  betBody.signature = generateSignature(betBody).toUpperCase();
  betBody.timestamp = Math.floor(Date.now() / 1000);
  
  logging.info(`Bet request details for user ${userId}:`);
  logging.info(`  Game Type: ${gameType}, Bet Type: ${betType}, API gameType: ${actualGameType}`);
  logging.info(`  Issue: ${issueNumber}, SelectType: ${selectType}, Amount: ${unitAmount * betCount}`);
  
  for (let attempt = 0; attempt < MAX_BET_RETRIES; attempt++) {
    try {
      const response = await session.post(endpoint, betBody);
      const res = response.data;
      logging.info(`Bet request for user ${userId}, ${gameType}, issue ${issueNumber}, select_type ${selectType}, amount ${unitAmount * betCount}`);
      return res;
    } catch (error) {
      logging.error(`Bet error for user ${userId}, attempt ${attempt + 1}: ${error.message}`);
      
      if (attempt < MAX_BET_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, BET_RETRY_DELAY * 1000));
        continue;
      }
      return { error: error.message };
    }
  }
  return { error: "Failed after retries" };
}

async function getWingoGameResults(session, gameType = "WINGO") {
  let typeId;
  
  if (gameType === "WINGO_30S") {
    typeId = 30;
  } else if (gameType === "WINGO_3MIN") {
    typeId = 2;
  } else if (gameType === "WINGO_5MIN") {
    typeId = 3;
  } else {
    typeId = 1;
  }
  
  const body = {
    "pageSize": 10,
    "pageNo": 1,
    "typeId": typeId,
    "language": 7,
    "random": "4ad5325e389745a882f4189ed6550e70"
  };
  
  if (gameType === "WINGO_30S") {
    body.signature = "5483D466A138F08B6704354BAA7E7FB3";
    body.timestamp = 1761247150;
  } else {
    body.signature = generateSignature(body).toUpperCase();
    body.timestamp = Math.floor(Date.now() / 1000);
  }
  
  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    const data = response.data;
    
    if (data && data.code === 0 && data.data && data.data.list) {
      logging.info(`Successfully fetched ${data.data.list.length} results for ${gameType}`);
      return data;
    } else {
      logging.error(`Failed to get ${gameType} results: ${data?.msg || 'Unknown error'}`);
      return data;
    }
  } catch (error) {
    logging.error(`Error getting ${gameType} results: ${error.message}`);
    return { error: error.message };
  }
}

async function getOldestHistory(session, gameType = "TRX") {
  let typeId;
  
  if (gameType === "TRX") {
    typeId = 13;
  } else if (gameType === "WINGO_30S") {
    typeId = 30;
  } else if (gameType === "WINGO_3MIN") {
    typeId = 2;
  } else if (gameType === "WINGO_5MIN") {
    typeId = 3;
  } else {
    typeId = 1;
  }

  const body = {
    "pageSize": 100,
    "pageNo": 1,
    "typeId": typeId,
    "language": 7,
    "random": "4ad5325e389745a882f4189ed6550e70"
  };

  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);

  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    const data = response.data;
    
    if (data && data.code === 0 && data.data && data.data.list) {
      return data.data.list;
    } else {
      logging.error(`Failed to get 100 history for ${gameType}: ${data?.msg || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    logging.error(`Error getting 100 history for ${gameType}: ${error.message}`);
    return null;
  }
}

async function getGameResults40(session, gameType = "TRX") {
  let typeId;
  if (gameType === "TRX") typeId = 13;
  else if (gameType === "WINGO_30S") typeId = 30;
  else if (gameType === "WINGO_3MIN") typeId = 2;
  else if (gameType === "WINGO_5MIN") typeId = 3;
  else typeId = 1;

  const body = {
    "pageSize": 40,
    "pageNo": 1,
    "typeId": typeId,
    "language": 7,
    "random": crypto.randomBytes(16).toString('hex')
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);

  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    if (response.data && response.data.code === 0 && response.data.data && response.data.data.list) {
      return response.data.data.list;
    }
    logging.error(`GetNoaverageEmerdList failed for ${gameType}: ${response.data?.msg}`);
    return null;
  } catch (error) {
    logging.error(`Error getting 40 results for ${gameType}: ${error.message}`);
    return null;
  }
}

async function getTrxPublicResults() {
  const url = `https://draw.ar-lottery01.com/TrxWinGo/TrxWinGo_1M/GetHistoryIssuePage.json?ts=${Date.now()}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Referer': 'https://ar-lottery01.com/',
        'Origin': 'https://ar-lottery01.com'
      },
      timeout: 10000
    });
    
    const res = response.data;
    
    if (res && res.code === 0 && res.data && res.data.list && res.data.list.length > 0) {
      logging.info(`TRX Public API: Fetched ${res.data.list.length} results`);
      return res.data.list;
    } else {
      logging.error(`TRX Public API: Invalid response: ${res?.msg || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    logging.error(`TRX Public API error: ${error.message}`);
    return null;
  }
}

async function getNextPeriodTimeLeft(session, gameType) {
  try {
    const issueRes = await getGameIssueRequest(session, gameType);
    if (!issueRes || issueRes.code !== 0 || !issueRes.data) return "N/A";

    const data = issueRes.data;
    if (data.remainTime !== undefined && data.remainTime !== null) {
      const secs = parseInt(data.remainTime) || 0;
      if (secs > 0) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    }

    const issueStr = String(data.issueNumber || data.predraw?.issueNumber || '');
    if (issueStr.length >= 14) {
      const timeStr = issueStr.substring(0,14);
      const issueTime = new Date(`${timeStr.substring(0,4)}-${timeStr.substring(4,6)}-${timeStr.substring(6,8)}T${timeStr.substring(8,10)}:${timeStr.substring(10,12)}:${timeStr.substring(12,14)}Z`).getTime();
      if (!isNaN(issueTime)) {
        const leftSecs = Math.max(0, Math.floor((issueTime + 60000 - Date.now()) / 1000));
        return `${Math.floor(leftSecs / 60)}m ${leftSecs % 60}s`;
      }
    }
    return "N/A";
  } catch (e) {
    return "N/A";
  }
}

function formatManualResultsPage(results, page, timeLeftStr) {
  const start = (page - 1) * 10;
  const end = start + 10;
  const pageResults = results.slice(start, end);

  let msg = `${EMOJI.RESULTSBS} *Game Results (Page ${page}/4)*\n`;
  msg += `⏳ *Next Draw In: ${timeLeftStr}*\n`;
  msg += `${STYLE.SEPARATOR}\n`;

  pageResults.forEach(r => {
    const num = parseInt(r.number) % 10;
    const bs = num >= 5 ? 'B' : 'S';
    const color = numberToColor(num);
    const colorEmoji = color === 'G' ? '🟢' : color === 'R' ? '🔴' : '🟣';
    const period = String(r.issueNumber || '').slice(-10);
    msg += `${colorEmoji} \`${period}\` → *${num}* (${bs})\n`;
  });
  return msg;
}

function makeManualResPageKeyboard(currentPage) {
  const buttons = [];
  const row = [];
  if (currentPage > 1) row.push(Markup.button.callback("◀️ Prev", `manual_res_page_${currentPage - 1}`));
  row.push(Markup.button.callback(`${currentPage} / 4`, `manual_res_page_none`));
  if (currentPage < 4) row.push(Markup.button.callback("Next ▶️", `manual_res_page_${currentPage + 1}`));
  buttons.push(row);
  return Markup.inlineKeyboard(buttons);
}

async function sendMessageWithRetry(ctx, text, replyMarkup = null) {
  for (let attempt = 0; attempt < MAX_TELEGRAM_RETRIES; attempt++) {
    try {
      const options = { parse_mode: 'Markdown' };
      if (replyMarkup) {
        options.reply_markup = replyMarkup.reply_markup || replyMarkup;
      }
      
      await ctx.reply(text, options);
      return true;
    } catch (error) {
      logging.error(`Telegram message error, attempt ${attempt + 1}: ${error.message}`);
      
      if (attempt < MAX_TELEGRAM_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, TELEGRAM_RETRY_DELAY));
        continue;
      }
      
      try {
        const plainText = text.replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '');
        await ctx.reply(plainText, replyMarkup);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
  return false;
}

async function checkProfitAndStopLoss(userId, bot) {
  const settings = userSettings[userId] || {};
  const stats = safeGetUserStats(userId);
  
  const targetProfit = settings.target_profit;
  const stopLossLimit = settings.stop_loss;

  const isSniperStrategy = ["CYBER_SNIPER", "COLOR_SNIPER"].includes(settings.strategy);
  
  if (isSniperStrategy) {
    logging.info(`Skipping profit/stop-loss check for ${settings.strategy} strategy`);
    return false;
  }
  
  if (!targetProfit && !stopLossLimit) {
    return false;
  }
  
  let currentProfit;
  let balance;
  
  if (settings.virtual_mode) {
    currentProfit = (userStats[userId].virtual_balance || 0) - (userStats[userId].initial_balance || 0);
    balance = userStats[userId].virtual_balance;
  } else {
    currentProfit = userStats[userId].profit || 0;
    const session = userSessions[userId];
    balance = await getBalance(session, parseInt(userId));
  }
  
  let username = '';
  try {
    const chat = await bot.telegram.getChat(userId);
    username = chat.username ? `@${chat.username}` : '';
  } catch (error) {
    logging.error(`Failed to get username for user ${userId}: ${error.message}`);
  }
  
  if (targetProfit && currentProfit >= targetProfit) {
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    
    settings.martin_index = 0;
    settings.dalembert_units = 1;
    settings.custom_index = 0;
    
    settings.profit_target_reached = true;
    
    const balanceLabel = settings.virtual_mode ? 'Virtual Balance' : 'Balance';
    settings.profit_target_message = `Hey!! ${username}\n` +
                                    `🎯 🔥 TARGET ACHIEVED 🔥\n` +
                                    `${STYLE.SEPARATOR}\n` +
                                    `${STYLE.ITEM(`Target: ${targetProfit} Ks`)}\n` +
                                    `${STYLE.ITEM(`Profit: +${currentProfit.toFixed(2)} Ks`)}\n` +
                                    `${STYLE.LAST_ITEM(`${balanceLabel}: ${balance?.toFixed(2) || '0.00'} Ks`)}`;
    
    const restartKeyboard = Markup.inlineKeyboard([
      Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)
    ]);
    
    await bot.telegram.sendMessage(userId, settings.profit_target_message, {
      reply_markup: restartKeyboard.reply_markup
    });
    
    return true;
  }
  
  if (stopLossLimit && currentProfit <= -stopLossLimit) {
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    
    settings.martin_index = 0;
    settings.dalembert_units = 1;
    settings.custom_index = 0;
    
    settings.stop_loss_reached = true;
    
    const balanceLabel = settings.virtual_mode ? 'Virtual Balance' : 'Balance';
    settings.stop_loss_message = `Hey!! ${username}\n` +
                               `⏸️ 🔥 STOP LOSS HIT 🔥\n` +
                               `${STYLE.SEPARATOR}\n` +
                               `${STYLE.ITEM(`Limit: ${stopLossLimit} Ks`)}\n` +
                               `${STYLE.ITEM(`Loss: ${Math.abs(currentProfit).toFixed(2)} Ks`)}\n` +
                               `${STYLE.LAST_ITEM(`${balanceLabel}: ${balance?.toFixed(2) || '0.00'} Ks`)}`;
    
    const restartKeyboard = Markup.inlineKeyboard([
      Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)
    ]);
    
    await bot.telegram.sendMessage(userId, settings.stop_loss_message, {
      reply_markup: restartKeyboard.reply_markup
    });
    
    return true;
  }
  
  return false;
}

function ensureUserStatsInitialized(userId) {
  if (!userStats[userId]) {
    const settings = userSettings[userId] || {};
    userStats[userId] = {
      start_balance: 0,
      profit: 0,
      virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      daily_date: new Date().toDateString(),
      daily_wins: 0,
      daily_losses: 0,
      daily_profit: 0,
      daily_start_balance: 0
    };
    logging.info(`Initialized userStats for user ${userId}`);
  }
}

function safeGetUserStats(userId) {
  if (!userStats[userId]) {
    const settings = userSettings[userId] || {};
    userStats[userId] = {
      start_balance: 0,
      profit: 0,
      virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      daily_date: new Date().toDateString(),
      daily_wins: 0,
      daily_losses: 0,
      daily_profit: 0,
      daily_start_balance: 0
    };
    logging.info(`Created userStats for ${userId}`);
  } else if (!userStats[userId].daily_date) {
    userStats[userId].daily_date = new Date().toDateString();
    userStats[userId].daily_wins = 0;
    userStats[userId].daily_losses = 0;
    userStats[userId].daily_profit = 0;
    userStats[userId].daily_start_balance = 0;
  }
  return userStats[userId];
}

function getCyberSniperPrediction(userId) {
  const state = userSettings[userId].cyber_sniper_state || {
    active: false,
    direction: null,
    sequence: [],
    step: 0,
    hit_count: 0,
    got_same_result: false
  };

  const lastNumbers = userLastResults[userId] || [];
  const lastNumStr = lastNumbers.length > 0 ? lastNumbers[lastNumbers.length - 1] : null;

  if (!state.active && lastNumStr) {
    if (lastNumStr === "0") {
      state.active = true;
      state.direction = "B";
      state.sequence = ["B"];
      state.step = 0;
      state.hit_count = 0;
      state.got_same_result = false;
      logging.info(`CYBER_SNIPER: Triggered by 0. Betting BIG.`);
    } else if (lastNumStr === "9") {
      state.active = true;
      state.direction = "S";
      state.sequence = ["S"];
      state.step = 0;
      state.hit_count = 0;
      state.got_same_result = false;
      logging.info(`CYBER_SNIPER: Triggered by 9. Betting SMALL.`);
    }
  }

  userSettings[userId].cyber_sniper_state = state;

  if (state.active) {
    if (state.step < state.sequence.length) {
      return { choice: state.sequence[state.step], shouldSkip: false };
    } else {
      return { choice: state.direction, shouldSkip: false };
    }
  } else {
    return { choice: 'B', shouldSkip: true };
  }
}

function getQuantumCalcPrediction(userId) {
  if (!userAllResults[userId] || userAllResults[userId].length < 5) {
    return 'B';
  }

  const latest5 = userAllResults[userId].slice(-5);
  const numericLatest5 = latest5.map(r => r === 'B' ? 7 : 2);
  const sumLatest = numericLatest5.reduce((a, b) => a + b, 0);

  const remainingHistory = userAllResults[userId].slice(0, -5);
  let sumHistory = 0;
  if (remainingHistory.length > 0) {
    const numericHistory = remainingHistory.map(r => r === 'B' ? 7 : 2);
    sumHistory = numericHistory.reduce((a, b) => a + b, 0);
  }

  const diff = Math.abs(sumLatest - sumHistory);
  const lastDigit = diff % 10;
  const isTwoDigitCalc = Math.abs(sumLatest - sumHistory) >= 10;

  logging.info(`QUANTUM_CALC: SumLatest=${sumLatest}, SumHistory=${sumHistory}, Diff=${diff}, LastDigit=${lastDigit}, Is2Digit=${isTwoDigitCalc}`);

  if (isTwoDigitCalc) {
    if (lastDigit >= 5) return 'S';
    else return 'B';
  } else {
    if (lastDigit >= 5) return 'B';
    else return 'S';
  }
}

function getTimeWarpPrediction(userId) {
  if (!userSettings[userId].time_warp_pos) {
    userSettings[userId].time_warp_pos = 8;
  }
  const pos = userSettings[userId].time_warp_pos;

  if (!userAllResults[userId] || userAllResults[userId].length < pos) {
    const last = userAllResults[userId]?.slice(-1)[0];
    return last || 'B';
  }

  const index = userAllResults[userId].length - pos;
  const prediction = userAllResults[userId][index];
  logging.info(`TIME_WARP: Looking back ${pos} positions (index ${index}), found ${prediction}`);
  return prediction;
}

function getColorSniperPrediction(userId) {
  const state = userSettings[userId].color_sniper_state || {
    active: false,
    step: 0,
    hit_count: 0,
    waiting_for_trigger: true
  };

  const lastNumbers = userLastResults[userId] || [];
  const lastNumStr = lastNumbers.length > 0 ? lastNumbers[lastNumbers.length - 1] : null;

  if (!state.active && state.waiting_for_trigger && lastNumStr) {
    if (lastNumStr === "1" || lastNumStr === "7") {
      state.active = true;
      state.waiting_for_trigger = false;
      state.step = 0;
      state.hit_count = 0;
      logging.info(`COLOR_SNIPER: Triggered by ${lastNumStr}. Betting RED.`);
    }
  }

  userSettings[userId].color_sniper_state = state;

  if (state.active) {
    return { choice: 'R', shouldSkip: false };
  } else {
    return { choice: 'R', shouldSkip: true };
  }
}

function getOpPatternPrediction(userId) {
  const OP_PATTERN_TRX = "BSBSBBSSBBBSSSBSBS";
  
  try {
    if (!userSettings[userId].op_pattern_index) {
      userSettings[userId].op_pattern_index = 0;
    }
    
    let patternIndex = userSettings[userId].op_pattern_index;
    const betType = OP_PATTERN_TRX[patternIndex];
    
    patternIndex = (patternIndex + 1) % OP_PATTERN_TRX.length;
    userSettings[userId].op_pattern_index = patternIndex;
    
    logging.info(`🔥 OP PATTERN: Index ${patternIndex-1}/${OP_PATTERN_TRX.length}, Bet ${betType}`);
    return { choice: betType, shouldSkip: false };
  } catch (error) {
    logging.error(`❌ OP PATTERN error: ${error.message}`);
    return { choice: 'B', shouldSkip: false };
  }
}

function getCustomDigitPrediction(userId) {
  const DEFAULT_DIGIT_MAPPING = {
    '0': 'B', '1': 'B', '2': 'S', '3': 'S', '4': 'B',
    '5': 'S', '6': 'S', '7': 'B', '8': 'B', '9': 'S',
    'DEFAULT': 'B'
  };
  
  try {
    const mapping = userSettings[userId]?.digit_mapping || DEFAULT_DIGIT_MAPPING;
    
    if (!mapping || Object.keys(mapping).length === 0) {
      logging.info(`🎲 Custom Digit: No mapping found, using default`);
      return { choice: DEFAULT_DIGIT_MAPPING.DEFAULT, shouldSkip: false };
    }
    
    const lastResults = userLastResults[userId] || [];
    if (lastResults.length === 0) {
      return { choice: mapping['DEFAULT'] || DEFAULT_DIGIT_MAPPING.DEFAULT, shouldSkip: false };
    }
    
    const lastNumber = lastResults[lastResults.length - 1];
    const lastDigit = lastNumber.toString().slice(-1);
    let betType = mapping[lastDigit] || mapping['DEFAULT'] || DEFAULT_DIGIT_MAPPING.DEFAULT;
    
    logging.info(`🎲 Custom Digit: Last digit ${lastDigit}, Bet ${betType}`);
    return { choice: betType, shouldSkip: false };
  } catch (error) {
    logging.error(`❌ Custom Digit error: ${error.message}`);
    return { choice: 'B', shouldSkip: false };
  }
}

async function getOldestResultPrediction(userId, session, gameType) {
  const history = await getOldestHistory(session, gameType);
  
  if (!history || history.length < 100) {
    logging.warning(`OLDEST_RESULT: Could not fetch 100 results. Length: ${history ? history.length : 0}. Defaulting to B.`);
    return { choice: 'B', shouldSkip: false };
  }

  const oldestResult = history[99]; 
  const number = parseInt(oldestResult.number || "0");
  const oldestBS = number >= 5 ? "B" : "S";

  const choice = oldestBS === "B" ? "S" : "B";

  logging.info(`OLDEST_RESULT: Index 99 is ${number} (${oldestBS}). Bet is REVERSED: ${choice}.`);

  return { choice: choice, shouldSkip: false };
}

function getAlinkarPrediction(userId) {
  const ALINKAR_PATTERN = "BBSSBSBSBBSS";
  
  try {
    if (!userSettings[userId].alinkar_index) {
      userSettings[userId].alinkar_index = 0;
    }
    
    const patternIndex = userSettings[userId].alinkar_index;
    const prediction = ALINKAR_PATTERN[patternIndex];
    
    userSettings[userId].alinkar_index = (patternIndex + 1) % ALINKAR_PATTERN.length;
    
    logging.info(`🔗 ALINKAR: Pattern index ${patternIndex}, Bet ${prediction}`);
    return { choice: prediction, shouldSkip: false };
  } catch (error) {
    logging.error(`❌ ALINKAR error: ${error.message}`);
    return { choice: Math.random() < 0.5 ? 'B' : 'S', shouldSkip: false };
  }
}

function getTrendFollowPrediction(userId) {
  try {
    const settings = userSettings[userId] || {};
    const betType = settings.bet_type || "BS";
    
    if (betType === "COLOR") {
      if (!settings.color_trend_state) {
        settings.color_trend_state = { last_result: null };
      }
      
      if (settings.color_trend_state.last_result === null) {
        const colors = ['G', 'V', 'R'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        logging.info(`Color TREND_FOLLOW: First bet random (${randomColor})`);
        return { choice: randomColor, shouldSkip: false };
      } else {
        const prediction = settings.color_trend_state.last_result;
        logging.info(`Color TREND_FOLLOW: Following last result (${prediction})`);
        return { choice: prediction, shouldSkip: false };
      }
    } else {
      if (!settings.trend_state) {
        settings.trend_state = { last_result: null, skip_mode: false };
      }
      
      const bsWaitCount = settings.bs_sb_wait_count || 0;
      let shouldSkip = false;
      
      if (bsWaitCount > 0) {
        const requiredResults = 2 * bsWaitCount;
        const results = userAllResults[userId] || [];
        
        if (results.length >= requiredResults) {
          const lastResults = results.slice(-requiredResults);
          const patternBS = 'BS'.repeat(bsWaitCount);
          const patternSB = 'SB'.repeat(bsWaitCount);
          const actualPattern = lastResults.join('');
          
          if (actualPattern === patternBS || actualPattern === patternSB) {
            shouldSkip = true;
            settings.trend_state.skip_mode = true;
            logging.info(`TREND_FOLLOW: Pattern ${actualPattern} found. Skipping.`);
          } else {
            shouldSkip = false;
            settings.trend_state.skip_mode = false;
          }
        }
      }
      
      if (settings.trend_state.skip_mode) {
        const prediction = settings.trend_state.last_result || 'B';
        logging.info(`TREND_FOLLOW: Skip mode, betting ${prediction}`);
        return { choice: prediction, shouldSkip: true };
      } else {
        if (settings.trend_state.last_result === null) {
          logging.info(`TREND_FOLLOW: First bet, defaulting to B`);
          return { choice: 'B', shouldSkip: false };
        } else {
          const prediction = settings.trend_state.last_result;
          logging.info(`TREND_FOLLOW: Betting ${prediction}`);
          return { choice: prediction, shouldSkip: false };
        }
      }
    }
  } catch (error) {
    logging.error(`❌ TREND_FOLLOW error: ${error.message}`);
    return { choice: 'B', shouldSkip: false };
  }
}

function getAlternatePrediction(userId) {
  try {
    const settings = userSettings[userId] || {};
    
    if (!settings.alternate_state) {
      settings.alternate_state = { last_result: null, skip_mode: false };
    }
    
    const bbWaitCount = settings.bb_ss_wait_count || 0;
    let shouldSkip = false;
    
    if (bbWaitCount > 0) {
      const requiredResults = 2 * bbWaitCount;
      const results = userAllResults[userId] || [];
      
      if (results.length >= requiredResults) {
        const lastResults = results.slice(-requiredResults);
        const patternBB = 'BB'.repeat(bbWaitCount);
        const patternSS = 'SS'.repeat(bbWaitCount);
        const actualPattern = lastResults.join('');
        
        if (actualPattern === patternBB || actualPattern === patternSS) {
          shouldSkip = true;
          settings.alternate_state.skip_mode = true;
          logging.info(`ALTERNATE: Pattern ${actualPattern} found. Skipping.`);
        } else {
          shouldSkip = false;
          settings.alternate_state.skip_mode = false;
        }
      }
    }
    
    if (settings.alternate_state.skip_mode) {
      let prediction;
      if (settings.alternate_state.last_result === null) {
        prediction = 'B';
      } else {
        prediction = settings.alternate_state.last_result === 'B' ? 'S' : 'B';
      }
      logging.info(`ALTERNATE: Skip mode, betting ${prediction}`);
      return { choice: prediction, shouldSkip: true };
    } else {
      if (settings.alternate_state.last_result === null) {
        logging.info(`ALTERNATE: First bet, defaulting to B`);
        return { choice: 'B', shouldSkip: false };
      } else {
        const prediction = settings.alternate_state.last_result === 'B' ? 'S' : 'B';
        logging.info(`ALTERNATE: Betting ${prediction}`);
        return { choice: prediction, shouldSkip: false };
      }
    }
  } catch (error) {
    logging.error(`❌ ALTERNATE error: ${error.message}`);
    return { choice: 'B', shouldSkip: false };
  }
}

function getBsOrderPrediction(userId) {
  try {
    const settings = userSettings[userId] || {};
    const DEFAULT_BS_ORDER = "BSBBSBSSSB";
    
    if (!settings.pattern) {
      settings.pattern = DEFAULT_BS_ORDER;
      settings.pattern_index = 0;
      logging.warning(`BS_ORDER: Pattern not found, using default: ${DEFAULT_BS_ORDER}`);
    }
    
    const pattern = settings.pattern;
    let patternIndex = settings.pattern_index || 0;
    
    if (patternIndex >= pattern.length) {
      patternIndex = 0;
      settings.pattern_index = 0;
    }
    
    if (!pattern || typeof pattern !== 'string' || pattern.length === 0) {
      logging.error(`BS_ORDER: Invalid pattern for user ${userId}: ${pattern}`);
      return { choice: 'B', shouldSkip: false };
    }
    
    if (!pattern.split('').every(c => c === 'B' || c === 'S')) {
      logging.error(`BS_ORDER: Pattern contains invalid characters: ${pattern}`);
      return { choice: 'B', shouldSkip: false };
    }
    
    const prediction = pattern[patternIndex];
    logging.info(`BS_ORDER: Pattern="${pattern}", Index=${patternIndex}, Choice=${prediction}`);
    
    const nextIndex = (patternIndex + 1) % pattern.length;
    settings.pattern_index = nextIndex;
    logging.info(`BS_ORDER: Next index will be ${nextIndex}`);
    
    return { choice: prediction, shouldSkip: false };
  } catch (error) {
    logging.error(`❌ BS_ORDER error: ${error.message}`);
    return { choice: 'B', shouldSkip: false };
  }
}

// ========== 𝕯𝖗𝖆𝖓𝖌𝖔𝖓 𝕱𝖎𝖗𝖊 STRATEGY ==========
function getDragonFirePrediction(userId) {
  try {
    const results = userAllResults[userId] || [];
    
    if (results.length < 3) {
      logging.info(`🐉 DRAGON_FIRE: Not enough history (${results.length}/3). Defaulting to B`);
      return { choice: 'B', shouldSkip: false };
    }
    
    const last3 = results.slice(-3);
    const bigCount = last3.filter(r => r === 'B').length;
    const smallCount = last3.filter(r => r === 'S').length;
    
    let reversalCheck = false;
    if (results.length >= 5) {
      const last5 = results.slice(-5);
      const big5 = last5.filter(r => r === 'B').length;
      const small5 = last5.filter(r => r === 'S').length;
      
      if (big5 >= 4 || small5 >= 4) {
        reversalCheck = true;
      }
    }
    
    let prediction;
    let reason;
    
    if (reversalCheck) {
      const last5 = results.slice(-5);
      const big5 = last5.filter(r => r === 'B').length;
      
      if (big5 >= 4) {
        prediction = 'S';
        reason = `Reversal (${big5}B/5) → SMALL`;
      } else {
        prediction = 'B';
        reason = `Reversal (${5 - big5}S/5) → BIG`;
      }
    }
    else if (bigCount === 3) {
      prediction = 'B';
      reason = `Dragon Fire (BBB) → BIG`;
    } else if (smallCount === 3) {
      prediction = 'S';
      reason = `Dragon Fire (SSS) → SMALL`;
    }
    else {
      prediction = bigCount > smallCount ? 'B' : 'S';
      reason = `Majority (${bigCount}B/${smallCount}S) → ${prediction}`;
    }
    
    logging.info(`🐉 DRAGON_FIRE: ${reason}`);
    return { choice: prediction, shouldSkip: false };
    
  } catch (error) {
    logging.error(`❌ DRAGON_FIRE error: ${error.message}`);
    return { choice: 'B', shouldSkip: false };
  }
}
// ========== 𝕯𝖗𝖆𝖓𝖌𝖔𝖓 𝕱𝖎𝖗𝖊 END ==========

// ========== 𝔖𝔘𝔓𝔈ℜ STRATEGY ==========
function getSuperPrediction(userId) {
  try {
    const results = userAllResults[userId] || [];
    
    if (results.length < 3) {
      logging.info(`⚡ SUPER: Not enough history (${results.length}/3). Defaulting to B`);
      return { choice: 'B', shouldSkip: false };
    }
    
    if (results.length >= 7) {
      const last7 = results.slice(-7);
      const big7 = last7.filter(r => r === 'B').length;
      const small7 = last7.filter(r => r === 'S').length;
      
      if (big7 >= 5) {
        logging.info(`⚡ SUPER: Strong BIG signal (${big7}/7) → BIG`);
        return { choice: 'B', shouldSkip: false };
      }
      if (small7 >= 5) {
        logging.info(`⚡ SUPER: Strong SMALL signal (${small7}/7) → SMALL`);
        return { choice: 'S', shouldSkip: false };
      }
    }
    
    if (results.length >= 5) {
      const last5 = results.slice(-5);
      const big5 = last5.filter(r => r === 'B').length;
      const small5 = last5.filter(r => r === 'S').length;
      
      if (big5 >= 4) {
        logging.info(`⚡ SUPER: Reversal (${big5}B/5) → SMALL`);
        return { choice: 'S', shouldSkip: false };
      }
      if (small5 >= 4) {
        logging.info(`⚡ SUPER: Reversal (${small5}S/5) → BIG`);
        return { choice: 'B', shouldSkip: false };
      }
    }
    
    const last3 = results.slice(-3);
    const big3 = last3.filter(r => r === 'B').length;
    const small3 = last3.filter(r => r === 'S').length;
    
    if (big3 === 3) {
      logging.info(`⚡ SUPER: Dragon (BBB) → BIG`);
      return { choice: 'B', shouldSkip: false };
    }
    if (small3 === 3) {
      logging.info(`⚡ SUPER: Dragon (SSS) → SMALL`);
      return { choice: 'S', shouldSkip: false };
    }
    
    const last5ForWeight = results.slice(-5);
    let bigScore = 0;
    let smallScore = 0;
    last5ForWeight.forEach((r, i) => {
      const weight = i + 1;
      if (r === 'B') bigScore += weight;
      else smallScore += weight;
    });
    
    if (bigScore > smallScore) {
      logging.info(`⚡ SUPER: Weighted BIG (${bigScore} vs ${smallScore})`);
      return { choice: 'B', shouldSkip: false };
    } else if (smallScore > bigScore) {
      logging.info(`⚡ SUPER: Weighted SMALL (${smallScore} vs ${bigScore})`);
      return { choice: 'S', shouldSkip: false };
    } else {
      const last = results[results.length - 1];
      logging.info(`⚡ SUPER: Tie → following last (${last})`);
      return { choice: last, shouldSkip: false };
    }
    
  } catch (error) {
    logging.error(`❌ SUPER error: ${error.message}`);
    return { choice: 'B', shouldSkip: false };
  }
}
// ========== 𝔖𝔘𝔓𝔈ℜ END ==========

async function getPotatoGraPrediction(userId, session, gameType) {
  try {
    let history;
    
    if (gameType === "TRX") {
      history = await getTrxPublicResults();
    } else {
      history = await getGameResults40(session, gameType);
    }
    
    if (!history || history.length < 5) {
      logging.info(`POTATO_GRA: Not enough results (${history ? history.length : 0}/5). Skipping.`);
      return { choice: 'B', shouldSkip: true };
    }
    
    const latest5 = history.slice(0, 5);
    const pattern = latest5.map(r => parseInt(r.number || "0") % 10 >= 5 ? "B" : "S").join('');
    
    logging.info(`POTATO_GRA: Pattern (newest→oldest): ${pattern}`);
    
    if (pattern === 'BBBBS') {
      logging.info(`POTATO_GRA: Found BBBBS pattern! Betting SMALL.`);
      return { choice: 'S', shouldSkip: false };
    } else if (pattern === 'SSSSB') {
      logging.info(`POTATO_GRA: Found SSSSB pattern! Betting BIG.`);
      return { choice: 'B', shouldSkip: false };
    } else {
      logging.info(`POTATO_GRA: No matching pattern (${pattern}). Skipping.`);
      return { choice: 'B', shouldSkip: true };
    }
  } catch (error) {
    logging.error(`POTATO_GRA: Failed to fetch results: ${error.message}`);
    return { choice: 'B', shouldSkip: true };
  }
}

async function handleSniperHit(userId, strategyName, bot, isWin) {
  const settings = userSettings[userId] || {};
  
  if (!settings.sniper_hit_count) {
    settings.sniper_hit_count = 0;
  }
  
  if (!settings.sniper_loss_count) {
    settings.sniper_loss_count = 0;
  }
  
  if (isWin) {
    settings.sniper_hit_count++;
    settings.sniper_loss_count = 0;
    
    if (SNIPER_NOTIFICATIONS) {
      const hitNotification = `🎯 ${STYLE.BOLD(`${strategyName} HIT!`)} 🎯\n` +
                            `${STYLE.SEPARATOR}\n` +
                            `${STYLE.ITEM(`Hit Count: ${settings.sniper_hit_count}/${SNIPER_MAX_HITS}`)}\n` +
                            `${STYLE.ITEM(`Loss Count: ${settings.sniper_loss_count}/${SNIPER_MAX_LOSSES}`)}\n` +
                            `${STYLE.LAST_ITEM(`Strategy: ${strategyName}`)}`;
      
      try {
        await bot.telegram.sendMessage(userId, hitNotification, { parse_mode: 'Markdown' });
      } catch (error) {
        logging.error(`Failed to send sniper notification to ${userId}: ${error.message}`);
      }
    }
    
    if (settings.sniper_hit_count >= SNIPER_MAX_HITS) {
      await terminateSniperSession(userId, strategyName, bot, true);
      return true;
    }
  } else {
    settings.sniper_loss_count++;
    if (SNIPER_NOTIFICATIONS) {
      const lossNotification = `❌ ${STYLE.BOLD(`${strategyName} LOSS!`)} ❌\n` +
                              `${STYLE.SEPARATOR}\n` +
                              `${STYLE.ITEM(`Hit Count: ${settings.sniper_hit_count}/${SNIPER_MAX_HITS}`)}\n` +
                              `${STYLE.ITEM(`Loss Count: ${settings.sniper_loss_count}/${SNIPER_MAX_LOSSES}`)}\n` +
                              `${STYLE.LAST_ITEM(`Strategy: ${strategyName}`)}`;
      
      try {
        await bot.telegram.sendMessage(userId, lossNotification, { parse_mode: 'Markdown' });
      } catch (error) {
        logging.error(`Failed to send sniper loss notification to ${userId}: ${error.message}`);
      }
    }
    
    if (settings.sniper_loss_count >= SNIPER_MAX_LOSSES) {
      await terminateSniperSession(userId, strategyName, bot, false);
      return true;
    }
  }
  
  return false;
}

async function terminateSniperSession(userId, strategyName, bot, isHitTermination) {
  const settings = userSettings[userId] || {};
  
  settings.running = false;
  delete userWaitingForResult[userId];
  delete userShouldSkipNext[userId];
  
  settings.martin_index = 0;
  settings.dalembert_units = 1;
  settings.custom_index = 0;
  
  const isVirtual = settings.virtual_mode || false;
  let startAmount = 0;
  let balance = 0;
  let profit = 0;
  
  if (isVirtual) {
    startAmount = userStats[userId]?.initial_balance || 0;
    balance = userStats[userId]?.virtual_balance || 0;
    profit = balance - startAmount;
  } else {
    startAmount = userStats[userId]?.start_balance || 0;
    profit = userStats[userId]?.profit || 0;
    const session = userSessions[userId];
    if (session) {
      balance = await getBalance(session, parseInt(userId)) || 0;
    }
  }
  
  const caption = isHitTermination 
    ? `🎯 ${STYLE.BOLD('SNIPER MISSION COMPLETE!')}\n` +
      `${STYLE.SEPARATOR}\n` +
      `${STYLE.ITEM(`Target Hits: ${SNIPER_MAX_HITS}`)}\n` +
      `${STYLE.ITEM(`Actual Hits: ${settings.sniper_hit_count || 0}`)}\n` +
      `${STYLE.ITEM(`Losses: ${settings.sniper_loss_count || 0}`)}\n` +
      `${STYLE.LAST_ITEM('🎉 Target acquired successfully!')}`
    : `🛑 ${STYLE.BOLD('SNIPER MAX LOSSES REACHED')}\n` +
      `${STYLE.SEPARATOR}\n` +
      `${STYLE.ITEM(`Target Hits: ${SNIPER_MAX_HITS}`)}\n` +
      `${STYLE.ITEM(`Actual Hits: ${settings.sniper_hit_count || 0}`)}\n` +
      `${STYLE.ITEM(`Max Losses: ${SNIPER_MAX_LOSSES}`)}\n` +
      `${STYLE.LAST_ITEM('⚠️ Session terminated - Too many consecutive losses')}`;
  
  const restartKeyboard = Markup.inlineKeyboard([
    Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)
  ]);
  
  await bot.telegram.sendMessage(userId, caption, {
    parse_mode: 'Markdown',
    reply_markup: restartKeyboard.reply_markup
  });
  
  delete settings.sniper_hit_count;
  delete settings.sniper_loss_count;
}

async function winLoseChecker(bot) {
  logging.info("Win/lose checker started");
  while (true) {
    try {
      for (const [userId, session] of Object.entries(userSessions)) {
        if (!session) continue;
        const settings = userSettings[userId] || {};
        
        if (!userStats[userId]) {
          userStats[userId] = {
            start_balance: 0,
            profit: 0,
            virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
            initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
            daily_date: new Date().toDateString(),
            daily_wins: 0,
            daily_losses: 0,
            daily_profit: 0,
            daily_start_balance: 0
          };
          logging.info(`Initialized userStats for user ${userId} in winLoseChecker`);
        }
        
        const gameType = settings.game_type || "TRX";
        const betType = settings.bet_type || "BS";
        const stats = safeGetUserStats(userId);
        
        let data;
        
        if (gameType === "WINGO" || gameType === "WINGO_30S" || gameType === "WINGO_3MIN" || gameType === "WINGO_5MIN") {
          const wingoRes = await getWingoGameResults(session, gameType);
          if (!wingoRes || wingoRes.code !== 0) {
            logging.error(`Failed to get ${gameType} results: ${wingoRes?.msg || 'Unknown error'}`);
            continue;
          }
          data = wingoRes.data?.list || [];

          if (data.length < 10) {
            logging.warning(`Only ${data.length} results available for ${gameType}, expected 10`);
          }
          
          if (gameType === "WINGO_30S" || gameType === "WINGO_3MIN" || gameType === "WINGO_5MIN") {
            logging.debug(`${gameType}: Retrieved ${data.length} results`);
            if (data.length > 0) {
              logging.debug(`${gameType}: First result issueNumber: ${data[0].issueNumber}, number: ${data[0].number}`);
            }
          }
        } else {
          let issueRes = await getGameIssueRequest(session, gameType);
          
          if (!issueRes || issueRes.code !== 0) {
            continue;
          }
          
          data = issueRes.data ? [issueRes.data.settled || {}] : [];
        }
        
        if (gameType === "WINGO" || gameType === "WINGO_30S" || gameType === "WINGO_3MIN" || gameType === "WINGO_5MIN") {
          if (!userAllResults[userId]) userAllResults[userId] = [];
          if (!userLastResults[userId]) userLastResults[userId] = [];
          
          for (let i = 0; i < Math.min(data.length, 10); i++) {
            const result = data[i];
            if (result && result.number) {
              const number = parseInt(result.number || "0") % 10;
              const bigSmall = number >= 5 ? "B" : "S";
              const color = numberToColor(number);
              
              if (!userAllResults[userId].includes(bigSmall)) {
                userAllResults[userId].push(bigSmall);
                if (userAllResults[userId].length > 20) {
                  userAllResults[userId] = userAllResults[userId].slice(-20);
                }
              }
            }
          }
        }
        
        if (userPendingBets[userId]) {
          for (const [period, betInfo] of Object.entries(userPendingBets[userId])) {
            const settled = data.find(item => item.issueNumber === period);
            if (settled && settled.number) {
              if (gameType === "WINGO_30S" || gameType === "WINGO_3MIN" || gameType === "WINGO_5MIN") {
                logging.debug(`${gameType}: Found result for period ${period}: ${settled.number}`);
              }
              
              const [betChoice, amount, isVirtual] = betInfo;
              const number = parseInt(settled.number || "0") % 10;
              const bigSmall = number >= 5 ? "B" : "S";
              const color = numberToColor(number);
              
              let isWin;
              if (betType === "COLOR") {
                isWin = betChoice === color;
              } else {
                isWin = (betChoice === "B" && bigSmall === "B") || (betChoice === "S" && bigSmall === "S");
              }
              
              if (!userLastResults[userId]) {
                userLastResults[userId] = [];
              }
              userLastResults[userId].push(number.toString());
              if (userLastResults[userId].length > 10) {
                userLastResults[userId] = userLastResults[userId].slice(-10);
              }
              
              if (!userAllResults[userId]) {
                userAllResults[userId] = [];
              }
              userAllResults[userId].push(bigSmall);
              if (userAllResults[userId].length > 20) {
                userAllResults[userId] = userAllResults[userId].slice(-20);
              }
              
              if (settings.strategy === "CYBER_SNIPER" && settings.cyber_sniper_state) {
                const csState = settings.cyber_sniper_state;
                
                if (settings.sniper_hit_count === undefined) {
                  settings.sniper_hit_count = 0;
                }
                if (settings.sniper_loss_count === undefined) {
                  settings.sniper_loss_count = 0;
                }
                
                if (isWin) {
                  settings.sniper_hit_count++;
                  settings.sniper_loss_count = 0;
                  csState.hit_count = (csState.hit_count || 0) + 1;
                  
                  if (settings.sniper_hit_count >= SNIPER_MAX_HITS) {
                    await terminateSniperSession(userId, 'CYBER SNIPER', bot, true);
                    settings.running = false;
                    delete userWaitingForResult[userId];
                    delete userShouldSkipNext[userId];
                    
                    csState.active = false;
                    csState.direction = null;
                    csState.sequence = [];
                    csState.step = 0;
                    csState.hit_count = 0;
                    csState.got_same_result = false;
                    
                    logging.info(`CYBER_SNIPER: Target Acquired (${SNIPER_MAX_HITS} Wins). Stopping.`);
                  } else {
                    settings.cyber_hit_once = true;
                    logging.info(`CYBER_SNIPER: Hit ${settings.sniper_hit_count}/${SNIPER_MAX_HITS}`);
                    
                    csState.active = false;
                    csState.direction = null;
                    csState.sequence = [];
                    csState.step = 0;
                  }
                } else {
                  settings.sniper_loss_count++;
                  
                  if (settings.sniper_loss_count >= SNIPER_MAX_LOSSES) {
                    await terminateSniperSession(userId, 'CYBER SNIPER', bot, false);
                    
                    settings.running = false;
                    settings.cyber_max_reached = true;
                    delete userWaitingForResult[userId];
                    delete userShouldSkipNext[userId];
                    
                    csState.active = false;
                    csState.direction = null;
                    csState.sequence = [];
                    csState.step = 0;
                    csState.hit_count = 0;
                    csState.got_same_result = false;
                    
                    logging.info(`CYBER_SNIPER: Max losses (${SNIPER_MAX_LOSSES}) reached. Stopping.`);
                  } else {
                    csState.step++;
                    if (csState.step >= 4) {
                      settings.running = false;
                      settings.cyber_max_reached = true;
                      logging.info(`CYBER_SNIPER: Max internal losses (4) reached. Stopping.`);
                      delete userWaitingForResult[userId];
                      delete userShouldSkipNext[userId];
                    } else {
                      const lastNumStr = userLastResults[userId][userLastResults[userId].length - 2];
                      const currentNumStr = userLastResults[userId][userLastResults[userId].length - 1];

                      if (lastNumStr === currentNumStr && csState.step === 1) {
                        csState.got_same_result = true;
                        if (currentNumStr === "0") csState.sequence = ["B", "S", "B", "B"];
                        if (currentNumStr === "9") csState.sequence = ["S", "B", "S", "S"];
                      } else if (!csState.got_same_result) {
                        if (csState.direction === "B") {
                          if (csState.step === 2) csState.sequence.push("B");
                          if (csState.step === 3) csState.sequence.push("B");
                        } else {
                          if (csState.step === 2) csState.sequence.push("S");
                          if (csState.step === 3) csState.sequence.push("S");
                        }
                      }
                    }
                  }
                }
              }

              if (settings.strategy === "OLDEST_RESULT") {
                if (!settings.oldest_state) {
                  settings.oldest_state = { is_reversing: false };
                }
                
                settings.oldest_state.is_reversing = !settings.oldest_state.is_reversing;
                
                const action = settings.oldest_state.is_reversing ? "Reverse" : "Follow";
                logging.info(`OLDEST_RESULT: Next period will ${action} index 99.`);
              }

              if (settings.strategy === "COLOR_SNIPER" && settings.color_sniper_state) {
                const csState = settings.color_sniper_state;
                
                if (settings.sniper_hit_count === undefined) {
                  settings.sniper_hit_count = 0;
                }
                if (settings.sniper_loss_count === undefined) {
                  settings.sniper_loss_count = 0;
                }
                
                if (isWin) {
                  settings.sniper_hit_count++;
                  settings.sniper_loss_count = 0;
                  csState.hit_count = (csState.hit_count || 0) + 1;
                  
                  if (settings.sniper_hit_count >= SNIPER_MAX_HITS) {
                    await terminateSniperSession(userId, 'COLOR SNIPER', bot, true);
                    
                    settings.color_sniper_hit_twice = true;
                    settings.running = false;
                    delete userWaitingForResult[userId];
                    delete userShouldSkipNext[userId];
                    
                    csState.active = false;
                    csState.waiting_for_trigger = true;
                    csState.step = 0;
                    csState.hit_count = 0;
                    
                    logging.info(`COLOR_SNIPER: Target Acquired (${SNIPER_MAX_HITS} Wins). Stopping.`);
                  } else {
                    settings.color_sniper_hit_once = true;
                    logging.info(`COLOR_SNIPER: Hit ${settings.sniper_hit_count}/${SNIPER_MAX_HITS}`);
                    
                    csState.active = false;
                    csState.waiting_for_trigger = true;
                    csState.step = 0;
                  }
                } else {
                  settings.sniper_loss_count++;
                  
                  if (settings.sniper_loss_count >= SNIPER_MAX_LOSSES) {
                    await terminateSniperSession(userId, 'COLOR SNIPER', bot, false);
                    
                    settings.running = false;
                    settings.color_sniper_max_reached = true;
                    delete userWaitingForResult[userId];
                    delete userShouldSkipNext[userId];
                    
                    csState.active = false;
                    csState.waiting_for_trigger = true;
                    csState.step = 0;
                    csState.hit_count = 0;
                    
                    logging.info(`COLOR_SNIPER: Max losses (${SNIPER_MAX_LOSSES}) reached. Stopping.`);
                  } else {
                    csState.step++;
                    if (csState.step >= 4) {
                      settings.running = false;
                      settings.color_sniper_max_reached = true;
                      logging.info(`COLOR_SNIPER: Max internal losses (4) reached. Stopping.`);
                      delete userWaitingForResult[userId];
                      delete userShouldSkipNext[userId];
                    }
                  }
                }
              }

              if (settings.strategy === "TREND_FOLLOW") {
                if (betType === "COLOR") {
                  if (!settings.color_trend_state) {
                    settings.color_trend_state = { last_result: null };
                  }
                  settings.color_trend_state.last_result = color;
                  logging.info(`Color TREND_FOLLOW: Updated last_result to ${color}`);
                } else {
                  if (!settings.trend_state) {
                    settings.trend_state = { last_result: null, skip_mode: false };
                  }
                  settings.trend_state.last_result = bigSmall;
                  logging.info(`TREND_FOLLOW: Updated last_result to ${bigSmall}`);
                }
              }

              if (settings.strategy === "ALTERNATE") {
                if (!settings.alternate_state) {
                  settings.alternate_state = { last_result: null, skip_mode: false };
                }
                settings.alternate_state.last_result = bigSmall;
                
                if (settings.alternate_state.skip_mode) {
                  if (isWin) {
                    settings.alternate_state.skip_mode = false;
                    logging.info(`ALTERNATE: Win in skip mode. Resuming normal betting.`);
                  }
                  logging.info(`ALTERNATE: Updated last_result to ${bigSmall} (still in skip mode)`);
                } else {
                  logging.info(`ALTERNATE: Updated last_result to ${bigSmall} (normal mode)`);
                }
              }
              
              if (settings.strategy === "QUANTUM_CALC") {
                logging.info(`QUANTUM_CALC: ${isWin ? 'WIN' : 'LOSS'}`);
              }

              if (settings.strategy === "TIME_WARP") {
                logging.info(`TIME_WARP: ${isWin ? 'WIN' : 'LOSS'}`);
                if (!isWin) {
                  settings.time_warp_pos = settings.time_warp_pos === 8 ? 5 : 8;
                  logging.info(`TIME_WARP: Loss. Switched lookback to ${settings.time_warp_pos}`);
                }
              }
              
              if (settings.strategy === "DRAGON_FIRE") {
                logging.info(`🐉 DRAGON_FIRE: ${isWin ? 'WIN' : 'LOSS'}`);
              }

              if (settings.strategy === "SUPER") {
                logging.info(`⚡ SUPER: ${isWin ? 'WIN' : 'LOSS'}`);
              }
              
              const entryLayer = settings.layer_limit || 1;
              
              if (entryLayer === 2) {
                if (!settings.entry_layer_state) {
                  settings.entry_layer_state = { waiting_for_lose: true };
                }
                
                if (settings.entry_layer_state.waiting_for_lose) {
                  if (isWin) {
                    settings.entry_layer_state.waiting_for_lose = true;
                  } else {
                    settings.entry_layer_state.waiting_for_lose = false;
                  }
                }
              } else if (entryLayer === 3) {
                if (!settings.entry_layer_state) {
                  settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
                }
                
                if (settings.entry_layer_state.waiting_for_loses) {
                  if (isWin) {
                    settings.entry_layer_state.waiting_for_loses = true;
                    settings.entry_layer_state.consecutive_loses = 0;
                  } else {
                    settings.entry_layer_state.consecutive_loses++;
                    
                    if (settings.entry_layer_state.consecutive_loses >= 2) {
                      settings.entry_layer_state.waiting_for_loses = false;
                    }
                  }
                }
              }
              
              if (settings.sl_layer && settings.sl_layer > 0) {
                if (isWin) {
                  settings.consecutive_losses = 0;
                  userShouldSkipNext[userId] = false;
                  
                  if (userSLSkipWaitingForWin[userId]) {
                    delete userSLSkipWaitingForWin[userId];
                    logging.info(`SL Layer: Got win after skip, resetting SL state for user ${userId}`);
                  }
                  
                  updateBettingStrategy(settings, true, amount);
                } else {
                  settings.consecutive_losses = (settings.consecutive_losses || 0) + 1;
                  logging.info(`SL Layer: Consecutive losses increased to ${settings.consecutive_losses}/${settings.sl_layer}`);
                  
                  updateBettingStrategy(settings, false, amount);
                  
                  if (settings.consecutive_losses >= settings.sl_layer) {
                    const bettingStrategy = settings.betting_strategy || "Martingale";
                    if (bettingStrategy === "Martingale" || bettingStrategy === "Anti-Martingale") {
                      settings.original_martin_index = settings.martin_index || 0;
                    } else if (bettingStrategy === "D'Alembert") {
                      settings.original_dalembert_units = settings.dalembert_units || 1;
                    } else if (bettingStrategy === "Custom") {
                      settings.original_custom_index = settings.custom_index || 0;
                    }
                    
                    settings.skip_betting = true;
                    userShouldSkipNext[userId] = true;
                    userSLSkipWaitingForWin[userId] = true;
                    logging.warning(`SL Layer triggered! Skipping next bet after ${settings.consecutive_losses} consecutive losses.`);
                  }
                }
              } else {
                updateBettingStrategy(settings, isWin, amount);
              }
              
              if (isVirtual) {
                if (!userStats[userId].virtual_balance) {
                  userStats[userId].virtual_balance = settings.virtual_balance || 0;
                }
                
                if (isWin) {
                  userStats[userId].virtual_balance += amount * 0.96;
                } else {
                  userStats[userId].virtual_balance -= amount;
                }
              } else {
                if (userStats[userId] && amount > 0) {
                  if (isWin) {
                    const profitChange = amount * 0.96;
                    userStats[userId].profit += profitChange;
                  } else {
                    userStats[userId].profit -= amount;
                  }
                }
              }
              
              const todayStr = new Date().toDateString();
              if (userStats[userId].daily_date !== todayStr) {
                userStats[userId].daily_date = todayStr;
                userStats[userId].daily_wins = 0;
                userStats[userId].daily_losses = 0;
                userStats[userId].daily_profit = 0;
              }
              if (isWin) {
                userStats[userId].daily_wins = (userStats[userId].daily_wins || 0) + 1;
                userStats[userId].daily_profit = (userStats[userId].daily_profit || 0) + (amount * 0.96);
              } else {
                userStats[userId].daily_losses = (userStats[userId].daily_losses || 0) + 1;
                userStats[userId].daily_profit = (userStats[userId].daily_profit || 0) - amount;
              }
              
              const currentBalance = isVirtual 
                ? userStats[userId].virtual_balance 
                : await getBalance(session, parseInt(userId));
              
              const botStopped = await checkProfitAndStopLoss(userId, bot);
              
              if (!userStats[userId]) {
                userStats[userId] = {
                  start_balance: 0,
                  profit: 0,
                  virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
                  initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
                  daily_date: new Date().toDateString(),
                  daily_wins: 0,
                  daily_losses: 0,
                  daily_profit: 0,
                  daily_start_balance: 0
                };
              }

              let resultText;
              if (betType === "COLOR") {
                resultText = `${EMOJI.RESULT} Result: ${number} → ${getColorName(color)} (${bigSmall === 'B' ? 'Big' : 'Small'})`;
              } else {
                resultText = `${EMOJI.RESULT} Result: ${number} → ${bigSmall === 'B' ? 'Big' : 'Small'}`;
              }
              
              const gameId = `${EMOJI.GAME} ${escapeMarkdown(gameType)} : ${period}`;
              
              let message;
              if (isWin) {
                const winAmount = amount * 0.96;
                const totalProfit = isVirtual 
                  ? (userStats[userId].virtual_balance - (userStats[userId].initial_balance || 0))
                  : (userStats[userId]?.profit || 0);
                message = `${EMOJI.WIN} ${STYLE.BOLD('VICTORY')} +${winAmount.toFixed(2)} Ks\n` +
                         `${STYLE.SEPARATOR}\n` +
                         `${gameId}\n` +
                         `${resultText}\n` +
                         `${EMOJI.BALANCE} Balance: ${currentBalance?.toFixed(2) || '0.00'} Ks\n` +
                         `${EMOJI.PROFIT} Total Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} Ks`;
              } else {
                const totalProfit = isVirtual 
                  ? (userStats[userId].virtual_balance - (userStats[userId].initial_balance || 0))
                  : (userStats[userId]?.profit || 0);
                const consecutiveLosses = settings.consecutive_losses || 0;
                
                let slStatusLine = '';
                if (settings.sl_layer) {
                  slStatusLine = `${EMOJI.WARNING} Consecutive Losses: ${consecutiveLosses}/${settings.sl_layer}\n`;
                }
                
                message = `${EMOJI.LOSS} ${STYLE.BOLD('LOSS')} -${amount} Ks\n` +
                         `${STYLE.SEPARATOR}\n` +
                         `${gameId}\n` +
                         `${resultText}\n` +
                         `${slStatusLine}` +
                         `${EMOJI.BALANCE} Balance: ${currentBalance?.toFixed(2) || '0.00'} Ks\n` +
                         `${EMOJI.LOSS_ICON} Total Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} Ks`;
              }
              
              try {
                await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
              } catch (error) {
                logging.error(`Failed to send result to ${userId}: ${error.message}`);
              }
              
              delete userPendingBets[userId][period];
              if (Object.keys(userPendingBets[userId]).length === 0) {
                delete userPendingBets[userId];
              }
              userWaitingForResult[userId] = false;
            }
          }
        }
        
        if (userSkippedBets[userId]) {
          if (!userStats[userId]) {
            userStats[userId] = {
              start_balance: 0,
              profit: 0,
              virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
              initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
              daily_date: new Date().toDateString(),
              daily_wins: 0,
              daily_losses: 0,
              daily_profit: 0,
              daily_start_balance: 0
            };
          }

          for (const [period, betInfo] of Object.entries(userSkippedBets[userId])) {
            const settled = data.find(item => item.issueNumber === period);
            if (settled && settled.number) {
              if (gameType === "WINGO_30S" || gameType === "WINGO_3MIN" || gameType === "WINGO_5MIN") {
                logging.debug(`${gameType}: Found result for skipped period ${period}: ${settled.number}`);
              }
              
              const [betChoice, isVirtual] = betInfo;
              const number = parseInt(settled.number || "0") % 10;
              const bigSmall = number >= 5 ? "B" : "S";
              const color = numberToColor(number);
              
              let isWin;
              if (betType === "COLOR") {
                isWin = betChoice === color;
              } else {
                isWin = (betChoice === "B" && bigSmall === "B") || (betChoice === "S" && bigSmall === "S");
              }
              
              if (!userLastResults[userId]) {
                userLastResults[userId] = [];
              }
              userLastResults[userId].push(number.toString());
              if (userLastResults[userId].length > 10) {
                userLastResults[userId] = userLastResults[userId].slice(-10);
              }
              
              if (!userAllResults[userId]) {
                userAllResults[userId] = [];
              }
              userAllResults[userId].push(bigSmall);
              if (userAllResults[userId].length > 20) {
                userAllResults[userId] = userAllResults[userId].slice(-20);
              }
              
              if (settings.strategy === "TREND_FOLLOW") {
                if (betType === "COLOR") {
                  if (!settings.color_trend_state) {
                    settings.color_trend_state = { last_result: null };
                  }
                  settings.color_trend_state.last_result = color;
                  logging.info(`Color TREND_FOLLOW: Updated last_result to ${color}`);
                } else {
                  if (!settings.trend_state) {
                    settings.trend_state = { last_result: null, skip_mode: false };
                  }
                  settings.trend_state.last_result = bigSmall;
                  
                  if (settings.trend_state.skip_mode) {
                    if (isWin) {
                      settings.trend_state.skip_mode = false;
                      logging.info(`TREND_FOLLOW: Win in skip mode. Resuming normal betting.`);
                    }
                    logging.info(`TREND_FOLLOW: Updated last_result to ${bigSmall} (still in skip mode)`);
                  }
                }
              }
              
              if (settings.strategy === "ALTERNATE") {
                if (!settings.alternate_state) {
                  settings.alternate_state = { last_result: null, skip_mode: false };
                }
                settings.alternate_state.last_result = bigSmall;
                
                if (settings.alternate_state.skip_mode) {
                  if (isWin) {
                    settings.alternate_state.skip_mode = false;
                    logging.info(`ALTERNATE: Win in skip mode. Resuming normal betting.`);
                  }
                  logging.info(`ALTERNATE: Updated last_result to ${bigSmall} (still in skip mode)`);
                } else {
                  logging.info(`ALTERNATE: Updated last_result to ${bigSmall} (normal mode)`);
                }
              }
              
              const entryLayer = settings.layer_limit || 1;
              
              if (entryLayer === 2) {
                if (!settings.entry_layer_state) {
                  settings.entry_layer_state = { waiting_for_lose: true };
                }
                
                if (settings.entry_layer_state.waiting_for_lose) {
                  if (isWin) {
                    settings.entry_layer_state.waiting_for_lose = true;
                  } else {
                    settings.entry_layer_state.waiting_for_lose = false;
                  }
                }
              } else if (entryLayer === 3) {
                if (!settings.entry_layer_state) {
                  settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
                }
                
                if (settings.entry_layer_state.waiting_for_loses) {
                  if (isWin) {
                    settings.entry_layer_state.waiting_for_loses = true;
                    settings.entry_layer_state.consecutive_loses = 0;
                  } else {
                    settings.entry_layer_state.consecutive_loses++;
                    if (settings.entry_layer_state.consecutive_loses >= 2) {
                      settings.entry_layer_state.waiting_for_loses = false;
                    }
                  }
                }
              }
              
              if (settings.sl_layer && settings.sl_layer > 0 && userSLSkipWaitingForWin[userId] && isWin) {
                userShouldSkipNext[userId] = false;
                settings.skip_betting = false;
                settings.consecutive_losses = 0;
                delete userSLSkipWaitingForWin[userId];
                
                const bettingStrategy = settings.betting_strategy || "Martingale";
                if (bettingStrategy === "Martingale" || bettingStrategy === "Anti-Martingale") {
                  settings.martin_index = settings.original_martin_index || 0;
                } else if (bettingStrategy === "D'Alembert") {
                  settings.dalembert_units = settings.original_dalembert_units || 1;
                } else if (bettingStrategy === "Custom") {
                  settings.custom_index = settings.original_custom_index || 0;
                }
                
                logging.info(`SL Layer: Skip win achieved! Resetting SL state and continuing with normal betting for user ${userId}`);
              }
              
              const currentBalance = isVirtual 
                ? userStats[userId].virtual_balance 
                : await getBalance(session, parseInt(userId));
              const totalProfit = isVirtual 
                ? (userStats[userId].virtual_balance - (userStats[userId].initial_balance || 0))
                : (userStats[userId]?.profit || 0);
              
              let resultText;
              if (betType === "COLOR") {
                resultText = `${EMOJI.RESULT} Result: ${number} → ${getColorName(color)} (${bigSmall === 'B' ? 'Big' : 'Small'})`;
              } else {
                resultText = `${EMOJI.RESULT} Result: ${number} → ${bigSmall === 'B' ? 'Big' : 'Small'}`;
              }
              
              const resultMessage = `${resultText}`;
                
              
              try {
                await bot.telegram.sendMessage(userId, resultMessage, { parse_mode: 'Markdown' });
              } catch (error) {
                logging.error(`Failed to send virtual result to ${userId}: ${error.message}`);
              }
              
              delete userSkippedBets[userId][period];
              if (Object.keys(userSkippedBets[userId]).length === 0) {
                delete userSkippedBets[userId];
              }
              
              if (userSkipResultWait[userId] === period) {
                delete userSkipResultWait[userId];
              }
            }
          }
        }

        if (userManualBets[userId] && data.length > 0) {
          for (let i = 0; i < userManualBets[userId].length; i++) {
            const bet = userManualBets[userId][i];
            if (bet.status === "PENDING" && bet.period) {
              const settled = data.find(item => item.issueNumber === bet.period);
              if (settled && settled.number) {
                const number = parseInt(settled.number) % 10;
                const bigSmall = number >= 5 ? "B" : "S";
                const isWin = (bet.choice === "B" && bigSmall === "B") || (bet.choice === "S" && bigSmall === "S");
                const profit = isWin ? (bet.amount * 0.96) : -bet.amount;
                
                bet.status = isWin ? "WIN" : "LOSS";
                bet.result = `${number}(${bigSmall})`;
                bet.isWin = isWin;
                bet.profit = profit;
                
                const choiceText = bet.choice === 'B' ? 'BIG' : 'SMALL';
                const gameId = `${EMOJI.GAME} ${escapeMarkdown(gameType)} : ${bet.period}`;
                const resultText = `${EMOJI.RESULT} Result: ${number} → ${bigSmall === 'B' ? 'Big' : 'Small'}`;
                
                let message;
                if (isWin) {
                  message = `${EMOJI.WIN} ${STYLE.BOLD('MANUAL BET VICTORY')} +${(bet.amount * 0.96).toFixed(2)} Ks\n` +
                           `${STYLE.SEPARATOR}\n${gameId}\n${resultText}\nBet: ${choiceText} | ${bet.amount} Ks`;
                } else {
                  message = `${EMOJI.LOSS} ${STYLE.BOLD('MANUAL BET LOSS')} -${bet.amount.toFixed(2)} Ks\n` +
                           `${STYLE.SEPARATOR}\n${gameId}\n${resultText}\nBet: ${choiceText} | ${bet.amount} Ks`;
                }
                
                try {
                  await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
                } catch (error) {
                  logging.error(`Failed to send manual bet result to ${userId}: ${error.message}`);
                }
              }
            }
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, WIN_LOSE_CHECK_INTERVAL * 1000));
    } catch (error) {
      logging.error(`Win/lose checker error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

function getBetIndexEmoji(settings) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  let betIndex = 0;
  
  if (bettingStrategy === "Martingale" || bettingStrategy === "Anti-Martingale") {
    betIndex = settings.martin_index || 0;
  } else if (bettingStrategy === "Custom") {
    betIndex = settings.custom_index || 0;
  } else if (bettingStrategy === "D'Alembert") {
    betIndex = (settings.dalembert_units || 1) - 1;
  }
  
  return betIndex === 0 ? "🔺" : "🔻";
}

async function safeDeleteMessage(ctx, messageId = null) {
  try {
    const msgId = messageId || ctx.callbackQuery?.message?.message_id;
    if (msgId) {
      await ctx.deleteMessage(msgId);
    }
  } catch (error) {
    if (error.response?.error_code !== 400) {
      logging.error(`Failed to delete message: ${error.message}`);
    }
  }
}

async function bettingWorker(userId, ctx, bot) {
  const settings = userSettings[userId] || {};
  let session = userSessions[userId];
  ensureUserStatsInitialized(userId);

  if (!settings || !session) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please login first`, makeMainKeyboard(false, isAdmin(userId)));
    settings.running = false;
    return;
  }
  
  if (!userStats[userId]) {
    if (settings.virtual_mode) {
      userStats[userId] = { 
        virtual_balance: settings.virtual_balance || 0,
        initial_balance: settings.virtual_balance || 0
      };
    } else {
      userStats[userId] = { start_balance: 0.0, profit: 0.0 };
    }
  }
  
  settings.running = true;
  settings.last_issue = null;
  settings.consecutive_errors = 0;
  settings.consecutive_losses = 0;
  settings.current_layer = 0;
  settings.skip_betting = false;
  
  if (settings.strategy === "CYBER_SNIPER") {
    settings.cyber_sniper_state = {
      active: false,
      direction: null,
      sequence: [],
      step: 0,
      hit_count: 0,
      got_same_result: false
    };
    userLastResults[userId] = [];
    logging.info(`CYBER_SNIPER initialized`);
  }

  if (settings.strategy === "OP_PATTERN") {
    settings.op_pattern_index = 0;
    logging.info(`OP_PATTERN initialized`);
  }
  if (settings.strategy === "CUSTOM_DIGIT") {
    settings.digit_mapping = DEFAULT_DIGIT_MAPPING;
    logging.info(`CUSTOM_DIGIT initialized`);
  }
  if (settings.strategy === "ALINKAR") {
    settings.alinkar_index = 0;
    logging.info(`ALINKAR initialized`);
  }
  
  if (settings.strategy === "DRAGON_FIRE") {
    logging.info(`🐉 DRAGON_FIRE initialized (fully history-based)`);
  }

  if (settings.strategy === "SUPER") {
    logging.info(`⚡ SUPER initialized (fully history-based)`);
  }

  if (settings.strategy === "COLOR_SNIPER") {
    settings.color_sniper_state = {
      active: false,
      step: 0,
      hit_count: 0,
      waiting_for_trigger: true
    };
    userLastResults[userId] = [];
    logging.info(`COLOR_SNIPER initialized`);
  }

  if (settings.strategy === "POTATO_GRA") {
    settings.potato_gra_last_login = Date.now();
    logging.info(`POTATO_GRA initialized`);
  }

  if (settings.strategy === "TIME_WARP") {
    if (!settings.time_warp_pos) settings.time_warp_pos = 8;
    logging.info(`TIME_WARP initialized at pos ${settings.time_warp_pos}`);
  }
  
  if (["CYBER_SNIPER", "COLOR_SNIPER"].includes(settings.strategy)) {
    settings.sniper_hit_count = 0;
    settings.sniper_loss_count = 0;
    logging.info(`Reset sniper counters for ${settings.strategy} - Hits: 0/${SNIPER_MAX_HITS}, Losses: 0/${SNIPER_MAX_LOSSES}`);
  }
  
  if (settings.original_martin_index === undefined) {
    settings.original_martin_index = 0;
  }
  if (settings.original_dalembert_units === undefined) {
    settings.original_dalembert_units = 1;
  }
  if (settings.original_custom_index === undefined) {
    settings.original_custom_index = 0;
  }
  
  userShouldSkipNext[userId] = false;
  delete userSLSkipWaitingForWin[userId];
  
  const entryLayer = settings.layer_limit || 1;
  const betType = settings.bet_type || "BS";
  
  if (entryLayer === 2) {
    settings.entry_layer_state = { waiting_for_lose: true };
  } else if (entryLayer === 3) {
    settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
  }
  
  if (settings.strategy === "TREND_FOLLOW") {
    if (betType === "COLOR") {
      settings.color_trend_state = { last_result: null };
    } else {
      settings.trend_state = { last_result: null, skip_mode: false };
    }
    logging.info(`TREND_FOLLOW strategy initialized for user ${userId}`);
  }
  
  if (settings.strategy === "ALTERNATE") {
    settings.alternate_state = { last_result: null, skip_mode: false };
    logging.info(`ALTERNATE strategy initialized for user ${userId}`);
  }
  
  if (settings.strategy === "BS_ORDER") {
    if (!settings.pattern || settings.pattern.length === 0) {
      settings.pattern = DEFAULT_BS_ORDER;
      settings.pattern_index = 0;
      await sendMessageWithRetry(ctx,
        `${EMOJI.INFO} No BS pattern found, using default: ${DEFAULT_BS_ORDER}`,
        makeMainKeyboard(true, isAdmin(userId))
      );
    } else {
      const pattern = settings.pattern;
      if (!pattern.split('').every(c => c === 'B' || c === 'S')) {
        await sendMessageWithRetry(ctx,
          `${EMOJI.ERROR} Invalid BS pattern! Using default pattern instead.`,
          makeMainKeyboard(true, isAdmin(userId))
        );
        settings.pattern = DEFAULT_BS_ORDER;
        settings.pattern_index = 0;
      }
    }
    
    settings.pattern_index = 0;
    
    const pattern = settings.pattern;
    const firstBet = pattern && pattern.length > 0 ? pattern[0] : 'B';
    
    await sendMessageWithRetry(ctx,
      `${EMOJI.PATTERN} ${STYLE.BOLD('BS ORDER Strategy Active')}\n` +
      `${STYLE.ITEM(`Pattern: ${pattern}`)}\n` +
      `${STYLE.ITEM(`Length: ${pattern.length}`)}\n` +
      `${STYLE.LAST_ITEM(`First bet will be: ${firstBet === 'B' ? 'BIG' : 'SMALL'}`)}`
    );
    
    logging.info(`BS_ORDER strategy initialized for user ${userId}, Pattern: ${settings.pattern}, Index: 0`);
  }
  
  if (!userLastResults[userId]) {
    userLastResults[userId] = [];
  }
  
  let currentBalance = null;
  if (settings.virtual_mode) {
    currentBalance = userStats[userId].virtual_balance || settings.virtual_balance || 0;
  } else {
    let balanceRetrieved = false;
    for (let attempt = 0; attempt < MAX_BALANCE_RETRIES; attempt++) {
      try {
        const balanceResult = await getBalance(session, parseInt(userId));
        if (balanceResult !== null) {
          currentBalance = balanceResult;
          userStats[userId].start_balance = currentBalance;
          balanceRetrieved = true;
          break;
        }
      } catch (error) {
        logging.error(`Balance check attempt ${attempt + 1} failed: ${error.message}`);
      }
      
      if (attempt < MAX_BALANCE_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, BALANCE_RETRY_DELAY * 1000));
      }
    }
    
    if (!balanceRetrieved) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to check balance. Please try again.`, makeMainKeyboard(true, isAdmin(userId)));
      settings.running = false;
      return;
    }
  }
  
  const safeEscape = (text) => {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[*_`\\[\]()~>#+\-=|{}.!]/g, '\\$&');
  };
  
let strategyText = settings.strategy === "TREND_FOLLOW" ? "Trend Follow" :
                   settings.strategy === "ALTERNATE" ? "Alternate" :
                   settings.strategy === "BS_ORDER" ? "Bs Order" :
                   settings.strategy === "CYBER_SNIPER" ? "Cyber Sniper" :
                   settings.strategy === "QUANTUM_CALC" ? "Quantum Calc" :
                   settings.strategy === "TIME_WARP" ? "Time Warp" :
                   settings.strategy === "COLOR_SNIPER" ? "Color Sniper" :
                   settings.strategy === "OP_PATTERN" ? "OP Pattern" :
                   settings.strategy === "CUSTOM_DIGIT" ? "Custom Digit" :
                   settings.strategy === "ALINKAR" ? "Alinkar" :
                   settings.strategy === "OLDEST_RESULT" ? "Oldest Result" :
                   settings.strategy === "POTATO_GRA" ? "Potato Gra" :
                   settings.strategy === "DRAGON_FIRE" ? "Dragon Fire" :
                   settings.strategy === "SUPER" ? "Super" :
                   safeEscape(settings.strategy);

  if (settings.strategy === "TREND_FOLLOW") {
    const bsWaitCount = settings.bs_sb_wait_count || 0;
    if (bsWaitCount > 0) {
      strategyText += ` (BS/SB Wait: ${bsWaitCount})`;
    }
  }
  
  if (settings.strategy === "ALTERNATE") {
    const bbWaitCount = settings.bb_ss_wait_count || 0;
    if (bbWaitCount > 0) {
      strategyText += ` (BB/SS Wait: ${bbWaitCount})`;
    }
  }

  const bettingStrategyText = settings.betting_strategy === "Martingale" ? "Martingale" :
                            settings.betting_strategy === "Anti-Martingale" ? "Anti-Martingale" :
                            settings.betting_strategy === "D'Alembert" ? "D'Alembert" :
                            settings.betting_strategy === "Custom" ? "Custom" : safeEscape(settings.betting_strategy);

  const profitTargetText = settings.target_profit ? `${settings.target_profit} Ks` : "Not Set";
  const stopLossText = settings.stop_loss ? `${settings.stop_loss} Ks` : "Not Set";
  const gameType = settings.game_type || "TRX";
  const betTypeText = settings.bet_type === "COLOR" ? "Color" : "Big/Small";

  const startMessage = 
    `${EMOJI.START} *BOT ACTIVATED*\n` +
    `${STYLE.SEPARATOR}\n\n` +
    `${EMOJI.BALANCE} Balance: ${currentBalance} Ks\n\n` +
    `${EMOJI.GAME} Game: ${safeEscape(gameType)}\n` +
    `${EMOJI.MODE} Type: ${safeEscape(betTypeText)}\n` +
    `${EMOJI.STRATEGY} Strategy: ${strategyText}\n` +
    `${EMOJI.SETTINGS} Mode: ${safeEscape(bettingStrategyText)}\n\n` +
    `${EMOJI.TARGET} Target: ${safeEscape(profitTargetText)}\n` +
    `${EMOJI.STOP} Stop Loss: ${safeEscape(stopLossText)}\n\n` +
    `${STYLE.SEPARATOR}\n` +
    `${EMOJI.LOADING} Starting betting sequence...`;

  await sendMessageWithRetry(ctx, startMessage);
  
    try {
    while (settings.running) {
      if (settings.strategy === "OLDEST_RESULT" && settings.game_type === "TRX") {
        settings.running = false;
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Configuration Error: OLDEST_RESULT is disabled for TRX.\nPlease change your Game Type to WINGO or select a different Strategy.`, makeMainKeyboard(true, isAdmin(userId)));
        break;
      }

      if (userWaitingForResult[userId]) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      if (userSkipResultWait[userId]) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

if (settings.strategy === "POTATO_GRA" && userCredentials[userId]) {
  const lastLoginTime = settings.potato_gra_last_login || Date.now();
  const elapsed = Date.now() - lastLoginTime;
  
  if (elapsed >= 30 * 60 * 1000) {
    logging.info(`POTATO_GRA: Auto re-login (30 min elapsed)`);
    const creds = userCredentials[userId];
    const platform = PLATFORMS[creds.platform];
    
    try {
      const { response: res, session: newSession } = await loginRequest(creds.phone, creds.password, platform.baseUrl);
      if (newSession) {
        userSessions[userId] = newSession;
        session = newSession;
        settings.potato_gra_last_login = Date.now();
        logging.info(`POTATO_GRA: Auto re-login successful`);
        
        try {
          await bot.telegram.sendMessage(userId, 
            `🥔 *POTATO GRA: Auto Re-Login*\n` +
            `${STYLE.SEPARATOR}\n` +
            `✅ Session refreshed after 30 minutes\n` +
            `🔜 Still waiting for pattern...`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {
          logging.error(`Failed to send re-login notification: ${e.message}`);
        }
      } else {
        logging.error(`POTATO_GRA: Auto re-login failed: ${res.msg || 'Unknown error'}`);
        try {
          await bot.telegram.sendMessage(userId, 
            `🥔 *POTATO GRA: Re-Login Failed*\n` +
            `${STYLE.SEPARATOR}\n` +
            `❌ Error: ${res.msg || 'Unknown error'}\n` +
            `🔄 Will retry next cycle...`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }
    } catch (error) {
      logging.error(`POTATO_GRA: Auto re-login error: ${error.message}`);
    }
  }
}
      
      if (settings.virtual_mode) {
        currentBalance = userStats[userId].virtual_balance || settings.virtual_balance || 0;
      } else {
        try {
          const balanceResult = await getBalance(session, parseInt(userId));
          if (balanceResult !== null) {
            currentBalance = balanceResult;
          }
        } catch (error) {
          logging.error(`Balance check failed: ${error.message}`);
        }
      }
      
      if (currentBalance === null) {
        logging.error(`Current balance is null for user ${userId}`);
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to recover balance. Stopping...`, makeMainKeyboard(true, isAdmin(userId)));
        settings.running = false;
        break;
      }
      
      const betSizes = settings.bet_sizes || [];
      if (!betSizes.length) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Bet_Wragers not set. Please configure first.`);
        settings.running = false;
        break;
      }
      
      const minBetSize = Math.min(...betSizes);
      if (currentBalance < minBetSize) {
        const message = `${EMOJI.WARNING} ${STYLE.BOLD('Low Balance!')}\n` +
                        `${STYLE.SEPARATOR}\n` +
                        `${STYLE.ITEM(`Current: ${currentBalance.toFixed(2)} Ks`)}\n` +
                        `${STYLE.LAST_ITEM(`Minimum: ${minBetSize} Ks`)}`;
        await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdmin(userId)));
        settings.running = false;
        break;
      }
      
      const balanceWarningThreshold = minBetSize * 3;
      const now = Date.now();
      const lastWarning = userBalanceWarnings[userId] || 0;
      
      if (currentBalance < balanceWarningThreshold && currentBalance >= minBetSize && (now - lastWarning > 60000)) {
        const warningMessage = `${EMOJI.WARNING} ${STYLE.BOLD('Balance Warning!')}\n` +
                              `${STYLE.SEPARATOR}\n` +
                              `${STYLE.ITEM(`Current: ${currentBalance.toFixed(2)} Ks`)}\n` +
                              `${STYLE.LAST_ITEM(`Minimum: ${minBetSize} Ks`)}`;
        await sendMessageWithRetry(ctx, warningMessage);
        userBalanceWarnings[userId] = now;
      }
      
      let issueRes;
      try {
        issueRes = await getGameIssueRequest(session, gameType);
        if (!issueRes || issueRes.code !== 0) {
          settings.consecutive_errors++;
          if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
            await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Too many errors. Stopping.`);
            settings.running = false;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      } catch (error) {
        logging.error(`Error getting issue: ${error.message}`);
        settings.consecutive_errors++;
        if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
          await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Too many errors. Stopping.`);
          settings.running = false;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      settings.consecutive_errors = 0;
      
      let currentIssue;
      const data = issueRes.data || {};
      
      if (gameType === "TRX") {
        currentIssue = data.predraw?.issueNumber;
      } else {
        currentIssue = data.issueNumber;
      }
      
      if (!currentIssue || currentIssue === settings.last_issue) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      let ch;
      let shouldSkip = false;
      let skipReason = "";
      
      if (settings.strategy === "CYBER_SNIPER") {
        const prediction = getCyberSniperPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Waiting for 0 or 9)";
      } else if (settings.strategy === "COLOR_SNIPER") {
        const prediction = getColorSniperPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Waiting for 1 or 7)";
      } else if (settings.strategy === "POTATO_GRA") {
         const prediction = await getPotatoGraPrediction(userId, session, gameType);
         ch = prediction.choice;
         shouldSkip = prediction.shouldSkip;
         if (shouldSkip) skipReason = "(Waiting for BBBBS or SSSSB pattern)";
      }else if (settings.strategy === "QUANTUM_CALC") {
        ch = getQuantumCalcPrediction(userId);
        shouldSkip = false;
      } else if (settings.strategy === "TIME_WARP") {
        ch = getTimeWarpPrediction(userId);
        shouldSkip = false;
      } else if (settings.strategy === "OP_PATTERN") {
        const prediction = getOpPatternPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(OP Pattern)";
      } else if (settings.strategy === "CUSTOM_DIGIT") {
        const prediction = getCustomDigitPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Digit Mapping)";
      } else if (settings.strategy === "OLDEST_RESULT") {
        const prediction = await getOldestResultPrediction(userId, session, gameType);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
      }else if (settings.strategy === "ALINKAR") {
        const prediction = getAlinkarPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Alinkar Pattern)";
      } else if (settings.strategy === "TREND_FOLLOW") {
        const prediction = getTrendFollowPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Trend Follow)";
      } else if (settings.strategy === "ALTERNATE") {
        const prediction = getAlternatePrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Alternate)";
      } else if (settings.strategy === "BS_ORDER") {
        const prediction = getBsOrderPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(BS Order)";
      } else if (settings.strategy === "DRAGON_FIRE") {
        const prediction = getDragonFirePrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Dragon Fire)";
      } else if (settings.strategy === "SUPER") {
        const prediction = getSuperPrediction(userId);
        ch = prediction.choice;
        shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Super)";
      } else {
        ch = 'B';
        logging.info(`Default bet: B`);
      }
      
      const selectType = getSelectMap(gameType, betType)[ch];

      if (selectType === undefined) {
        logging.error(`Invalid selectType: ${ch}`);
        settings.consecutive_errors++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      logging.info(`Bet Choice: ${ch}, SelectType: ${selectType}`);
      
      if (entryLayer === 1) {
        if (!shouldSkip) {
          shouldSkip = userShouldSkipNext[userId] || false;
          if (shouldSkip) {
            skipReason = "(SL Layer Skip)";
          }
        }
      } else if (entryLayer === 2) {
        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_lose) {
          shouldSkip = true;
          skipReason = "(Entry Layer 2 - Wait for Lose)";
        } else {
          if (!shouldSkip) {
            shouldSkip = userShouldSkipNext[userId] || false;
            if (shouldSkip) skipReason = "(SL Layer Skip)";
          }
        }

        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_lose && shouldSkip) {
          settings.entry_layer_state.waiting_for_lose = false;
          logging.info(`Entry Layer 2: Got loss, now resuming normal betting for user ${userId}`);
        }
      } else if (entryLayer === 3) {
        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_loses) {
          shouldSkip = true;
          skipReason = `(Entry Layer 3 - Wait for ${settings.entry_layer_state.consecutive_loses || 0}/2 Loses)`;
        } else {
          if (!shouldSkip) {
            shouldSkip = userShouldSkipNext[userId] || false;
            if (shouldSkip) skipReason = "(SL Layer Skip)";
          }
        }
        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_lose && shouldSkip) {
          settings.entry_layer_state.waiting_for_lose = false;
          logging.info(`Entry Layer 3: Got 2 loss, now resuming normal betting for user ${userId}`);
        }
      }
      
      const betEmoji = getBetIndexEmoji(settings);
      const gameId = `${EMOJI.GAME} ${gameType} : ${currentIssue}`;
      
      if (shouldSkip) {
        let betChoiceText;
        if (betType === "COLOR") {
          betChoiceText = getColorName(ch);
        } else {
          betChoiceText = ch === 'B' ? `BIG` : `SMALL`;
        }
        
        let betMsg = `${EMOJI.SKIP} SKIPPING\n\n${safeEscape(gameId)}\n${EMOJI.STRATEGY} Strategy: ${strategyText}`;
        await sendMessageWithRetry(ctx, betMsg);
        
        if (!userSkippedBets[userId]) {
          userSkippedBets[userId] = {};
        }
        userSkippedBets[userId][currentIssue] = [ch, settings.virtual_mode];
        
        userSkipResultWait[userId] = currentIssue;
        
        let resultAvailable = false;
        let waitAttempts = 0;
        const maxWaitAttempts = 60;
        
        while (!resultAvailable && waitAttempts < maxWaitAttempts && settings.running) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!userSkippedBets[userId] || !userSkippedBets[userId][currentIssue]) {
            resultAvailable = true;
          }
          waitAttempts++;
        }
        
        if (!resultAvailable) {
          if (userSkipResultWait[userId] === currentIssue) {
            delete userSkipResultWait[userId];
          }
        }
      } else {
        let desiredAmount;
        try {
          desiredAmount = calculateBetAmount(settings, currentBalance);
        } catch (error) {
          await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error: ${error.message}`, makeMainKeyboard(true, isAdmin(userId)));
          settings.running = false;
          break;
        }
        
        const { unitAmount, betCount, actualAmount } = computeBetDetails(desiredAmount);
        
        if (actualAmount === 0) {
          await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid bet amount.`, makeMainKeyboard(true, isAdmin(userId)));
          settings.running = false;
          break;
        }
        
        if (currentBalance < actualAmount) {
          await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Insufficient balance.`, makeMainKeyboard(true, isAdmin(userId)));
          settings.running = false;
          break;
        }
        
        let betChoiceText;
        if (betType === "COLOR") {
          betChoiceText = getColorName(ch);
        } else {
          betChoiceText = ch === 'B' ? `BIG` : `SMALL`;
        }
        
        let patternInfo = "";
        if (settings.strategy === "BS_ORDER" && settings.pattern) {
          const currentIndex = settings.pattern_index !== undefined ? 
                              (settings.pattern_index === 0 ? settings.pattern.length - 1 : settings.pattern_index - 1) : 0;
          patternInfo = ` (Pattern Index: ${currentIndex})`;
        }
        
        let betMsg = `${safeEscape(gameId)}\n${betEmoji} Order: ${safeEscape(betChoiceText)} → ${actualAmount} Ks\n${EMOJI.STRATEGY} Strategy: ${safeEscape(strategyText)}`;
        await sendMessageWithRetry(ctx, betMsg);
        
        if (settings.virtual_mode) {
          if (!userPendingBets[userId]) {
            userPendingBets[userId] = {};
          }
          userPendingBets[userId][currentIssue] = [ch, actualAmount, true];
          userWaitingForResult[userId] = true;
        } else {
          const betResp = await placeBetRequest(session, currentIssue, selectType, unitAmount, betCount, gameType, parseInt(userId));
          
          if (betResp.error || betResp.code !== 0) {
            await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Bet error: ${betResp.msg || betResp.error}. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          
          if (!userPendingBets[userId]) {
            userPendingBets[userId] = {};
          }
          userPendingBets[userId][currentIssue] = [ch, actualAmount, false];
          userWaitingForResult[userId] = true;
        }
      }
      
      settings.last_issue = currentIssue;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    logging.error(`Betting worker error: ${error.message}`);
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error: ${error.message}. Stopping...`);
    settings.running = false;
  } finally {
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    delete userBalanceWarnings[userId];
    delete userSkipResultWait[userId];
    delete userSLSkipWaitingForWin[userId];
    
    if (settings.strategy === "CYBER_SNIPER") {
      delete settings.cyber_sniper_state;
    }
    if (settings.strategy === "COLOR_SNIPER") {
      delete settings.color_sniper_state;
    }
    if (settings.strategy === "TIME_WARP") {
      delete settings.time_warp_pos;
    }

    
    
    if (settings.strategy === "TREND_FOLLOW") {
      delete settings.trend_state;
      delete settings.color_trend_state;
    }
    
    if (settings.strategy === "ALTERNATE") {
      delete settings.alternate_state;
    }
    
    if (settings.strategy === "BS_ORDER") {
      settings.pattern_index = 0;
    }
    
    let totalProfit = 0;
    let balanceText = "";
    
    if (settings.virtual_mode) {
      totalProfit = (userStats[userId]?.virtual_balance || 0) - (userStats[userId]?.initial_balance || 0);
      balanceText = `${EMOJI.VIRTUAL} Virtual Balance: ${(userStats[userId]?.virtual_balance || 0).toFixed(2)} Ks\n`;
    } else {
      totalProfit = userStats[userId]?.profit || 0;
      try {
        const finalBalance = await getBalance(session, parseInt(userId));
        balanceText = `${EMOJI.BALANCE} Final Balance: ${finalBalance?.toFixed(2) || '0.00'} Ks\n`;
      } catch (error) {
        balanceText = `${EMOJI.BALANCE} Final Balance: Unknown\n`;
      }
    }
    
    let profitIndicator = "";
    if (totalProfit > 0) profitIndicator = "+";
    else if (totalProfit < 0) profitIndicator = "-";
    
    delete userStats[userId];
    settings.martin_index = 0;
    settings.dalembert_units = 1;
    settings.custom_index = 0;
    
    if (!userStopInitiated[userId]) {
      const message = `${EMOJI.STOP} ${STYLE.BOLD('SESSION TERMINATED')}\n${balanceText}${EMOJI.PROFIT} Total Profit: ${profitIndicator}${totalProfit.toFixed(2)} Ks`;
      await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdmin(userId)));
    }
    
    delete userStopInitiated[userId];
    delete userAllResults[userId];
  }
}

function makePlatformKeyboard() {
  return Markup.keyboard([
    [`${PLATFORMS["6LOTTERY"].color} ${PLATFORMS["6LOTTERY"].name}`,
    `${PLATFORMS["777BIGWIN"].color} ${PLATFORMS["777BIGWIN"].name}`,
    `${PLATFORMS["CKLOTTERY"].color} ${PLATFORMS["CKLOTTERY"].name}`]
  ]).resize().oneTime(false);
}

function makeMainKeyboard(loggedIn = false, isAdminUser = false) {
  if (!loggedIn) {
    return Markup.keyboard([
      [`${EMOJI.LOGIN} Login`, `📖 Tutorial`]
    ]).resize().oneTime(false);
  }
  
let keyboard = [
  [`${EMOJI.START} Activate`, `${EMOJI.STOP} Deactivate`],
  [`${EMOJI.BETWRAGER} Bet_Wrager`, `${EMOJI.GAME} Game Mode`],
  [`${EMOJI.TARGET} Game Type`, `${EMOJI.COLOR} Bet Type`, `${EMOJI.STRATEGY} Strategy`], 
  [`${EMOJI.SETTINGS} Betting Settings`, `${EMOJI.RISK} Risk Management`],
  [`${EMOJI.BET} Manual Bet`, `${EMOJI.INFO} Account Info`, `${EMOJI.LOGOUT} Re-Login`],
  [`📅 Daily Report`, `📖 Tutorial`]
];
  
  if (isAdminUser) {
    keyboard.push([`${EMOJI.ADMIN} Admin Panel`]);
  }
  
  return Markup.keyboard(keyboard).resize().oneTime(false);
}

function makeRiskManagementSubmenu() {
  return Markup.keyboard([
    [`${EMOJI.TARGET} Profit Target`, `${EMOJI.STOP} Stop Loss`],
    [`${EMOJI.LAYER} Entry Layer`, `${EMOJI.WARNING} Bet SL`],
    [`${EMOJI.BACK} Back`]
  ]).resize().oneTime(false);
}

function makeAdminPanelKeyboard(userId) {
  const isOwner = userId === ADMIN_ID;
  const rows = [];

  rows.push([`${EMOJI.ADD} Add User`, `${EMOJI.REMOVE} Remove User`]);
  rows.push([`${EMOJI.STATS} User Stats`, `${EMOJI.MENU} Allowed IDs`]);
  rows.push([`${EMOJI.BROADCAST} Broadcast`]);
  
  if (isOwner) {
    rows.push([`👥 Add Admin`, `❌ Remove Admin`]);
    rows.push([`📋 List Admins`]);
  }
  
  rows.push([`${EMOJI.MENU} Main Menu`]);
  return Markup.keyboard(rows).resize().oneTime(false);
}

function makeStrategyKeyboard(userId = null) {
  const isTRX = userId && userSettings[userId]?.game_type === "TRX";

  if (userId && userSettings[userId] && userSettings[userId].bet_type === "COLOR") {
    const colorKeyboard = [
      [Markup.button.callback(`${EMOJI.TREND} TREND_FOLLOW`, "strategy:TREND_FOLLOW")],
      [Markup.button.callback(`🎯 COLOR SNIPER`, "strategy:COLOR_SNIPER")]
    ];
    return Markup.inlineKeyboard(colorKeyboard);
  }

  const keyboard = [
    [
      Markup.button.callback(`${EMOJI.TREND} TREND_FOLLOW`, "strategy:TREND_FOLLOW"),
      Markup.button.callback(`${EMOJI.ALTERNATE} ALTERNATE`, "strategy:ALTERNATE")
    ],
    [
      Markup.button.callback(`${EMOJI.PATTERN} BS ORDER`, "strategy:BS_ORDER"),
      Markup.button.callback(`🤖 CYBER_SNIPER`, "strategy:CYBER_SNIPER")
    ],
    [
      Markup.button.callback(`🔮 QUANTUM_CALC`, "strategy:QUANTUM_CALC"),
      Markup.button.callback(`⏳ TIME_WARP`, "strategy:TIME_WARP")
    ],
    [
      Markup.button.callback(`🔥 OP PATTERN`, "strategy:OP_PATTERN"),
      Markup.button.callback(`🎲 DIGIT MAP`, "strategy:CUSTOM_DIGIT")
    ],
    [
      Markup.button.callback(`🥔 POTATO GRA`, "strategy:POTATO_GRA")
    ],
    [
      Markup.button.callback(`🐉 𝕯𝖗𝖆𝖓𝖌𝖔𝖓 𝕱𝖎𝖗𝖊`, "strategy:DRAGON_FIRE"),
      Markup.button.callback(`⚡ 𝔖𝔘𝔓𝔈ℜ`, "strategy:SUPER")
    ]
  ];
  
  if (!isTRX) {
    keyboard.push(
      [
        Markup.button.callback(`🔗 ALINKAR`, "strategy:ALINKAR"),
        Markup.button.callback(`🕰 OLDEST RESULT`, "strategy:OLDEST_RESULT")
      ]
    );
  } else {
    keyboard.push(
      [
        Markup.button.callback(`🔗 ALINKAR`, "strategy:ALINKAR")
      ]
    );
  }
  
  return Markup.inlineKeyboard(keyboard);
}

function makeBetTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`Big/Small`, "bet_type:BS")],
    [Markup.button.callback(`Color`, "bet_type:COLOR")]
  ]);
}

function makeBSWaitCountKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1", "bs_wait_count:1"), Markup.button.callback("2", "bs_wait_count:2"), Markup.button.callback("3", "bs_wait_count:3")],
    [Markup.button.callback("4", "bs_wait_count:4"), Markup.button.callback("5", "bs_wait_count:5"), Markup.button.callback("6", "bs_wait_count:6")],
    [Markup.button.callback(`${EMOJI.CHECK} 0 (Disable)`, "bs_wait_count:0")]
  ]);
}

function makeBBWaitCountKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1", "bb_wait_count:1"), Markup.button.callback("2", "bb_wait_count:2"), Markup.button.callback("3", "bb_wait_count:3")],
    [Markup.button.callback("4", "bb_wait_count:4"), Markup.button.callback("5", "bb_wait_count:5"), Markup.button.callback("6", "bb_wait_count:6")],
    [Markup.button.callback(`${EMOJI.CHECK} 0 (Disable)`, "bb_wait_count:0")]
  ]);
}

function makeBettingStrategyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.ANTI_MARTINGALE} Anti-Martingale`, "betting_strategy:Anti-Martingale")],
    [Markup.button.callback(`${EMOJI.MARTINGALE} Martingale`, "betting_strategy:Martingale")],
    [Markup.button.callback(`${EMOJI.DALEMBERT} D'Alembert`, "betting_strategy:D'Alembert")]
  ]);
}

function makeGameTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.GAME} WINGO`, "game_type:WINGO_SELECT")],
    [Markup.button.callback(`${EMOJI.GAME} TRX`, "game_type:TRX")]
  ]);
}

function makeWINGOSelectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.GAME} WINGO 30s`, "game_type:WINGO_30S"),
     Markup.button.callback(`${EMOJI.GAME} WINGO 1min`, "game_type:WINGO")],
    [Markup.button.callback(`${EMOJI.GAME} WINGO 3min`, "game_type:WINGO_3MIN"),
     Markup.button.callback(`${EMOJI.GAME} WINGO 5min`, "game_type:WINGO_5MIN")]
  ]);
}

function makeEntryLayerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1 - Direct For BET", "entry_layer:1")],
    [Markup.button.callback("2 - Wait for 1 Lose", "entry_layer:2")],
    [Markup.button.callback("3 - Wait for 2 Loses", "entry_layer:3")]
  ]);
}

function makeSLLayerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.CHECK} 0 - Disabled`, "sl_layer:0")],
    [Markup.button.callback("1", "sl_layer:1"), Markup.button.callback("2", "sl_layer:2"), Markup.button.callback("3", "sl_layer:3")],
    [Markup.button.callback("4", "sl_layer:4"), Markup.button.callback("5", "sl_layer:5"), Markup.button.callback("6", "sl_layer:6")],
    [Markup.button.callback("7", "sl_layer:7"), Markup.button.callback("8", "sl_layer:8"), Markup.button.callback("9", "sl_layer:9")]
  ]);
}

function makeModeSelectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.VIRTUAL} Virtual Mode`, "mode:virtual")],
    [Markup.button.callback(`${EMOJI.REAL} Real Mode`, "mode:real")]
  ]);
}

function makeManualBetMenuKeyboard() {
  return Markup.keyboard([
    [`${EMOJI.RESULT} BIG`, `${EMOJI.RESULT} SMALL`],
    [`${EMOJI.RESULTSBS} Game Results`, `${EMOJI.BET} My Bets`],
    [`${EMOJI.BALANCE} My Balance`, `${EMOJI.GAME} Game Type`],
    [`${EMOJI.BACK} Back`]
  ]).resize().oneTime(false);
}

function makeManualAmountKeyboard(choice) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("10", `manual_amt_10_${choice}`), Markup.button.callback("100", `manual_amt_100_${choice}`), Markup.button.callback("1,000", `manual_amt_1000_${choice}`)],
    [Markup.button.callback("10,000", `manual_amt_10000_${choice}`), Markup.button.callback("100,000", `manual_amt_100000_${choice}`), Markup.button.callback("Custom", `manual_amt_custom_${choice}`)]
  ]);
}

function makeManualMultiplierKeyboard(choice, amount) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1x", `manual_mult_1_${choice}_${amount}`), Markup.button.callback("5x", `manual_mult_5_${choice}_${amount}`), Markup.button.callback("20x", `manual_mult_20_${choice}_${amount}`)],
    [Markup.button.callback("50x", `manual_mult_50_${choice}_${amount}`), Markup.button.callback("100x", `manual_mult_100_${choice}_${amount}`), Markup.button.callback("Custom", `manual_mult_custom_${choice}_${amount}`)]
  ]);
}

function makeManualConfirmKeyboard(choice, amount, multiplier) {
  const total = amount * multiplier;
  const choiceText = choice === 'B' ? 'BIG' : 'SMALL';
  return Markup.inlineKeyboard([
    [Markup.button.callback(`✅ YES (Bet ${total} on ${choiceText})`, `manual_confirm_${choice}_${amount}_${multiplier}`)],
    [Markup.button.callback("❌ CANCEL", `manual_cancel`)]
  ]);
}

async function checkUserAuthorized(ctx) {
  const userId = ctx.from.id;
  if (!userSessions[userId]) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please login first`, makeMainKeyboard(false, isAdmin(userId)));
    return false;
  }
  if (!userSettings[userId]) {
    const platformKey = userPlatforms[userId] || "CKLOTTERY";
    userSettings[userId] = {
      platform: platformKey,
      strategy: "TREND_FOLLOW",
      betting_strategy: "Martingale",
      game_type: platformKey === "CKLOTTERY" ? "TRX" : "WINGO",
      bet_type: "BS",
      martin_index: 0,
      dalembert_units: 1,
      pattern_index: 0,
      running: false,
      consecutive_losses: 0,
      current_layer: 0,
      skip_betting: false,
      sl_layer: null,
      original_martin_index: 0,
      original_dalembert_units: 1,
      original_custom_index: 0,
      custom_index: 0,
      layer_limit: 1,
      virtual_mode: false,
      bs_sb_wait_count: 0,
      bb_ss_wait_count: 0
    };
  }
  return true;
}

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function cmdStartHandler(ctx) {
  const userId = ctx.from.id;
  const userName = ctx.from.username || ctx.from.first_name || "User";
  const isAdminUser = isAdmin(userId);
  
  console.log(`[USER_ACTIVITY] User ${userName} (ID: ${userId}) sent /start message`);
  
  activeUsers.add(userId);
  
  if (!userSettings[userId]) {
    userSettings[userId] = {
      strategy: "TREND_FOLLOW",
      betting_strategy: "Martingale",
      game_type: "TRX",
      bet_type: "BS",
      martin_index: 0,
      dalembert_units: 1,
      pattern_index: 0,
      running: false,
      consecutive_losses: 0,
      current_layer: 0,
      skip_betting: false,
      sl_layer: null,
      original_martin_index: 0,
      original_dalembert_units: 1,
      original_custom_index: 0,
      custom_index: 0,
      layer_limit: 1,
      virtual_mode: false,
      bs_sb_wait_count: 0,
      bb_ss_wait_count: 0
    };
  }
  
  userLastResults[userId] = [];
  
  const loggedIn = !!userSessions[userId];
  
  let profilePhotoId = null;
  try {
    const photos = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
    if (photos.total_count > 0) {
      profilePhotoId = photos.photos[0][0].file_id;
    }
  } catch (e) {
    logging.warning("Could not fetch profile photo");
  }

  const safeUserName = escapeMarkdown(userName);
  const safeUserId = escapeMarkdown(userId.toString());
  
  const welcomeMessage = 
    `${STYLE.HEADER('WELCOME TO AUTO BET BOT')}\n\n` +
    `${EMOJI.USER} ${STYLE.BOLD('User Information')}\n` +
    `${STYLE.ITEM(`ID: ${STYLE.CODE(safeUserId)}`)}\n` +
    `${STYLE.LAST_ITEM(`Name: ${safeUserName}`)}\n\n` +

    `${loggedIn ? `${EMOJI.CHECK} ${STYLE.BOLD('Status: Logged In')}` : `${EMOJI.ERROR} ${STYLE.BOLD('Status: Please Login')}`}\n\n` +
    
    `${EMOJI.MENU} ${STYLE.BOLD('Use the buttons below to get started')}`;
  
  if (profilePhotoId) {
    await ctx.replyWithPhoto(profilePhotoId, {
      caption: welcomeMessage,
      parse_mode: 'Markdown',
      reply_markup: makeMainKeyboard(loggedIn, isAdminUser).reply_markup
    });
  } else {
    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: makeMainKeyboard(loggedIn, isAdminUser).reply_markup
    });
  }
}

async function cmdAllowHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`, makeMainKeyboard(true, isAdmin(userId)));
    return;
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  if (!args.length || !args[0].match(/^\d+$/)) {
    await sendMessageWithRetry(ctx, `${EMOJI.INFO} Usage: /allow {6lottery_id}`, makeAdminPanelKeyboard(userId));
    return;
  }
  
  const sixlotteryId = parseInt(args[0]);
  if (allowedsixlotteryIds.has(sixlotteryId)) {
    await sendMessageWithRetry(ctx, `${EMOJI.INFO} User ${sixlotteryId} already added`, makeAdminPanelKeyboard(userId));
  } else {
    allowedsixlotteryIds.add(sixlotteryId);
    saveAllowedUsers();
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} User ${sixlotteryId} added`, makeAdminPanelKeyboard(userId));
  }
}

async function cmdRemoveHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`, makeMainKeyboard(true, isAdmin(userId)));
    return;
  }
  
  const args = ctx.message.text.split(' ').slice(1);
  if (!args.length || !args[0].match(/^\d+$/)) {
    await sendMessageWithRetry(ctx, `${EMOJI.INFO} Usage: /remove {6lottery_id}`, makeAdminPanelKeyboard(userId));
    return;
  }
  
  const sixlotteryId = parseInt(args[0]);
  if (!allowedsixlotteryIds.has(sixlotteryId)) {
    await sendMessageWithRetry(ctx, `${EMOJI.INFO} User ${sixlotteryId} not found`, makeAdminPanelKeyboard(userId));
  } else {
    allowedsixlotteryIds.delete(sixlotteryId);
    saveAllowedUsers();
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} User ${sixlotteryId} removed`, makeAdminPanelKeyboard(userId));
  }
}

async function cmdShowIdHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`);
    return;
  }
  
  try {
    let allowedIds = [];
    if (fs.existsSync('users_6lottery.json')) {
      const data = JSON.parse(fs.readFileSync('users_6lottery.json', 'utf8'));
      allowedIds = data.allowed_ids || [];
    } else {
      allowedIds = Array.from(allowedsixlotteryIds);
    }
    
    if (allowedIds.length === 0) {
      await sendMessageWithRetry(ctx, `${EMOJI.INFO} No allowed IDs found.`);
      return;
    }
  
    let message = `${EMOJI.MENU} ${STYLE.BOLD('List of Allowed IDs')}:\n\n`;
    allowedIds.forEach((id, index) => {
      message += `${index + 1}. ${STYLE.CODE(id.toString())}\n`;
    });
    
    message += `\n${EMOJI.INFO} Total: ${allowedIds.length} allowed users`;
    
    await sendMessageWithRetry(ctx, message);
  } catch (error) {
    logging.error(`Error showing allowed IDs: ${error.message}`);
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error retrieving allowed IDs.`);
  }
}

async function cmdUsersHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`);
    return;
  }
  
  try {
    const telegramUserIds = Array.from(activeUsers);
    
    if (telegramUserIds.length === 0) {
      await sendMessageWithRetry(ctx, `${EMOJI.INFO} No active users found.`);
      return;
    }
    
    let message = `${EMOJI.MENU} ${STYLE.BOLD('List of Active Users')}:\n\n`;
    
    for (const telegramId of telegramUserIds) {
      const userInfo = userGameInfo[telegramId];
      const userName = userInfo?.nickname || userInfo?.username || "Unknown";
      const gameUserId = userInfo?.user_id || "Not logged in";
      const balance = userInfo?.balance || 0;
      const isRunning = userSettings[telegramId]?.running || false;
      
      message += `${EMOJI.USER} ${userName}\n`;
      message += `${STYLE.ITEM(`Telegram ID: ${STYLE.CODE(telegramId.toString())}`)}\n`;
      message += `${STYLE.ITEM(`Game ID: ${gameUserId}`)}\n`;
      message += `${STYLE.ITEM(`Balance: ${balance.toFixed(2)} Ks`)}\n`;
      message += `${STYLE.LAST_ITEM(`Status: ${isRunning ? '🟢 Running' : '🔴 Stopped'}`)}\n\n`;
    }
    
    message += `\n${EMOJI.INFO} Total: ${telegramUserIds.length} active users`;
    
    await sendMessageWithRetry(ctx, message);
  } catch (error) {
    logging.error(`Error showing users: ${error.message}`);
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error retrieving user list.`);
  }
}

async function cmdSendHandler(ctx) {
  await sendMessageWithRetry(ctx, `${EMOJI.INFO} Please use Broadcast button in Admin Panel.`, makeMainKeyboard(true, isAdmin(ctx.from.id)));
}

async function callbackQueryHandler(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  
  console.log(`[CALLBACK] User: ${userId}, Data: ${data}`);
  
  if (data.startsWith("restart_bot:")) {
    const userIdFromCallback = parseInt(data.split(":")[1]);
    
    if (userIdFromCallback !== userId) {
      await ctx.reply(`${EMOJI.ERROR} Unauthorized action`);
      return;
    }
    
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    
    const settings = userSettings[userId] || {};
    
    if (!settings.bet_sizes) {
      await ctx.reply(`${EMOJI.ERROR} Please set Bet_Wrager first!`);
      return;
    }
    
    if (settings.running) {
      await ctx.reply(`${EMOJI.INFO} Bot is already running!`);
      return;
    }
    
    settings.running = true;
    settings.consecutive_errors = 0;
    saveUserSettings();
    
    const entryLayer = settings.layer_limit || 1;
    
    if (entryLayer === 2) {
      settings.entry_layer_state = { waiting_for_lose: true };
    } else if (entryLayer === 3) {
      settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
    }
    
    if (settings.strategy === "TREND_FOLLOW") {
      const betType = settings.bet_type || "BS";
      if (betType === "COLOR") {
        settings.color_trend_state = { last_result: null };
      } else {
        settings.trend_state = { last_result: null, skip_mode: false };
      }
    }
    
    if (settings.strategy === "ALTERNATE") {
      settings.alternate_state = { last_result: null, skip_mode: false };
    }

    if (settings.strategy === "CYBER_SNIPER") {
      settings.cyber_sniper_state = {
        active: false,
        direction: null,
        sequence: [],
        step: 0,
        hit_count: 0,
        got_same_result: false
      };
    }
    if (settings.strategy === "COLOR_SNIPER") {
      settings.color_sniper_state = {
        active: false,
        step: 0,
        hit_count: 0,
        waiting_for_trigger: true
      };
    }
    if (settings.strategy === "TIME_WARP" && !settings.time_warp_pos) {
      settings.time_warp_pos = 8;
    }

        
    if (settings.strategy === "POTATO_GRA") {     
      settings.potato_gra_last_login = Date.now(); 
    }       
    
    if (["CYBER_SNIPER", "COLOR_SNIPER"].includes(settings.strategy)) {
      settings.sniper_hit_count = 0;
      settings.sniper_loss_count = 0;
      logging.info(`Reset sniper counters for ${settings.strategy} on restart`);
    }
    
    delete userSkippedBets[userId];
    userShouldSkipNext[userId] = false;
    delete userSLSkipWaitingForWin[userId];
    userWaitingForResult[userId] = false;
    
    await ctx.reply(`${EMOJI.START} Bot restarted successfully!`);
    bettingWorker(userId, ctx, ctx.telegram);
    return;
  }
  
  if (!await checkUserAuthorized(ctx)) {
    return;
  }
  
  if (data.startsWith("risk:")) {
    const riskOption = data.split(":")[1];
    
    switch (riskOption) {
      case "profit_target":
        userState[userId] = { state: "INPUT_PROFIT_TARGET" };
        await sendMessageWithRetry(ctx, 
          `${EMOJI.TARGET} ${STYLE.BOLD('Profit Target Settings')}\n\n` +
          `${EMOJI.INFO} Please enter your desired profit target amount (in Ks):\n\n` +
          `${STYLE.CODE('Example: 10000')}`
        );
        break;
      case "stop_loss":
        userState[userId] = { state: "INPUT_STOP_LIMIT" };
        await sendMessageWithRetry(ctx, 
          `${EMOJI.STOP} ${STYLE.BOLD('Stop Loss Settings')}\n\n` +
          `${EMOJI.INFO} Please enter your stop loss limit amount (in Ks):\n\n` +
          `${STYLE.CODE('Example: 5000')}`
        );
        break;
      case "entry_layer":
        await sendMessageWithRetry(ctx, 
          `${EMOJI.LAYER} ${STYLE.BOLD('Entry Layer Settings')}\n\n` +
          `${EMOJI.INFO} Select when to start betting:`,
          makeEntryLayerKeyboard()
        );
        break;
      case "bet_sl":
        await sendMessageWithRetry(ctx, 
          `${EMOJI.WARNING} ${STYLE.BOLD('Stop Loss Layer Settings')}\n\n` +
          `${EMOJI.INFO} Select how many consecutive losses before skipping bets:`,
          makeSLLayerKeyboard()
        );
        break;
      default:
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid option`);
    }
    await safeDeleteMessage(ctx);
    return;
  }
  
    if (data.startsWith("strategy:")) {
    const strategy = data.split(":")[1];
    
    if (strategy === "OLDEST_RESULT" && userSettings[userId].game_type === "TRX") {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} OLDEST_RESULT strategy is not supported for TRX.\nPlease switch to WINGO to use this strategy.`);
      await safeDeleteMessage(ctx);
      return;
    }

    userSettings[userId].strategy = strategy;
    
    if (strategy === "BS_ORDER") {
      userState[userId] = { state: "INPUT_BS_PATTERN" };
      await sendMessageWithRetry(ctx, `${EMOJI.PATTERN} ${STYLE.BOLD('BS Pattern Settings')}\n\n${EMOJI.INFO} Please enter your BS pattern (B and S only):\n\n${STYLE.CODE('Example: BSBSSBBS')}`);
    } else if (strategy === "TREND_FOLLOW") {
      const betType = userSettings[userId].bet_type || "BS";
      if (betType === "COLOR") {
        await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Strategy: Trend Follow (Color Mode)')}`, makeMainKeyboard(true, isAdmin(userId)));
      } else {
        await sendMessageWithRetry(ctx, `${EMOJI.TREND} ${STYLE.BOLD('Trend Follow Settings')}\n\n${EMOJI.INFO} Select BS/SB Wait Count:`, makeBSWaitCountKeyboard());
      }
    } else if (strategy === "ALTERNATE") {
      await sendMessageWithRetry(ctx, `${EMOJI.ALTERNATE} ${STYLE.BOLD('Alternate Settings')}\n\n${EMOJI.INFO} Select BB/SS Wait Count:`, makeBBWaitCountKeyboard());
    } else if (strategy === "CYBER_SNIPER") {
      await sendMessageWithRetry(ctx, `🤖 ${STYLE.BOLD('CYBER_SNIPER Activated')}\n\n${EMOJI.INFO} • Session terminates after ${SNIPER_MAX_HITS} hits`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "POTATO_GRA") {
      await sendMessageWithRetry(ctx, 
    `🥔 ${STYLE.BOLD('POTATO GRA Activated')}\n\n` +
    `${EMOJI.INFO} • No pattern → Skip\n` +
    `${EMOJI.INFO} • Auto re-login every 30 minutes`,
    makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "COLOR_SNIPER") {
      await sendMessageWithRetry(ctx, `🎯 ${STYLE.BOLD('COLOR_SNIPER Activated')}\n\n${EMOJI.INFO} • Session terminates after ${SNIPER_MAX_HITS} hits`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "QUANTUM_CALC") {
      await sendMessageWithRetry(ctx, `🔮 ${STYLE.BOLD('QUANTUM_CALC Activated')}`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "TIME_WARP") {
      await sendMessageWithRetry(ctx, `⏳ ${STYLE.BOLD('TIME_WARP Activated')}`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "OP_PATTERN") {
      await sendMessageWithRetry(ctx, `🔥 ${STYLE.BOLD('OP PATTERN Activated')}`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "CUSTOM_DIGIT") {
      await sendMessageWithRetry(ctx, `🎲 ${STYLE.BOLD('CUSTOM DIGIT Activated')}`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "OLDEST_RESULT") {
      await sendMessageWithRetry(ctx, `🕰 ${STYLE.BOLD('OLDEST RESULT Activated')}`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "DRAGON_FIRE") {
      await sendMessageWithRetry(ctx, 
        `🐉 ${STYLE.BOLD('𝕯𝖗𝖆𝖓𝖌𝖔𝖓 𝕱𝖎𝖗𝖊 Activated')}\n\n` +
        `${EMOJI.INFO} • Dragon Fire Logic\n` +
        `${EMOJI.INFO} • 3 Same → Follow\n` +
        `${EMOJI.INFO} • 4/5 Same → Reverse`,
        makeMainKeyboard(true, isAdmin(userId))
      );
    } else if (strategy === "SUPER") {
      await sendMessageWithRetry(ctx, 
        `⚡ ${STYLE.BOLD('𝔖𝔘𝔓𝔈ℜ Activated')}\n\n` +
        `${EMOJI.INFO} • 5/7 Same → Strong Follow\n` +
        `${EMOJI.INFO} • 4/5 Same → Reverse\n` +
        `${EMOJI.INFO} • 3 Same → Dragon\n` +
        `${EMOJI.INFO} • Otherwise → Weighted Majority`,
        makeMainKeyboard(true, isAdmin(userId))
      );
    } else if (strategy === "ALINKAR") {
      await sendMessageWithRetry(ctx, `🔗 ${STYLE.BOLD('ALINKAR Activated')}`, makeMainKeyboard(true, isAdmin(userId)));
    } else {
      await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Strategy set')}`, makeMainKeyboard(true, isAdmin(userId)));
    }
    
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("bet_type:")) {
    const betType = data.split(":")[1];
    userSettings[userId].bet_type = betType;
    
    if (betType === "COLOR") {
      await sendMessageWithRetry(ctx,
        `${EMOJI.SUCCESS} ${STYLE.BOLD('Bet Type: Color')}\n` +
        `${EMOJI.INFO} Please select a strategy compatible with color betting.`,
        makeMainKeyboard(true, isAdmin(userId))
      );
    } else {
      await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Bet Type: Big/Small')}`, makeMainKeyboard(true, isAdmin(userId)));
    }
    
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("bs_wait_count:")) {
    const waitCount = parseInt(data.split(":")[1]);
    userSettings[userId].bs_sb_wait_count = waitCount;
    let message = waitCount === 0 ? `${EMOJI.SUCCESS} BS/SB Wait disabled` : `${EMOJI.SUCCESS} BS/SB Wait: ${waitCount}`;
    await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("bb_wait_count:")) {
    const waitCount = parseInt(data.split(":")[1]);
    userSettings[userId].bb_ss_wait_count = waitCount;
    let message = waitCount === 0 ? `${EMOJI.SUCCESS} BB/SS Wait disabled` : `${EMOJI.SUCCESS} BB/SS Wait: ${waitCount}`;
    await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("betting_strategy:")) {
    const bettingStrategy = data.split(":")[1];
    userSettings[userId].betting_strategy = bettingStrategy;
    userSettings[userId].martin_index = 0;
    userSettings[userId].dalembert_units = 1;
    userSettings[userId].consecutive_losses = 0;
    userSettings[userId].skip_betting = false;
    userSettings[userId].custom_index = 0;
    
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Betting Strategy:')} ${bettingStrategy}`, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("game_type:")) {
    const gameType = data.split(":")[1];
    
    if (gameType === "WINGO_SELECT") {
      await sendMessageWithRetry(ctx, `${EMOJI.GAME} ${STYLE.BOLD('Select WINGO Game Type')}`, makeWINGOSelectionKeyboard());
      await safeDeleteMessage(ctx);
      return;
    }
    
    userSettings[userId].game_type = gameType;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Game Type set')}`, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("entry_layer:")) {
    const layerValue = parseInt(data.split(":")[1]);
    const settings = userSettings[userId];
    
    if (!settings) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} User settings not found`);
      return;
    }
    
    settings.layer_limit = layerValue;
    
    if (layerValue === 2) {
      settings.entry_layer_state = { waiting_for_lose: true };
    } else if (layerValue === 3) {
      settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
    }
    
    let description = layerValue === 1 ? "Bet immediately" : layerValue === 2 ? "Wait for 1 lose" : "Wait for 2 loses";
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD(`Entry Layer: ${layerValue}`)}\n\n${EMOJI.INFO} ${description}`, makeRiskManagementSubmenu());
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("sl_layer:")) {
    const slValue = parseInt(data.split(":")[1]);
    userSettings[userId].sl_layer = slValue > 0 ? slValue : null;
    userSettings[userId].consecutive_losses = 0;
    userSettings[userId].skip_betting = false;
    
    userSettings[userId].original_martin_index = 0;
    userSettings[userId].original_dalembert_units = 1;
    userSettings[userId].original_custom_index = 0;
    
    let description = slValue === 0 ? "Disabled" : `Skip after ${slValue} losses`;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD(`SL Layer: ${slValue}`)}\n\n${EMOJI.INFO} ${description}`, makeRiskManagementSubmenu());
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("mode:")) {
    const mode = data.split(":")[1];
    const settings = userSettings[userId];
    
    if (mode === "virtual") {
      userState[userId] = { state: "INPUT_VIRTUAL_BALANCE" };
      await sendMessageWithRetry(ctx, `${EMOJI.VIRTUAL} ${STYLE.BOLD('Virtual Mode Settings')}\n\n${EMOJI.INFO} Please enter your virtual balance amount (in Ks):\n\n${STYLE.CODE('Example: 10000')}`);
    } else if (mode === "real") {
      settings.virtual_mode = false;
      await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Switched to Real Mode')}`, makeMainKeyboard(true, isAdmin(userId)));
      saveUserSettings();
    }
    
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("manual_amt_")) {
    const parts = data.split("_");
    if (parts[2] === "custom") {
      const choice = parts[3];
      userState[userId] = { state: "INPUT_MANUAL_CUSTOM_AMT", choice };
      await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Enter custom amount:`);
    } else {
      const amount = parseInt(parts[2]);
      const choice = parts[3];
      await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Amount: *${amount}*\n\n${EMOJI.RISK} Select Multiplier:`, makeManualMultiplierKeyboard(choice, amount));
    }
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("manual_res_page_")) {
    const pageStr = data.split("_")[3];
    if (pageStr === "none") return await ctx.answerCbQuery();
    
    const page = parseInt(pageStr);
    const manualData = userManualBet[userId];
    
    if (!manualData || !manualData.results) {
      return await ctx.answerCbQuery("Results expired. Click Game Results again.");
    }
    
    const text = formatManualResultsPage(manualData.results, page, manualData.timeLeft || "N/A");
    const keyboard = makeManualResPageKeyboard(page);
    
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    } catch (e) {
      logging.error(`Failed to edit results page: ${e.message}`);
    }
    return;
  }

  if (data.startsWith("manual_mult_")) {
    const parts = data.split("_");
    if (parts[2] === "custom") {
      const choice = parts[3];
      const amount = parseInt(parts[4]);
      userState[userId] = { state: "INPUT_MANUAL_CUSTOM_MULT", choice, amount };
      await sendMessageWithRetry(ctx, `${EMOJI.RISK} Enter custom multiplier (e.g., 10):`);
    } else {
      const mult = parseInt(parts[2]);
      const choice = parts[3];
      const amount = parseInt(parts[4]);
      await sendMessageWithRetry(ctx, `${EMOJI.RISK} Multiplier: *${mult}x*\n\n${EMOJI.WARNING} Confirm your bet:`, makeManualConfirmKeyboard(choice, amount, mult));
    }
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("manual_confirm_")) {
    const parts = data.split("_");
    const choice = parts[2];
    const amount = parseInt(parts[3]);
    const multiplier = parseInt(parts[4]);
    const totalAmount = amount * multiplier;
    const choiceText = choice === 'B' ? 'BIG' : 'SMALL';
    const gameType = userManualBet[userId]?.gameType || userSettings[userId]?.game_type || "TRX";
    const settings = userSettings[userId] || {};
    const isVirtual = settings.virtual_mode || false;
    
    await safeDeleteMessage(ctx);

    const selectType = getSelectMap(gameType, "BS")[choice];
    const { unitAmount, betCount, actualAmount } = computeBetDetails(totalAmount);
    
    if (isVirtual) {
      const resultNum = Math.floor(Math.random() * 10);
      const isWin = (choice === 'B' && resultNum >= 5) || (choice === 'S' && resultNum < 5);
      const resultBS = resultNum >= 5 ? "B" : "S";
      const profit = isWin ? (actualAmount * 0.96) : -actualAmount;

      if (isWin) {
        userStats[userId].virtual_balance = (userStats[userId].virtual_balance || 0) + (actualAmount * 0.96);
      } else {
        userStats[userId].virtual_balance = (userStats[userId].virtual_balance || 0) - actualAmount;
      }

      if (!userManualBets[userId]) userManualBets[userId] = [];
      userManualBets[userId].push({ choice, amount: actualAmount, result: `${resultNum}(${resultBS})`, isWin, profit });
      if (userManualBets[userId].length > 20) userManualBets[userId] = userManualBets[userId].slice(-20);

      const msg = isWin 
        ? `${EMOJI.WIN} *VICTORY!* +${(actualAmount * 0.96).toFixed(2)} Ks\n${STYLE.SEPARATOR}\nBet: ${choiceText} | Result: ${resultNum} (${resultBS})`
        : `${EMOJI.LOSS} *LOSS* -${actualAmount.toFixed(2)} Ks\n${STYLE.SEPARATOR}\nBet: ${choiceText} | Result: ${resultNum} (${resultBS})`;

      await sendMessageWithRetry(ctx, msg, makeManualBetMenuKeyboard());
    } else {
      const session = userSessions[userId];
      const issueRes = await getGameIssueRequest(session, gameType);
      if (!issueRes || issueRes.code !== 0) {
        return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to get current issue period.`, makeManualBetMenuKeyboard());
      }
      const currentIssue = issueRes.data?.issueNumber || issueRes.data?.predraw?.issueNumber;
      
      await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Placing bet...`);
      const betResp = await placeBetRequest(session, currentIssue, selectType, unitAmount, betCount, gameType, parseInt(userId));
      
      if (betResp.error || betResp.code !== 0) {
        return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Bet failed: ${betResp.msg || betResp.error}`, makeManualBetMenuKeyboard());
      }
      
      if (!userManualBets[userId]) userManualBets[userId] = [];
      userManualBets[userId].push({
        status: "PENDING",
        period: currentIssue,
        choice, 
        amount: actualAmount,
        result: null, 
        isWin: null, 
        profit: null
      });
      if (userManualBets[userId].length > 20) userManualBets[userId] = userManualBets[userId].slice(-20);

      await sendMessageWithRetry(ctx, 
        `${EMOJI.SUCCESS} *Bet Placed Successfully!*\n${STYLE.SEPARATOR}\nBet: ${choiceText} | Amount: ${actualAmount} Ks\nPeriod: \`${currentIssue}\`\n\n${EMOJI.WAIT} Result will be checked automatically...`, 
        makeManualBetMenuKeyboard()
      );
    }
    return;
  }

  if (data === "manual_cancel") {
    await safeDeleteMessage(ctx);
    await sendMessageWithRetry(ctx, `${EMOJI.INFO} Bet cancelled.`, makeManualBetMenuKeyboard());
    return;
  }

  if (data.startsWith("game_type:") && userManualBet[userId]) {
    const gameType = data.split(":")[1];
    if (gameType === "WINGO_SELECT") {
      await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select WINGO Game Type:`, makeWINGOSelectionKeyboard());
      await safeDeleteMessage(ctx);
      return;
    }
    userManualBet[userId].gameType = gameType;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} Manual Bet Game Type set to ${gameType}`, makeManualBetMenuKeyboard());
    await safeDeleteMessage(ctx);
    return;
  }
  
  logging.warning(`Unhandled callback: ${data}`);
  await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid action.`, makeMainKeyboard(true, isAdmin(userId)));
}

async function textMessageHandler(ctx) {
  const userId = ctx.from.id;
  const userName = ctx.from.username || ctx.from.first_name || "Unknown";
  const rawText = ctx.message.text;
  const isAdminUser = isAdmin(userId);
  
  const buttonText = rawText.trim();
 

  for (const [platformKey, platform] of Object.entries(PLATFORMS)) {
    if (buttonText === `${platform.color} ${platform.name}`) {
      userState[userId] = {
        state: "PLATFORM_SELECTED",
        platform: platformKey
      };
      await sendMessageWithRetry(ctx,
        `${platform.color} ${STYLE.BOLD(`Selected: ${platform.name}`)}\n\n` +
        `${EMOJI.LOGIN} Please login using the format:\n\n` +
        `${STYLE.CODE('phone')}\n` +
        `${STYLE.CODE('password')}`,
        Markup.keyboard([[`${EMOJI.BACK} Back`]]).resize().oneTime(false)
      );
      return;
    }
  }
  
  if (isAdminUser) {
    console.log(`User is admin, checking admin commands...`);
    
    if (buttonText === `${EMOJI.STATS} User Stats` || buttonText === "User Stats" || buttonText === "📊 User Stats") {
      console.log(`Admin pressed User Stats button`);
      ctx.message.text = "/users";
      await cmdUsersHandler(ctx);
      return;
    }
    
    if (buttonText === `${EMOJI.MENU} Allowed IDs` || buttonText === "Allowed IDs" || buttonText === "📋 Allowed IDs") {
      console.log(`Admin pressed Allowed IDs button`);
      ctx.message.text = "/showid";
      await cmdShowIdHandler(ctx);
      return;
    }
    
    if (buttonText === `${EMOJI.ADD} Add User` || buttonText === "Add User" || buttonText === "➕ Add User") {
      console.log(`Admin pressed Add User button`);
      userState[userId] = { state: "ADMIN_ADD_USER" };
      await sendMessageWithRetry(ctx, `${EMOJI.ADD} Enter user ID to add:`, makeAdminPanelKeyboard(userId));
      return;
    }
    
    if (buttonText === `${EMOJI.REMOVE} Remove User` || buttonText === "Remove User" || buttonText === "➖ Remove User") {
      console.log(`Admin pressed Remove User button`);
      userState[userId] = { state: "ADMIN_REMOVE_USER" };
      await sendMessageWithRetry(ctx, `${EMOJI.REMOVE} Enter user ID to remove:`, makeAdminPanelKeyboard(userId));
      return;
    }
    
    if (buttonText === `${EMOJI.BROADCAST} Broadcast` || buttonText === "Broadcast" || buttonText === "📢 Broadcast") {
      console.log(`Admin pressed Broadcast button`);
      userState[userId] = { state: "ADMIN_BROADCAST" };
      await sendMessageWithRetry(ctx, `${EMOJI.BROADCAST} Enter broadcast message:`, makeAdminPanelKeyboard(userId));
      return;
    }
    
    if (buttonText === "👥 Add Admin") {
      if (userId !== ADMIN_ID) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Only the owner can add admins.`, makeAdminPanelKeyboard(userId));
        return;
      }
      userState[userId] = { state: "ADMIN_ADD_ADMIN" };
      await sendMessageWithRetry(ctx, `${EMOJI.ADD} Enter Telegram user ID of the new admin:`, makeAdminPanelKeyboard(userId));
      return;
    }
    
    if (buttonText === "❌ Remove Admin") {
      if (userId !== ADMIN_ID) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Only the owner can remove admins.`, makeAdminPanelKeyboard(userId));
        return;
      }
      userState[userId] = { state: "ADMIN_REMOVE_ADMIN" };
      await sendMessageWithRetry(ctx, `${EMOJI.REMOVE} Enter Telegram user ID of the admin to remove:`, makeAdminPanelKeyboard(userId));
      return;
    }
    
    if (buttonText === "📋 List Admins") {
      if (userId !== ADMIN_ID) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Only the owner can view admin list.`, makeAdminPanelKeyboard(userId));
        return;
      }
      let msg = `${EMOJI.MENU} *Admin List*\n${STYLE.SEPARATOR}\n`;
      const sorted = Array.from(adminSet).sort((a,b)=>a-b);
      sorted.forEach(id => {
        msg += `${id === ADMIN_ID ? '👑 Owner' : '👤 Admin'}: \`${id}\`\n`;
      });
      msg += `\nTotal: ${sorted.length} admin(s)`;
      await sendMessageWithRetry(ctx, msg, makeAdminPanelKeyboard(userId));
      return;
    }
    
    if (buttonText === `${EMOJI.MENU} Main Menu` || buttonText === "Main Menu" || buttonText === "🏠 Main Menu") {
      console.log(`Admin pressed Main Menu button`);
      const loggedIn = !!userSessions[userId];
      await sendMessageWithRetry(ctx, `${EMOJI.MENU} Returning to main menu...`, makeMainKeyboard(loggedIn, isAdminUser));
      return;
    }
  }

  if (buttonText === `${EMOJI.ADMIN} Admin Panel` || buttonText === "Admin Panel" || buttonText === "👑 Admin Panel") {
    console.log(`User ${userName} (${userId}) pressed Admin Panel button`);
    if (isAdminUser) {
      await sendMessageWithRetry(ctx, `${EMOJI.ADMIN} ${STYLE.BOLD('Admin Panel')}\n\n${EMOJI.INFO} Select an admin action:`, makeAdminPanelKeyboard(userId));
    } else {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`, makeMainKeyboard(true, false));
    }
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_ADD_USER") {
    const userIdToAdd = rawText.trim();
    if (!userIdToAdd.match(/^\d+$/)) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid user ID.`, makeAdminPanelKeyboard(userId));
      return;
    }
    ctx.message.text = `/allow ${userIdToAdd}`;
    await cmdAllowHandler(ctx);
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_REMOVE_USER") {
    const userIdToRemove = rawText.trim();
    if (!userIdToRemove.match(/^\d+$/)) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid user ID.`, makeAdminPanelKeyboard(userId));
      return;
    }
    ctx.message.text = `/remove ${userIdToRemove}`;
    await cmdRemoveHandler(ctx);
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_BROADCAST") {
    const messageToSend = rawText.trim();
    if (!messageToSend) {
      await sendMessageWithRetry(ctx, `${EMOJI.INFO} Please provide a message.`, makeAdminPanelKeyboard(userId));
      delete userState[userId];
      return;
    }
    
    try {
      const telegramUserIds = Array.from(activeUsers);
      if (telegramUserIds.length === 0) {
        await sendMessageWithRetry(ctx, `${EMOJI.INFO} No active users.`, makeAdminPanelKeyboard(userId));
        delete userState[userId];
        return;
      }
      
      let successCount = 0;
      const broadcastMessage = `${EMOJI.BROADCAST} ${STYLE.BOLD('Admin Broadcast:')}\n\n${messageToSend}`;
      
      for (const telegramId of telegramUserIds) {
        try {
          await ctx.telegram.sendMessage(telegramId, broadcastMessage, { parse_mode: 'Markdown' });
          successCount++;
        } catch (error) {
          logging.error(`Failed to send message to user ${telegramId}: ${error.message}`);
        }
      }
      
      const resultMessage = `${EMOJI.SUCCESS} Message sent to ${successCount} users`;
      await sendMessageWithRetry(ctx, resultMessage, makeAdminPanelKeyboard(userId));
      logging.info(`Admin broadcast sent to ${successCount}/${telegramUserIds.length} users`);
    } catch (error) {
      logging.error(`Error sending admin broadcast: ${error.message}`);
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error sending message.`, makeAdminPanelKeyboard(userId));
    }
    
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_ADD_ADMIN") {
    const adminId = parseInt(rawText.trim());
    if (isNaN(adminId)) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid user ID.`, makeAdminPanelKeyboard(userId));
      delete userState[userId];
      return;
    }
    if (adminSet.has(adminId)) {
      await sendMessageWithRetry(ctx, `${EMOJI.INFO} User ${adminId} is already an admin.`, makeAdminPanelKeyboard(userId));
    } else {
      adminSet.add(adminId);
      saveAdmins();
      await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} Admin ${adminId} added.`, makeAdminPanelKeyboard(userId));
    }
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_REMOVE_ADMIN") {
    const adminId = parseInt(rawText.trim());
    if (isNaN(adminId)) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid user ID.`, makeAdminPanelKeyboard(userId));
      delete userState[userId];
      return;
    }
    if (adminId === ADMIN_ID) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Cannot remove the owner.`, makeAdminPanelKeyboard(userId));
      delete userState[userId];
      return;
    }
    if (!adminSet.has(adminId)) {
      await sendMessageWithRetry(ctx, `${EMOJI.INFO} User ${adminId} is not an admin.`, makeAdminPanelKeyboard(userId));
    } else {
      adminSet.delete(adminId);
      saveAdmins();
      await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} Admin ${adminId} removed.`, makeAdminPanelKeyboard(userId));
    }
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && rawText.startsWith("/allow ")) { await cmdAllowHandler(ctx); return; }
  if (isAdminUser && rawText.startsWith("/remove ")) { await cmdRemoveHandler(ctx); return; }
  if (isAdminUser && rawText.startsWith("/send ")) { await cmdSendHandler(ctx); return; }

  if (buttonText === `📖 Tutorial`) {
    const tutorialMessage = 
      `📖 *TUTORIAL — အသုံးပြုနည်း*\n` +
      `${STYLE.SEPARATOR}\n\n` +
      
      `*၁။ 🔐 Login လုပ်နည်း*\n` +
      `${STYLE.ITEM('Login Button ကို နှိပ်ပါ')}\n` +
      `${STYLE.ITEM('Site ၃ ခု ထဲက တစ်ခု ရွေးပါ')}\n` +
      `${STYLE.ITEM('Phone နံပါတ် ရိုက်ပါ')}\n` +
      `${STYLE.ITEM('Password ရိုက်ပါ')}\n` +
      `${STYLE.LAST_ITEM('ပြီးရင် Login လုပ်ပါမယ်')}\n\n` +
      
      `⚠️ *အရေးကြီး:* Phone နဲ့ Password ကို လိုင်းနှစ်လိုင်းနဲ့ ပို့ပါ\n` +
      `${STYLE.CODE('9782663611')}\n` +
      `${STYLE.CODE('Password123')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `*၂။ 🤹 Bet_Wrager သတ်မှတ်နည်း*\n` +
      `${STYLE.ITEM('Bet_Wrager Button ကို နှိပ်ပါ')}\n` +
      `${STYLE.ITEM('လောင်းချင်တဲ့ ငွေပမာဏတွေ ရိုက်ပါ')}\n` +
      `${STYLE.LAST_ITEM('ဥပမာ: 100, 200, 500')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `*၃။ 🎯 Game Type ရွေးနည်း*\n` +
      `${STYLE.ITEM('Game Type Button ကို နှိပ်ပါ')}\n` +
      `${STYLE.ITEM('TRX သို့ WINGO ရွေးပါ')}\n` +
      `${STYLE.LAST_ITEM('WINGO မှာ 30s, 1m, 3m, 5m ရှိတယ်')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `*၄။ 🧬 Strategy ရွေးနည်း*\n` +
      `${STYLE.ITEM('Strategy Button ကို နှိပ်ပါ')}\n` +
      `${STYLE.ITEM('ကြိုက်တဲ့ Strategy ရွေးပါ')}\n` +
      `${STYLE.LAST_ITEM('အကြံပြု: 𝔖𝔘𝔓𝔈ℜ, 𝕯𝖗𝖆𝖓𝖌𝖔𝖓 𝕱𝖎𝖗𝖊')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `*၅။ ▶️ Bot စတင်နည်း*\n` +
      `${STYLE.ITEM('Activate Button ကို နှိပ်ပါ')}\n` +
      `${STYLE.ITEM('Bot က Auto လောင်းပါမယ်')}\n` +
      `${STYLE.LAST_ITEM('ရပ်ချင်ရင် Deactivate နှိပ်ပါ')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `*၆။ 🛠 Risk Management*\n` +
      `${STYLE.ITEM('Profit Target — အမြတ်ရင် ရပ်')}\n` +
      `${STYLE.ITEM('Stop Loss — အရှုံးများရင် ရပ်')}\n` +
      `${STYLE.ITEM('Entry Layer — စတင်ချိန်')}\n` +
      `${STYLE.LAST_ITEM('SL Layer — ရှုံးရင် ရပ်ချိန်')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `*၇။ 📊 Daily Report*\n` +
      `${STYLE.ITEM('ဒီနေ့ Win/Loss ကြည့်နိုင်')}\n` +
      `${STYLE.ITEM('Win Rate % ကြည့်နိုင်')}\n` +
      `${STYLE.LAST_ITEM('Profit/Loss ကြည့်နိုင်')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `*၈။ 🤹 Manual Bet*\n` +
      `${STYLE.ITEM('Manual Bet Button ကို နှိပ်ပါ')}\n` +
      `${STYLE.ITEM('BIG/SMALL ရွေးပါ')}\n` +
      `${STYLE.ITEM('ပမာဏ ရွေးပါ')}\n` +
      `${STYLE.LAST_ITEM('Multiplier ရွေးပြီး အတည်ပြုပါ')}\n\n` +
      `${STYLE.SEPARATOR}\n\n` +

      `💡 *အကြံပြုချက်:*\n` +
      `${STYLE.ITEM('Virtual Mode နဲ့ အရင် စမ်းပါ')}\n` +
      `${STYLE.ITEM('Strategy ကောင်းတာ သေချာမှ Real သုံး')}\n` +
      `${STYLE.LAST_ITEM('Profit Target သတ်မှတ်ထားပါ')}\n\n` +
      
      `${STYLE.SEPARATOR}\n` +
      `${EMOJI.INFO} *Support:* @Super\_Rikooo`;

    await sendMessageWithRetry(ctx, tutorialMessage, makeMainKeyboard(!!userSessions[userId], isAdminUser));
    return;
  }

  if (buttonText === `📅 Daily Report`) {
    const stats = safeGetUserStats(userId);
    const todayStr = new Date().toDateString();
    
    let wins = 0;
    let losses = 0;
    let profit = 0;
    
    if (stats.daily_date === todayStr) {
      wins = stats.daily_wins || 0;
      losses = stats.daily_losses || 0;
      profit = stats.daily_profit || 0;
    } else {
      stats.daily_date = todayStr;
      stats.daily_wins = 0;
      stats.daily_losses = 0;
      stats.daily_profit = 0;
      stats.daily_start_balance = 0;
    }
    
    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
    
    const reportMessage = 
      `📅 *DAILY REPORT*\n` +
      `${STYLE.SEPARATOR}\n` +
      `📆 Date: ${todayStr}\n\n` +
      `🏆 Wins: ${wins}\n` +
      `❌ Losses: ${losses}\n` +
      `📈 Win Rate: ${winRate}%\n` +
      `💰 Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} Ks\n` +
      `📊 Total Bets: ${total}\n` +
      `${STYLE.SEPARATOR}`;
      
    await sendMessageWithRetry(ctx, reportMessage, makeMainKeyboard(true, isAdminUser));
    return;
  }
  
  if (buttonText === `${EMOJI.INFO} Account Info`) {
    await showUserStats(ctx, userId);
    return;
  }
  
  if (buttonText === `${EMOJI.TARGET} Game Type`) {
    await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select Game Type:`, makeGameTypeKeyboard());
    return;
  }
  
  if (buttonText === `${EMOJI.TARGET} Profit Target`) {
    userState[userId] = { state: "INPUT_PROFIT_TARGET" };
    await sendMessageWithRetry(ctx, `${EMOJI.TARGET} ${STYLE.BOLD('Profit Target Settings')}\n\n${EMOJI.INFO} Please enter your desired profit target amount (in Ks):\n\n${STYLE.CODE('Example: 10000')}`);
    return;
  }
  
  if (buttonText === `${EMOJI.STOP} Stop Loss`) {
    userState[userId] = { state: "INPUT_STOP_LIMIT" };
    await sendMessageWithRetry(ctx, `${EMOJI.STOP} ${STYLE.BOLD('Stop Loss Settings')}\n\n${EMOJI.INFO} Please enter your stop loss limit amount (in Ks):\n\n${STYLE.CODE('Example: 5000')}`);
    return;
  }
  
  if (buttonText === `${EMOJI.LAYER} Entry Layer`) {
    await sendMessageWithRetry(ctx, `${EMOJI.LAYER} ${STYLE.BOLD('Entry Layer Settings')}\n\n${EMOJI.INFO} Select when to start betting:`, makeEntryLayerKeyboard());
    return;
  }
  
  if (buttonText === `${EMOJI.WARNING} Bet SL`) {
    await sendMessageWithRetry(ctx, `${EMOJI.WARNING} ${STYLE.BOLD('Stop Loss Layer Settings')}\n\n${EMOJI.INFO} Select how many consecutive losses before skipping bets:`, makeSLLayerKeyboard());
    return;
  }
  
  if (buttonText === `${EMOJI.BACK} Back`) {
    if (userState[userId]?.state === "PLATFORM_SELECTED") {
      const loggedIn = !!userSessions[userId];
      await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning to main menu...`, makeMainKeyboard(loggedIn, isAdminUser));
      delete userState[userId];
      return;
    }
    
    const isOnPlatformKeyboard = Object.values(PLATFORMS).some(p =>
      buttonText.includes(p.name) || buttonText.includes(p.color)
    );
    
    if (isOnPlatformKeyboard) {
      const loggedIn = !!userSessions[userId];
      await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning to main menu...`, makeMainKeyboard(loggedIn, isAdminUser));
    } else {
      const loggedIn = !!userSessions[userId];
      if (!loggedIn) {
        await sendMessageWithRetry(ctx,
          `${EMOJI.LOGIN} ${STYLE.BOLD('Select Platform')}\n\n` +
          `${EMOJI.INFO} Choose your lottery platform:`,
          makePlatformKeyboard()
        );
      } else {
        await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning to main menu...`, makeMainKeyboard(loggedIn, isAdminUser));
      }
    }
    
    delete userState[userId];
    return;
  }
  
  if (buttonText === `${EMOJI.RISK} Risk Management`) {
    await sendMessageWithRetry(ctx, `${EMOJI.RISK} ${STYLE.BOLD('Risk Management')}\n\n${EMOJI.INFO} Configure your betting safety settings below:`, makeRiskManagementSubmenu());
    return;
  }
  
  if (buttonText === `${EMOJI.START} Activate`) {
  console.log(`[USER_ACTIVITY] User ${userName} (ID: ${userId}) started the bot`);
  
  const settings = userSettings[userId] || {};
  
  if (!settings.bet_sizes) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please set Bet_Wrager first!`, makeMainKeyboard(true, isAdminUser));
    return;
  }
  
  if (settings.running) {
    await sendMessageWithRetry(ctx, `${EMOJI.INFO} Bot is already running!`, makeMainKeyboard(true, isAdminUser));
    return;
  }
  
  settings.running = true;
  settings.consecutive_errors = 0;
  saveUserSettings();
  
  const entryLayer = settings.layer_limit || 1;
  
  if (entryLayer === 2) {
    settings.entry_layer_state = { waiting_for_lose: true };
  } else if (entryLayer === 3) {
    settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
  }
  
  if (settings.strategy === "TREND_FOLLOW") {
    const betType = settings.bet_type || "BS";
    if (betType === "COLOR") {
      settings.color_trend_state = { last_result: null };
    } else {
      settings.trend_state = { last_result: null, skip_mode: false };
    }
  }
  
  if (settings.strategy === "ALTERNATE") {
    settings.alternate_state = { last_result: null, skip_mode: false };
  }
  
  if (settings.strategy === "CYBER_SNIPER") {
    settings.cyber_sniper_state = {
      active: false,
      direction: null,
      sequence: [],
      step: 0,
      hit_count: 0,
      got_same_result: false
    };
  }
  if (settings.strategy === "COLOR_SNIPER") {
    settings.color_sniper_state = {
      active: false,
      step: 0,
      hit_count: 0,
      waiting_for_trigger: true
    };
  }
  if (settings.strategy === "TIME_WARP" && !settings.time_warp_pos) {
    settings.time_warp_pos = 8;
  }

    if (settings.strategy === "POTATO_GRA") {     
    settings.potato_gra_last_login = Date.now();   
  }   
  
  if (["CYBER_SNIPER", "COLOR_SNIPER"].includes(settings.strategy)) {
    settings.sniper_hit_count = 0;
    settings.sniper_loss_count = 0;
    logging.info(`Reset sniper counters for ${settings.strategy}`);
  }
  
  delete userSkippedBets[userId];
  userShouldSkipNext[userId] = false;
  delete userSLSkipWaitingForWin[userId];
  userWaitingForResult[userId] = false;
  
  bettingWorker(userId, ctx, ctx.telegram);
  return;
}
  
  if (buttonText === `${EMOJI.STOP} Deactivate`) {
    console.log(`[USER_ACTIVITY] User ${userName} (ID: ${userId}) stopped the bot`);
    
    const settings = userSettings[userId] || {};
    if (!settings.running) {
      await sendMessageWithRetry(ctx, `${EMOJI.INFO} Bot is not running!`, makeMainKeyboard(true, isAdminUser));
      return;
    }
    
    userStopInitiated[userId] = true;
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    delete userSLSkipWaitingForWin[userId];
    
    saveUserSettings();
    
    if (settings.strategy === "TREND_FOLLOW") {
      delete settings.trend_state;
      delete settings.color_trend_state;
    }
    if (settings.strategy === "ALTERNATE") {
      delete settings.alternate_state;
    }
    
    if (settings.strategy === "CYBER_SNIPER") {
      delete settings.cyber_sniper_state;
    }
    if (settings.strategy === "COLOR_SNIPER") {
      delete settings.color_sniper_state;
    }
    if (settings.strategy === "TIME_WARP") {
      delete settings.time_warp_pos;
    }
    
    let totalProfit = 0;
    let balanceText = "";
    
    if (settings.virtual_mode) {
      totalProfit = (userStats[userId]?.virtual_balance || 0) - (userStats[userId]?.initial_balance || 0);
      balanceText = `${EMOJI.VIRTUAL} Virtual Balance: ${(userStats[userId]?.virtual_balance || 0).toFixed(2)} Ks\n`;
    } else {
      totalProfit = userStats[userId]?.profit || 0;
      try {
        const session = userSessions[userId];
        const finalBalance = await getBalance(session, parseInt(userId));
        balanceText = `${EMOJI.BALANCE} Final Balance: ${finalBalance?.toFixed(2) || '0.00'} Ks\n`;
      } catch (error) {
        balanceText = `${EMOJI.BALANCE} Final Balance: Unknown\n`;
      }
    }
    
    let profitIndicator = "";
    if (totalProfit > 0) profitIndicator = "+";
    else if (totalProfit < 0) profitIndicator = "-";
    
    delete userStats[userId];
    settings.martin_index = 0;
    settings.dalembert_units = 1;
    settings.custom_index = 0;
    
    saveUserSettings();
    
    const message = `${EMOJI.STOP} ${STYLE.BOLD('SESSION TERMINATED')}\n${balanceText}${EMOJI.PROFIT} Total Profit: ${profitIndicator}${totalProfit.toFixed(2)} Ks`;
    await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdminUser));
    return;
  }
  
  if (buttonText === `${EMOJI.BETWRAGER} Bet_Wrager`) {
    userState[userId] = { state: "INPUT_BET_SIZES" };
    await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Enter Bet_Wragers (one per line):\n${STYLE.CODE('100')}\n${STYLE.CODE('200')}\n${STYLE.CODE('500')}`, makeMainKeyboard(true, isAdminUser));
    return;
  }
  
  if (buttonText === `${EMOJI.STRATEGY} Strategy`) {
    await sendMessageWithRetry(ctx, `${EMOJI.STRATEGY} Choose strategy:`, makeStrategyKeyboard(userId));
    return;
  }
  
  if (buttonText === `${EMOJI.SETTINGS} Betting Settings`) {
    await sendMessageWithRetry(ctx, `${EMOJI.SETTINGS} Choose Betting Strategy`, makeBettingStrategyKeyboard());
    return;
  }
  
  if (buttonText === `${EMOJI.GAME} Game Mode`) {
    await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select Mode:`, makeModeSelectionKeyboard());
    return;
  }
  
  if (buttonText === `${EMOJI.COLOR} Bet Type`) {
    const currentBetType = userSettings[userId]?.bet_type || "BS";
    const typeText = currentBetType === "COLOR" ? "Color" : "Big/Small";
    
    await sendMessageWithRetry(ctx,
      `${EMOJI.COLOR} ${STYLE.BOLD('Bet Type Settings')}\n\n` +
      `${EMOJI.INFO} Current: ${STYLE.BOLD(typeText)}\n` +
      `${EMOJI.INFO} Select your preferred betting mode:`,
      makeBetTypeKeyboard()
    );
    return;
  }
  
  if (buttonText === `${EMOJI.LOGIN} Login`) {
    await sendMessageWithRetry(ctx,
      `${EMOJI.LOGIN} ${STYLE.BOLD('Select Platform')}\n\n` +
      `${EMOJI.INFO} Choose your lottery platform:`,
      makePlatformKeyboard()
    );
    return;
  }
  
  if (buttonText === `${EMOJI.LOGOUT} Re-Login`) {
    delete userSessions[userId];
    delete userGameInfo[userId];
    delete userStats[userId];
    delete userLastResults[userId];
    delete userPlatforms[userId];
    
    await sendMessageWithRetry(ctx,
      `${EMOJI.LOGIN} ${STYLE.BOLD('Select Platform')}\n\n` +
      `${EMOJI.INFO} Choose your lottery platform:`,
      makePlatformKeyboard()
    );
    return;
  }
  
  const text = normalizeText(rawText);
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
  if (userState[userId]?.state === "PLATFORM_SELECTED" && lines.length >= 2) {
    const platformKey = userState[userId].platform;
    const platform = PLATFORMS[platformKey];
    const phone = lines[0];
    const password = lines[1];
    
    // 🔒 Auto Delete Password Message (Security)
    try {
      await ctx.deleteMessage();
      logging.info(`Auto-deleted login credentials message for user ${userId}`);
    } catch (delErr) {
      logging.warning(`Could not delete login message: ${delErr.message}`);
    }
    
    logging.info(`User ${userId} attempted login`);
    activeUsers.add(userId);
    
    await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Logging into ${platform.name}...`);
    
    userPlatforms[userId] = platformKey;
    
    const { response: res, session } = await loginRequest(phone, password, platform.baseUrl);
    
    if (session) {
      const userInfo = await getUserInfo(session, userId);
      if (userInfo && userInfo.user_id) {
        const gameUserId = userInfo.user_id;
        
        if (!allowedsixlotteryIds.has(gameUserId)) {
          await sendMessageWithRetry(ctx,
            `${EMOJI.ERROR} ${STYLE.BOLD('အသုံးပြုခွင့်မရရှိသေးပါ.')}\n\n` +
            `${EMOJI.INFO} ကျေးဇူးပြုပြီး အက်ဒမင်ကိုဆက်သွယ်ပါ @Super\_Rikooo:\n` +
            `${STYLE.ITEM(`Your ID: ${STYLE.CODE(gameUserId.toString())}`)}`,
            makeMainKeyboard(false, isAdminUser)
          );
          return;
        }
        
        userSessions[userId] = session;
        userGameInfo[userId] = userInfo;
        userTemp[userId] = { password, platform: platformKey };
        userCredentials[userId] = { phone, password, platform: platformKey };
        
        userAllResults[userId] = [];
        userLastResults[userId] = [];
        
        const balance = await getBalance(session, parseInt(userId));
        
        if (!userSettings[userId]) {
          userSettings[userId] = {
            platform: platformKey,
            strategy: "TREND_FOLLOW",
            betting_strategy: "Martingale",
            game_type: platformKey === "CKLOTTERY" ? "TRX" : "WINGO",
            bet_type: "BS",
            martin_index: 0,
            dalembert_units: 1,
            pattern_index: 0,
            running: false,
            consecutive_losses: 0,
            current_layer: 0,
            skip_betting: false,
            sl_layer: null,
            original_martin_index: 0,
            original_dalembert_units: 1,
            original_custom_index: 0,
            custom_index: 0,
            layer_limit: 1,
            virtual_mode: false,
            bs_sb_wait_count: 0,
            bb_ss_wait_count: 0
          };
        } else {
          userSettings[userId].platform = platformKey;
        }
        
        if (!userStats[userId]) {
          userStats[userId] = { 
            start_balance: parseFloat(balance || 0), 
            profit: 0.0,
            daily_date: new Date().toDateString(),
            daily_wins: 0,
            daily_losses: 0,
            daily_profit: 0,
            daily_start_balance: 0
          };
        }
        
        const balanceDisplay = balance !== null ? balance : 0.0;
        
        const loginMessage =
          `${platform.color} ${STYLE.BOLD(`${platform.name} Login Successful`)}\n\n` +
          `${EMOJI.USER} ${STYLE.BOLD('User ID:')} ${STYLE.CODE(userInfo.user_id.toString())}\n` +
          `${EMOJI.BALANCE} ${STYLE.BOLD('Balance:')} ${balanceDisplay} Ks\n\n` +
          `${EMOJI.START} Welcome back! Configure your settings.`;
        
        await sendMessageWithRetry(ctx, loginMessage, makeMainKeyboard(true, isAdminUser));
        
        if (userSettings[userId].bet_sizes && userSettings[userId].pattern) {
          await showUserStats(ctx, userId);
        }
        
        saveUserSettings();
      } else {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login failed: Could not get user info`, makeMainKeyboard(false, isAdminUser));
      }
    } else {
      const msg = res.msg || "Login failed";
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login error: ${msg}`, makeMainKeyboard(false, isAdminUser));
    }
    
    delete userState[userId];
    delete userTemp[userId];
    return;
  }

    if (buttonText === `${EMOJI.BET} Manual Bet`) {
    if (!await checkUserAuthorized(ctx)) return;
    userManualBet[userId] = { gameType: userSettings[userId]?.game_type || "TRX" };
    await sendMessageWithRetry(ctx, `${EMOJI.BET} ${STYLE.BOLD('MANUAL BET MODE')}\n\n${EMOJI.INFO} Select BIG or SMALL to start betting.`, makeManualBetMenuKeyboard());
    return;
  }

  if (buttonText === `${EMOJI.RESULT} BIG`) {
    await sendMessageWithRetry(ctx, `${EMOJI.RESULT} Selected: *BIG*\n\n${EMOJI.BALANCE} Select Bet Amount:`, makeManualAmountKeyboard('B'));
    return;
  }

  if (buttonText === `${EMOJI.RESULT} SMALL`) {
    await sendMessageWithRetry(ctx, `${EMOJI.RESULT} Selected: *SMALL*\n\n${EMOJI.BALANCE} Select Bet Amount:`, makeManualAmountKeyboard('S'));
    return;
  }

  if (buttonText === `${EMOJI.BALANCE} My Balance`) {
    if (!userSessions[userId]) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login first!`);
    await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Fetching balance...`);
    const balance = await getBalance(userSessions[userId], parseInt(userId));
    const balText = balance !== null ? `${balance.toFixed(2)} Ks` : "Failed to fetch";
    await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} *Current Balance:*\n\n${STYLE.SEPARATOR}\n${EMOJI.REAL} ${balText}`, makeManualBetMenuKeyboard());
    return;
  }

  if (buttonText === `${EMOJI.RESULTSBS} Game Results`) {
    if (!userSessions[userId]) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login first!`);
    await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Fetching last 40 results...`);
    
    const gameType = userManualBet[userId]?.gameType || userSettings[userId]?.game_type || "TRX";
    
    const [timeLeft, results] = await Promise.all([
      getNextPeriodTimeLeft(userSessions[userId], gameType),
      getGameResults40(userSessions[userId], gameType)
    ]);
    
    if (!results || results.length === 0) {
      return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to fetch results or no history yet.`, makeManualBetMenuKeyboard());
    }
    
    userManualBet[userId].results = results;
    userManualBet[userId].resPage = 1;
    userManualBet[userId].timeLeft = timeLeft;
    
    const msg = formatManualResultsPage(results, 1, timeLeft);
    await sendMessageWithRetry(ctx, msg, makeManualResPageKeyboard(1));
    return;
  }

  if (buttonText === `${EMOJI.BET} My Bets`) {
    const bets = userManualBets[userId] || [];
    if (bets.length === 0) return await sendMessageWithRetry(ctx, `${EMOJI.INFO} No manual bets placed yet.`, makeManualBetMenuKeyboard());
    
    let msg = `${EMOJI.BET} *My Recent 20 Bets*\n${STYLE.SEPARATOR}\n`;
    bets.slice(-20).reverse().forEach(b => {
      const choiceText = b.choice === 'B' ? 'BIG' : 'SMALL';
      
      if (b.status === "PENDING") {
        msg += `⏳ ${choiceText} | ${b.amount} Ks | Per: ${b.period ? String(b.period).slice(-8) : '...'} | *PENDING*\n`;
      } else {
        const statusEmoji = b.isWin ? EMOJI.WIN : EMOJI.LOSS;
        msg += `${statusEmoji} ${choiceText} | ${b.amount} Ks | Res: ${b.result} | P/L: ${b.isWin ? '+' : '-'}${b.profit.toFixed(2)} Ks\n`;
      }
    });
    await sendMessageWithRetry(ctx, msg, makeManualBetMenuKeyboard());
    return;
  }


  if (buttonText === `${EMOJI.GAME} Game Type` && userManualBet[userId]) {
    await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select Game Type for Manual Bet:`, makeGameTypeKeyboard());
    return;
  }

  if (buttonText === `${EMOJI.BACK} Back` && userManualBet[userId]) {
    delete userManualBet[userId];
    const loggedIn = !!userSessions[userId];
    await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning to main menu...`, makeMainKeyboard(loggedIn, isAdminUser));
    return;
  }

  if (userState[userId]?.state === "INPUT_MANUAL_CUSTOM_AMT") {
    const amt = parseInt(text);
    if (isNaN(amt) || amt <= 0) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid amount.`);
    const choice = userState[userId].choice;
    delete userState[userId];
    await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Amount: *${amt}*\n\n${EMOJI.RISK} Select Multiplier:`, makeManualMultiplierKeyboard(choice, amt));
    return;
  }

  if (userState[userId]?.state === "INPUT_MANUAL_CUSTOM_MULT") {
    const mult = parseInt(text);
    if (isNaN(mult) || mult <= 0) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid multiplier.`);
    const { choice, amount } = userState[userId];
    delete userState[userId];
    await sendMessageWithRetry(ctx, `${EMOJI.RISK} Multiplier: *${mult}x*\n\n${EMOJI.WARNING} Confirm your bet:`, makeManualConfirmKeyboard(choice, amount, mult));
    return;
  }
  
  const currentState = userState[userId]?.state;
  
  if (currentState === "INPUT_VIRTUAL_BALANCE") {
    const balance = parseFloat(text);
    if (isNaN(balance) || balance <= 0) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid balance amount.`);
      return;
    }
    const settings = userSettings[userId];
    settings.virtual_mode = true;
    settings.virtual_balance = balance;
    
    if (!userStats[userId]) {
      userStats[userId] = {};
    }
    userStats[userId].virtual_balance = balance;
    userStats[userId].initial_balance = balance;
    
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Virtual Mode:')} ${balance} Ks`, makeMainKeyboard(true, isAdminUser));
    delete userState[userId];
    saveUserSettings();
    return;
  }
  
  if (!await checkUserAuthorized(ctx) && text.toLowerCase() !== "login") {
    return;
  }
  
  if (currentState === "INPUT_BET_SIZES") {
    const betSizes = lines.filter(s => s.match(/^\d+$/)).map(Number);
    if (betSizes.length === 0) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} No valid numbers entered.`, makeMainKeyboard(true, isAdminUser));
      return;
    }
    
    const settings = userSettings[userId];
    if (settings.betting_strategy === "D'Alembert" && betSizes.length > 1) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} D'Alembert requires only ONE Bet_Wrager.`, makeMainKeyboard(true, isAdminUser));
      return;
    }
    
    userSettings[userId].bet_sizes = betSizes;
    userSettings[userId].dalembert_units = 1;
    userSettings[userId].martin_index = 0;
    userSettings[userId].custom_index = 0;
    
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Bet_Wrager set:')} ${betSizes.join(',')} Ks`, makeMainKeyboard(true, isAdminUser));
    delete userState[userId];
    saveUserSettings();
  } else if (currentState === "INPUT_BS_PATTERN") {
    const pattern = text.toUpperCase().trim();
    
    if (!pattern) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Pattern cannot be empty.`, makeMainKeyboard(true, isAdminUser));
      return;
    }
    
    if (!pattern.split('').every(c => c === 'B' || c === 'S')) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Pattern can only contain 'B' and 'S'.`, makeMainKeyboard(true, isAdminUser));
      return;
    }
    
    if (pattern.length < 3) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Pattern must be at least 3 characters long.`, makeMainKeyboard(true, isAdminUser));
      return;
    }
    
    userSettings[userId].pattern = pattern;
    userSettings[userId].pattern_index = 0;
    
    await sendMessageWithRetry(ctx,
      `${EMOJI.SUCCESS} ${STYLE.BOLD('BS Pattern set:')} ${pattern}\n` +
      `${EMOJI.INFO} Pattern length: ${pattern.length} characters\n` +
      `${EMOJI.INFO} First bet will be: ${pattern[0]}`,
      makeMainKeyboard(true, isAdminUser)
    );
    
    delete userState[userId];
    saveUserSettings();
  } else if (currentState === "INPUT_PROFIT_TARGET") {
    const target = parseFloat(text);
    if (isNaN(target) || target <= 0) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid profit target.`, makeRiskManagementSubmenu());
      return;
    }
    userSettings[userId].target_profit = target;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('TARGET set:')} ${target} Ks`, makeRiskManagementSubmenu());
    delete userState[userId];
    saveUserSettings();
  } else if (currentState === "INPUT_STOP_LIMIT") {
    const stopLoss = parseFloat(text);
    if (isNaN(stopLoss) || stopLoss <= 0) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid stop loss.`, makeRiskManagementSubmenu());
      return;
    }
    userSettings[userId].stop_loss = stopLoss;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('STOP LOSS set:')} ${stopLoss} Ks`, makeRiskManagementSubmenu());
    delete userState[userId];
    saveUserSettings();
  } else {
    if (userSessions[userId] && text.trim() !== "") {
      if (text.length > 1 && !text.match(/^\/[a-zA-Z]/)) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Unknown command.`, makeMainKeyboard(true, isAdminUser));
      }
    }
  }
}

async function showUserStats(ctx, userId) {
  const session = userSessions[userId];
  const userInfo = userGameInfo[userId];
  
  if (!userInfo) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to get user info. Please login first.`, makeMainKeyboard(!!userSessions[userId], isAdmin(userId)));
    return;
  }
  
  const settings = userSettings[userId] || {};
  const betSizes = settings.bet_sizes || [];
  const strategy = settings.strategy || "TREND_FOLLOW";
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const gameType = settings.game_type || "TRX";
  const betType = settings.bet_type || "BS";
  const virtualMode = settings.virtual_mode || false;
  const profitTarget = settings.target_profit;
  const stopLoss = settings.stop_loss;
  const slLayer = settings.sl_layer;
  const layerLimit = settings.layer_limit || 1;
  
  const platformKey = settings.platform || "CKLOTTERY";
  const platform = PLATFORMS[platformKey];
  
  let balance;
  
  if (virtualMode) {
    balance = userStats[userId]?.virtual_balance || settings.virtual_balance || 0;
  } else {
    if (session) {
      balance = await getBalance(session, parseInt(userId));
    } else {
      balance = userInfo.balance || 0;
    }
  }
  
  let betOrder = "N/A";
  if (strategy === "BS_ORDER") {
    betOrder = settings.pattern || "BS-Order";
  }
  
  let entryLayerDesc = layerLimit === 1 ? "Bet immediately" : layerLimit === 2 ? "Wait for 1 lose" : "Wait for 2 loses";
  let slStatus = userSLSkipWaitingForWin[userId] ? " (Waiting for Skip Win)" : (settings.consecutive_losses > 0 ? ` (${settings.consecutive_losses}/${slLayer || 0})` : "");
  
  const modeText = virtualMode ? `${EMOJI.VIRTUAL} Virtual Mode` : `${EMOJI.REAL} Real Mode`;
  const betTypeText = betType === "COLOR" ? `Color` : `Big/Small`;
  
  const safeText = (text) => {
    if (text === null || text === undefined) return '';
    return escapeMarkdown(String(text));
  };
  
  const betWrager = betSizes.join(', ') || 'Not set';
  
  const infoText =
    `${EMOJI.STATS} *ACCOUNT INFO*\n` +
    `${STYLE.SEPARATOR}\n\n` +
    
    `${EMOJI.USER} *USER DETAILS*\n` +
    `${STYLE.ITEM(`User ID: \`${safeText(userInfo.user_id?.toString() || 'N/A')}\``)}\n` +
    `${STYLE.ITEM(`Username: ${safeText(userInfo.nickname || userInfo.username || 'Unknown')}`)}\n` +
    `${STYLE.ITEM(`Platform: ${safeText(platform.name)} ${platform.color}`)}\n` +
    `${STYLE.LAST_ITEM(`Login Date: ${safeText(userInfo.login_date || 'N/A')}`)}\n` +
    `${STYLE.SEPARATOR}\n\n` +
    
    `${EMOJI.BALANCE} *BALANCE INFORMATION*\n` +
    `${STYLE.ITEM(`Balance: ${safeText(balance !== null && balance !== undefined ? balance.toFixed(2) : 'N/A')} Ks`)}\n` +
    `${STYLE.ITEM(`Mode: ${safeText(modeText)}`)}\n` +
    `${STYLE.SEPARATOR}\n\n` +
    
    `${EMOJI.GAME} *GAME SETTINGS*\n` +
    `${STYLE.ITEM(`Game: ${safeText(gameType)}`)}\n` +
    `${STYLE.ITEM(`Type: ${safeText(betTypeText)}`)}\n` +
    `${STYLE.ITEM(`Strategy: ${safeText(strategy)}`)}\n` +
    `${STYLE.ITEM(`Betting: ${safeText(bettingStrategy)}`)}\n` +
    `${STYLE.LAST_ITEM(`Bet_Wragers: ${safeText(betWrager)}`)}\n` +
    `${STYLE.SEPARATOR}\n\n` +
    
    `${EMOJI.STRATEGY} *STRATEGY CONFIGURATION*\n` +
    `${STYLE.ITEM(`BS Order: ${safeText(betOrder)}`)}\n` +
    `${STYLE.ITEM(`Profit Target: ${safeText(profitTarget ? profitTarget + ' Ks' : 'Not set')}`)}\n` +
    `${STYLE.ITEM(`Stop Loss: ${safeText(stopLoss ? stopLoss + ' Ks' : 'Not set')}`)}\n` +
    `${STYLE.ITEM(`SL Layer: ${safeText(slLayer ? slLayer + ' Layer' + slStatus : 'Not set')}`)}\n` +
    `${STYLE.LAST_ITEM(`Entry Layer: ${safeText(layerLimit.toString())} - ${safeText(entryLayerDesc)}`)}\n` +
    `${STYLE.SEPARATOR}\n\n` +
    `${EMOJI.START} *BOT STATUS*\n` +
    `${STYLE.LAST_ITEM(`Status: ${settings.running ? '🟢 ' : '🔴 '}${safeText(settings.running ? 'Running' : 'Stopped')}`)}\n\n` +
    `${STYLE.SEPARATOR}`;
  
  await sendMessageWithRetry(ctx, infoText, makeMainKeyboard(!!userSessions[userId], isAdmin(userId)));
}

const BASE_URL = PLATFORMS["CKLOTTERY"].baseUrl;
const BOT_TOKEN = "8552889682:AAEj5t1a1uG4AXwSxPanHrVVYKHj6AGwutg";
const ADMIN_ID = 8890310029;
const IGNORE_SSL = true;
const WIN_LOSE_CHECK_INTERVAL = 2;
const MAX_RESULT_WAIT_TIME = 60;
const MAX_BALANCE_RETRIES = 10;
const BALANCE_RETRY_DELAY = 5;
const BALANCE_API_TIMEOUT = 20000;
const BET_API_TIMEOUT = 30000;
const MAX_BET_RETRIES = 5;
const BET_RETRY_DELAY = 5;
const MAX_CONSECUTIVE_ERRORS = 10;
const MESSAGE_RATE_LIMIT_SECONDS = 10;
const MAX_TELEGRAM_RETRIES = 3;
const TELEGRAM_RETRY_DELAY = 2000;
const DEFAULT_BS_ORDER = "BSBBSBSSSB";
const SNIPER_NOTIFICATIONS = true;
const SNIPER_MAX_HITS = 2;
const SNIPER_MAX_LOSSES = 4;

const DEFAULT_DIGIT_MAPPING = {
  '0': 'B', '1': 'B', '2': 'S', '3': 'S', '4': 'B',
  '5': 'S', '6': 'S', '7': 'B', '8': 'B', '9': 'S',
  'DEFAULT': 'B'
};

function main() {
  loadAdmins();
  loadAllowedUsers();
  loadUserSettings();
  
  const bot = new Telegraf(BOT_TOKEN);
  
  bot.start(cmdStartHandler);
  bot.command('allow', cmdAllowHandler);
  bot.command('remove', cmdRemoveHandler);
  bot.command('showid', cmdShowIdHandler);
  bot.command('users', cmdUsersHandler);
  bot.command('send', cmdSendHandler);
  bot.on('callback_query', callbackQueryHandler);
  bot.on('text', textMessageHandler);
  
  winLoseChecker(bot).catch(error => {
    logging.error(`Win/lose checker failed: ${error.message}`);
  });
  
  bot.launch().then(() => {
    logging.info('🚀 Bot started successfully');
  }).catch(error => {
    logging.error(`❌ Bot failed to start: ${error.message}`);
  });

  const PORT = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Telegram Auto Bet Bot is running!\n');
  });
  server.listen(PORT, '0.0.0.0', () => {
    logging.info(`🌐 Web server listening on port ${PORT}`);
  });

  process.on('uncaughtException', (error) => {
    logging.error(`💥 Uncaught Exception: ${error.message}`);
    logging.error(error.stack);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logging.error(`⚠️ Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });
  
  process.once('SIGINT', () => {
    saveUserSettings();
    bot.stop('SIGINT');
  });
  
  process.once('SIGTERM', () => {
    saveUserSettings();
    bot.stop('SIGTERM');
  });
}

if (require.main === module) {
  main();
}
