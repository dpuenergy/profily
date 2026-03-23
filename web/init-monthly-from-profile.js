(function () {
  function _setVal(id, v) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function _readMonthlyFromOutProfile() {
    var pre = document.getElementById("outProfile");
    if (!pre) return null;
    var raw = (pre.textContent || "").trim();
    if (!raw) return null;
    // try to extract JSON between first '{' and last '}'
    var s = raw.indexOf("{");
    var e = raw.lastIndexOf("}");
    if (s === -1 || e === -1 || e <= s) return null;
    var jsonText = raw.slice(s, e + 1);
    try {
      var obj = JSON.parse(jsonText);
      if (
        obj &&
        Array.isArray(obj.monthly_share) &&
        obj.monthly_share.length === 12
      ) {
        return obj.monthly_share.map(Number);
      }
    } catch (err) {
      console &&
        console.warn &&
        console.warn("Cannot parse outProfile JSON:", err);
    }
    return null;
  }
  function resetMonthlyFromOutProfile() {
    try {
      var shares = _readMonthlyFromOutProfile();
      if (!shares) {
        console &&
          console.warn &&
          console.warn("monthly_share not found in #outProfile");
        return;
      }
      var sumS = shares.reduce(function (a, b) {
        return a + (Number(b) || 0);
      }, 0);
      if (!(sumS > 0)) {
        console && console.warn && console.warn("monthly_share sum is zero");
        return;
      }

      var annualEl = document.getElementById("annual");
      var annual = Number(annualEl && annualEl.value ? annualEl.value : 0) || 0;

      var abs = shares.map(function (s) {
        return ((Number(s) || 0) / sumS) * annual;
      });
      for (var i = 1; i <= 12; i++) {
        _setVal("mval_" + i, (abs[i - 1] || 0).toFixed(3));
      }
      if (typeof window.rebuildAndRender === "function")
        window.rebuildAndRender();
    } catch (e) {
      console &&
        console.warn &&
        console.warn("resetMonthlyFromOutProfile failed:", e);
    }
  }
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("btnResetMonthly");
    if (btn) btn.addEventListener("click", resetMonthlyFromOutProfile);
  });
})();
