// ═══════════════════════════════════════════════════════════════
//  StockControl — echter QR-Encoder (Byte-Modus, Fehlerkorrektur M)
//
//  Bewusst ohne Fremdbibliothek: die Etiketten müssen auch dann
//  druckbar sein, wenn kein Nachladen aus dem Netz möglich ist.
//  Versionen 1 bis 9 reichen für jede Artikelkennung um ein Vielfaches
//  (Version 9 fasst rund 180 Zeichen).
//
//  window.SCQR.encode(text) → { size, modules: boolean[][] }
// ═══════════════════════════════════════════════════════════════
(function () {
  "use strict";

  // Pro Version: [Codewörter gesamt, EC-Codewörter je Block, Blockaufbau]
  // Blockaufbau: [[Anzahl Blöcke, Datencodewörter je Block], …]
  var V = {
    1: [26, 10, [[1, 16]]],
    2: [44, 16, [[1, 28]]],
    3: [70, 26, [[1, 44]]],
    4: [100, 18, [[2, 32]]],
    5: [134, 24, [[2, 43]]],
    6: [172, 16, [[4, 27]]],
    7: [196, 18, [[4, 31]]],
    8: [242, 22, [[2, 38], [2, 39]]],
    9: [292, 22, [[3, 36], [2, 37]]]
  };

  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46]
  };

  // 18-Bit-Versionsinformation, erst ab Version 7 aufgedruckt.
  var VERSION_BITS = {
    7: "000111110010010100",
    8: "001000010110111100",
    9: "001001101010011001"
  };

  // 15-Bit-Formatinformation für Fehlerkorrektur M, je Maske 0–7.
  var FORMAT_M = [
    "101010000010010", "101000100100101", "101111001111100", "101101101001011",
    "100010111111001", "100000011001110", "100111110010111", "100101010100000"
  ];

  // ── Galois-Körper GF(256), Generatorpolynom 0x11d ──────────────
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function genPoly(n) {
    var p = [1];
    for (var i = 0; i < n; i++) {
      var q = p.concat([0]);
      for (var j = 0; j < p.length; j++) q[j + 1] ^= gmul(p[j], EXP[i]);
      p = q;
    }
    return p;
  }

  function ecBytes(data, n) {
    var gen = genPoly(n), res = data.concat(new Array(n).fill(0));
    for (var i = 0; i < data.length; i++) {
      var f = res[i];
      if (!f) continue;
      for (var j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], f);
    }
    return res.slice(data.length);
  }

  // ── Bitstrom aufbauen ──────────────────────────────────────────
  function toBytes(text) {
    var out = [], s = unescape(encodeURIComponent(String(text)));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }

  function pickVersion(len) {
    for (var v = 1; v <= 9; v++) {
      var spec = V[v], data = 0;
      spec[2].forEach(function (b) { data += b[0] * b[1]; });
      // Kopf: 4 Bit Modus + 8 Bit Länge = 12 Bit
      if (data * 8 >= len * 8 + 12) return v;
    }
    return null;
  }

  function dataCodewords(v, bytes) {
    var spec = V[v], total = 0;
    spec[2].forEach(function (b) { total += b[0] * b[1]; });

    var bits = "0100";                                   // Byte-Modus
    bits += ("00000000" + bytes.length.toString(2)).slice(-8);
    bytes.forEach(function (b) { bits += ("00000000" + b.toString(2)).slice(-8); });

    var cap = total * 8;
    bits += "0000".slice(0, Math.min(4, cap - bits.length));   // Abschluss
    while (bits.length % 8) bits += "0";                       // auf Byte runden

    var cw = [];
    for (var i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.substr(i, 8), 2));
    var pad = [0xec, 0x11], k = 0;
    while (cw.length < total) cw.push(pad[k++ % 2]);           // Füllmuster
    return cw;
  }

  // Daten- und EC-Codewörter blockweise verschränken.
  function interleave(v, cw) {
    var spec = V[v], ecLen = spec[1], blocks = [], at = 0;
    spec[2].forEach(function (b) {
      for (var i = 0; i < b[0]; i++) {
        var d = cw.slice(at, at + b[1]);
        at += b[1];
        blocks.push({ d: d, e: ecBytes(d, ecLen) });
      }
    });
    var out = [], max = 0;
    blocks.forEach(function (b) { max = Math.max(max, b.d.length); });
    for (var i = 0; i < max; i++) blocks.forEach(function (b) { if (i < b.d.length) out.push(b.d[i]); });
    for (var j = 0; j < ecLen; j++) blocks.forEach(function (b) { out.push(b.e[j]); });
    return out;
  }

  // ── Raster aufbauen ────────────────────────────────────────────
  function build(v) {
    var n = 17 + v * 4;
    var m = [], res = [];
    for (var y = 0; y < n; y++) { m.push(new Array(n).fill(false)); res.push(new Array(n).fill(false)); }

    function finder(ox, oy) {
      for (var y = -1; y <= 7; y++) for (var x = -1; x <= 7; x++) {
        var px = ox + x, py = oy + y;
        if (px < 0 || py < 0 || px >= n || py >= n) continue;
        var on = (x >= 0 && x <= 6 && (y === 0 || y === 6)) ||
                 (y >= 0 && y <= 6 && (x === 0 || x === 6)) ||
                 (x >= 2 && x <= 4 && y >= 2 && y <= 4);
        m[py][px] = on; res[py][px] = true;
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);

    for (var i = 8; i < n - 8; i++) {          // Taktlinien
      var on = i % 2 === 0;
      m[6][i] = on; res[6][i] = true;
      m[i][6] = on; res[i][6] = true;
    }

    var ap = ALIGN[v];
    for (var a = 0; a < ap.length; a++) for (var b = 0; b < ap.length; b++) {
      var cx = ap[a], cy = ap[b];
      if ((cx <= 8 && cy <= 8) || (cx <= 8 && cy >= n - 9) || (cx >= n - 9 && cy <= 8)) continue;
      for (var yy = -2; yy <= 2; yy++) for (var xx = -2; xx <= 2; xx++) {
        m[cy + yy][cx + xx] = Math.max(Math.abs(xx), Math.abs(yy)) !== 1;
        res[cy + yy][cx + xx] = true;
      }
    }

    m[n - 8][8] = true; res[n - 8][8] = true;  // dunkles Modul

    for (var k = 0; k <= 8; k++) {             // Platz für die Formatinfo
      if (k !== 6) { res[8][k] = true; res[k][8] = true; }
    }
    for (var q = 0; q < 8; q++) { res[8][n - 1 - q] = true; res[n - 1 - q][8] = true; }

    if (v >= 7) {
      for (var t = 0; t < 18; t++) {
        var r = Math.floor(t / 3), c = t % 3;
        res[r][n - 11 + c] = true; res[n - 11 + c][r] = true;
      }
    }
    return { n: n, m: m, res: res };
  }

  function placeData(g, cw) {
    var n = g.n, bits = [];
    cw.forEach(function (b) { for (var i = 7; i >= 0; i--) bits.push((b >> i) & 1); });
    var idx = 0, up = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;                    // die senkrechte Taktlinie überspringen
      for (var r = 0; r < n; r++) {
        var y = up ? n - 1 - r : r;
        for (var c = 0; c < 2; c++) {
          var x = col - c;
          if (g.res[y][x]) continue;
          g.m[y][x] = idx < bits.length ? bits[idx] === 1 : false;
          idx++;
        }
      }
      up = !up;
    }
  }

  function maskFn(k) {
    return [
      function (y, x) { return (y + x) % 2 === 0; },
      function (y) { return y % 2 === 0; },
      function (y, x) { return x % 3 === 0; },
      function (y, x) { return (y + x) % 3 === 0; },
      function (y, x) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; },
      function (y, x) { return (y * x) % 2 + (y * x) % 3 === 0; },
      function (y, x) { return ((y * x) % 2 + (y * x) % 3) % 2 === 0; },
      function (y, x) { return ((y + x) % 2 + (y * x) % 3) % 2 === 0; }
    ][k];
  }

  // Strafpunkte nach der Norm — je weniger, desto besser lesbar.
  function penalty(m, n) {
    var p = 0, i, j, run, dark = 0;
    for (i = 0; i < n; i++) {
      run = 1;
      for (j = 1; j < n; j++) {
        if (m[i][j] === m[i][j - 1]) { run++; } else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) p += 3 + (run - 5);
      run = 1;
      for (j = 1; j < n; j++) {
        if (m[j][i] === m[j - 1][i]) { run++; } else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) p += 3 + (run - 5);
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < n - 1; j++) {
      var a = m[i][j];
      if (a === m[i][j + 1] && a === m[i + 1][j] && a === m[i + 1][j + 1]) p += 3;
    }
    var pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    var pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    function match(arr, pat) {
      for (var k = 0; k < 11; k++) if (arr[k] !== pat[k]) return false;
      return true;
    }
    for (i = 0; i < n; i++) for (j = 0; j <= n - 11; j++) {
      var row = [], colv = [];
      for (var k = 0; k < 11; k++) { row.push(m[i][j + k]); colv.push(m[j + k][i]); }
      if (match(row, pat1) || match(row, pat2)) p += 40;
      if (match(colv, pat1) || match(colv, pat2)) p += 40;
    }
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (m[i][j]) dark++;
    p += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }

  function writeFormat(m, n, mask) {
    var f = FORMAT_M[mask];
    for (var i = 0; i < 15; i++) {
      var on = f[i] === "1";
      // obere linke Ecke
      if (i < 6) m[8][i] = on;
      else if (i === 6) m[8][7] = on;
      else if (i === 7) m[8][8] = on;
      else if (i === 8) m[7][8] = on;
      else m[14 - i][8] = on;
      // gespiegelt an den beiden anderen Ecken
      if (i < 8) m[n - 1 - i][8] = on;
      else m[8][n - 15 + i] = on;
    }
  }

  function writeVersion(m, n, v) {
    var bits = VERSION_BITS[v];
    if (!bits) return;
    for (var i = 0; i < 18; i++) {
      var on = bits[17 - i] === "1";
      var r = Math.floor(i / 3), c = i % 3;
      m[r][n - 11 + c] = on;
      m[n - 11 + c][r] = on;
    }
  }

  function encode(text) {
    var bytes = toBytes(text);
    var v = pickVersion(bytes.length);
    if (!v) throw new Error("Text zu lang für einen QR-Code dieser Größe");
    var cw = interleave(v, dataCodewords(v, bytes));
    var g = build(v);
    placeData(g, cw);
    if (v >= 7) writeVersion(g.m, g.n, v);

    // Alle acht Masken durchrechnen und die ruhigste nehmen.
    var best = null, bestP = Infinity;
    for (var k = 0; k < 8; k++) {
      var fn = maskFn(k);
      var cand = g.m.map(function (row) { return row.slice(); });
      for (var y = 0; y < g.n; y++) for (var x = 0; x < g.n; x++) {
        if (!g.res[y][x] && fn(y, x)) cand[y][x] = !cand[y][x];
      }
      writeFormat(cand, g.n, k);
      var p = penalty(cand, g.n);
      if (p < bestP) { bestP = p; best = cand; }
    }
    return { size: g.n, modules: best };
  }

  window.SCQR = { encode: encode };
})();
