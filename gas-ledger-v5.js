// ========================================
// KINTSU LEDGER — GAS v5
// ========================================

// ========================================
// CUSTOM MENU (onOpen trigger)
// ========================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KINTSU Ledger')
    .addItem('\u2795 \u0e40\u0e1e\u0e34\u0e48\u0e21\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23', 'showAddBankDialog')
    .addItem('\u{1f4c4} \u0e19\u0e33\u0e40\u0e02\u0e49\u0e32 Statement \u0e01\u0e23\u0e30\u0e17\u0e1a\u0e22\u0e2d\u0e14', 'showImportStatementDialog')
    .addSeparator()
    .addItem('\u27f3 Sync \u0e40\u0e14\u0e37\u0e2d\u0e19\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19', 'syncCurrentMonth')
    .addItem('\u27f3 Sync \u0e21\u0e35.\u0e04. 2026', 'syncMar')
    .addItem('\u27f3 Sync \u0e40\u0e21.\u0e22. 2026', 'syncApr')
    .addItem('\u27f3 Sync \u0e1e.\u0e04. 2026', 'syncMay')
    .addItem('\u27f3 Sync \u0e21\u0e34.\u0e22. 2026', 'syncJun')
    .addSeparator()
    .addItem('\u27f3 Sync \u0e07\u0e1a\u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19', 'syncFinancials')
    .addItem('\u2699\ufe0f Full Setup (\u0e17\u0e38\u0e01\u0e40\u0e14\u0e37\u0e2d\u0e19)', 'fullSetup')
    .addItem('\u{1f9f9} Cleanup Old Sheets', 'cleanupOldSheets')
    .addToUi();
}

// ========================================
// ADD BANK ACCOUNT DIALOG
// ========================================
function showAddBankDialog() {
  var html = HtmlService.createHtmlOutputFromFile('AddBankDialog')
    .setWidth(420)
    .setHeight(340);
  SpreadsheetApp.getUi().showModalDialog(html, '\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23');
}

function addBankAccountFromDialog(bankName, accountNumber, accountName, isIncome) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var sh = ss.getSheetByName('\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23');

  if (!sh) {
    sh = ss.insertSheet('\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23');
    sh.getRange(1, 1, 1, 5).setValues([['\u0e23\u0e2b\u0e31\u0e2a\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23', '\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e23\u0e31\u0e1a\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 (\u2713)']]);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f3f3f3');
    sh.getRange(1, 5).setBackground('#fff2cc');
  }

  var data = sh.getDataRange().getValues();

  // Check for duplicate
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === bankName.toLowerCase() &&
        String(data[i][2]).trim() === accountNumber.trim()) {
      return {ok: false, msg: '\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e19\u0e35\u0e49\u0e21\u0e35\u0e2d\u0e22\u0e39\u0e48\u0e41\u0e25\u0e49\u0e27'};
    }
  }

  // Find next available code
  var usedCodes = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) usedCodes[String(data[i][0])] = true;
  }
  var nextCode = 1201;
  while (usedCodes[String(nextCode)]) nextCode++;

  var newRow = sh.getLastRow() + 1;
  sh.getRange(newRow, 1, 1, 5).setValues([[String(nextCode), bankName, accountNumber, accountName, isIncome ? '\u2713' : '']]);
  if (isIncome) sh.getRange(newRow, 5).setBackground('#b6d7a8');

  // Reset cache
  _bankCache = null;
  _incomeBankCode = null;

  return {ok: true, code: String(nextCode)};
}

function syncCurrentMonth() {
  var bkk = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
  var month = Utilities.formatDate(bkk, 'Asia/Bangkok', 'yyyy-MM');
  syncLedger(month);
  buildTrialBalance('2026');
  buildPnL('2026');
  buildBalanceSheet('2026');
  SpreadsheetApp.getUi().alert('Sync \u0e40\u0e14\u0e37\u0e2d\u0e19 ' + month + ' \u0e40\u0e2a\u0e23\u0e47\u0e08');
}

var LEDGER_ID = '1ql0rr6VVMt3S3lcKx97rmnUn9i-tWn7TUQv6HaQ_fCw';
var EXPORT_BASE = 'https://kintsu-accounting.vercel.app/api/export';
var EXPORT_KEY = 'kintsu2026';

// Static Account Map (non-bank accounts)
var ACCOUNT_MAP = {
  '1100': 'เงินสด',
  '1300': 'ลูกหนี้การค้า',
  '1400': 'สินค้าคงเหลือ',
  '1510': 'สินทรัพย์ถาวร - ครัวและอุปกรณ์',
  '1520': 'สินทรัพย์ถาวร - เฟอร์นิเจอร์และตกแต่ง',
  '1530': 'สินทรัพย์ถาวร - ยานพาหนะ',
  '1540': 'สินทรัพย์ถาวร - อื่นๆ',
  '1600': 'ค่าเสื่อมราคาสะสม',
  '2100': 'เจ้าหนี้การค้า',
  '2200': 'เงินกู้ระยะสั้น',
  '2300': 'เงินกู้ระยะยาว',
  '3100': 'ทุน',
  '3200': 'กำไรสะสม',
  '4100': 'รายได้ Dine-in (Foodstory)',
  '4200': 'รายได้ Dine-in (Papaya)',
  '4300': 'รายได้ GrabFood',
  '4400': 'รายได้ Takeaway',
  '5100': 'ต้นทุนอาหาร (Food Cost)',
  '5200': 'ต้นทุนแรงงาน (Labor Cost)',
  '6990': 'ค่าใช้จ่ายอื่นๆ'
};

var EXPENSE_CODE_START = 6100;
var EXPENSE_CODE_STEP = 10;

// ========================================
// BANK ACCOUNT CACHE
// ========================================
var _bankCache = null;
var _incomeBankCode = null;

function _resetCache() {
  _bankCache = null;
  _incomeBankCode = null;
}

function loadBankCache() {
  if (_bankCache) return _bankCache;
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var sh = ss.getSheetByName('ผังบัญชีธนาคาร');
  if (!sh) { _bankCache = []; return _bankCache; }
  var data = sh.getDataRange().getValues();
  var cache = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    cache.push({
      code: String(row[0]),
      bank_name: String(row[1] || ''),
      account_number: String(row[2] || ''),
      account_name: String(row[3] || ''),
      is_income: String(row[4] || '').indexOf('\u2713') >= 0
    });
  }
  _bankCache = cache;
  return cache;
}

function getIncomeBankCode() {
  if (_incomeBankCode) return _incomeBankCode;
  var cache = loadBankCache();
  for (var i = 0; i < cache.length; i++) {
    if (cache[i].is_income) {
      _incomeBankCode = cache[i].code;
      return _incomeBankCode;
    }
  }
  _incomeBankCode = cache.length > 0 ? cache[0].code : '1201';
  return _incomeBankCode;
}

function getBankCode(bankName) {
  var cache = loadBankCache();
  if (!bankName) return getIncomeBankCode();
  var bn = bankName.toUpperCase().replace(/\s+/g, '');
  for (var i = 0; i < cache.length; i++) {
    var cn = cache[i].bank_name.toUpperCase().replace(/\s+/g, '');
    if (cn === bn || bn.indexOf(cn) >= 0 || cn.indexOf(bn) >= 0) {
      return cache[i].code;
    }
  }
  // keyword fallback
  var kw = { 'KBANK': '', '\u0e01\u0e2a\u0e34\u0e01\u0e23': '', 'TTB': '', '\u0e17\u0e2b\u0e32\u0e23\u0e44\u0e17\u0e22': '', 'BBL': '', '\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e': '', 'SCB': '', '\u0e44\u0e17\u0e22\u0e1e\u0e32\u0e13\u0e34\u0e0a\u0e22\u0e4c': '', 'KTB': '', '\u0e01\u0e23\u0e38\u0e07\u0e44\u0e17\u0e22': '', 'BAY': '', '\u0e01\u0e23\u0e38\u0e07\u0e28\u0e23\u0e35': '' };
  for (var i = 0; i < cache.length; i++) {
    var cn = cache[i].bank_name.toUpperCase().replace(/\s+/g, '');
    if (bn.indexOf('KBANK') >= 0 || bn.indexOf('\u0e01\u0e2a\u0e34\u0e01\u0e23') >= 0) {
      if (cn.indexOf('KBANK') >= 0 || cn.indexOf('\u0e01\u0e2a\u0e34\u0e01\u0e23') >= 0) return cache[i].code;
    }
    if (bn.indexOf('TTB') >= 0 || bn.indexOf('\u0e17\u0e2b\u0e32\u0e23\u0e44\u0e17\u0e22') >= 0) {
      if (cn.indexOf('TTB') >= 0 || cn.indexOf('\u0e17\u0e2b\u0e32\u0e23\u0e44\u0e17\u0e22') >= 0) return cache[i].code;
    }
  }
  return getIncomeBankCode();
}

function acctName(code) {
  var cache = loadBankCache();
  var c = String(code);
  for (var i = 0; i < cache.length; i++) {
    if (cache[i].code === c) {
      return cache[i].bank_name + (cache[i].account_number ? ' ' + cache[i].account_number : '');
    }
  }
  return ACCOUNT_MAP[c] || c;
}

// ========================================
// SETUP: ผังบัญชีธนาคาร
// FIX: uses bank_name|account_number as unique key (not bank_name alone)
// ========================================
function setupBankAccounts(bankAccounts) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var sh = ss.getSheetByName('\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23');

  // Read existing assignments: key = "bank_name|account_number" → {code, is_income}
  var existingMap = {};
  if (sh) {
    var old = sh.getDataRange().getValues();
    for (var i = 1; i < old.length; i++) {
      var r = old[i];
      if (!r[0]) continue;
      var key = (String(r[1]) + '|' + String(r[2])).toLowerCase();
      existingMap[key] = {
        code: String(r[0]),
        is_income: String(r[4] || '').indexOf('\u2713') >= 0
      };
    }
  }

  if (!sh) {
    sh = ss.insertSheet('\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23');
  } else {
    sh.clearContents();
  }

  // Headers
  sh.getRange(1, 1, 1, 5).setValues([['\u0e23\u0e2b\u0e31\u0e2a\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23', '\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e23\u0e31\u0e1a\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 (\u2713)']]);
  sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f3f3f3');

  // Collect used codes from existing assignments
  var usedCodes = {};
  for (var i = 0; i < bankAccounts.length; i++) {
    var ba = bankAccounts[i];
    var key = (ba.bank_name + '|' + (ba.account_number || '')).toLowerCase();
    if (existingMap[key]) {
      usedCodes[existingMap[key].code] = true;
    }
  }

  var nextCodeNum = 1201;
  var rows = [];

  // Track which keys come from API (so we know which are manual-only)
  var apiKeys = {};
  for (var i = 0; i < bankAccounts.length; i++) {
    var k = (bankAccounts[i].bank_name + '|' + (bankAccounts[i].account_number || '')).toLowerCase();
    apiKeys[k] = true;
  }

  // Build rows for API accounts (in API order)
  for (var i = 0; i < bankAccounts.length; i++) {
    var ba = bankAccounts[i];
    var key = (ba.bank_name + '|' + (ba.account_number || '')).toLowerCase();
    var code, isIncome;

    if (existingMap[key]) {
      code = existingMap[key].code;
      isIncome = existingMap[key].is_income;
    } else {
      while (usedCodes[String(nextCodeNum)]) nextCodeNum++;
      code = String(nextCodeNum);
      usedCodes[code] = true;
      nextCodeNum++;
      isIncome = false;
    }

    rows.push([code, ba.bank_name, ba.account_number || '', ba.account_name || '', isIncome ? '\u2713' : '']);
  }

  // Preserve manually-added entries NOT in API data
  for (var key in existingMap) {
    if (!apiKeys[key]) {
      var ex = existingMap[key];
      // Reconstruct from original sheet row
      if (sh) {
        var old2 = sh.getDataRange().getValues();
        for (var i = 1; i < old2.length; i++) {
          var rowKey = (String(old2[i][1]) + '|' + String(old2[i][2])).toLowerCase();
          if (rowKey === key) {
            rows.push([ex.code, String(old2[i][1]), String(old2[i][2]), String(old2[i][3]), ex.is_income ? '\u2713' : '']);
            break;
          }
        }
      }
    }
  }

  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, 5).setValues(rows);
    // Highlight income column header
    sh.getRange(1, 5).setBackground('#fff2cc');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][4] === '\u2713') {
        sh.getRange(i + 2, 5).setBackground('#b6d7a8');
      }
    }
  }

  sh.setColumnWidth(1, 90);
  sh.setColumnWidth(2, 130);
  sh.setColumnWidth(3, 150);
  sh.setColumnWidth(4, 200);
  sh.setColumnWidth(5, 110);

  // Reset cache so next reads pick up new data
  _bankCache = null;
  _incomeBankCode = null;
}

// ========================================
// EXPENSE CATEGORY → CODE MAP
// ========================================
function getExpenseCategoryMap(categories) {
  var map = {};
  var code = EXPENSE_CODE_START;
  var expCats = (categories || []).filter(function(c) { return c.type !== 'income'; });
  for (var i = 0; i < expCats.length; i++) {
    map[expCats[i].name] = String(code);
    code += EXPENSE_CODE_STEP;
  }
  return map;
}

// ========================================
// ASSET CATEGORY → ACCOUNT CODE
// ========================================
function getAssetCode(category) {
  if (!category) return '1540';
  var c = category.toLowerCase();
  if (c.indexOf('\u0e04\u0e23\u0e31\u0e27') >= 0 || c.indexOf('\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c') >= 0 || c.indexOf('kitchen') >= 0 || c.indexOf('equipment') >= 0) return '1510';
  if (c.indexOf('\u0e40\u0e1f\u0e2d\u0e23\u0e4c') >= 0 || c.indexOf('\u0e15\u0e01\u0e41\u0e15\u0e48\u0e07') >= 0 || c.indexOf('furniture') >= 0 || c.indexOf('decoration') >= 0) return '1520';
  if (c.indexOf('\u0e22\u0e32\u0e19') >= 0 || c.indexOf('\u0e23\u0e16') >= 0 || c.indexOf('vehicle') >= 0) return '1530';
  return '1540';
}

// ========================================
// CHART OF ACCOUNTS
// ========================================
function setupChartOfAccounts(categories) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var sh = ss.getSheetByName('\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35');
  if (!sh) sh = ss.insertSheet('\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35');
  else sh.clearContents();

  sh.getRange(1, 1, 1, 3).setValues([['\u0e23\u0e2b\u0e31\u0e2a\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17']]).setFontWeight('bold').setBackground('#d9d9d9');

  var rows = [];
  rows.push(['1000', '== \u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c ==', '\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d']);
  rows.push(['1100', '\u0e40\u0e07\u0e34\u0e19\u0e2a\u0e14', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);

  var banks = loadBankCache();
  for (var i = 0; i < banks.length; i++) {
    rows.push([banks[i].code, banks[i].bank_name + (banks[i].account_number ? ' ' + banks[i].account_number : ''), '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);
  }

  rows.push(['1300', '\u0e25\u0e39\u0e01\u0e2b\u0e19\u0e35\u0e49\u0e01\u0e32\u0e23\u0e04\u0e49\u0e32', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);
  rows.push(['1400', '\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e04\u0e07\u0e40\u0e2b\u0e25\u0e37\u0e2d', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);
  rows.push(['1510', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c\u0e16\u0e32\u0e27\u0e23 - \u0e04\u0e23\u0e31\u0e27\u0e41\u0e25\u0e30\u0e2d\u0e38\u0e1b\u0e01\u0e23\u0e13\u0e4c', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);
  rows.push(['1520', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c\u0e16\u0e32\u0e27\u0e23 - \u0e40\u0e1f\u0e2d\u0e23\u0e4c\u0e19\u0e34\u0e40\u0e08\u0e2d\u0e23\u0e4c\u0e41\u0e25\u0e30\u0e15\u0e01\u0e41\u0e15\u0e48\u0e07', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);
  rows.push(['1530', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c\u0e16\u0e32\u0e27\u0e23 - \u0e22\u0e32\u0e19\u0e1e\u0e32\u0e2b\u0e19\u0e30', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);
  rows.push(['1540', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c\u0e16\u0e32\u0e27\u0e23 - \u0e2d\u0e37\u0e48\u0e19\u0e46', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c']);
  rows.push(['1600', '\u0e04\u0e48\u0e32\u0e40\u0e2a\u0e37\u0e48\u0e2d\u0e21\u0e23\u0e32\u0e04\u0e32\u0e2a\u0e30\u0e2a\u0e21', '\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c (-)']);
  rows.push(['2000', '== \u0e2b\u0e19\u0e35\u0e49\u0e2a\u0e34\u0e19 ==', '\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d']);
  rows.push(['2100', '\u0e40\u0e08\u0e49\u0e32\u0e2b\u0e19\u0e35\u0e49\u0e01\u0e32\u0e23\u0e04\u0e49\u0e32', '\u0e2b\u0e19\u0e35\u0e49\u0e2a\u0e34\u0e19']);
  rows.push(['2200', '\u0e40\u0e07\u0e34\u0e19\u0e01\u0e39\u0e49\u0e23\u0e30\u0e22\u0e30\u0e2a\u0e31\u0e49\u0e19', '\u0e2b\u0e19\u0e35\u0e49\u0e2a\u0e34\u0e19']);
  rows.push(['2300', '\u0e40\u0e07\u0e34\u0e19\u0e01\u0e39\u0e49\u0e23\u0e30\u0e22\u0e30\u0e22\u0e32\u0e27', '\u0e2b\u0e19\u0e35\u0e49\u0e2a\u0e34\u0e19']);
  rows.push(['3000', '== \u0e2a\u0e48\u0e27\u0e19\u0e02\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e16\u0e37\u0e2d\u0e2b\u0e38\u0e49\u0e19 ==', '\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d']);
  rows.push(['3100', '\u0e17\u0e38\u0e19', '\u0e2a\u0e48\u0e27\u0e19\u0e1c\u0e39\u0e49\u0e16\u0e37\u0e2d\u0e2b\u0e38\u0e49\u0e19']);
  rows.push(['3200', '\u0e01\u0e33\u0e44\u0e23\u0e2a\u0e30\u0e2a\u0e21', '\u0e2a\u0e48\u0e27\u0e19\u0e1c\u0e39\u0e49\u0e16\u0e37\u0e2d\u0e2b\u0e38\u0e49\u0e19']);
  rows.push(['4000', '== \u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 ==', '\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d']);
  rows.push(['4100', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Dine-in (Foodstory)', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49']);
  rows.push(['4200', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Dine-in (Papaya)', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49']);
  rows.push(['4300', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 GrabFood', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49']);
  rows.push(['4400', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Takeaway', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49']);
  rows.push(['5000', '== \u0e15\u0e49\u0e19\u0e17\u0e38\u0e19\u0e02\u0e32\u0e22 ==', '\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d']);
  rows.push(['5100', '\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19\u0e2d\u0e32\u0e2b\u0e32\u0e23 (Food Cost)', '\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19']);
  rows.push(['5200', '\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19\u0e41\u0e23\u0e07\u0e07\u0e32\u0e19 (Labor Cost)', '\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19']);
  rows.push(['6000', '== \u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22 ==', '\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d']);

  var catMap = getExpenseCategoryMap(categories);
  for (var catName in catMap) {
    rows.push([catMap[catName], catName, '\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22']);
  }
  rows.push(['6990', '\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22\u0e2d\u0e37\u0e48\u0e19\u0e46', '\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22']);

  sh.getRange(2, 1, rows.length, 3).setValues(rows);

  // Style header section rows
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][2] === '\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d') {
      sh.getRange(i + 2, 1, 1, 3).setFontWeight('bold').setBackground('#efefef');
    }
  }

  sh.autoResizeColumns(1, 3);
}

// ========================================
// BUILD JOURNAL ENTRIES
// ========================================
function buildJournalEntries(data) {
  var entries = [];
  var catMap = getExpenseCategoryMap(data.categories || []);

  // ---- SALES ----
  var sales = data.sales || [];
  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    var incCode = getIncomeBankCode();

    // Foodstory Dine-in
    var fsRev = Math.round((s.dine_in || 0) * 100);
    if (fsRev !== 0) {
      var fsCash     = Math.round((s.fs_cash || 0) * 100);
      var fsPP       = Math.round((s.fs_promptpay || 0) * 100);
      var fsCard     = Math.round((s.fs_credit_card || 0) * 100);
      var fsXfer     = Math.round((s.fs_company_transfer || 0) * 100);
      var fsOther    = fsRev - fsCash - fsPP - fsCard - fsXfer;

      if (fsCash  !== 0) entries.push({date: s.date, ref: 'FS-CASH',     desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Foodstory \u0e40\u0e07\u0e34\u0e19\u0e2a\u0e14',     dr: '1100',   cr: '4100', satang: fsCash});
      if (fsPP    !== 0) entries.push({date: s.date, ref: 'FS-PP',       desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Foodstory \u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e40\u0e1e\u0e22\u0e4c',   dr: incCode, cr: '4100', satang: fsPP});
      if (fsCard  !== 0) entries.push({date: s.date, ref: 'FS-CARD',     desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Foodstory \u0e1a\u0e31\u0e15\u0e23\u0e40\u0e04\u0e23\u0e14\u0e34\u0e15',   dr: incCode, cr: '4100', satang: fsCard});
      if (fsXfer  !== 0) entries.push({date: s.date, ref: 'FS-XFER',     desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Foodstory \u0e42\u0e2d\u0e19',         dr: incCode, cr: '4100', satang: fsXfer});
      if (Math.abs(fsOther) > 50) entries.push({date: s.date, ref: 'FS-OTHER', desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Foodstory \u0e2d\u0e37\u0e48\u0e19\u0e46', dr: incCode, cr: '4100', satang: fsOther});
    }

    // Papaya Dine-in
    var papRev = Math.round((s.papaya || 0) * 100);
    if (papRev !== 0) {
      var papCash  = Math.round((s.papaya_cash || 0) * 100);
      var papPP    = Math.round((s.papaya_promptpay || 0) * 100);
      var papCard  = Math.round((s.papaya_credit_card || 0) * 100);
      var papXfer  = Math.round((s.papaya_company_transfer || 0) * 100);
      var papOther = papRev - papCash - papPP - papCard - papXfer;

      if (papCash  !== 0) entries.push({date: s.date, ref: 'PAP-CASH',  desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Papaya \u0e40\u0e07\u0e34\u0e19\u0e2a\u0e14',   dr: '1100',   cr: '4200', satang: papCash});
      if (papPP    !== 0) entries.push({date: s.date, ref: 'PAP-PP',    desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Papaya \u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e40\u0e1e\u0e22\u0e4c', dr: incCode, cr: '4200', satang: papPP});
      if (papCard  !== 0) entries.push({date: s.date, ref: 'PAP-CARD',  desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Papaya \u0e1a\u0e31\u0e15\u0e23\u0e40\u0e04\u0e23\u0e14\u0e34\u0e15', dr: incCode, cr: '4200', satang: papCard});
      if (papXfer  !== 0) entries.push({date: s.date, ref: 'PAP-XFER',  desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Papaya \u0e42\u0e2d\u0e19',       dr: incCode, cr: '4200', satang: papXfer});
      if (Math.abs(papOther) > 50) entries.push({date: s.date, ref: 'PAP-OTHER', desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Papaya \u0e2d\u0e37\u0e48\u0e19\u0e46', dr: incCode, cr: '4200', satang: papOther});
    }

    // GrabFood
    var grabGross = Math.round((s.grabfood_gross || 0) * 100);
    var grabGP    = Math.round((s.grabfood_gp   || 0) * 100);
    var grabNet   = Math.round((s.grabfood_net  || 0) * 100);
    if (grabGross !== 0) {
      entries.push({date: s.date, ref: 'GRAB',    desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 GrabFood (Net)',         dr: incCode, cr: '4300', satang: grabNet});
      if (grabGP !== 0) {
        var gpCode = catMap['\u0e04\u0e48\u0e32 GP GrabFood'] || catMap['GP GrabFood'] || '6990';
        entries.push({date: s.date, ref: 'GRAB-GP', desc: '\u0e04\u0e48\u0e32 GP GrabFood 30%', dr: gpCode, cr: incCode, satang: grabGP});
      }
    }

    // Takeaway
    var tkRev = Math.round((s.takeaway || 0) * 100);
    if (tkRev !== 0) {
      entries.push({date: s.date, ref: 'TK', desc: '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49 Takeaway', dr: incCode, cr: '4400', satang: tkRev});
    }
  }

  // ---- EXPENSES ----
  var expenses = data.expenses || [];
  for (var i = 0; i < expenses.length; i++) {
    var e = expenses[i];
    var amtSatang = Math.round((e.amount || 0) * 100);
    if (amtSatang === 0) continue;

    var expCode = catMap[e.category] || '6990';
    var payCode;
    var pm = (e.payment_method || '').toLowerCase();
    if (pm === 'cash' || pm.indexOf('\u0e2a\u0e14') >= 0) {
      payCode = '1100';
    } else {
      payCode = getBankCode(e.bank);
    }

    var desc = e.category;
    if (e.recipient) desc += ' (' + e.recipient + ')';
    if (e.note) desc += ' — ' + e.note;

    entries.push({date: e.date, ref: 'EXP', desc: desc, dr: expCode, cr: payCode, satang: amtSatang});
  }

  // ---- BANK TRANSFERS ----
  var transfers = data.transfers || [];
  for (var i = 0; i < transfers.length; i++) {
    var t = transfers[i];
    var tSatang = Math.round((t.amount || 0) * 100);
    if (tSatang === 0) continue;

    var fromCode = getBankCode(t.from_bank);
    var toCode   = getBankCode(t.to_bank);
    var desc = '\u0e42\u0e2d\u0e19\u0e40\u0e07\u0e34\u0e19 ' + (t.from_bank || '') + ' \u2192 ' + (t.to_bank || '');
    if (t.note) desc += ' ' + t.note;

    entries.push({date: t.date, ref: 'TFR', desc: desc, dr: toCode, cr: fromCode, satang: tSatang});
  }

  // ---- ASSETS (filter by sync month only) ----
  var syncMonth = data.month || '';
  var assets = data.assets || [];
  for (var i = 0; i < assets.length; i++) {
    var a = assets[i];
    if (!a.purchase_date || a.purchase_date.substring(0, 7) !== syncMonth) continue;

    var pSatang = Math.round((a.purchase_amount || 0) * 100);
    if (pSatang === 0) continue;

    var assetCode = getAssetCode(a.category);
    var payCode;
    var pm = (a.payment_method || '').toLowerCase();
    if (pm === 'cash' || pm.indexOf('\u0e2a\u0e14') >= 0) {
      payCode = '1100';
    } else if (a.payment_bank) {
      payCode = getBankCode(a.payment_bank);
    } else {
      payCode = getIncomeBankCode();
    }

    var desc = '\u0e0b\u0e37\u0e49\u0e2d\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c ' + a.name;
    if (a.category) desc += ' (' + a.category + ')';

    entries.push({date: a.purchase_date, ref: 'ASSET', desc: desc, dr: assetCode, cr: payCode, satang: pSatang});
  }

  // Sort by date then ref
  entries.sort(function(a, b) {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  return entries;
}

// ========================================
// WRITE JOURNAL SHEET
// ========================================
function writeJournal(ss, month, entries) {
  var shName = '\u0e2a\u0e21\u0e38\u0e14\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19 ' + month;
  var sh = ss.getSheetByName(shName);
  if (!sh) sh = ss.insertSheet(shName);
  else sh.clearContents();

  var headers = ['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14', 'DR \u0e23\u0e2b\u0e31\u0e2a', 'DR \u0e0a\u0e37\u0e48\u0e2d', 'CR \u0e23\u0e2b\u0e31\u0e2a', 'CR \u0e0a\u0e37\u0e48\u0e2d', '\u0e08\u0e33\u0e19\u0e27\u0e19 (\u0e1a\u0e32\u0e17)'];
  sh.getRange(1, 1, 1, 8).setValues([headers]).setFontWeight('bold').setBackground('#d9d9d9');

  if (entries.length === 0) {
    sh.getRange(2, 1).setValue('\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25');
    return;
  }

  var rows = entries.map(function(e) {
    return [e.date, e.ref, e.desc, e.dr, acctName(e.dr), e.cr, acctName(e.cr), e.satang / 100];
  });

  sh.getRange(2, 1, rows.length, 8).setValues(rows);
  sh.getRange(2, 8, rows.length, 1).setNumberFormat('#,##0.00');

  var totalRow = rows.length + 2;
  sh.getRange(totalRow, 7).setValue('\u0e23\u0e27\u0e21').setFontWeight('bold');
  sh.getRange(totalRow, 8).setFormula('=SUM(H2:H' + (rows.length + 1) + ')').setNumberFormat('#,##0.00').setFontWeight('bold');

  sh.setColumnWidth(1, 90);
  sh.setColumnWidth(2, 80);
  sh.setColumnWidth(3, 280);
  sh.setColumnWidth(4, 70);
  sh.setColumnWidth(5, 160);
  sh.setColumnWidth(6, 70);
  sh.setColumnWidth(7, 160);
  sh.setColumnWidth(8, 110);
}

// ========================================
// BANK RECONCILIATION (takes pre-built entries)
// ========================================
function buildBankReconciliation(ss, month, entries) {
  var banks = loadBankCache();

  // Always include cash (1100) + all bank accounts
  var allAccounts = [{code: '1100', label: '\u0e40\u0e07\u0e34\u0e19\u0e2a\u0e14'}];
  for (var i = 0; i < banks.length; i++) {
    allAccounts.push({
      code: banks[i].code,
      label: banks[i].bank_name + (banks[i].account_number ? ' ' + banks[i].account_number : '')
    });
  }

  for (var a = 0; a < allAccounts.length; a++) {
    var acct = allAccounts[a];
    var shName = '\u0e01\u0e23\u0e30\u0e17\u0e1a ' + acct.label + ' ' + month;
    var sh = ss.getSheetByName(shName);
    if (!sh) sh = ss.insertSheet(shName);
    else sh.clearContents();

    // Calculate totals from journal entries
    var moneyIn = 0, moneyOut = 0;
    var inList = [], outList = [];
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      if (e.dr === acct.code) { moneyIn += e.satang; inList.push(e); }
      if (e.cr === acct.code) { moneyOut += e.satang; outList.push(e); }
    }

    // Header
    sh.getRange(1, 1).setValue('\u0e01\u0e23\u0e30\u0e17\u0e1a\u0e22\u0e2d\u0e14: ' + acct.label).setFontWeight('bold').setFontSize(13);
    sh.getRange(2, 1).setValue('\u0e40\u0e14\u0e37\u0e2d\u0e19: ' + month);

    // Summary table
    sh.getRange(4, 1, 1, 2).setValues([['\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23', '\u0e08\u0e33\u0e19\u0e27\u0e19 (\u0e1a\u0e32\u0e17)']]).setFontWeight('bold').setBackground('#d9d9d9');

    sh.getRange(5, 1).setValue('\u0e22\u0e2d\u0e14\u0e22\u0e01\u0e21\u0e32 (\u0e01\u0e23\u0e2d\u0e01\u0e40\u0e2d\u0e07)');
    sh.getRange(5, 2).setValue(0).setBackground('#fff2cc').setNumberFormat('#,##0.00');

    sh.getRange(6, 1).setValue('\u0e40\u0e07\u0e34\u0e19\u0e40\u0e02\u0e49\u0e32 (\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a)');
    sh.getRange(6, 2).setValue(moneyIn / 100).setNumberFormat('#,##0.00');

    sh.getRange(7, 1).setValue('\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e2d\u0e01 (\u0e08\u0e32\u0e01\u0e23\u0e30\u0e1a\u0e1a)');
    sh.getRange(7, 2).setValue(moneyOut / 100).setNumberFormat('#,##0.00');

    sh.getRange(8, 1).setValue('\u0e22\u0e2d\u0e14\u0e04\u0e07\u0e40\u0e2b\u0e25\u0e37\u0e2d (\u0e23\u0e30\u0e1a\u0e1a)').setFontWeight('bold');
    sh.getRange(8, 2).setFormula('=B5+B6-B7').setNumberFormat('#,##0.00').setFontWeight('bold');
    sh.getRange(8, 1, 1, 2).setBackground('#e8f0fe');

    sh.getRange(10, 1).setValue('\u0e22\u0e2d\u0e14\u0e15\u0e32\u0e21 Statement (\u0e01\u0e23\u0e2d\u0e01\u0e40\u0e2d\u0e07)');
    sh.getRange(10, 2).setValue(0).setBackground('#fff2cc').setNumberFormat('#,##0.00');

    sh.getRange(11, 1).setValue('\u0e1c\u0e25\u0e15\u0e48\u0e32\u0e07 (\u0e23\u0e30\u0e1a\u0e1a - Statement)').setFontWeight('bold');
    sh.getRange(11, 2).setFormula('=B8-B10').setNumberFormat('#,##0.00').setFontWeight('bold');

    // Conditional format: ผลต่าง ≠ 0 → red
    var rule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberNotEqualTo(0)
      .setBackground('#f4cccc')
      .setRanges([sh.getRange(11, 2)])
      .build();
    sh.setConditionalFormatRules([rule]);

    // Note for manual cells
    sh.getRange(13, 1).setValue('\u0e2b\u0e21\u0e32\u0e22\u0e40\u0e2b\u0e15\u0e38: \u0e40\u0e0b\u0e25\u0e2a\u0e35\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e07 = \u0e01\u0e23\u0e2d\u0e01\u0e40\u0e2d\u0e07').setFontStyle('italic').setFontColor('#888888');

    // Detail: money in
    var inStartRow = 15;
    sh.getRange(inStartRow, 1, 1, 3).setValues([['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e08\u0e33\u0e19\u0e27\u0e19 (\u0e1a\u0e32\u0e17)', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14']]).setFontWeight('bold').setBackground('#b6d7a8');
    sh.getRange(inStartRow - 1, 1).setValue('\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19\u0e40\u0e02\u0e49\u0e32').setFontWeight('bold');

    var inRow = inStartRow + 1;
    for (var j = 0; j < inList.length; j++) {
      sh.getRange(inRow, 1).setValue(inList[j].date);
      sh.getRange(inRow, 2).setValue(inList[j].satang / 100).setNumberFormat('#,##0.00');
      sh.getRange(inRow, 3).setValue(inList[j].desc);
      inRow++;
    }

    // Detail: money out
    var outStartRow = Math.max(inRow + 2, inStartRow + 15);
    sh.getRange(outStartRow - 1, 1).setValue('\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e2d\u0e01').setFontWeight('bold');
    sh.getRange(outStartRow, 1, 1, 3).setValues([['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e08\u0e33\u0e19\u0e27\u0e19 (\u0e1a\u0e32\u0e17)', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14']]).setFontWeight('bold').setBackground('#f4cccc');

    var outRow = outStartRow + 1;
    for (var j = 0; j < outList.length; j++) {
      sh.getRange(outRow, 1).setValue(outList[j].date);
      sh.getRange(outRow, 2).setValue(outList[j].satang / 100).setNumberFormat('#,##0.00');
      sh.getRange(outRow, 3).setValue(outList[j].desc);
      outRow++;
    }

    sh.setColumnWidth(1, 100);
    sh.setColumnWidth(2, 130);
    sh.setColumnWidth(3, 280);
  }
}

// ========================================
// COLLECT ENTRIES FROM ALL MONTH JOURNALS
// ========================================
function collectAllEntries(ss, year) {
  var allEntries = [];
  var months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  for (var m = 0; m < months.length; m++) {
    var jsh = ss.getSheetByName('\u0e2a\u0e21\u0e38\u0e14\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19 ' + year + '-' + months[m]);
    if (!jsh) continue;
    var data = jsh.getDataRange().getValues();
    for (var r = 1; r < data.length - 1; r++) {
      if (!data[r][0] || !data[r][3]) continue;
      var amt = parseFloat(data[r][7]) || 0;
      if (amt === 0) continue;
      allEntries.push({dr: String(data[r][3]), cr: String(data[r][5]), amount: amt});
    }
  }
  return allEntries;
}

function buildAcctTotals(allEntries) {
  var totals = {};
  for (var i = 0; i < allEntries.length; i++) {
    var e = allEntries[i];
    if (!totals[e.dr]) totals[e.dr] = {dr: 0, cr: 0};
    if (!totals[e.cr]) totals[e.cr] = {dr: 0, cr: 0};
    totals[e.dr].dr += e.amount;
    totals[e.cr].cr += e.amount;
  }
  return totals;
}

// ========================================
// TRIAL BALANCE
// ========================================
function buildTrialBalance(year) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var sh = ss.getSheetByName('\u0e07\u0e1a\u0e17\u0e14\u0e25\u0e2d\u0e07 ' + year);
  if (!sh) sh = ss.insertSheet('\u0e07\u0e1a\u0e17\u0e14\u0e25\u0e2d\u0e07 ' + year);
  else sh.clearContents();

  var totals = buildAcctTotals(collectAllEntries(ss, year));

  sh.getRange(1, 1).setValue('\u0e07\u0e1a\u0e17\u0e14\u0e25\u0e2d\u0e07 \u0e1b\u0e35 ' + year).setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1, 1, 4).setValues([['\u0e23\u0e2b\u0e31\u0e2a', '\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e0d\u0e0a\u0e35', '\u0e40\u0e14\u0e1a\u0e34\u0e15', '\u0e40\u0e04\u0e23\u0e14\u0e34\u0e15']]).setFontWeight('bold').setBackground('#d9d9d9');

  var codes = Object.keys(totals).sort();
  var rows = [];
  var totalDR = 0, totalCR = 0;

  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    var t = totals[c];
    var bal = t.dr - t.cr;
    var drBal = bal > 0 ? bal : 0;
    var crBal = bal < 0 ? -bal : 0;
    totalDR += drBal;
    totalCR += crBal;
    rows.push([c, acctName(c), drBal > 0 ? drBal : '', crBal > 0 ? crBal : '']);
  }

  if (rows.length > 0) {
    sh.getRange(3, 1, rows.length, 4).setValues(rows);
    sh.getRange(3, 3, rows.length, 2).setNumberFormat('#,##0.00');
  }

  var tRow = rows.length + 3;
  sh.getRange(tRow, 2).setValue('\u0e23\u0e27\u0e21').setFontWeight('bold');
  sh.getRange(tRow, 3).setValue(totalDR).setNumberFormat('#,##0.00').setFontWeight('bold');
  sh.getRange(tRow, 4).setValue(totalCR).setNumberFormat('#,##0.00').setFontWeight('bold');

  sh.autoResizeColumns(1, 4);
}

// ========================================
// P&L STATEMENT
// ========================================
function buildPnL(year) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var sh = ss.getSheetByName('\u0e07\u0e1a\u0e01\u0e33\u0e44\u0e23\u0e02\u0e32\u0e14\u0e17\u0e38\u0e19 ' + year);
  if (!sh) sh = ss.insertSheet('\u0e07\u0e1a\u0e01\u0e33\u0e44\u0e23\u0e02\u0e32\u0e14\u0e17\u0e38\u0e19 ' + year);
  else sh.clearContents();

  var totals = buildAcctTotals(collectAllEntries(ss, year));
  var codes = Object.keys(totals).sort();

  sh.getRange(1, 1).setValue('\u0e07\u0e1a\u0e01\u0e33\u0e44\u0e23\u0e02\u0e32\u0e14\u0e17\u0e38\u0e19 \u0e1b\u0e35 ' + year).setFontWeight('bold').setFontSize(14);

  var row = 3;

  function writeSection(label, bg, filter, normalBalanceCR) {
    sh.getRange(row, 1).setValue(label).setFontWeight('bold').setBackground(bg);
    sh.getRange(row, 1, 1, 3).setBackground(bg);
    row++;
    var total = 0;
    for (var i = 0; i < codes.length; i++) {
      var c = codes[i];
      if (!filter(c)) continue;
      var t = totals[c];
      var bal = normalBalanceCR ? (t.cr - t.dr) : (t.dr - t.cr);
      if (bal === 0) continue;
      sh.getRange(row, 1).setValue(c);
      sh.getRange(row, 2).setValue(acctName(c));
      sh.getRange(row, 3).setValue(bal).setNumberFormat('#,##0.00');
      total += bal;
      row++;
    }
    return total;
  }

  // Revenue
  var totalRev = writeSection('\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49', '#d9ead3', function(c) { return c.charAt(0) === '4'; }, true);
  sh.getRange(row, 2).setValue('\u0e23\u0e27\u0e21\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49').setFontWeight('bold');
  sh.getRange(row, 3).setValue(totalRev).setNumberFormat('#,##0.00').setFontWeight('bold');
  row += 2;

  // COGS
  var totalCOGS = writeSection('\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19\u0e02\u0e32\u0e22', '#fce5cd', function(c) { return c.charAt(0) === '5'; }, false);
  sh.getRange(row, 2).setValue('\u0e23\u0e27\u0e21\u0e15\u0e49\u0e19\u0e17\u0e38\u0e19').setFontWeight('bold');
  sh.getRange(row, 3).setValue(totalCOGS).setNumberFormat('#,##0.00').setFontWeight('bold');
  row++;

  var grossProfit = totalRev - totalCOGS;
  sh.getRange(row, 2).setValue('\u0e01\u0e33\u0e44\u0e23\u0e02\u0e31\u0e49\u0e19\u0e15\u0e49\u0e19').setFontWeight('bold').setBackground('#d9ead3');
  sh.getRange(row, 3).setValue(grossProfit).setNumberFormat('#,##0.00').setFontWeight('bold').setBackground('#d9ead3');
  row += 2;

  // Expenses
  var totalExp = writeSection('\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22', '#f4cccc', function(c) { return c.charAt(0) === '6'; }, false);
  sh.getRange(row, 2).setValue('\u0e23\u0e27\u0e21\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22').setFontWeight('bold');
  sh.getRange(row, 3).setValue(totalExp).setNumberFormat('#,##0.00').setFontWeight('bold');
  row += 2;

  var netProfit = grossProfit - totalExp;
  sh.getRange(row, 2).setValue('\u0e01\u0e33\u0e44\u0e23 (\u0e02\u0e32\u0e14\u0e17\u0e38\u0e19) \u0e2a\u0e38\u0e17\u0e18\u0e34\u0e4c').setFontWeight('bold').setFontSize(12);
  sh.getRange(row, 3).setValue(netProfit).setNumberFormat('#,##0.00').setFontWeight('bold').setFontSize(12);
  sh.getRange(row, 2, 1, 2).setBackground(netProfit >= 0 ? '#d9ead3' : '#f4cccc');

  sh.autoResizeColumns(1, 3);
}

// ========================================
// BALANCE SHEET
// ========================================
function buildBalanceSheet(year) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var sh = ss.getSheetByName('\u0e07\u0e1a\u0e14\u0e38\u0e25 ' + year);
  if (!sh) sh = ss.insertSheet('\u0e07\u0e1a\u0e14\u0e38\u0e25 ' + year);
  else sh.clearContents();

  var totals = buildAcctTotals(collectAllEntries(ss, year));
  var codes = Object.keys(totals).sort();

  sh.getRange(1, 1).setValue('\u0e07\u0e1a\u0e14\u0e38\u0e25 \u0e1b\u0e35 ' + year).setFontWeight('bold').setFontSize(14);

  var row = 3;

  // Assets (1xxx) DR normal
  sh.getRange(row, 1).setValue('\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c').setFontWeight('bold').setBackground('#d9ead3');
  sh.getRange(row, 1, 1, 3).setBackground('#d9ead3');
  row++;
  var totalAssets = 0;
  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    if (c.charAt(0) !== '1') continue;
    var t = totals[c];
    var bal = t.dr - t.cr;
    if (bal === 0) continue;
    sh.getRange(row, 1).setValue(c);
    sh.getRange(row, 2).setValue(acctName(c));
    sh.getRange(row, 3).setValue(bal).setNumberFormat('#,##0.00');
    totalAssets += bal;
    row++;
  }
  sh.getRange(row, 2).setValue('\u0e23\u0e27\u0e21\u0e2a\u0e34\u0e19\u0e17\u0e23\u0e31\u0e1e\u0e22\u0e4c').setFontWeight('bold');
  sh.getRange(row, 3).setValue(totalAssets).setNumberFormat('#,##0.00').setFontWeight('bold');
  row += 2;

  // Liabilities (2xxx) CR normal
  sh.getRange(row, 1).setValue('\u0e2b\u0e19\u0e35\u0e49\u0e2a\u0e34\u0e19').setFontWeight('bold').setBackground('#f4cccc');
  sh.getRange(row, 1, 1, 3).setBackground('#f4cccc');
  row++;
  var totalLiab = 0;
  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    if (c.charAt(0) !== '2') continue;
    var t = totals[c];
    var bal = t.cr - t.dr;
    if (bal === 0) continue;
    sh.getRange(row, 1).setValue(c);
    sh.getRange(row, 2).setValue(acctName(c));
    sh.getRange(row, 3).setValue(bal).setNumberFormat('#,##0.00');
    totalLiab += bal;
    row++;
  }
  sh.getRange(row, 2).setValue('\u0e23\u0e27\u0e21\u0e2b\u0e19\u0e35\u0e49\u0e2a\u0e34\u0e19').setFontWeight('bold');
  sh.getRange(row, 3).setValue(totalLiab).setNumberFormat('#,##0.00').setFontWeight('bold');
  row += 2;

  // Equity (3xxx) CR normal + net profit
  sh.getRange(row, 1).setValue('\u0e2a\u0e48\u0e27\u0e19\u0e02\u0e2d\u0e07\u0e1c\u0e39\u0e49\u0e16\u0e37\u0e2d\u0e2b\u0e38\u0e49\u0e19').setFontWeight('bold').setBackground('#d9d9d9');
  sh.getRange(row, 1, 1, 3).setBackground('#d9d9d9');
  row++;
  var totalEquity = 0;
  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    if (c.charAt(0) !== '3') continue;
    var t = totals[c];
    var bal = t.cr - t.dr;
    if (bal === 0) continue;
    sh.getRange(row, 1).setValue(c);
    sh.getRange(row, 2).setValue(acctName(c));
    sh.getRange(row, 3).setValue(bal).setNumberFormat('#,##0.00');
    totalEquity += bal;
    row++;
  }

  // Net profit from income/expense accounts
  var netProfit = 0;
  for (var i = 0; i < codes.length; i++) {
    var c = codes[i];
    var t = totals[c];
    if (c.charAt(0) === '4') netProfit += (t.cr - t.dr);
    if (c.charAt(0) === '5') netProfit -= (t.dr - t.cr);
    if (c.charAt(0) === '6') netProfit -= (t.dr - t.cr);
  }
  if (netProfit !== 0) {
    sh.getRange(row, 2).setValue('\u0e01\u0e33\u0e44\u0e23 (\u0e02\u0e32\u0e14\u0e17\u0e38\u0e19) \u0e1b\u0e35 ' + year);
    sh.getRange(row, 3).setValue(netProfit).setNumberFormat('#,##0.00');
    totalEquity += netProfit;
    row++;
  }

  sh.getRange(row, 2).setValue('\u0e23\u0e27\u0e21\u0e2a\u0e48\u0e27\u0e19\u0e1c\u0e39\u0e49\u0e16\u0e37\u0e2d\u0e2b\u0e38\u0e49\u0e19').setFontWeight('bold');
  sh.getRange(row, 3).setValue(totalEquity).setNumberFormat('#,##0.00').setFontWeight('bold');
  row += 2;

  sh.getRange(row, 2).setValue('\u0e23\u0e27\u0e21\u0e2b\u0e19\u0e35\u0e49\u0e2a\u0e34\u0e19 + \u0e2a\u0e48\u0e27\u0e19\u0e1c\u0e39\u0e49\u0e16\u0e37\u0e2d\u0e2b\u0e38\u0e49\u0e19').setFontWeight('bold').setFontSize(12);
  sh.getRange(row, 3).setValue(totalLiab + totalEquity).setNumberFormat('#,##0.00').setFontWeight('bold').setFontSize(12);
  sh.getRange(row, 2, 1, 2).setBackground('#d9d9d9');

  sh.autoResizeColumns(1, 3);
}

// ========================================
// FETCH EXPORT DATA
// ========================================
function fetchExportData(month) {
  var url = EXPORT_BASE + '?key=' + EXPORT_KEY + '&month=' + month;
  try {
    var resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    if (resp.getResponseCode() !== 200) {
      Logger.log('API error ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 200));
      return null;
    }
    return JSON.parse(resp.getContentText());
  } catch (ex) {
    Logger.log('fetchExportData error: ' + ex.message);
    return null;
  }
}

// ========================================
// SYNC LEDGER (per month)
// ========================================
function syncLedger(month) {
  _resetCache();
  var ss = SpreadsheetApp.openById(LEDGER_ID);

  var data = fetchExportData(month);
  if (!data) {
    Logger.log('No data for ' + month);
    return;
  }

  // Update bank accounts from API (preserves ✓ flags and existing code assignments)
  if (data.bank_accounts && data.bank_accounts.length > 0) {
    setupBankAccounts(data.bank_accounts);
  }

  // Update chart of accounts
  setupChartOfAccounts(data.categories || []);

  // Build journal entries
  var entries = buildJournalEntries(data);

  // Write journal sheet
  writeJournal(ss, month, entries);

  // Build bank reconciliation (pass entries, no re-fetch)
  buildBankReconciliation(ss, month, entries);

  Logger.log('syncLedger ' + month + ': ' + entries.length + ' entries');
}

// ========================================
// SYNC FINANCIALS (Trial Balance, P&L, Balance Sheet)
// ========================================
function syncFinancials() {
  var year = '2026';
  buildTrialBalance(year);
  buildPnL(year);
  buildBalanceSheet(year);
  SpreadsheetApp.getUi().alert('syncFinancials \u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19');
}

// ========================================
// INDIVIDUAL MONTH FUNCTIONS
// ========================================
function syncMar() { syncLedger('2026-03'); }
function syncApr() { syncLedger('2026-04'); }
function syncMay() { syncLedger('2026-05'); }
function syncJun() { syncLedger('2026-06'); }

// ========================================
// FULL SETUP
// ========================================
function fullSetup() {
  _resetCache();

  var data = fetchExportData('2026-06');
  if (!data) {
    SpreadsheetApp.getUi().alert('\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e15\u0e48\u0e2d API \u0e44\u0e14\u0e49');
    return;
  }

  if (data.bank_accounts && data.bank_accounts.length > 0) {
    setupBankAccounts(data.bank_accounts);
  }

  syncLedger('2026-03');
  syncLedger('2026-04');
  syncLedger('2026-05');
  syncLedger('2026-06');

  buildTrialBalance('2026');
  buildPnL('2026');
  buildBalanceSheet('2026');

  SpreadsheetApp.getUi().alert('fullSetup \u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19');
}

// ========================================
// CLEANUP OLD SHEETS
// ========================================
function cleanupOldSheets() {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var coreSheets = [
    '\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35',
    '\u0e1c\u0e31\u0e07\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23',
    '\u0e07\u0e1a\u0e17\u0e14\u0e25\u0e2d\u0e07 2026',
    '\u0e07\u0e1a\u0e01\u0e33\u0e44\u0e23\u0e02\u0e32\u0e14\u0e17\u0e38\u0e19 2026',
    '\u0e07\u0e1a\u0e14\u0e38\u0e25 2026'
  ];

  var sheets = ss.getSheets();
  var deleted = 0;
  for (var i = sheets.length - 1; i >= 0; i--) {
    if (ss.getSheets().length <= 1) break;
    var name = sheets[i].getName();
    var keep = false;
    for (var j = 0; j < coreSheets.length; j++) {
      if (name === coreSheets[j]) { keep = true; break; }
    }
    if (!keep) {
      ss.deleteSheet(sheets[i]);
      deleted++;
    }
  }
  SpreadsheetApp.getUi().alert('cleanupOldSheets \u0e25\u0e1a ' + deleted + ' \u0e0a\u0e35\u0e15\u0e40\u0e2a\u0e23\u0e47\u0e08');
}

// ========================================
// DAILY SYNC TRIGGER
// ========================================
function dailySync() {
  var bkk = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
  var month = Utilities.formatDate(bkk, 'Asia/Bangkok', 'yyyy-MM');
  syncLedger(month);
  buildTrialBalance('2026');
  buildPnL('2026');
  buildBalanceSheet('2026');
}

// ========================================
// STATEMENT IMPORT & RECONCILIATION
// ========================================

function showImportStatementDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ImportStatementDialog')
    .setWidth(500)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, '\u0e19\u0e33\u0e40\u0e02\u0e49\u0e32 Bank Statement \u0e01\u0e23\u0e30\u0e17\u0e1a\u0e22\u0e2d\u0e14');
}

function getAvailableBanks() {
  _resetCache();
  var cache = loadBankCache();
  var result = [{code: '1100', label: '\u0e40\u0e07\u0e34\u0e19\u0e2a\u0e14 (1100)'}];
  for (var i = 0; i < cache.length; i++) {
    result.push({
      code: cache[i].code,
      label: cache[i].bank_name + (cache[i].account_number ? ' ' + cache[i].account_number : '') + ' (' + cache[i].code + ')'
    });
  }
  return result;
}

function getBankLabel(bankCode) {
  if (bankCode === '1100') return '\u0e40\u0e07\u0e34\u0e19\u0e2a\u0e14';
  var cache = loadBankCache();
  for (var i = 0; i < cache.length; i++) {
    if (cache[i].code === bankCode) {
      return cache[i].bank_name + (cache[i].account_number ? ' ' + cache[i].account_number : '');
    }
  }
  return bankCode;
}

// ---- Thai Month Name Map ----
var THAI_MONTHS = {
  '\u0e21.\u0e04.': '01', '\u0e21\u0e01\u0e23\u0e32\u0e04\u0e21': '01',
  '\u0e01.\u0e1e.': '02', '\u0e01\u0e38\u0e21\u0e20\u0e32\u0e1e\u0e31\u0e19\u0e18\u0e4c': '02',
  '\u0e21\u0e35.\u0e04.': '03', '\u0e21\u0e35\u0e19\u0e32\u0e04\u0e21': '03',
  '\u0e40\u0e21.\u0e22.': '04', '\u0e40\u0e21\u0e29\u0e32\u0e22\u0e19': '04',
  '\u0e1e.\u0e04.': '05', '\u0e1e\u0e24\u0e29\u0e20\u0e32\u0e04\u0e21': '05',
  '\u0e21\u0e34.\u0e22.': '06', '\u0e21\u0e34\u0e16\u0e38\u0e19\u0e32\u0e22\u0e19': '06',
  '\u0e01.\u0e04.': '07', '\u0e01\u0e23\u0e01\u0e0e\u0e32\u0e04\u0e21': '07',
  '\u0e2a.\u0e04.': '08', '\u0e2a\u0e34\u0e07\u0e2b\u0e32\u0e04\u0e21': '08',
  '\u0e01.\u0e22.': '09', '\u0e01\u0e31\u0e19\u0e22\u0e32\u0e22\u0e19': '09',
  '\u0e15.\u0e04.': '10', '\u0e15\u0e38\u0e25\u0e32\u0e04\u0e21': '10',
  '\u0e1e.\u0e22.': '11', '\u0e1e\u0e24\u0e28\u0e08\u0e34\u0e01\u0e32\u0e22\u0e19': '11',
  '\u0e18.\u0e04.': '12', '\u0e18\u0e31\u0e19\u0e27\u0e32\u0e04\u0e21': '12'
};

// Parse Thai date: "9 มิ.ย. 69", "9 มิ.ย. 2569", "9 มิถุนายน 2569"
function parseThaiDate(str) {
  if (!str) return null;
  str = str.trim();
  for (var monthKey in THAI_MONTHS) {
    // Escape dots for regex
    var escaped = monthKey.replace(/\./g, '\\.');
    var re = new RegExp('(\\d{1,2})\\s*' + escaped + '\\s*(\\d{2,4})');
    var m = str.match(re);
    if (m) {
      var day  = parseInt(m[1]);
      var year = parseInt(m[2]);
      if (year < 100) year += 2500;   // 69 → 2569
      if (year > 2400) year -= 543;   // พ.ศ. → ค.ศ.
      return year + '-' + THAI_MONTHS[monthKey] + '-' + String(day).padStart(2, '0');
    }
  }
  return null;
}

// ---- CSV Row Parser ----
function parseCsvRow(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === '\t') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ---- Date Parser (supports CE, BE, Thai month names) ----
function parseDate(str) {
  if (!str) return null;
  str = str.trim().replace(/\u00a0/g, '');

  // Try Thai month name first (e.g., "9 มิ.ย. 69")
  var thai = parseThaiDate(str);
  if (thai) return thai;

  // YYYY-MM-DD
  var m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    var y = parseInt(m[1]); if (y > 2400) y -= 543;
    return y + '-' + m[2] + '-' + m[3];
  }
  // DD/MM/YYYY or DD-MM-YYYY
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    var y = parseInt(m[3]); if (y > 2400) y -= 543;
    return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  // DD/MM/YY
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) {
    var y = parseInt(m[3]); y += (y > 50 ? 1900 : 2000);
    return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  return null;
}

// ---- Amount Parser ----
function parseAmount(str) {
  if (!str) return 0;
  var s = String(str).replace(/,/g, '').replace(/\s/g, '').replace(/[^\d.-]/g, '');
  var v = parseFloat(s);
  return isNaN(v) ? 0 : Math.abs(v);
}

// ---- Date Diff in Days ----
function dateDiffDays(d1, d2) {
  var a = new Date(d1), b = new Date(d2);
  return Math.round((a - b) / 86400000);
}

// ---- Auto-detect CSV columns from header row ----
function detectCsvColumns(headerCells) {
  var cols = {date: -1, desc: -1, credit: -1, debit: -1, balance: -1};
  for (var j = 0; j < headerCells.length; j++) {
    var h = headerCells[j].toLowerCase().replace(/\s+/g, '').replace(/[()]/g, '');
    if (cols.date < 0    && (h === '\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48' || h === 'date' || h.indexOf('txdate') >= 0 || h.indexOf('\u0e27\u0e31\u0e19') >= 0)) cols.date = j;
    if (cols.desc < 0    && (h === '\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23' || h === '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14' || h === 'description' || h === 'detail' || h.indexOf('\u0e23\u0e32\u0e22') >= 0)) cols.desc = j;
    if (cols.credit < 0  && (h === '\u0e40\u0e07\u0e34\u0e19\u0e1d\u0e32\u0e01' || h === '\u0e40\u0e07\u0e34\u0e19\u0e40\u0e02\u0e49\u0e32' || h === 'credit' || h.indexOf('\u0e1d\u0e32\u0e01') >= 0 || h.indexOf('credit') >= 0 || h === '\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19\u0e1d\u0e32\u0e01')) cols.credit = j;
    if (cols.debit < 0   && (h === '\u0e40\u0e07\u0e34\u0e19\u0e16\u0e2d\u0e19' || h === '\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e2d\u0e01' || h === 'debit' || h.indexOf('\u0e16\u0e2d\u0e19') >= 0 || h.indexOf('debit') >= 0 || h === '\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19\u0e16\u0e2d\u0e19')) cols.debit = j;
    // Single signed-amount column (TTB: "จำนวนเงิน") — store in cols.amount
    if (h === '\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19' || h === 'amount') cols.amount = j;
    if (cols.balance < 0 && (h.indexOf('\u0e22\u0e2d\u0e14') >= 0 || h === 'balance')) cols.balance = j;
  }
  return cols;
}

// ---- Parse CSV Statement ----
function parseCsvStatement(content) {
  var lines = content.replace(/\r/g, '').split('\n');
  var entries = [];
  var cols = {date: -1, desc: -1, credit: -1, debit: -1, amount: -1};
  var dataStart = -1;

  // Find header row (scan first 30 lines)
  for (var i = 0; i < Math.min(30, lines.length); i++) {
    var cells = parseCsvRow(lines[i]);
    var detected = detectCsvColumns(cells);
    if (detected.date >= 0 && (detected.credit >= 0 || detected.debit >= 0 || detected.amount >= 0)) {
      cols = detected;
      dataStart = i + 1;
      break;
    }
  }

  // Fallback: find first row with a parseable date
  if (dataStart < 0) {
    for (var i = 0; i < lines.length; i++) {
      var cells = parseCsvRow(lines[i]);
      if (cells.length >= 3 && parseDate(cells[0])) {
        dataStart = i;
        cols = {date: 0, desc: 1, credit: 2, debit: 3, balance: 4};
        break;
      }
    }
  }

  if (dataStart < 0) return [];

  // Detect single signed-amount column
  var amountCol = cols.amount >= 0 ? cols.amount : -1;
  if (amountCol < 0 && cols.credit < 0 && cols.debit < 0) {
    // Scan first data row for a signed number pattern
    if (dataStart >= 0 && dataStart < lines.length) {
      var cells0 = parseCsvRow(lines[dataStart]);
      for (var j = 0; j < cells0.length; j++) {
        if (/^[+\-][\d,]+\.\d{2}$/.test(cells0[j].trim())) { amountCol = j; break; }
      }
    }
  }

  for (var i = dataStart; i < lines.length; i++) {
    var cells = parseCsvRow(lines[i]);
    if (cells.length < 2) continue;
    var date = parseDate(cols.date >= 0 ? cells[cols.date] : cells[0]);
    if (!date) continue;

    var desc = cols.desc >= 0 && cols.desc < cells.length ? cells[cols.desc].trim() : '';

    if (amountCol >= 0 && amountCol < cells.length) {
      // Single signed-amount column (TTB and similar)
      var raw = cells[amountCol].trim().replace(/,/g, '');
      var val = parseFloat(raw);
      if (!isNaN(val) && val !== 0) {
        entries.push({date: date, desc: desc, amount: Math.abs(val), type: val > 0 ? 'in' : 'out'});
      }
    } else {
      var credit = cols.credit >= 0 && cols.credit < cells.length ? parseAmount(cells[cols.credit]) : 0;
      var debit  = cols.debit  >= 0 && cols.debit  < cells.length ? parseAmount(cells[cols.debit])  : 0;
      if (credit > 0) entries.push({date: date, desc: desc, amount: credit, type: 'in'});
      if (debit  > 0) entries.push({date: date, desc: desc, amount: debit,  type: 'out'});
    }
  }

  return entries;
}

// ---- Parse PDF via Google Drive OCR ----
function parsePdfStatement(fileId) {
  var blob = DriveApp.getFileById(fileId).getBlob();
  var resource = {title: '_tmp_stmt_ocr', mimeType: 'application/vnd.google-apps.document'};
  var converted = Drive.Files.insert(resource, blob, {convert: true, ocr: true, ocrLanguage: 'th'});
  var docId = converted.id;

  var text = '';
  try {
    var doc = DocumentApp.openById(docId);
    text = doc.getBody().getText();
  } finally {
    DriveApp.getFileById(docId).setTrashed(true);
  }

  return parseStatementText(text);
}

// ---- Parse OCR/Plain Text into Entries ----
// Handles TTB format: "9 มิ.ย. 69  13:19  โอนเงินออก  Mobile  -2,000.00  1,120,564.30  BBL X4481..."
function parseStatementText(text) {
  var entries = [];
  var lines = text.replace(/\r/g, '').split('\n');

  // TTB/Thai bank pattern: Thai date + time + desc + channel + signed amount + balance + detail
  // Amount is the FIRST signed number after the Thai date
  // "9 มิ.ย. 69" then somewhere "+59,942.00" or "-2,000.00"
  var thaiDateRe = /(\d{1,2}\s+[\u0e00-\u0e7f.]+\s+\d{2,4})/;
  var signedAmtRe = /([+\-][\d,]+\.\d{2})/;
  var unsignedAmtRe = /([\d,]+\.\d{2})/g;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // Try Thai date in this line
    var dm = line.match(thaiDateRe);
    var date = dm ? parseThaiDate(dm[1]) : parseDate(line.split(/\s+/)[0]);
    if (!date) continue;

    // Look for signed amount first (TTB single-column format)
    var sm = line.match(signedAmtRe);
    if (sm) {
      var val = parseFloat(sm[1].replace(/,/g, ''));
      if (!isNaN(val) && val !== 0) {
        // Build description: everything after date+time, before the amount
        var beforeAmt = line.substring(0, line.indexOf(sm[1])).trim();
        var desc = beforeAmt
          .replace(thaiDateRe, '').replace(/\d{2}:\d{2}/, '').replace(/Mobile|ระบบ|SCB|ATM/g, '').trim();
        // Append detail after balance (last field in TTB rows)
        var afterAmt = line.substring(line.indexOf(sm[1]) + sm[1].length).trim();
        var balAmt = afterAmt.match(/^[\d,]+\.\d{2}\s+(.*)/);
        var detail = balAmt ? balAmt[1].trim() : afterAmt.replace(/^[\d,]+\.\d{2}/, '').trim();
        if (detail && detail !== '-') desc = (desc ? desc + ' ' : '') + detail;
        entries.push({date: date, desc: desc.trim(), amount: Math.abs(val), type: val > 0 ? 'in' : 'out'});
      }
      continue;
    }

    // Fallback: unsigned amounts — first=credit or debit, second=balance
    var amounts = [];
    var uMatch;
    var copyLine = line;
    while ((uMatch = unsignedAmtRe.exec(copyLine)) !== null) {
      amounts.push(parseFloat(uMatch[1].replace(/,/g, '')));
    }
    if (amounts.length >= 2) {
      var amt = amounts[0]; // first amount = transaction amount
      if (amt > 0) {
        var type = guessTransactionType(line);
        entries.push({date: date, desc: line.replace(thaiDateRe, '').replace(/\d{2}:\d{2}/,'').trim(), amount: amt, type: type});
      }
    }
  }

  return entries;
}

function guessTransactionType(desc) {
  var d = desc.toLowerCase();
  var inKeywords = ['\u0e23\u0e31\u0e1a\u0e42\u0e2d\u0e19', '\u0e40\u0e07\u0e34\u0e19\u0e40\u0e02\u0e49\u0e32', '\u0e1d\u0e32\u0e01', 'credit', '\u0e23\u0e31\u0e1a\u0e40\u0e07\u0e34\u0e19', 'promptpay\u0e23\u0e31\u0e1a', '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49'];
  var outKeywords = ['\u0e08\u0e48\u0e32\u0e22', '\u0e16\u0e2d\u0e19', '\u0e42\u0e2d\u0e19\u0e2d\u0e2d\u0e01', 'debit', '\u0e0a\u0e33\u0e23\u0e30', '\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22'];
  for (var i = 0; i < outKeywords.length; i++) { if (d.indexOf(outKeywords[i]) >= 0) return 'out'; }
  for (var i = 0; i < inKeywords.length; i++) { if (d.indexOf(inKeywords[i]) >= 0) return 'in'; }
  return 'in'; // default
}

// ---- Parse from Manual Entry Sheet ----
function parseSheetStatement(bankCode, month) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var shName = 'STM-' + bankCode + '-' + month;
  var sh = ss.getSheetByName(shName);
  if (!sh) return [];

  var data = sh.getDataRange().getValues();
  var entries = [];
  // Expected columns: วันที่ | รายละเอียด | เงินเข้า | เงินออก
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var date = parseDate(String(row[0]));
    if (!date) continue;
    var desc = String(row[1] || '').trim();
    var credit = parseAmount(row[2]);
    var debit  = parseAmount(row[3]);
    if (credit > 0) entries.push({date: date, desc: desc, amount: credit, type: 'in'});
    if (debit > 0)  entries.push({date: date, desc: desc, amount: debit,  type: 'out'});
  }
  return entries;
}

// ---- Create Manual Entry Template Sheet ----
function createStatementTemplate(bankCode, month) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var shName = 'STM-' + bankCode + '-' + month;
  var sh = ss.getSheetByName(shName);
  if (!sh) {
    sh = ss.insertSheet(shName);
    sh.getRange(1, 1, 1, 5).setValues([['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14', '\u0e40\u0e07\u0e34\u0e19\u0e40\u0e02\u0e49\u0e32 (\u0e1a\u0e32\u0e17)', '\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e2d\u0e01 (\u0e1a\u0e32\u0e17)', '\u0e22\u0e2d\u0e14\u0e04\u0e07\u0e40\u0e2b\u0e25\u0e37\u0e2d']]);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#4a86e8').setFontColor('#fff');
    sh.getRange(2, 1).setValue('2026-06-01');
    sh.getRange(2, 2).setValue('\u0e15\u0e31\u0e27\u0e2d\u0e22\u0e48\u0e32\u0e07 \u0e23\u0e31\u0e1a\u0e42\u0e2d\u0e19');
    sh.getRange(2, 3).setValue(1000);
    sh.getRange(3, 1).setValue('2026-06-02');
    sh.getRange(3, 2).setValue('\u0e15\u0e31\u0e27\u0e2d\u0e22\u0e48\u0e32\u0e07 \u0e08\u0e48\u0e32\u0e22\u0e04\u0e48\u0e32');
    sh.getRange(3, 4).setValue(500);
    sh.setColumnWidth(1, 110);
    sh.setColumnWidth(2, 260);
    sh.setColumnWidth(3, 130);
    sh.setColumnWidth(4, 130);
    sh.setColumnWidth(5, 130);
    // Protect header row
    sh.getRange(1, 1, 1, 5).setBackground('#4a86e8');
  }
  return shName;
}

// ---- Get Journal Entries for a Bank Account ----
function getJournalEntriesForBank(ss, bankCode, month) {
  var sh = ss.getSheetByName('\u0e2a\u0e21\u0e38\u0e14\u0e23\u0e32\u0e22\u0e27\u0e31\u0e19 ' + month);
  if (!sh) return [];

  var data = sh.getDataRange().getValues();
  var entries = [];
  for (var i = 1; i < data.length - 1; i++) {
    var row = data[i];
    if (!row[0] || !row[3]) continue;
    var amt = parseFloat(row[7]) || 0;
    if (amt === 0) continue;
    var dr = String(row[3]);
    var cr = String(row[5]);
    if (dr === bankCode) entries.push({date: String(row[0]), desc: String(row[2]), amount: amt, isIn: true,  ref: String(row[1])});
    if (cr === bankCode) entries.push({date: String(row[0]), desc: String(row[2]), amount: amt, isIn: false, ref: String(row[1])});
  }
  return entries;
}

// ---- Main Reconciliation Algorithm ----
function reconcileEntries(statementEntries, journalEntries) {
  var journalUsed = new Array(journalEntries.length).fill(false);
  var matched = [], statementOnly = [], systemOnly = [];

  // For each statement entry, find best journal match
  for (var i = 0; i < statementEntries.length; i++) {
    var s = statementEntries[i];
    var bestScore = -1, bestJ = -1;

    for (var j = 0; j < journalEntries.length; j++) {
      if (journalUsed[j]) continue;
      var e = journalEntries[j];

      // Amount must match within 1 baht (rounding tolerance)
      if (Math.abs(s.amount - e.amount) > 1) continue;

      // Direction must match
      if (s.type === 'in'  && !e.isIn) continue;
      if (s.type === 'out' &&  e.isIn) continue;

      // Date proximity (max ±3 days for bank processing lag)
      var dayDiff = Math.abs(dateDiffDays(s.date, e.date));
      if (dayDiff > 3) continue;

      var score = 100 - dayDiff * 25;
      // Bonus for exact amount match
      if (Math.abs(s.amount - e.amount) < 0.01) score += 10;

      if (score > bestScore) { bestScore = score; bestJ = j; }
    }

    if (bestJ >= 0) {
      journalUsed[bestJ] = true;
      var dayDiff = dateDiffDays(s.date, journalEntries[bestJ].date);
      matched.push({statement: s, journal: journalEntries[bestJ], dayDiff: dayDiff, score: bestScore});
    } else {
      statementOnly.push(s);
    }
  }

  for (var j = 0; j < journalEntries.length; j++) {
    if (!journalUsed[j]) systemOnly.push(journalEntries[j]);
  }

  return {matched: matched, statementOnly: statementOnly, systemOnly: systemOnly};
}

// ---- Write Reconciliation Output Sheet ----
function writeStatementReconciliation(ss, bankCode, bankLabel, month, results) {
  var shName = '\u0e01\u0e23\u0e30\u0e17\u0e1a Statement ' + bankLabel + ' ' + month;
  var sh = ss.getSheetByName(shName);
  if (!sh) sh = ss.insertSheet(shName);
  else sh.clearContents();
  ss.setActiveSheet(sh);

  var matched      = results.matched;
  var stmOnly      = results.statementOnly;
  var sysOnly      = results.systemOnly;

  // Totals
  var stmIn = 0, stmOut = 0, sysIn = 0, sysOut = 0;
  for (var i = 0; i < matched.length; i++) {
    var s = matched[i].statement;
    if (s.type === 'in') { stmIn += s.amount; sysIn += matched[i].journal.amount; }
    else { stmOut += s.amount; sysOut += matched[i].journal.amount; }
  }
  for (var i = 0; i < stmOnly.length; i++) {
    if (stmOnly[i].type === 'in') stmIn += stmOnly[i].amount; else stmOut += stmOnly[i].amount;
  }
  for (var i = 0; i < sysOnly.length; i++) {
    if (sysOnly[i].isIn) sysIn += sysOnly[i].amount; else sysOut += sysOnly[i].amount;
  }

  var row = 1;

  // ---- Header ----
  sh.getRange(row, 1).setValue('\u0e01\u0e23\u0e30\u0e17\u0e1a\u0e22\u0e2d\u0e14 Statement: ' + bankLabel).setFontWeight('bold').setFontSize(14);
  sh.getRange(row, 1, 1, 6).setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold');
  row++;
  sh.getRange(row, 1).setValue('\u0e40\u0e14\u0e37\u0e2d\u0e19: ' + month + '   |   \u0e2a\u0e23\u0e49\u0e32\u0e07: ' + new Date().toLocaleString('th-TH'));
  sh.getRange(row, 1, 1, 6).setBackground('#2e2e4e').setFontColor('#cccccc');
  row += 2;

  // ---- Summary ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u0e2a\u0e23\u0e38\u0e1b\u0e01\u0e32\u0e23\u0e01\u0e23\u0e30\u0e17\u0e1a\u0e22\u0e2d\u0e14 \u2550\u2550').setFontWeight('bold').setFontSize(12);
  sh.getRange(row, 1, 1, 6).setBackground('#f3f3f3');
  row++;

  var summaryData = [
    ['\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23', 'Statement', '\u0e23\u0e30\u0e1a\u0e1a', '\u0e1c\u0e25\u0e15\u0e48\u0e32\u0e07', '\u0e2a\u0e16\u0e32\u0e19\u0e30', ''],
    ['\u0e40\u0e07\u0e34\u0e19\u0e40\u0e02\u0e49\u0e32 (\u0e1a\u0e32\u0e17)', stmIn, sysIn, stmIn - sysIn, Math.abs(stmIn - sysIn) < 1 ? '\u2705 \u0e15\u0e23\u0e07' : '\u26a0\ufe0f \u0e44\u0e21\u0e48\u0e15\u0e23\u0e07', ''],
    ['\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e2d\u0e01 (\u0e1a\u0e32\u0e17)', stmOut, sysOut, stmOut - sysOut, Math.abs(stmOut - sysOut) < 1 ? '\u2705 \u0e15\u0e23\u0e07' : '\u26a0\ufe0f \u0e44\u0e21\u0e48\u0e15\u0e23\u0e07', ''],
    ['\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14', stmOnly.length + matched.length, sysOnly.length + matched.length, '', '', ''],
    ['\u0e08\u0e31\u0e1a\u0e04\u0e39\u0e48\u0e44\u0e14\u0e49 \u2705', matched.length, matched.length, '', '', ''],
    ['\u0e43\u0e19 Statement \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a \u26a0\ufe0f', stmOnly.length, '', '', stmOnly.length > 0 ? '\u26a0\ufe0f \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a' : '\u2705', ''],
    ['\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19 Statement \u26a0\ufe0f', '', sysOnly.length, '', sysOnly.length > 0 ? '\u26a0\ufe0f \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a' : '\u2705', ''],
  ];
  sh.getRange(row, 1, 1, 5).setValues([summaryData[0]]).setFontWeight('bold').setBackground('#dddddd');
  row++;
  for (var r = 1; r < summaryData.length; r++) {
    sh.getRange(row, 1, 1, 5).setValues([summaryData[r]]);
    var statusCell = sh.getRange(row, 5);
    if (String(summaryData[r][4]).indexOf('\u2705') >= 0) statusCell.setBackground('#d9ead3');
    else if (String(summaryData[r][4]).indexOf('\u26a0') >= 0) statusCell.setBackground('#fce8b2');
    sh.getRange(row, 2, 1, 3).setNumberFormat('#,##0.00');
    row++;
  }
  row++;

  // ---- Matched Entries ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u2705 \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e17\u0e35\u0e48\u0e15\u0e23\u0e07\u0e01\u0e31\u0e19 (' + matched.length + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23) \u2550\u2550').setFontWeight('bold');
  sh.getRange(row, 1, 1, 6).setBackground('#d9ead3').setFontWeight('bold');
  row++;
  if (matched.length > 0) {
    sh.getRange(row, 1, 1, 6).setValues([['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 (Statement)', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14 Statement', '\u0e08\u0e33\u0e19\u0e27\u0e19', '\u0e17\u0e34\u0e28\u0e17\u0e32\u0e07', '\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 (\u0e23\u0e30\u0e1a\u0e1a)', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e23\u0e30\u0e1a\u0e1a']]).setFontWeight('bold').setBackground('#b6d7a8');
    row++;
    for (var i = 0; i < matched.length; i++) {
      var s = matched[i].statement, e = matched[i].journal;
      var flag = matched[i].dayDiff !== 0 ? ' \u26a0\ufe0f\u0e15\u0e48\u0e32\u0e07\u0e27\u0e31\u0e19 ' + matched[i].dayDiff + 'd' : '';
      sh.getRange(row, 1, 1, 6).setValues([[s.date, s.desc, s.amount, s.type === 'in' ? '\u2b06\ufe0f\u0e40\u0e02\u0e49\u0e32' : '\u2b07\ufe0f\u0e2d\u0e2d\u0e01', e.date + flag, e.desc]]);
      sh.getRange(row, 3).setNumberFormat('#,##0.00');
      if (matched[i].dayDiff !== 0) sh.getRange(row, 1, 1, 6).setBackground('#fff2cc');
      else sh.getRange(row, 1, 1, 6).setBackground('#f0fff0');
      row++;
    }
  } else {
    sh.getRange(row, 1).setValue('(\u0e44\u0e21\u0e48\u0e21\u0e35\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e17\u0e35\u0e48\u0e15\u0e23\u0e07\u0e01\u0e31\u0e19)').setFontStyle('italic').setFontColor('#888');
    row++;
  }
  row++;

  // ---- Statement Only (not in system) ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u26a0\ufe0f \u0e43\u0e19 Statement \u0e41\u0e15\u0e48\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a (' + stmOnly.length + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23) \u2550\u2550').setFontWeight('bold');
  sh.getRange(row, 1, 1, 4).setBackground('#fce8b2').setFontWeight('bold');
  row++;
  if (stmOnly.length > 0) {
    sh.getRange(row, 1, 1, 4).setValues([['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14', '\u0e08\u0e33\u0e19\u0e27\u0e19 (\u0e1a\u0e32\u0e17)', '\u0e17\u0e34\u0e28\u0e17\u0e32\u0e07']]).setFontWeight('bold').setBackground('#ffe599');
    row++;
    for (var i = 0; i < stmOnly.length; i++) {
      var s = stmOnly[i];
      sh.getRange(row, 1, 1, 4).setValues([[s.date, s.desc, s.amount, s.type === 'in' ? '\u2b06\ufe0f\u0e40\u0e02\u0e49\u0e32' : '\u2b07\ufe0f\u0e2d\u0e2d\u0e01']]);
      sh.getRange(row, 3).setNumberFormat('#,##0.00');
      sh.getRange(row, 1, 1, 4).setBackground('#fff9e6');
      row++;
    }
    // Suggest action
    sh.getRange(row, 1).setValue('\u27a1\ufe0f \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a: \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e2b\u0e25\u0e48\u0e32\u0e19\u0e35\u0e49\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a \u0e2b\u0e23\u0e37\u0e2d\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e1c\u0e34\u0e14\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48').setFontStyle('italic').setFontColor('#856404');
    row++;
  } else {
    sh.getRange(row, 1).setValue('\u2705 \u0e17\u0e38\u0e01\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e43\u0e19 Statement \u0e1e\u0e1a\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e04\u0e23\u0e1a').setFontColor('#276221');
    row++;
  }
  row++;

  // ---- System Only (not in statement) ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u26a0\ufe0f \u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e41\u0e15\u0e48\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19 Statement (' + sysOnly.length + ' \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23) \u2550\u2550').setFontWeight('bold');
  sh.getRange(row, 1, 1, 4).setBackground('#f4cccc').setFontWeight('bold');
  row++;
  if (sysOnly.length > 0) {
    sh.getRange(row, 1, 1, 4).setValues([['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14', '\u0e08\u0e33\u0e19\u0e27\u0e19 (\u0e1a\u0e32\u0e17)', '\u0e17\u0e34\u0e28\u0e17\u0e32\u0e07']]).setFontWeight('bold').setBackground('#ea9999');
    row++;
    for (var i = 0; i < sysOnly.length; i++) {
      var e = sysOnly[i];
      sh.getRange(row, 1, 1, 4).setValues([[e.date, e.desc, e.amount, e.isIn ? '\u2b06\ufe0f\u0e40\u0e02\u0e49\u0e32' : '\u2b07\ufe0f\u0e2d\u0e2d\u0e01']]);
      sh.getRange(row, 3).setNumberFormat('#,##0.00');
      sh.getRange(row, 1, 1, 4).setBackground('#fce5e5');
      row++;
    }
    sh.getRange(row, 1).setValue('\u27a1\ufe0f \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a: \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e40\u0e2b\u0e25\u0e48\u0e32\u0e19\u0e35\u0e49\u0e2d\u0e32\u0e08\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e23\u0e39\u0e49\u0e2a\u0e36\u0e01\u0e43\u0e19 Statement \u0e2b\u0e23\u0e37\u0e2d\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e1c\u0e34\u0e14').setFontStyle('italic').setFontColor('#9e3030');
    row++;
  } else {
    sh.getRange(row, 1).setValue('\u2705 \u0e17\u0e38\u0e01\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e1e\u0e1a\u0e43\u0e19 Statement \u0e04\u0e23\u0e1a').setFontColor('#276221');
    row++;
  }

  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 280);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 100);
  sh.setColumnWidth(5, 130);
  sh.setColumnWidth(6, 260);
}

// ---- Main entry point called from dialog ----
function importAndReconcile(params) {
  _resetCache();
  var bankCode  = params.bankCode;
  var month     = params.month;
  var fileId    = params.fileId || '';
  var inputMode = params.inputMode; // 'drive_csv', 'drive_pdf', 'sheet'

  try {
    var statementEntries = [];

    if (inputMode === 'sheet') {
      statementEntries = parseSheetStatement(bankCode, month);
    } else if (fileId) {
      if (inputMode === 'drive_pdf') {
        statementEntries = parsePdfStatement(fileId);
      } else {
        // CSV or Excel saved as CSV
        var file = DriveApp.getFileById(fileId);
        var blob = file.getBlob();
        var content;
        try { content = blob.getDataAsString('UTF-8'); } catch (e) { content = blob.getDataAsString('TIS-620'); }
        statementEntries = parseCsvStatement(content);
      }
    }

    if (statementEntries.length === 0) {
      return {ok: false, msg: '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e43\u0e19 Statement \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a\u0e44\u0e1f\u0e25\u0e4c\u0e2b\u0e23\u0e37\u0e2d\u0e01\u0e32\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e2b\u0e31\u0e27\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07 CSV'};
    }

    var ss = SpreadsheetApp.openById(LEDGER_ID);
    var journalEntries = getJournalEntriesForBank(ss, bankCode, month);
    var results = reconcileEntries(statementEntries, journalEntries);
    var bankLabel = getBankLabel(bankCode);
    writeStatementReconciliation(ss, bankCode, bankLabel, month, results);

    return {
      ok: true,
      statementCount: statementEntries.length,
      journalCount: journalEntries.length,
      matched: results.matched.length,
      statementOnly: results.statementOnly.length,
      systemOnly: results.systemOnly.length
    };

  } catch (ex) {
    return {ok: false, msg: ex.message + ' (' + ex.fileName + ':' + ex.lineNumber + ')'};
  }
}

function createStatementTemplateAction(bankCode, month) {
  var shName = createStatementTemplate(bankCode, month);
  return {ok: true, sheetName: shName};
}

// ========================================
// WRITE RECONCILIATION FROM WEB APP PAYLOAD
// ========================================
function writeReconciliationFromPayload(payload) {
  var ss = SpreadsheetApp.openById(LEDGER_ID);
  var bank    = payload.bank  || 'Unknown';
  var month   = payload.month || '';
  var matched      = payload.matched      || [];
  var stmOnly      = payload.statementOnly || [];
  var sysOnly      = payload.systemOnly   || [];
  var summary      = payload.summary      || {};

  var shName = '\u0e01\u0e23\u0e30\u0e17\u0e1a Statement ' + bank + ' ' + month;
  var sh = ss.getSheetByName(shName);
  if (!sh) sh = ss.insertSheet(shName);
  else sh.clearContents();
  ss.setActiveSheet(sh);

  var row = 1;

  // ---- Header ----
  sh.getRange(row, 1).setValue('\u0e01\u0e23\u0e30\u0e17\u0e1a Statement: ' + bank).setFontWeight('bold').setFontSize(14);
  sh.getRange(row, 1, 1, 7).setBackground('#1a1a2e').setFontColor('#ffffff');
  row++;
  sh.getRange(row, 1).setValue('\u0e40\u0e14\u0e37\u0e2d\u0e19: ' + month + '   |   \u0e2a\u0e23\u0e49\u0e32\u0e07: ' + new Date().toLocaleString('th-TH'));
  sh.getRange(row, 1, 1, 7).setBackground('#2e2e4e').setFontColor('#cccccc');
  row += 2;

  // ---- Summary ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u0e2a\u0e23\u0e38\u0e1b \u2550\u2550').setFontWeight('bold').setFontSize(12);
  sh.getRange(row, 1, 1, 4).setBackground('#f3f3f3');
  row++;
  var summaryRows = [
    ['\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23', 'Statement', '\u0e23\u0e30\u0e1a\u0e1a', '\u0e2a\u0e16\u0e32\u0e19\u0e30'],
    ['\u0e40\u0e07\u0e34\u0e19\u0e40\u0e02\u0e49\u0e32', summary.stmIn || 0, summary.sysIn || 0, Math.abs((summary.stmIn||0)-(summary.sysIn||0)) < 1 ? '\u2705 \u0e15\u0e23\u0e07' : '\u26a0\ufe0f \u0e15\u0e48\u0e32\u0e07 \u0e2d\u0e34\u0e14 ' + Math.abs((summary.stmIn||0)-(summary.sysIn||0)).toFixed(2)],
    ['\u0e40\u0e07\u0e34\u0e19\u0e2d\u0e2d\u0e01', summary.stmOut || 0, summary.sysOut || 0, Math.abs((summary.stmOut||0)-(summary.sysOut||0)) < 1 ? '\u2705 \u0e15\u0e23\u0e07' : '\u26a0\ufe0f \u0e15\u0e48\u0e32\u0e07 \u0e2d\u0e34\u0e14 ' + Math.abs((summary.stmOut||0)-(summary.sysOut||0)).toFixed(2)],
    ['\u0e08\u0e31\u0e1a\u0e04\u0e39\u0e48\u0e44\u0e14\u0e49 \u2705', summary.matchedCount || 0, '', ''],
    ['\u0e43\u0e19 Statement \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a \u26a0\ufe0f', summary.statementOnlyCount || 0, '', (summary.statementOnlyCount||0) > 0 ? '\u26a0\ufe0f \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a' : '\u2705'],
    ['\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19 Statement \u26a0\ufe0f', '', summary.systemOnlyCount || 0, (summary.systemOnlyCount||0) > 0 ? '\u26a0\ufe0f \u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a' : '\u2705'],
  ];
  sh.getRange(row, 1, 1, 4).setValues([summaryRows[0]]).setFontWeight('bold').setBackground('#dddddd');
  row++;
  for (var r = 1; r < summaryRows.length; r++) {
    sh.getRange(row, 1, 1, 4).setValues([summaryRows[r]]);
    sh.getRange(row, 2, 1, 2).setNumberFormat('#,##0.00');
    var statusTxt = String(summaryRows[r][3]);
    if (statusTxt.indexOf('\u2705') >= 0) sh.getRange(row, 4).setBackground('#d9ead3');
    else if (statusTxt.indexOf('\u26a0') >= 0) sh.getRange(row, 4).setBackground('#fce8b2');
    row++;
  }
  row++;

  // ---- Helper: write entry rows ----
  function writeEntryHeader(cols, bg) {
    sh.getRange(row, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground(bg);
  }

  // ---- Matched ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u2705 \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e17\u0e35\u0e48\u0e15\u0e23\u0e07\u0e01\u0e31\u0e19 (' + matched.length + ') \u2550\u2550').setFontWeight('bold');
  sh.getRange(row, 1, 1, 7).setBackground('#d9ead3');
  row++;
  if (matched.length > 0) {
    writeEntryHeader(['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 (Stmt)', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14 Statement', '\u0e08\u0e33\u0e19\u0e27\u0e19', '\u0e17\u0e34\u0e28\u0e17\u0e32\u0e07', '\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 (\u0e23\u0e30\u0e1a\u0e1a)', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e23\u0e30\u0e1a\u0e1a', '\u0e2b\u0e21\u0e32\u0e22\u0e40\u0e2b\u0e15\u0e38'], '#b6d7a8');
    row++;
    for (var i = 0; i < matched.length; i++) {
      var m = matched[i];
      var s = m.statement, e = m.system;
      var note = '';
      if (m.dayDiff && m.dayDiff !== 0) note += '\u0e15\u0e48\u0e32\u0e07\u0e27\u0e31\u0e19 ' + m.dayDiff + 'd ';
      if (m.amountDiff && Math.abs(m.amountDiff) > 0.01) note += '\u0e15\u0e48\u0e32\u0e07\u0e22\u0e2d\u0e14 ' + Math.abs(m.amountDiff).toFixed(2);
      sh.getRange(row, 1, 1, 7).setValues([[s.date, s.description, s.amount, s.type === 'in' ? '\u2b06\ufe0f\u0e40\u0e02\u0e49\u0e32' : '\u2b07\ufe0f\u0e2d\u0e2d\u0e01', e.date, e.description, note.trim()]]);
      sh.getRange(row, 3).setNumberFormat('#,##0.00');
      sh.getRange(row, 1, 1, 7).setBackground(note ? '#fff2cc' : '#f0fff0');
      row++;
    }
  }
  row++;

  // ---- Statement Only ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u26a0\ufe0f \u0e43\u0e19 Statement \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a (' + stmOnly.length + ') \u2550\u2550').setFontWeight('bold');
  sh.getRange(row, 1, 1, 5).setBackground('#fce8b2');
  row++;
  if (stmOnly.length > 0) {
    writeEntryHeader(['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14', '\u0e08\u0e33\u0e19\u0e27\u0e19', '\u0e17\u0e34\u0e28\u0e17\u0e32\u0e07', '\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33'], '#ffe599');
    row++;
    for (var i = 0; i < stmOnly.length; i++) {
      var e2 = stmOnly[i];
      sh.getRange(row, 1, 1, 5).setValues([[e2.date, e2.description, e2.amount, e2.type === 'in' ? '\u2b06\ufe0f\u0e40\u0e02\u0e49\u0e32' : '\u2b07\ufe0f\u0e2d\u0e2d\u0e01', '\u27a1\ufe0f \u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a']]);
      sh.getRange(row, 3).setNumberFormat('#,##0.00');
      sh.getRange(row, 1, 1, 5).setBackground('#fff9e6');
      row++;
    }
  } else {
    sh.getRange(row, 1).setValue('\u2705 \u0e17\u0e38\u0e01\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e43\u0e19 Statement \u0e1e\u0e1a\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e04\u0e23\u0e1a').setFontColor('#276221');
    row++;
  }
  row++;

  // ---- System Only ----
  sh.getRange(row, 1).setValue('\u2550\u2550 \u26a0\ufe0f \u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e43\u0e19 Statement (' + sysOnly.length + ') \u2550\u2550').setFontWeight('bold');
  sh.getRange(row, 1, 1, 5).setBackground('#f4cccc');
  row++;
  if (sysOnly.length > 0) {
    writeEntryHeader(['\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48', '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14', '\u0e08\u0e33\u0e19\u0e27\u0e19', '\u0e17\u0e34\u0e28\u0e17\u0e32\u0e07', '\u0e04\u0e33\u0e41\u0e19\u0e30\u0e19\u0e33'], '#ea9999');
    row++;
    for (var i = 0; i < sysOnly.length; i++) {
      var e3 = sysOnly[i];
      sh.getRange(row, 1, 1, 5).setValues([[e3.date, e3.description, e3.amount, e3.type === 'in' ? '\u2b06\ufe0f\u0e40\u0e02\u0e49\u0e32' : '\u2b07\ufe0f\u0e2d\u0e2d\u0e01', '\u27a1\ufe0f \u0e2d\u0e32\u0e08\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e1c\u0e34\u0e14\u0e18\u0e19\u0e32\u0e04\u0e32\u0e23']]);
      sh.getRange(row, 3).setNumberFormat('#,##0.00');
      sh.getRange(row, 1, 1, 5).setBackground('#fce5e5');
      row++;
    }
  } else {
    sh.getRange(row, 1).setValue('\u2705 \u0e17\u0e38\u0e01\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e43\u0e19\u0e23\u0e30\u0e1a\u0e1a\u0e1e\u0e1a\u0e43\u0e19 Statement \u0e04\u0e23\u0e1a').setFontColor('#276221');
    row++;
  }

  sh.setColumnWidth(1, 105);
  sh.setColumnWidth(2, 270);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 105);
  sh.setColumnWidth(6, 270);
  sh.setColumnWidth(7, 160);

  Logger.log('writeReconciliationFromPayload done: ' + shName);
}

// ========================================
// WEBHOOK doPost
// ========================================
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (ex) {}

  // Route: write_reconciliation from web app
  if (body.action === 'write_reconciliation') {
    try {
      writeReconciliationFromPayload(body);
      return ContentService.createTextOutput(JSON.stringify({ok: true, sheet: 'กระทบ Statement ' + body.bank + ' ' + body.month}))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (ex) {
      return ContentService.createTextOutput(JSON.stringify({error: ex.message}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Route: sync month
  var month = body.month;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    syncLedger(month);
    buildTrialBalance('2026');
    buildPnL('2026');
    buildBalanceSheet('2026');
    return ContentService.createTextOutput(JSON.stringify({ok: true, month: month}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({error: 'Invalid request'}))
    .setMimeType(ContentService.MimeType.JSON);
}
