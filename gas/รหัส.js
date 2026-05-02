const ADMIN_PASSWORD = "1234"; // เปลี่ยนรหัสผ่านตรงนี้

// =====================================================
// TEST — ทดสอบการเชื่อมต่อ Firestore
// =====================================================
function testFirestore() {
  var token = ScriptApp.getOAuthToken();
  var projectId = 'gen-lang-client-0528383957';
  var dbId = 'ai-studio-01987361-573e-4f30-9681-1e83b5c491e3';
  var url = 'https://firestore.googleapis.com/v1/projects/' + projectId +
            '/databases/' + dbId + '/documents/members';

  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  Logger.log('Status: ' + res.getResponseCode());
  Logger.log(res.getContentText().substring(0, 500));
}

// =====================================================
// doGet — Multi-page router
// =====================================================
function doGet(e) {
  // JSON API endpoint — ดึงรายชื่อพนักงานทั้งหมดสำหรับ React import
  if (e && e.parameter && e.parameter.action === 'getAllMembers') {
    return gasGetAllMembersJSON(e.parameter.callback || null);
  }

  checkAndInitialize();
  var page = (e && e.parameter && e.parameter.p) ? e.parameter.p : "home";
  var tmp = HtmlService.createTemplateFromFile('Main');
  tmp.page    = page;
  tmp.pos     = (e && e.parameter && e.parameter.pos) ? e.parameter.pos : '';
  tmp.baseUrl = ScriptApp.getService().getUrl();
  return tmp.evaluate()
    .setTitle('ระบบจัดการสถานี')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getPageUrl(page) {
  return ScriptApp.getService().getUrl() + '?p=' + page;
}

function include(filename) {
  try {
    var tmp = HtmlService.createTemplateFromFile(filename);
    tmp.baseUrl = ScriptApp.getService().getUrl();
    return tmp.evaluate().getContent();
  } catch (e1) {
    try {
      return HtmlService.createHtmlOutputFromFile(filename).getContent();
    } catch (e2) {
      return "<div class='alert alert-danger'>ไม่พบไฟล์: " + filename + " (" + e2.toString() + ")</div>";
    }
  }
}

function includeShift(filename, shiftPos) {
  try {
    var tmp = HtmlService.createTemplateFromFile(filename);
    tmp.baseUrl = ScriptApp.getService().getUrl();
    tmp.pos     = shiftPos || '';
    return tmp.evaluate().getContent();
  } catch (e) {
    return "<div class='alert alert-danger'>ไม่พบไฟล์: " + filename + " (" + e.toString() + ")</div>";
  }
}

function checkAndInitialize() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1");
  if (!sheet) {
    sheet = ss.insertSheet("Sheet1");
    var headers = ["ID","วันที่","เลขเล่ม","ใบเริ่ม","เห็น","ได้ยิน","ร่างกาย","จิตใจ","สติปัญญา","เรียนรู้","ออทิสติก","จำนวนใบ","ใบสุดท้าย","ประเภท"];
    sheet.getRange(1,1,1,headers.length).setValues([headers]).setBackground("#0d6efd").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("dd/MM/yyyy");
    sheet.getRange("D:D").setNumberFormat("000");
    sheet.getRange("M:M").setNumberFormat("000");
  }
  initSheet2();
  initTaskSheet();
}

function getDataSummary() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1");
    if (!sheet) return JSON.stringify({ error: "ไม่พบแผ่นงาน Sheet1" });
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return JSON.stringify({ status: "success", data: [] });
    var tz = ss.getSpreadsheetTimeZone();
    var cleanData = values.slice(1).map(function(r) {
      var row = r.slice();
      if (row[1] instanceof Date) {
        row[1] = Utilities.formatDate(row[1], tz, "yyyy-MM-dd");
      } else if (row[1]) {
        row[1] = row[1].toString();
      }
      return row;
    });
    return JSON.stringify({ status: "success", data: cleanData });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
}

function getNextAvailablePage(bookNo) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
    if (!sheet) return 1;
    var data = sheet.getDataRange().getValues();
    var lastEnd = 0, found = false;
    var bookStr = bookNo.toString().trim();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][2].toString().trim() === bookStr) {
        var endVal = parseInt(data[i][12]);
        if (!isNaN(endVal)) lastEnd = Math.max(lastEnd, endVal);
        found = true;
      }
    }
    if (found) return (lastEnd + 1);
    var lastDigit = parseInt(bookStr.slice(-1));
    if (isNaN(lastDigit)) return 1;
    if (lastDigit === 0) lastDigit = 10;
    return ((lastDigit - 1) * 100) + 1;
  } catch (e) { return 1; }
}

function saveBatchData(payload) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1");
    if (!sheet) return JSON.stringify({ status: "error", message: "ไม่พบ Sheet1" });
    var tz = ss.getSpreadsheetTimeZone();
    var saveDate = payload.customDate
      ? payload.customDate
      : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var dataToSave = payload.books.map(function(b, i) {
      var v = [0,0,0,0,0,0,0];
      var bookCount = 0;
      if (payload.isInitial) {
        var startVal = parseInt(b.start) || 0;
        var endVal   = parseInt(b.end)   || 0;
        bookCount = endVal >= startVal ? (endVal - startVal + 1) : 0;
      } else {
        bookCount = parseInt(b.count) || 0;
        if (payload.totalCoupons > 0 && bookCount > 0) {
          var prop = bookCount / payload.totalCoupons;
          v = payload.totals.map(function(t) { return Math.floor((parseInt(t)||0) * prop); });
          if (i === payload.books.length - 1) {
            payload.totals.forEach(function(t, idx) {
              var s = payload.books.slice(0,-1).reduce(function(acc, curr) {
                return acc + Math.floor((parseInt(payload.totals[idx])||0) * ((parseInt(curr.count)||0) / payload.totalCoupons));
              }, 0);
              v[idx] = (parseInt(t)||0) - s;
            });
          }
        }
      }
      return [Utilities.getUuid(), saveDate, b.no.toString(), parseInt(b.start)||0,
              v[0],v[1],v[2],v[3],v[4],v[5],v[6], bookCount, parseInt(b.end)||0,
              payload.isInitial ? "ตั้งค่า" : "ปกติ"];
    });
    if (dataToSave.length > 0) {
      sheet.getRange(sheet.getLastRow()+1, 1, dataToSave.length, 14).setValues(dataToSave);
      sheet.getRange("B:B").setNumberFormat("dd/MM/yyyy");
      sheet.getRange("D:D").setNumberFormat("000");
      sheet.getRange("M:M").setNumberFormat("000");
    }
    return JSON.stringify({ status: "success" });
  } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }); }
}

function verifyAdmin(p) { return p === ADMIN_PASSWORD; }

// =====================================================
// MERGE AND SAVE — บันทึกแบบรวมยอดถ้ามีเล่มเดียวกันวันเดียวกัน
// =====================================================
function mergeAndSave(payload) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1");
    if (!sheet) return JSON.stringify({ status: "error", message: "ไม่พบ Sheet1" });
    var tz       = ss.getSpreadsheetTimeZone();
    var saveDate = payload.customDate || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    var bookNosToMerge = {};
    payload.books.forEach(function(b) { bookNosToMerge[b.no.toString().trim()] = true; });

    // หา start ดั้งเดิม (เล็กสุด) ของแต่ละเล่มในวันนั้น
    var originalStarts = {};
    var data = sheet.getDataRange().getValues();
    data.slice(1).forEach(function(row) {
      var rowBook = row[2].toString().trim();
      var rowDate = row[1] instanceof Date
        ? Utilities.formatDate(row[1], tz, 'yyyy-MM-dd')
        : row[1].toString().substring(0, 10);
      if (bookNosToMerge[rowBook] && rowDate === saveDate) {
        var rowStart = parseInt(row[3]) || 0;
        if (!originalStarts[rowBook] || rowStart < originalStarts[rowBook]) {
          originalStarts[rowBook] = rowStart;
        }
      }
    });

    // ลบแถวเก่าของเล่มที่ซ้ำในวันเดียวกัน (reverse เพื่อไม่ให้ index เลื่อน)
    for (var i = data.length - 1; i >= 1; i--) {
      var rowBook = data[i][2].toString().trim();
      var rowDate = data[i][1] instanceof Date
        ? Utilities.formatDate(data[i][1], tz, 'yyyy-MM-dd')
        : data[i][1].toString().substring(0, 10);
      if (bookNosToMerge[rowBook] && rowDate === saveDate) {
        sheet.deleteRow(i + 1);
      }
    }

    // ปรับ start และ count ให้เป็น range เต็มตั้งแต่ต้นวัน
    var adjustedBooks = payload.books.map(function(b) {
      var origStart = originalStarts[b.no.toString().trim()];
      if (origStart && origStart > 0) {
        var newCount = parseInt(b.end) - origStart + 1;
        return { no: b.no, start: origStart, end: b.end, count: newCount };
      }
      return b;
    });
    var adjustedTotal = adjustedBooks.reduce(function(s, b) { return s + (parseInt(b.count) || 0); }, 0);

    return saveBatchData({
      books:        adjustedBooks,
      totals:       payload.totals,
      totalCoupons: adjustedTotal,
      customDate:   saveDate,
      isInitial:    payload.isInitial
    });
  } catch(e) {
    return JSON.stringify({ status: "error", message: e.toString() });
  }
}

function deleteEntry(id, p) {
  if (p !== ADMIN_PASSWORD) return { status: "error", message: "Unauthorized" };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === id) sheet.deleteRow(i + 1);
    }
    return { status: "success" };
  } catch (e) { return { status: "error", message: e.toString() }; }
}

function updateData(id, d, p) {
  if (p !== ADMIN_PASSWORD) return { status: "error", message: "Unauthorized" };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
    var v = sheet.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (v[i][0] === id) {
        var c = (parseInt(d.endNo) - parseInt(v[i][3])) + 1;
        sheet.getRange(i+1, 5, 1, 9).setValues([[
          parseInt(d.v1)||0, parseInt(d.v2)||0, parseInt(d.v3)||0,
          parseInt(d.v4)||0, parseInt(d.v5)||0, parseInt(d.v6)||0,
          parseInt(d.v7)||0, c, parseInt(d.endNo)
        ]]);
        return { status: "success" };
      }
    }
    return { status: "error", message: "ไม่พบรายการ ID: " + id };
  } catch (e) { return { status: "error", message: e.toString() }; }
}

function fixSheetHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet1") || ss.insertSheet("Sheet1");
  sheet.clearContents();
  var headers = ["ID","วันที่","เลขเล่ม","ใบเริ่ม","เห็น","ได้ยิน","ร่างกาย","จิตใจ","สติปัญญา","เรียนรู้","ออทิสติก","จำนวนใบ","ใบสุดท้าย","ประเภท"];
  sheet.getRange(1,1,1,headers.length).setValues([headers]).setBackground("#0d6efd").setFontColor("white").setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.getRange("B:B").setNumberFormat("dd/MM/yyyy");
  sheet.getRange("D:D").setNumberFormat("000");
  sheet.getRange("M:M").setNumberFormat("000");
  Logger.log("✅ Header ครบ " + headers.length + " คอลัมน์แล้ว");
}

// =====================================================
// PASSENGER MODULE — Sheet2
// =====================================================

function initSheet2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet2");
  if (!sheet) {
    sheet = ss.insertSheet("Sheet2");
    var headers = [
      "ID", "วันที่",
      "ขาเข้า-Rabbit", "ขาเข้า-ThinCard", "ขาเข้า-รวม",
      "ขาออก-Rabbit", "ขาออก-ThinCard", "ขาออก-รวม",
      "รวมทั้งหมด"
    ];
    sheet.getRange(1,1,1,headers.length)
      .setValues([headers])
      .setBackground("#198754")
      .setFontColor("white")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("dd/MM/yyyy");
  }
  return sheet;
}

function savePassengerData(payload) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = initSheet2();
    var tz = ss.getSpreadsheetTimeZone();
    var saveDate = payload.date
      ? payload.date
      : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    var inRabbit   = parseInt(payload.inRabbit)   || 0;
    var inTrin     = parseInt(payload.inTrin)     || 0;
    var outRabbit  = parseInt(payload.outRabbit)  || 0;
    var outTrin    = parseInt(payload.outTrin)    || 0;
    var inTotal    = inRabbit  + inTrin;
    var outTotal   = outRabbit + outTrin;
    var grandTotal = inTotal   + outTotal;

    var row = [
      Utilities.getUuid(), saveDate,
      inRabbit, inTrin, inTotal,
      outRabbit, outTrin, outTotal,
      grandTotal
    ];

    if (payload.editId) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === payload.editId) {
          sheet.getRange(i+1, 1, 1, 9).setValues([row]);
          return JSON.stringify({ status: "success" });
        }
      }
    }

    sheet.getRange(sheet.getLastRow()+1, 1, 1, 9).setValues([row]);
    sheet.getRange("B:B").setNumberFormat("dd/MM/yyyy");
    return JSON.stringify({ status: "success" });
  } catch(e) {
    return JSON.stringify({ status: "error", message: e.toString() });
  }
}

function getPassengerData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet2");
    if (!sheet) return JSON.stringify({ status: "success", data: [] });
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return JSON.stringify({ status: "success", data: [] });
    var tz = ss.getSpreadsheetTimeZone();
    var data = values.slice(1).map(function(r) {
      var row = r.slice();
      if (row[1] instanceof Date) {
        row[1] = Utilities.formatDate(row[1], tz, "yyyy-MM-dd");
      } else if (row[1]) {
        row[1] = row[1].toString();
      }
      return row;
    });
    return JSON.stringify({ status: "success", data: data });
  } catch(e) {
    return JSON.stringify({ error: e.toString() });
  }
}

function deletePassengerEntry(id, p) {
  if (p !== ADMIN_PASSWORD) return { status: "error", message: "Unauthorized" };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet2");
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === id) sheet.deleteRow(i+1);
    }
    return { status: "success" };
  } catch(e) { return { status: "error", message: e.toString() }; }
}

// =====================================================
// TASK MODULE — Sheet "Tasks"
// =====================================================

var TASK_SHEET = 'Tasks';

function initTaskSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TASK_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TASK_SHEET);
    var headers = [
      "ID", "วันที่สร้าง", "หัวข้อ", "รายละเอียด",
      "ผู้รับผิดชอบ", "วันครบกำหนด", "ลำดับความสำคัญ", "สถานะ", "หมายเหตุ", "แก้ไขล่าสุด"
    ];
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground("#fd7e14")
      .setFontColor("white")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("dd/MM/yyyy");
    sheet.getRange("F:F").setNumberFormat("dd/MM/yyyy");
    sheet.setColumnWidths(1, 10, 160);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(3, 240);
    sheet.setColumnWidth(4, 300);
  }
  return sheet;
}

function getTaskData() {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(TASK_SHEET);
    if (!sheet) return JSON.stringify({ status: 'success', data: [] });
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ status: 'success', data: [] });
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var tz   = ss.getSpreadsheetTimeZone();
    var data = rows
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r) {
        return [
          r[0].toString(),
          r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : r[1].toString(),
          r[2].toString(),
          r[3].toString(),
          r[4].toString(),
          r[5] instanceof Date ? Utilities.formatDate(r[5], tz, 'yyyy-MM-dd') : r[5].toString(),
          r[6].toString(),
          r[7].toString(),
          r[8].toString()
        ];
      });
    return JSON.stringify({ status: 'success', data: data });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function saveTaskData(payload) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = initTaskSheet();
    var tz    = ss.getSpreadsheetTimeZone();
    var now   = new Date();
    var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

    if (payload.editId) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return JSON.stringify({ status: 'error', message: 'ไม่พบข้อมูล' });
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var rowIdx = -1;
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0].toString() === payload.editId.toString()) { rowIdx = i + 2; break; }
      }
      if (rowIdx === -1) return JSON.stringify({ status: 'error', message: 'ไม่พบรายการที่แก้ไข' });
      sheet.getRange(rowIdx, 3, 1, 8).setValues([[
        payload.title,
        payload.desc     || '',
        payload.assignee || '',
        payload.dueDate  ? new Date(payload.dueDate) : '',
        payload.priority || 'กลาง',
        payload.status   || 'รอดำเนินการ',
        payload.note     || '',
        now
      ]]);
    } else {
      var newId = 'TASK_' + now.getTime();
      sheet.appendRow([
        newId,
        today,
        payload.title,
        payload.desc     || '',
        payload.assignee || '',
        payload.dueDate  ? new Date(payload.dueDate) : '',
        payload.priority || 'กลาง',
        payload.status   || 'รอดำเนินการ',
        payload.note     || '',
        now
      ]);
      sheet.getRange("B:B").setNumberFormat("dd/MM/yyyy");
      sheet.getRange("F:F").setNumberFormat("dd/MM/yyyy");
    }
    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function deleteTaskEntry(id, p) {
  if (p !== ADMIN_PASSWORD) return { status: 'error', message: 'Unauthorized' };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TASK_SHEET);
    if (!sheet) return { status: 'error', message: 'ไม่พบ Sheet' };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'ไม่พบข้อมูล' };
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0].toString() === id.toString()) {
        sheet.deleteRow(i + 2);
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'ไม่พบรายการ' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

// =====================================================
// EMPLOYEE MODULE — Sheet "Employees"
// =====================================================

var EMP_SHEET = 'Employees';

function getEmployeeData() {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    if (!sheet) return JSON.stringify({ status: 'success', data: [] });
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ status: 'success', data: [] });
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    var data = rows
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r) {
        return [
          r[0].toString(),
          r[1].toString(),
          r[2].toString(),
          r[3].toString(),
          r[4].toString(),
          r[5].toString(),
          r[6] ? Utilities.formatDate(new Date(r[6]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
          r[7].toString(),
          r[8].toString()
        ];
      });
    return JSON.stringify({ status: 'success', data: data });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.message });
  }
}

function getEmployeeById(empId) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    if (!sheet) return JSON.stringify({ status: 'notfound' });
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ status: 'notfound' });
    var rows = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1].toString().trim() === empId.toString().trim()) {
        return JSON.stringify({
          status:     'success',
          empId:      rows[i][1].toString(),
          name:       rows[i][2].toString(),
          position:   rows[i][3].toString(),
          department: rows[i][4].toString(),
          empStatus:  rows[i][5].toString()
        });
      }
    }
    return JSON.stringify({ status: 'notfound' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.message });
  }
}

function saveEmployee(payload) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(EMP_SHEET);
      sheet.appendRow(['ID','EmpId','Name','Position','Department',
                       'Status','StartDate','Phone','Note','Timestamp']);
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, 10, 150);
      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(2, 100);
      sheet.setColumnWidth(3, 180);
    }
    var now = new Date();
    if (payload.editId) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return JSON.stringify({ status: 'error', message: 'ไม่พบข้อมูล' });
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var rowIdx = -1;
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0].toString() === payload.editId.toString()) { rowIdx = i + 2; break; }
      }
      if (rowIdx === -1) return JSON.stringify({ status: 'error', message: 'ไม่พบรายการที่แก้ไข' });
      sheet.getRange(rowIdx, 2, 1, 9).setValues([[
        payload.empId, payload.name, payload.position, payload.department,
        payload.status,
        payload.startDate ? new Date(payload.startDate) : '',
        payload.phone, payload.note, now
      ]]);
    } else {
      var newId = 'EMP_' + now.getTime();
      sheet.appendRow([
        newId, payload.empId, payload.name, payload.position, payload.department,
        payload.status,
        payload.startDate ? new Date(payload.startDate) : '',
        payload.phone, payload.note, now
      ]);
    }
    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.message });
  }
}

function deleteEmployee(id, pass) {
  try {
    if (!verifyAdmin(pass)) return { status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' };
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    if (!sheet) return { status: 'error', message: 'ไม่พบ Sheet' };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'ไม่พบข้อมูล' };
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0].toString() === id.toString()) {
        sheet.deleteRow(i + 2);
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'ไม่พบรายการ' };
  } catch(e) {
    return { status: 'error', message: e.message };
  }
}

// =====================================================
// OGS MODULE — Sheet "Leave"
// =====================================================

var LEAVE_SHEET = 'Leave';

function getLeaveData() {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LEAVE_SHEET);
    if (!sheet) return JSON.stringify({ status: 'success', data: [] });
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return JSON.stringify({ status: 'success', data: [] });
    var rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    var data = rows
      .filter(function(r) { return r[0] !== ''; })
      .map(function(r) {
        return [
          r[0].toString(),
          r[1] ? Utilities.formatDate(new Date(r[1]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
          r[2].toString(),
          r[3].toString(),
          r[4].toString(),
          r[5].toString(),
          r[6].toString(),
          r[7],
          r[8],
          r[9].toString()
        ];
      });
    return JSON.stringify({ status: 'success', data: data });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.message });
  }
}

function saveLeaveData(payload) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LEAVE_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(LEAVE_SHEET);
      sheet.appendRow(['ID','Date','EmpId','EmpName','Position',
                       'Status','Type','Days','Minutes','Note','Timestamp']);
      sheet.setFrozenRows(1);
    }
    var now = new Date();
    if (payload.editId) {
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return JSON.stringify({ status: 'error', message: 'ไม่พบข้อมูล' });
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var rowIdx = -1;
      for (var i = 0; i < ids.length; i++) {
        if (ids[i][0].toString() === payload.editId.toString()) { rowIdx = i + 2; break; }
      }
      if (rowIdx === -1) return JSON.stringify({ status: 'error', message: 'ไม่พบรายการที่แก้ไข' });
      sheet.getRange(rowIdx, 2, 1, 10).setValues([[
        new Date(payload.date), payload.empId, payload.empName,
        payload.position, payload.status, payload.type,
        payload.days, payload.minutes, payload.note, now
      ]]);
    } else {
      var newId = 'LV_' + now.getTime();
      sheet.appendRow([
        newId, new Date(payload.date), payload.empId, payload.empName,
        payload.position, payload.status, payload.type,
        payload.days, payload.minutes, payload.note, now
      ]);
    }
    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.message });
  }
}

function deleteLeaveEntry(id, pass) {
  try {
    if (!verifyAdmin(pass)) return { status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' };
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LEAVE_SHEET);
    if (!sheet) return { status: 'error', message: 'ไม่พบ Sheet' };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'ไม่พบข้อมูล' };
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0].toString() === id.toString()) {
        sheet.deleteRow(i + 2);
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'ไม่พบรายการ' };
  } catch(e) {
    return { status: 'error', message: e.message };
  }
}

// =====================================================
// FIRESTORE — ระบบยำกะผี
// =====================================================
var FS_PROJECT = 'gen-lang-client-0528383957';
var FS_DB      = 'ai-studio-01987361-573e-4f30-9681-1e83b5c491e3';
var FS_BASE    = 'https://firestore.googleapis.com/v1/projects/' + FS_PROJECT +
                 '/databases/' + FS_DB + '/documents/';

function toFirestoreFields(obj) {
  var fields = {};
  Object.keys(obj).forEach(function(k) {
    var v = obj[k];
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      fields[k] = { integerValue: String(v) };
    } else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map(function(item) {
        return { stringValue: String(item) };
      }) } };
    } else {
      fields[k] = { stringValue: String(v) };
    }
  });
  return fields;
}

function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  var obj = {};
  obj.id = doc.name ? doc.name.split('/').pop() : '';
  Object.keys(doc.fields).forEach(function(k) {
    var fv = doc.fields[k];
    if      (fv.stringValue  !== undefined) obj[k] = fv.stringValue;
    else if (fv.integerValue !== undefined) obj[k] = parseInt(fv.integerValue);
    else if (fv.doubleValue  !== undefined) obj[k] = fv.doubleValue;
    else if (fv.booleanValue !== undefined) obj[k] = fv.booleanValue;
    else if (fv.nullValue    !== undefined) obj[k] = null;
    else if (fv.arrayValue   !== undefined) {
      obj[k] = (fv.arrayValue.values || []).map(function(item) {
        if (item.stringValue  !== undefined) return item.stringValue;
        if (item.integerValue !== undefined) return parseInt(item.integerValue);
        return null;
      });
    } else { obj[k] = null; }
  });
  return obj;
}

function fsGetCollection(collection) {
  var token = ScriptApp.getOAuthToken();
  var url   = FS_BASE + collection + '?pageSize=500';
  var res   = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return [];
  var data = JSON.parse(res.getContentText());
  return data.documents || [];
}

function fsPatchField(collection, docId, fields) {
  var token = ScriptApp.getOAuthToken();
  var url   = FS_BASE + collection + '/' + docId +
              '?updateMask.fieldPaths=' + Object.keys(fields).join('&updateMask.fieldPaths=');
  var res   = UrlFetchApp.fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ fields: toFirestoreFields(fields) }),
    muteHttpExceptions: true
  });
  return res.getResponseCode();
}

// ===== Public functions called by ShiftSS / ShiftAStS / ShiftSP =====

function gasGetAllData(yearMonth) {
  try {
    var members  = fsGetCollection('members').map(fromFirestoreDoc).filter(Boolean);
    var allShifts = fsGetCollection('shifts').map(fromFirestoreDoc).filter(Boolean);
    var shifts   = allShifts.filter(function(s) {
      return !yearMonth || (s.date && s.date.slice(0, 7) === yearMonth);
    });
    var requests = fsGetCollection('swapRequests').map(fromFirestoreDoc).filter(Boolean);
    return JSON.stringify({ status: 'success', data: { members: members, shifts: shifts, requests: requests } });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasSaveShift(memberId, date, shiftCode) {
  try {
    var token  = ScriptApp.getOAuthToken();
    var docId  = memberId + '_' + date;
    var url    = FS_BASE + 'shifts/' + docId;
    var res    = UrlFetchApp.fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ fields: toFirestoreFields({ memberId: memberId, date: date, shiftCode: shiftCode }) }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() < 300) return JSON.stringify({ status: 'success' });
    return JSON.stringify({ status: 'error', message: 'HTTP ' + res.getResponseCode() });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasCreateSwapRequest(dataJson) {
  try {
    var d     = JSON.parse(dataJson);
    var docId = 'REQ_' + new Date().getTime();
    var token = ScriptApp.getOAuthToken();
    var url   = FS_BASE + 'swapRequests?documentId=' + docId;
    var fields = {
      requesterId: d.requesterId   || '',
      requesterName: d.requesterName || '',
      targetId:    d.targetId      || '',
      targetName:  d.targetName    || '',
      requesterDate: d.requesterDate || '',
      targetDate:  d.targetDate    || '',
      requesterShift: d.requesterShift || '',
      targetShift: d.targetShift   || '',
      reason:      d.reason        || '',
      status:      'pending',
      createdAt:   new Date().toISOString()
    };
    var res = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ fields: toFirestoreFields(fields) }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() < 300) return JSON.stringify({ status: 'success', id: docId });
    return JSON.stringify({ status: 'error', message: 'HTTP ' + res.getResponseCode() });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasApproveSwapRequest(requestId, autoMemberId, autoDate, autoCode) {
  try {
    fsPatchField('swapRequests', requestId, { status: 'approved' });
    if (autoMemberId && autoDate && autoCode) {
      gasSaveShift(autoMemberId, autoDate, autoCode);
    }
    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasRejectSwapRequest(requestId) {
  try {
    fsPatchField('swapRequests', requestId, { status: 'rejected' });
    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasGetAllDataByPosition(yearMonth, position) {
  try {
    // อ่านรายชื่อพนักงานตามตำแหน่งจาก Sheet
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    var sheetEmployees = []; // { empId, name }
    var allowedNames   = null;

    if (position && sheet && sheet.getLastRow() >= 2) {
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
      allowedNames = [];
      var posLower = position.toLowerCase().trim();
      rows.forEach(function(r) {
        var empPos = r[3].toString().toLowerCase().trim();
        if (empPos === posLower || empPos.indexOf(posLower) >= 0 || posLower.indexOf(empPos) >= 0) {
          var name  = r[2].toString().trim();
          var empId = r[1].toString().trim();
          if (name) {
            allowedNames.push(name.toLowerCase());
            sheetEmployees.push({ empId: empId, name: name });
          }
        }
      });
    }

    // ดึง members จาก Firestore แล้ว filter ตาม allowedNames
    var memberDocs = fsGetCollection('members');
    var allMembers = memberDocs.map(fromFirestoreDoc).filter(Boolean);
    var members = allowedNames === null ? allMembers : allMembers.filter(function(m) {
      return allowedNames.indexOf(m.name.trim().toLowerCase()) >= 0;
    });

    // เพิ่ม placeholder สำหรับพนักงานใน Sheet แต่ยังไม่มีใน Firestore
    var firestoreNameSet = {};
    members.forEach(function(m) { firestoreNameSet[m.name.trim().toLowerCase()] = true; });
    sheetEmployees.forEach(function(emp) {
      if (!firestoreNameSet[emp.name.toLowerCase()]) {
        members.push({
          id: 'EMP_' + (emp.empId || emp.name),
          name: emp.name,
          role: 'member',
          shiftPattern: [],
          cycleStartDate: '',
          _fromSheet: true
        });
      }
    });

    // ดึง shifts, requests, และ shiftProperties
    var allShifts = fsGetCollection('shifts').map(fromFirestoreDoc).filter(Boolean);
    var shifts = allShifts.filter(function(s) {
      return !yearMonth || (s.date && s.date.slice(0, 7) === yearMonth);
    });
    var requests = fsGetCollection('swapRequests').map(fromFirestoreDoc).filter(Boolean);
    var shiftProperties = fsGetCollection('shiftProperties').map(fromFirestoreDoc).filter(Boolean);

    return JSON.stringify({ status: 'success', data: { members: members, shifts: shifts, requests: requests, shiftProperties: shiftProperties } });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasDeleteShift(memberId, date) {
  try {
    var token = ScriptApp.getOAuthToken();
    var docId = memberId + '_' + date;
    var url   = FS_BASE + 'shifts/' + docId;
    UrlFetchApp.fetch(url, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasPinLogin(empId, pin, position) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    if (!sheet || sheet.getLastRow() < 2)
      return JSON.stringify({ status: 'error', message: 'ไม่พบข้อมูลพนักงาน' });

    var lastCol = Math.max(sheet.getLastColumn(), 11);
    var rows    = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    var posLower = position.toLowerCase().trim();

    var empRow = null;
    rows.forEach(function(r) {
      if (r[1].toString().trim() === empId.toString().trim()) {
        var ep = r[3].toString().toLowerCase().trim();
        if (ep === posLower || ep.indexOf(posLower) >= 0 || posLower.indexOf(ep) >= 0)
          empRow = r;
      }
    });
    if (!empRow) return JSON.stringify({ status: 'error', message: 'ไม่พบรหัสพนักงานในตำแหน่งนี้' });

    var storedPin  = empRow[10] ? empRow[10].toString().trim() : '';
    var defaultPin = empId.toString().trim().slice(-4);
    var checkPin   = storedPin || defaultPin;
    if (pin.toString().trim() !== checkPin)
      return JSON.stringify({ status: 'error', message: 'PIN ไม่ถูกต้อง' });

    var empName = empRow[2].toString().trim();
    var allMembers = fsGetCollection('members').map(fromFirestoreDoc).filter(Boolean);
    var member = null;
    allMembers.forEach(function(m) {
      if (m.name.trim().toLowerCase() === empName.toLowerCase()) member = m;
    });
    if (!member) member = { id: 'EMP_' + empId, name: empName, role: 'member' };

    return JSON.stringify({ status: 'success', member: { id: member.id, name: member.name, role: member.role || 'member', empId: empId.toString().trim() } });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasGetMemberPins(position) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    if (!sheet || sheet.getLastRow() < 2)
      return JSON.stringify({ status: 'success', data: [] });

    var lastCol  = Math.max(sheet.getLastColumn(), 11);
    var rows     = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    var posLower = position.toLowerCase().trim();
    var result   = [];
    rows.forEach(function(r) {
      var ep = r[3].toString().toLowerCase().trim();
      if (ep === posLower || ep.indexOf(posLower) >= 0 || posLower.indexOf(ep) >= 0) {
        var name  = r[2].toString().trim();
        var empId = r[1].toString().trim();
        var pin   = r[10] ? r[10].toString().trim() : '';
        if (name) result.push({ empId: empId, name: name, hasPin: pin.length > 0 });
      }
    });
    return JSON.stringify({ status: 'success', data: result });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

function gasSetMemberPin(empId, newPin, position) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    if (!sheet || sheet.getLastRow() < 2)
      return JSON.stringify({ status: 'error', message: 'ไม่พบ sheet' });

    var lastCol  = Math.max(sheet.getLastColumn(), 11);
    var rows     = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    var posLower = position.toLowerCase().trim();
    var rowIndex = -1;
    rows.forEach(function(r, i) {
      if (r[1].toString().trim() === empId.toString().trim()) {
        var ep = r[3].toString().toLowerCase().trim();
        if (ep === posLower || ep.indexOf(posLower) >= 0 || posLower.indexOf(ep) >= 0)
          rowIndex = i;
      }
    });
    if (rowIndex < 0) return JSON.stringify({ status: 'error', message: 'ไม่พบพนักงาน' });
    sheet.getRange(rowIndex + 2, 11).setValue(newPin);
    return JSON.stringify({ status: 'success' });
  } catch(e) {
    return JSON.stringify({ status: 'error', message: e.toString() });
  }
}

// =====================================================
// gasGetAllMembersJSON — JSON API สำหรับ React import
// เรียกผ่าน GET ?action=getAllMembers
// =====================================================
function gasGetAllMembersJSON(callback) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(EMP_SHEET);
    var result;
    if (!sheet || sheet.getLastRow() < 2) {
      result = { status: 'success', members: [] };
    } else {
      var lastRow = sheet.getLastRow();
      var rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
      var members = [];
      rows.forEach(function(r) {
        var empId = r[1].toString().trim();
        var name  = r[2].toString().trim();
        if (!empId || !name) return;
        members.push({
          empId:      empId,
          name:       name,
          position:   r[3].toString().trim(),
          department: r[4].toString().trim(),
          status:     r[5].toString().trim(),
          phone:      r[7].toString().trim(),
          email:      r[11] ? r[11].toString().trim() : ''
        });
      });
      result = { status: 'success', members: members };
    }
    var json = JSON.stringify(result);
    var output = callback
      ? ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
    return output;
  } catch(err) {
    var errJson = JSON.stringify({ status: 'error', message: err.toString() });
    var output = callback
      ? ContentService.createTextOutput(callback + '(' + errJson + ')').setMimeType(ContentService.MimeType.JAVASCRIPT)
      : ContentService.createTextOutput(errJson).setMimeType(ContentService.MimeType.JSON);
    return output;
  }
}
function testGetAllMembers() {
  var result = gasGetAllMembersJSON(null);
  Logger.log(result.getContent());
}