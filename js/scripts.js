(function () {
  "use strict";

  // Fixed rules (not user inputs)
  var ASSISTANCE_RATE = 0.20;
  var ASSISTANCE_CAP = 3000;

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // ---------- Core calculation (pure) ----------
  function getStatus(payable, payment) {
    if (payable === 0 && payment === 0) return { label: "No Patient Balance", css: "none" };
    if (payment > payable) return { label: "Excess Payment", css: "excess" };
    if (payment === payable) return { label: "Fully Paid", css: "full" };
    if (payment === 0) return { label: "Unpaid", css: "unpaid" };
    return { label: "Partially Paid", css: "partial" };
  }

  function compute(d) {
    var room = round2(d.days * d.roomRate);                              // 1
    var total = round2(room + d.lab + d.med + d.fees);                   // 2
    var benefit = round2(d.benefit);
    var remaining = Math.max(0, round2(total - benefit));                // 3
    var benefitExceeds = benefit > total;
    var assistance = 0;                                                  // 4-5
    if (d.eligible) {
      assistance = Math.min(round2(remaining * ASSISTANCE_RATE), ASSISTANCE_CAP);
    }
    var payable = round2(remaining - assistance);                        // 6
    var payment = round2(d.payment);
    var status = getStatus(payable, payment);                            // 7
    var diff = round2(payable - payment);                                // 8

    return {
      room: room,
      lab: round2(d.lab),
      med: round2(d.med),
      fees: round2(d.fees),
      total: total,
      benefit: Math.min(benefit, total),
      benefitExceeds: benefitExceeds,
      remaining: remaining,
      assistance: assistance,
      capped: d.eligible && round2(remaining * ASSISTANCE_RATE) > ASSISTANCE_CAP,
      payable: payable,
      payment: payment,
      status: status,
      diffIsExcess: diff < 0,
      diff: Math.abs(diff)
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { compute: compute, round2: round2 };
  }
  if (typeof document === "undefined") return;

  // ---------- UI ----------
  var form = document.getElementById("billForm");
  var emptyState = document.getElementById("emptyState");
  var results = document.getElementById("results");
  var notice = document.getElementById("notice");

  var textFields = ["patientName", "hospitalName"];
  var numFields = ["days", "roomRate", "labCharges", "medCharges", "proFees", "benefit", "payment"];
  var labels = {
    patientName: "patient's name",
    hospitalName: "hospital name",
    days: "number of days admitted",
    roomRate: "daily room rate",
    labCharges: "laboratory and procedure charges",
    medCharges: "medicine charges",
    proFees: "professional fees",
    benefit: "benefit amount",
    payment: "patient's payment"
  };

  function $(id) { return document.getElementById(id); }

  function peso(n) {
    return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setError(id, msg) {
    var box = document.querySelector('.err[data-for="' + id + '"]');
    if (box) box.textContent = msg;
    $(id).classList.add("invalid");
  }

  function clearError(id) {
    var box = document.querySelector('.err[data-for="' + id + '"]');
    if (box) box.textContent = "";
    $(id).classList.remove("invalid");
  }

  function validate() {
    var ok = true;
    var values = {};

    textFields.forEach(function (id) {
      clearError(id);
      var v = $(id).value.trim();
      if (!v) { setError(id, "Please enter the " + labels[id] + "."); ok = false; }
      values[id] = v;
    });

    numFields.forEach(function (id) {
      clearError(id);
      var raw = $(id).value.trim();
      var n = Number(raw);
      if (raw === "" || isNaN(n)) {
        setError(id, "Please enter the " + labels[id] + ".");
        ok = false;
      } else if (n < 0) {
        setError(id, "Must be zero or greater.");
        ok = false;
      } else if (id === "days" && !Number.isInteger(n)) {
        setError(id, "Days admitted must be a whole number.");
        ok = false;
      }
      values[id] = n;
    });

    if (!ok) {
      var first = document.querySelector("input.invalid");
      if (first) first.focus();
      return null;
    }

    return {
      patientName: values.patientName,
      hospitalName: values.hospitalName,
      days: values.days,
      roomRate: values.roomRate,
      lab: values.labCharges,
      med: values.medCharges,
      fees: values.proFees,
      benefit: values.benefit,
      payment: values.payment,
      eligible: form.elements.eligibility.value === "Eligible"
    };
  }

  function renderMix(r) {
    var parts = [
      { k: "room", name: "Room", v: r.room },
      { k: "lab", name: "Lab & procedures", v: r.lab },
      { k: "med", name: "Medicines", v: r.med },
      { k: "fees", name: "Prof. fees", v: r.fees }
    ];
    var bar = $("mixBar");
    var legend = $("mixLegend");
    bar.innerHTML = "";
    legend.innerHTML = "";
    if (r.total <= 0) return;

    parts.forEach(function (p) {
      if (p.v <= 0) return;
      var pct = (p.v / r.total) * 100;
      var seg = document.createElement("i");
      seg.className = "c-" + p.k;
      seg.style.width = pct + "%";
      bar.appendChild(seg);

      var li = document.createElement("li");
      var dot = document.createElement("i");
      dot.className = "c-" + p.k;
      li.appendChild(dot);
      li.appendChild(document.createTextNode(p.name + " " + Math.round(pct) + "%"));
      legend.appendChild(li);
    });
  }

  function render(d, r) {
    $("outPatient").textContent = d.patientName;
    $("outHospital").textContent = d.hospitalName;

    $("outRoomNote").textContent = "(" + d.days + " day" + (d.days === 1 ? "" : "s") + " × " + peso(d.roomRate) + ")";
    $("outRoom").textContent = peso(r.room);
    $("outLab").textContent = peso(r.lab);
    $("outMed").textContent = peso(r.med);
    $("outFees").textContent = peso(r.fees);
    $("outTotal").textContent = peso(r.total);
    $("outBenefit").textContent = (r.benefit > 0 ? "− " : "") + peso(r.benefit);
    $("outRemaining").textContent = peso(r.remaining);

    $("outAssistNote").textContent = d.eligible
      ? (r.capped ? "(20%, capped at " + peso(ASSISTANCE_CAP) + ")" : "(20%)")
      : "(not eligible)";
    $("outAssist").textContent = (r.assistance > 0 ? "− " : "") + peso(r.assistance);

    $("outPayable").textContent = peso(r.payable);
    $("outPayable2").textContent = peso(r.payable);
    $("outPayment").textContent = peso(r.payment);
    $("outDiffLabel").textContent = r.diffIsExcess ? "Excess payment to return" : "Unpaid balance";
    $("outDiff").textContent = peso(r.diff);

    var badge = $("outStatus");
    badge.textContent = r.status.label;
    badge.className = "badge " + r.status.css;
    $("payableCard").className = "payable-card " + r.status.css;

    if (r.benefitExceeds) {
      notice.textContent = "The benefit amount is larger than the total bill, so only " +
        peso(r.total) + " of it is applied and nothing remains payable.";
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }

    $("stmtDate").textContent = "Generated " + new Date().toLocaleDateString("en-PH", {
      year: "numeric", month: "long", day: "numeric"
    });

    renderMix(r);
    emptyState.hidden = true;
    results.hidden = false;
  }

  function showEmpty() {
    results.hidden = true;
    emptyState.hidden = false;
    $("stmtDate").textContent = "Awaiting patient details";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = validate();
    if (!data) { showEmpty(); return; }
    render(data, compute(data));
  });

  $("resetBtn").addEventListener("click", function () {
    form.reset();
    textFields.concat(numFields).forEach(clearError);
    showEmpty();
  });

  $("printBtn").addEventListener("click", function () { window.print(); });

  textFields.concat(numFields).forEach(function (id) {
    $(id).addEventListener("input", function () { clearError(id); });
  });
})();
