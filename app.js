// ========== CONFIG ==========
const SUPABASE_URL = "https://klkqhllylooezrohnpdh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsa3FobGx5bG9vZXpyb2hucGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzOTQ1MzksImV4cCI6MjEwODk3MDUzOX0.vRQkIr2EmGN3K20bLvgWlQShyUsizIVzG3r-VugIBTc";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CURRENCY = "₦";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function money(n) {
  return (
    CURRENCY +
    Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })
  );
}
function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  $("#toastStack").appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ========== AUTH ==========
let isSignupMode = false;
let currentUser = null;
let productsCache = [];

function showLogin() {
  $("#loginScreen").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
  $("#resetScreen").classList.add("hidden");
}
function showApp() {
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  $("#resetScreen").classList.add("hidden");
}
function showReset() {
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.add("hidden");
  $("#resetScreen").classList.remove("hidden");
}

$("#authToggle").addEventListener("click", (e) => {
  e.preventDefault();
  isSignupMode = !isSignupMode;
  $("#authTitle").textContent = isSignupMode
    ? "Create account"
    : "Welcome back";
  $("#authSub").textContent = isSignupMode
    ? "Sign up to start selling"
    : "Sign in to record sales";
  $("#authSubmit").textContent = isSignupMode ? "Create Account" : "Sign In";
  $("#authToggleText").textContent = isSignupMode
    ? "Already have an account?"
    : "No account?";
  $("#authToggle").textContent = isSignupMode ? "Sign in" : "Create one";
  $("#authError").textContent = "";
});

// ========== FORGOT PASSWORD ==========
$("#forgotPasswordLink").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = $("#authEmail").value.trim();
  const errEl = $("#authError");
  errEl.textContent = "";

  if (!email) {
    errEl.textContent =
      "Enter your email above first, then click Forgot password.";
    $("#authEmail").focus();
    return;
  }

  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw error;
    toast("Reset link sent — check your email.");
    errEl.textContent = "";
  } catch (err) {
    errEl.textContent = err.message;
  }
});

$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const errEl = $("#authError");
  errEl.textContent = "";
  $("#authSubmit").disabled = true;
  try {
    if (isSignupMode) {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        errEl.textContent = "Check your email to confirm, then sign in.";
        return;
      }
      toast("Account created!");
      await onSignedIn(data.user);
    } else {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast("Welcome back!");
      await onSignedIn(data.user);
    }
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    $("#authSubmit").disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  currentUser = null;
  showLogin();
});

// ========== RESET PASSWORD FORM ==========
$("#resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#newPassword").value;
  const pw2 = $("#confirmPassword").value;
  const errEl = $("#resetError");
  errEl.textContent = "";

  if (pw !== pw2) {
    errEl.textContent = "Passwords do not match.";
    return;
  }
  if (pw.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    return;
  }

  $("#resetSubmit").disabled = true;
  try {
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) throw error;
    toast("Password updated! Please sign in.");
    await db.auth.signOut();
    showLogin();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    $("#resetSubmit").disabled = false;
  }
});

$("#backToLogin").addEventListener("click", (e) => {
  e.preventDefault();
  showLogin();
});

async function onSignedIn(user) {
  currentUser = user;
  showApp();
  $("#dashboardDate").value = todayISO();
  await loadProducts();
  await loadDashboard();
  speakWelcome();
}

function speakWelcome() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const message =
      "Welcome to Elias Communication. Your sales tracker is ready.";
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang.includes("en-GB") || v.lang.includes("en-US"),
    );
    if (preferredVoice) utterance.voice = preferredVoice;
    window.speechSynthesis.speak(utterance);
  }
}

// Boot: check existing session + handle password recovery
(async () => {
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );
  const isRecovery =
    hashParams.get("type") === "recovery" ||
    window.location.hash.includes("type=recovery");

  if (isRecovery) {
    const {
      data: { session },
    } = await db.auth.getSession();
    history.replaceState(null, "", window.location.pathname);
    if (session?.user) {
      currentUser = session.user;
      showReset();
      return;
    }
  }

  const {
    data: { session },
  } = await db.auth.getSession();
  if (session?.user) {
    await onSignedIn(session.user);
  } else {
    showLogin();
  }

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      showLogin();
    }
    if (event === "PASSWORD_RECOVERY") {
      currentUser = session?.user || null;
      showReset();
    }
  });
})();

// ========== VIEW SWITCHING ==========
function switchView(name) {
  $$(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.view === name),
  );
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $(`#view-${name}`).classList.remove("hidden");
  const titles = {
    dashboard: ["Dashboard", "Your business at a glance"],
    transactions: ["Transactions", "Search history"],
    products: ["Products", "Your inventory catalog"],
    reports: ["Reports", "Monthly summary"],
  };
  $("#pageTitle").textContent = titles[name][0];
  $("#pageSubtitle").textContent = titles[name][1];
  if (name === "transactions") loadTransactions();
  if (name === "products") loadProducts();
  if (name === "reports") loadReports();
}
$$(".nav-item").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    switchView(el.dataset.view);
  }),
);

// ========== PRODUCTS ==========
async function loadProducts() {
  const { data, error } = await db.from("products").select("*").order("name");
  if (error) {
    toast("Load products failed: " + error.message, "error");
    return;
  }
  productsCache = data || [];
  renderProductDatalist();
  renderProductTable();
}

function renderProductDatalist() {
  $("#productList").innerHTML = productsCache
    .map((p) => `<option value="${escapeHtml(p.name)}"></option>`)
    .join("");
}

function renderProductTable() {
  const tbody = $("#productTable tbody");
  if (!tbody) return;
  const q = ($("#productSearch")?.value || "").toLowerCase();
  const list = productsCache.filter((p) => p.name.toLowerCase().includes(q));
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No products yet — add your first item</td></tr>';
    return;
  }
  list.forEach((p) => {
    const margin = p.selling_price - p.cost_price;
    tbody.innerHTML += `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.unit || "pcs")}</td>
      <td>${money(p.cost_price)}</td>
      <td>${money(p.selling_price)}</td>
      <td class="text-green">${money(margin)}</td>
      <td>
        <button class="btn-edit" data-id="${p.id}">Edit</button>
        <button class="btn-del" data-id="${p.id}">Delete</button>
      </td>
    </tr>`;
  });
  $$("#productTable .btn-edit").forEach((b) =>
    b.addEventListener("click", () =>
      openProductModal(productsCache.find((p) => p.id === b.dataset.id)),
    ),
  );
  $$("#productTable .btn-del").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this product?")) return;
      const { error } = await db
        .from("products")
        .delete()
        .eq("id", b.dataset.id);
      if (error) {
        toast(error.message, "error");
        return;
      }
      toast("Product deleted");
      await loadProducts();
    }),
  );
}

function openProductModal(product = null) {
  $("#productModalTitle").textContent = product
    ? "Edit Product"
    : "Add Product";
  const f = $("#productForm");
  f.reset();
  $("#productIdEdit").value = product?.id || "";
  if (product) {
    f.name.value = product.name;
    f.unit.value = product.unit || "pcs";
    f.cost_price.value = product.cost_price;
    f.selling_price.value = product.selling_price;
    if (f.barcode) f.barcode.value = product.barcode || "";
  }
  $("#productModal").classList.remove("hidden");
}

$("#openNewProduct").addEventListener("click", () => openProductModal());
$("#closeProduct").addEventListener("click", () =>
  $("#productModal").classList.add("hidden"),
);
$("#cancelProduct").addEventListener("click", () =>
  $("#productModal").classList.add("hidden"),
);
$("#productSearch")?.addEventListener("input", renderProductTable);

$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return toast("Please log in", "error");
  const f = e.target;
  const fd = new FormData(f);
  const payload = {
    user_id: currentUser.id,
    name: fd.get("name").trim(),
    unit: fd.get("unit").trim() || "pcs",
    cost_price: Number(fd.get("cost_price")),
    selling_price: Number(fd.get("selling_price")),
  };
  const barcodeVal = (fd.get("barcode") || "").trim();
  if (barcodeVal) payload.barcode = barcodeVal;

  const editId = fd.get("id");
  let error;
  if (editId) {
    ({ error } = await db.from("products").update(payload).eq("id", editId));
  } else {
    ({ error } = await db.from("products").insert(payload));
  }
  if (error) {
    toast("Save failed: " + error.message, "error");
    return;
  }
  toast(editId ? "Product updated" : "Product added");
  $("#productModal").classList.add("hidden");
  await loadProducts();
});

// ========== DASHBOARD ==========
async function loadDashboard() {
  if (!currentUser) return;
  const dateStr = $("#dashboardDate").value || todayISO();
  const monthStr = dateStr.slice(0, 7);

  const { data: dayData } = await db
    .from("sales_transactions")
    .select("*")
    .eq("transaction_date", dateStr)
    .order("created_at", { ascending: false });
  const { data: monthData } = await db
    .from("sales_transactions")
    .select("*")
    .gte("transaction_date", monthStr + "-01")
    .lte("transaction_date", monthStr + "-31");

  const daySales = (dayData || []).reduce(
    (s, t) => s + Number(t.total_amount),
    0,
  );
  const dayProfit = (dayData || []).reduce(
    (s, t) => s + (t.selling_price - t.cost_price) * t.quantity,
    0,
  );
  const monthSales = (monthData || []).reduce(
    (s, t) => s + Number(t.total_amount),
    0,
  );
  const monthProfit = (monthData || []).reduce(
    (s, t) => s + (t.selling_price - t.cost_price) * t.quantity,
    0,
  );

  $("#statSales").textContent = money(daySales);
  $("#statProfit").textContent = money(dayProfit);
  $("#statMonthSales").textContent = money(monthSales);
  $("#statMonthProfit").textContent = money(monthProfit);
  renderRecent(dayData || []);
}

function renderRecent(list) {
  const tbody = $("#recentTable tbody");
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No transactions yet</td></tr>';
    return;
  }
  list.slice(0, 8).forEach((t) => {
    const profit = (t.selling_price - t.cost_price) * t.quantity;
    tbody.innerHTML += `<tr>
      <td>${escapeHtml(t.product_name)}</td>
      <td>${escapeHtml(t.customer_name || "—")}</td>
      <td>${money(t.total_amount)}</td>
      <td class="text-green">${money(profit)}</td>
      <td><button class="btn-receipt" data-id="${t.id}">Receipt</button></td>
    </tr>`;
  });
  $$(".btn-receipt").forEach((b) =>
    b.addEventListener("click", () => openReceipt(b.dataset.id)),
  );
}

// ========== TRANSACTIONS ==========
async function loadTransactions() {
  let query = db
    .from("sales_transactions")
    .select("*")
    .order("transaction_date", { ascending: false });
  const dateFilter = $("#txnDate").value;
  const searchFilter = $("#txnSearch").value.trim();
  if (dateFilter) query = query.eq("transaction_date", dateFilter);
  if (searchFilter)
    query = query.or(
      `product_name.ilike.%${searchFilter}%,customer_name.ilike.%${searchFilter}%`,
    );

  const { data } = await query;
  const tbody = $("#txnTable tbody");
  tbody.innerHTML = "";
  if (!data || !data.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No results</td></tr>';
    return;
  }
  data.forEach((t) => {
    const profit = (t.selling_price - t.cost_price) * t.quantity;
    tbody.innerHTML += `<tr>
      <td>${t.transaction_date}</td>
      <td>${escapeHtml(t.product_name)}</td>
      <td>${escapeHtml(t.customer_name || "—")}</td>
      <td>${money(t.total_amount)}</td>
      <td class="text-green">${money(profit)}</td>
      <td><button class="btn-receipt" data-id="${t.id}">Receipt</button></td>
    </tr>`;
  });
  $$(".btn-receipt").forEach((b) =>
    b.addEventListener("click", () => openReceipt(b.dataset.id)),
  );
}
$("#txnSearch")?.addEventListener("input", loadTransactions);
$("#txnDate")?.addEventListener("change", loadTransactions);

// ========== REPORTS ==========
async function loadReports() {
  if (!currentUser) return;
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data } = await db
    .from("sales_transactions")
    .select("*")
    .gte("transaction_date", monthStr + "-01")
    .lte("transaction_date", monthStr + "-31");
  const sales = (data || []).reduce((s, t) => s + Number(t.total_amount), 0);
  const profit = (data || []).reduce(
    (s, t) => s + (t.selling_price - t.cost_price) * t.quantity,
    0,
  );
  $("#rSales").textContent = money(sales);
  $("#rProfit").textContent = money(profit);
  $("#rCount").textContent = (data || []).length;
}

// ========== NEW TRANSACTION ==========
$("#openNewTxn").addEventListener("click", () => {
  $("#txnForm").reset();
  $("#productId").value = "";
  $("#liveProfit").textContent = money(0);
  $("#txnModal").classList.remove("hidden");
});
$("#closeModal").addEventListener("click", () =>
  $("#txnModal").classList.add("hidden"),
);
$("#cancelTxn").addEventListener("click", () =>
  $("#txnModal").classList.add("hidden"),
);

function handleProductInput() {
  const typed = $("#productInput").value.trim().toLowerCase();
  const match = productsCache.find((p) => p.name.toLowerCase() === typed);
  if (match) {
    $("#productId").value = match.id;
    $("#costInput").value = match.cost_price;
    $("#sellInput").value = match.selling_price;
  } else {
    $("#productId").value = "";
  }
  updateLiveProfit();
}
$("#productInput").addEventListener("input", handleProductInput);
$("#productInput").addEventListener("change", handleProductInput);

function updateLiveProfit() {
  const fd = new FormData($("#txnForm"));
  const qty = Number(fd.get("quantity")) || 0;
  const cost = Number(fd.get("cost_price")) || 0;
  const sell = Number(fd.get("selling_price")) || 0;
  $("#liveProfit").textContent = money((sell - cost) * qty);
}
$("#txnForm").addEventListener("input", updateLiveProfit);

$("#txnForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    toast("Please log in first", "error");
    return;
  }

  const fd = new FormData(e.target);
  const productId = fd.get("product_id") || null;

  const payload = {
    user_id: currentUser.id,
    product_id: productId || null,
    product_name: fd.get("product_name").trim(),
    quantity: Number(fd.get("quantity")),
    cost_price: Number(fd.get("cost_price")),
    selling_price: Number(fd.get("selling_price")),
    customer_name: fd.get("customer_name") || null,
    customer_phone: fd.get("customer_phone") || null,
    customer_email: fd.get("customer_email") || null,
    transaction_date: todayISO(),
  };

  const { error } = await db.from("sales_transactions").insert(payload);
  if (error) {
    toast("Save failed: " + error.message, "error");
    return;
  }
  toast("Sale recorded!");
  e.target.reset();
  $("#productId").value = "";
  $("#txnModal").classList.add("hidden");
  loadDashboard();
});

// ========== RECEIPT + WHATSAPP ==========
let currentReceiptTxn = null;

async function openReceipt(id) {
  const { data } = await db
    .from("sales_transactions")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) return;
  currentReceiptTxn = data;
  const profit = (data.selling_price - data.cost_price) * data.quantity;
  $("#receiptSummary").innerHTML = `
    <strong>${escapeHtml(data.product_name)}</strong> × ${data.quantity}<br>
    Total: ${money(data.total_amount)} · Profit: <span class="text-green">${money(profit)}</span><br>
    Customer: ${escapeHtml(data.customer_name || "Walk-in")}
  `;
  $("#receiptModal").classList.remove("hidden");
}
$("#closeReceipt").addEventListener("click", () =>
  $("#receiptModal").classList.add("hidden"),
);

async function generateReceiptPDF(txn) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Elias Commucations", 40, 60);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Sales Receipt", 40, 82);
  doc.text("Receipt #: " + txn.id.slice(0, 8), 40, 98);
  doc.text("Date: " + txn.transaction_date, 40, 114);

  doc.setDrawColor(220);
  doc.line(40, 130, 555, 130);
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text("Item", 40, 154);
  doc.text("Qty", 350, 154);
  doc.text("Price", 420, 154);
  doc.text("Total", 490, 154);

  doc.setFontSize(11);
  doc.text(String(txn.product_name), 40, 178);
  doc.text(String(txn.quantity), 350, 178);
  doc.text(Number(txn.selling_price).toFixed(2), 420, 178);
  doc.text(Number(txn.total_amount).toFixed(2), 490, 178);

  doc.line(40, 200, 555, 200);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Total:", 420, 224);
  doc.text("NGN " + Number(txn.total_amount).toLocaleString(), 490, 224);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Thank you for your purchase!", 40, 270);

  return doc.output("blob");
}

async function uploadReceiptAndGetUrl(txn) {
  const blob = await generateReceiptPDF(txn);
  const path = `receipts/${txn.id}.pdf`;
  const { error } = await db.storage
    .from("receipts")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const { data } = db.storage.from("receipts").getPublicUrl(path);
  return data.publicUrl;
}

$("#sendWhatsapp").addEventListener("click", async () => {
  if (!currentReceiptTxn?.customer_phone) {
    toast("Customer phone number missing", "error");
    return;
  }
  try {
    toast("Generating receipt link...");
    const url = await uploadReceiptAndGetUrl(currentReceiptTxn);

    let phone = currentReceiptTxn.customer_phone.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "234" + phone.slice(1);

    const message = `Hello ${currentReceiptTxn.customer_name || "Customer"}, here is your receipt from Ledgerly: ${url}`;
    const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    window.open(waLink, "_blank");

    toast("Opening WhatsApp... Click 'Send' to deliver.");
    $("#receiptModal").classList.add("hidden");
  } catch (err) {
    toast(err.message, "error");
  }
});

$("#sendEmail").addEventListener("click", async () => {
  if (!currentReceiptTxn?.customer_email) {
    toast("Customer email missing", "error");
    return;
  }

  try {
    toast("Generating receipt link...");
    const url = await uploadReceiptAndGetUrl(currentReceiptTxn);

    const subject = `Your Receipt from Ledgerly - #${currentReceiptTxn.id.slice(0, 8)}`;
    const body = `Hello ${currentReceiptTxn.customer_name || "Customer"},\n\nThank you for your purchase!\n\nItem: ${currentReceiptTxn.product_name}\nQuantity: ${currentReceiptTxn.quantity}\nTotal: ₦${Number(currentReceiptTxn.total_amount).toLocaleString()}\n\nYou can download your PDF receipt here:\n${url}\n\nBest regards,\nLedgerly Store`;

    const mailtoLink = `mailto:${currentReceiptTxn.customer_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = mailtoLink;

    toast("Opening email app... Click 'Send' to deliver.");
    $("#receiptModal").classList.add("hidden");
  } catch (err) {
    console.error("Email Error:", err);
    toast("Upload failed: " + err.message, "error");
  }
});

// ========== INIT ==========
$("#dashboardDate").value = todayISO();
$("#dashboardDate").addEventListener("change", loadDashboard);

// ========== HELPERS ==========
function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

// ========== BARCODE SCANNER ==========

// Polyfill BarcodeDetector if the browser doesn't have it (safe if CDN blocked)
if (typeof window.BarcodeDetector === "undefined") {
  if (typeof barcodeDetectorPolyfill !== "undefined") {
    window.BarcodeDetector = barcodeDetectorPolyfill.BarcodeDetectorPolyfill;
    console.log("BarcodeDetector: using polyfill");
  } else {
    console.warn(
      "BarcodeDetector: native unavailable and polyfill not loaded. Scanner will not work.",
    );
  }
} else {
  console.log("BarcodeDetector: native");
}

let scannerStream = null;
let scannerLoopActive = false;

window.startScanner = async function () {
  const video = document.getElementById("scannerVideo");
  const status = document.getElementById("scannerStatus");

  if (typeof window.BarcodeDetector === "undefined") {
    status.textContent =
      "Barcode scanning is not supported in this browser. Try Chrome on Android.";
    return;
  }

  try {
    // Use `ideal` so laptops (front-only cameras) also work
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    video.srcObject = scannerStream;
    await video.play();

    status.textContent = "Scanning... Hold steady.";

    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
    });

    scannerLoopActive = true;

    const scanLoop = async () => {
      if (!scannerLoopActive) return;

      try {
        const barcodes = await detector.detect(video);

        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;

          if (navigator.vibrate) navigator.vibrate(200);

          window.stopScanner();
          window.onBarcodeScanned(code);
          return;
        }
      } catch (err) {
        console.log("Detection error (ignored):", err.message);
      }

      if (scannerLoopActive) {
        setTimeout(scanLoop, 100);
      }
    };

    scanLoop();
  } catch (err) {
    status.textContent = "Camera error: " + err.message;
    console.error("Scanner error:", err);
  }
};

window.stopScanner = function () {
  scannerLoopActive = false;
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
  document.getElementById("scannerModal").classList.add("hidden");
};

window.onBarcodeScanned = function (barcodeValue) {
  const product = productsCache.find((p) => p.barcode === barcodeValue);

  if (product) {
    document.getElementById("productInput").value = product.name;
    // Let the existing handler fill id/cost/sell/profit consistently
    handleProductInput();
    document.getElementById("txnModal").classList.remove("hidden");
    toast("Product found: " + product.name);
  } else {
    document.getElementById("productInput").value = barcodeValue;
    handleProductInput();
    document.getElementById("txnModal").classList.remove("hidden");
    toast("New barcode scanned. Enter product details.", "error");
  }
};

// Event Listeners for Scanner
document.getElementById("openScanner")?.addEventListener("click", () => {
  document.getElementById("scannerModal").classList.remove("hidden");
  window.startScanner();
});

document
  .getElementById("closeScanner")
  ?.addEventListener("click", window.stopScanner);

// ========== BULK ADD PRODUCTS ==========

document.getElementById("openBulkAdd")?.addEventListener("click", () => {
  document.getElementById("bulkInput").value = "";
  document.getElementById("bulkPreview").innerHTML = "";
  document.getElementById("bulkFileName").textContent = "";
  document.getElementById("bulkFile").value = "";
  document.getElementById("bulkModal").classList.remove("hidden");
});

document.getElementById("closeBulk")?.addEventListener("click", () => {
  document.getElementById("bulkModal").classList.add("hidden");
});
document.getElementById("cancelBulk")?.addEventListener("click", () => {
  document.getElementById("bulkModal").classList.add("hidden");
});

function parseBulkInput(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const valid = [];
  const errors = [];
  lines.forEach((line, i) => {
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const [name, unit, cost, selling, barcode] = parts;
    if (!name) {
      errors.push(`Line ${i + 1}: missing name`);
      return;
    }
    const costNum = Number(cost);
    const sellNum = Number(selling);
    if (!cost || isNaN(costNum)) {
      errors.push(`Line ${i + 1}: invalid cost "${cost || ""}"`);
      return;
    }
    if (!selling || isNaN(sellNum)) {
      errors.push(`Line ${i + 1}: invalid selling price "${selling || ""}"`);
      return;
    }
    valid.push({
      name,
      unit: unit || "pcs",
      cost_price: costNum,
      selling_price: sellNum,
      barcode: barcode || null,
    });
  });
  return { valid, errors };
}

document.getElementById("previewBulk")?.addEventListener("click", () => {
  const text = document.getElementById("bulkInput").value;
  const { valid, errors } = parseBulkInput(text);
  const preview = document.getElementById("bulkPreview");
  if (!valid.length && !errors.length) {
    preview.innerHTML =
      '<span style="color:#94a3b8;">Nothing to preview.</span>';
    return;
  }
  let html = "";
  if (valid.length) {
    html += `<div style="color:#166534; margin-bottom:6px;"><strong>${valid.length} valid product(s):</strong></div>`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead><tr style="background:#f9fafb; text-align:left;">
        <th style="padding:4px 6px;">Name</th>
        <th style="padding:4px 6px;">Unit</th>
        <th style="padding:4px 6px;">Cost</th>
        <th style="padding:4px 6px;">Sell</th>
        <th style="padding:4px 6px;">Barcode</th>
      </tr></thead><tbody>`;
    valid.forEach((p) => {
      html += `<tr style="border-top:1px solid #f1f5f9;">
        <td style="padding:4px 6px;">${escapeHtml(p.name)}</td>
        <td style="padding:4px 6px;">${escapeHtml(p.unit)}</td>
        <td style="padding:4px 6px;">${money(p.cost_price)}</td>
        <td style="padding:4px 6px;">${money(p.selling_price)}</td>
        <td style="padding:4px 6px;">${escapeHtml(p.barcode || "—")}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  if (errors.length) {
    html += `<div style="color:#b91c1c; margin-top:10px;"><strong>${errors.length} error(s):</strong><ul style="margin:4px 0 0 16px; padding:0;">`;
    errors.forEach((e) => {
      html += `<li>${escapeHtml(e)}</li>`;
    });
    html += `</ul></div>`;
  }
  preview.innerHTML = html;
});

document.getElementById("saveBulk")?.addEventListener("click", async () => {
  if (!currentUser) {
    toast("Please log in first", "error");
    return;
  }
  const text = document.getElementById("bulkInput").value;
  const { valid, errors } = parseBulkInput(text);
  if (!valid.length) {
    toast("No valid products to save", "error");
    return;
  }
  if (errors.length) {
    const proceed = confirm(
      `${errors.length} line(s) had errors and will be skipped.\nContinue with ${valid.length} valid product(s)?`,
    );
    if (!proceed) return;
  }
  const btn = document.getElementById("saveBulk");
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    const payload = valid.map((p) => ({
      user_id: currentUser.id,
      name: p.name,
      unit: p.unit,
      cost_price: p.cost_price,
      selling_price: p.selling_price,
      barcode: p.barcode,
    }));
    const { error } = await db.from("products").insert(payload);
    if (error) throw error;
    toast(`${valid.length} product(s) added!`);
    document.getElementById("bulkModal").classList.add("hidden");
    await loadProducts();
  } catch (err) {
    toast("Bulk save failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save All";
  }
});

// ========== BULK ADD FROM EXCEL FILE ==========

document.getElementById("bulkFile")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  document.getElementById("bulkFileName").textContent = file.name;
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    if (!rows.length) {
      toast("File is empty", "error");
      return;
    }
    let startIdx = 0;
    const firstRow = rows[0].map((c) => String(c).toLowerCase().trim());
    if (
      firstRow[0] === "name" ||
      firstRow[0] === "product" ||
      firstRow[0] === "product name"
    ) {
      startIdx = 1;
    }
    const lines = [];
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      const name = String(row[0] ?? "").trim();
      const unit = String(row[1] ?? "").trim();
      const cost = String(row[2] ?? "").trim();
      const selling = String(row[3] ?? "").trim();
      const barcode = String(row[4] ?? "").trim();
      if (!name) continue;
      lines.push([name, unit, cost, selling, barcode].join(", "));
    }
    if (!lines.length) {
      toast("No product rows found in file", "error");
      return;
    }
    document.getElementById("bulkInput").value = lines.join("\n");
    document.getElementById("previewBulk").click();
    toast(`Loaded ${lines.length} row(s) from ${file.name}`);
  } catch (err) {
    console.error("File read error:", err);
    toast("Could not read file: " + err.message, "error");
  }
});
