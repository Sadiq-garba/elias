// ========== CONFIG ==========
const SUPABASE_URL = "https://klkqhllylooezrohnpdh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsa3FobGx5bG9vZXpyb2hucGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzOTQ1MzksImV4cCI6MjEwODk3MDUzOX0.vRQkIr2EmGN3K20bLvgWlQShyUsizIVzG3r-VugIBTc";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CURRENCY = "₦";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

$("#closeModal").addEventListener("click", () => {
  document.getElementById("txnModal").classList.add("hidden");
});
$("#cancelTxn").addEventListener("click", () => {
  clearCart();
  document.getElementById("txnModal").classList.add("hidden");
});

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
let saleCart = [];
let isProfitRevealed = false;
const MANAGER_PIN = "7290";

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
      '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No products found</td></tr>';
    updateInventorySummary([]);
    return;
  }

  list.forEach((p) => {
    const margin = p.selling_price - p.cost_price;
    const stock = p.unit || 0; // Using 'unit' column as stock

    // Color code the stock level
    let stockDisplay = "";
    if (stock === 0) {
      stockDisplay = `<span style="background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:4px; font-weight:600; font-size:12px;">Out of Stock</span>`;
    } else if (stock <= 5) {
      stockDisplay = `<span style="background:#fef3c7; color:#92400e; padding:4px 8px; border-radius:4px; font-weight:600; font-size:12px;">Low: ${stock}</span>`;
    } else {
      stockDisplay = `<span style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:4px; font-weight:600; font-size:12px;">${stock} pcs</span>`;
    }

    tbody.innerHTML += `<tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${stockDisplay}</td>
      <td>${money(p.cost_price)}</td>
      <td>${money(p.selling_price)}</td>
      <td class="text-green">${money(margin)}</td>
      <td>
        <button class="btn-edit" data-id="${p.id}">Edit</button>
        <button class="btn-del" data-id="${p.id}">Delete</button>
      </td>
    </tr>`;
  });

  // Update the summary cards at the top
  updateInventorySummary(productsCache);

  // Attach listeners
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

  const hideStyle = isProfitRevealed ? "" : "none";

  // Hide/Show table headers
  $$("#productTable th:nth-child(3)").forEach(
    (el) => (el.style.display = hideStyle),
  ); // Cost Price
  $$("#productTable th:nth-child(5)").forEach(
    (el) => (el.style.display = hideStyle),
  ); // Profit / Unit

  // Hide/Show table cells
  $$("#productTable td:nth-child(3)").forEach(
    (el) => (el.style.display = hideStyle),
  ); // Cost Price
  $$("#productTable td:nth-child(5)").forEach(
    (el) => (el.style.display = hideStyle),
  ); // Profit / Unit
}

// NEW: Calculate and show inventory totals
// NEW: Calculate and show inventory totals
// NEW: Calculate and show inventory totals
// NEW: Calculate and show inventory totals
function updateInventorySummary(products) {
  let totalItems = 0;
  let totalCost = 0;
  let lowStockCount = 0;

  products.forEach((p) => {
    // Force the stock to be a number, default to 0 if it's empty
    const stock = Number(p.unit) || 0;

    // Add the stock to the total
    totalItems += stock;

    // Force cost price to be a number
    const cost = Number(p.cost_price) || 0;
    totalCost += stock * cost;

    if (stock <= 5) lowStockCount++;
  });

  // Display the result
  $("#invTotalItems").textContent = totalItems.toLocaleString();
  $("#invTotalValue").textContent = money(totalCost);
  $("#invLowStock").textContent = lowStockCount;
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
    barcode: fd.get("barcode") || null, // <--- ADD THIS LINE
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

  const profitCards = [
    $("#statProfit").parentElement,
    $("#statMonthProfit").parentElement,
  ];
  profitCards.forEach((card) => {
    if (card) card.style.display = isProfitRevealed ? "" : "none";
  });
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
  if (saleCart.length === 0) {
    clearCart(); // ensures empty cart UI shows
  }
  document.getElementById("txnModal").classList.remove("hidden");
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

// ===== PHYSICAL SCANNER LOGIC =====
$("#productInput")?.addEventListener("keydown", (e) => {
  // Scanners automatically send an "Enter" key at the end of the barcode
  if (e.key === "Enter") {
    e.preventDefault(); // Stop the form from submitting immediately

    const scannedCode = e.target.value.trim();
    if (!scannedCode) return;

    // Find the product in your cache by matching the barcode
    const matchedProduct = productsCache.find((p) => p.barcode === scannedCode);

    if (matchedProduct) {
      // Auto-fill the form fields
      $("#productId").value = matchedProduct.id;
      $("#costInput").value = matchedProduct.cost_price;
      $("#sellInput").value = matchedProduct.selling_price;
      updateLiveProfit();
      toast(`Scanned: ${matchedProduct.name}`);

      // Move the cursor to the Quantity field so you can type the quantity
      $('input[name="quantity"]').focus();
      $('input[name="quantity"]').select();
    } else {
      toast(`Barcode ${scannedCode} not found in catalog`, "error");
    }
  }
});
// ========== REPLACE THE TWO #productInput keydown HANDLERS ==========
$("#productInput")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const val = e.target.value.trim();
  if (!val) return;

  // 1. Try barcode match
  let product = productsCache.find(
    (p) => p.barcode && String(p.barcode).trim() === val,
  );

  // 2. Fuzzy barcode (ignore spaces/dashes/case)
  if (!product) {
    const clean = val.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    product = productsCache.find((p) => {
      if (!p.barcode) return false;
      return (
        String(p.barcode)
          .replace(/[^A-Z0-9]/gi, "")
          .toUpperCase() === clean
      );
    });
  }

  // 3. Fallback: name match
  if (!product) {
    product = productsCache.find(
      (p) => p.name.toLowerCase() === val.toLowerCase(),
    );
  }

  if (product) {
    addToCart(product, 1);
    e.target.value = "";
    toast("Added: " + product.name);
  } else {
    toast(
      "Product not found — scan a saved barcode or type exact name.",
      "error",
    );
  }
});

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
  if (!currentUser) return toast("Please log in first", "error");
  if (!saleCart.length)
    return toast("Cart is empty — scan a product first.", "error");

  const fd = new FormData(e.target);
  const customer_name = (fd.get("customer_name") || "").trim() || null;
  const customer_phone = (fd.get("customer_phone") || "").trim() || null;
  const customer_email = (fd.get("customer_email") || "").trim() || null;

  // 1. Validate stock for every line
  for (const item of saleCart) {
    const p = productsCache.find((x) => x.id === item.product_id);
    const stock = Number(p?.unit) || 0;
    if (stock < item.quantity) {
      return toast(
        `Not enough stock for ${item.product_name}. Only ${stock} left.`,
        "error",
      );
    }
  }

  // 2. Insert one transaction row per cart item + reduce stock
  for (const item of saleCart) {
    const { error: txnErr } = await db.from("sales_transactions").insert({
      user_id: currentUser.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      cost_price: item.cost_price,
      selling_price: item.selling_price,
      customer_name,
      customer_phone,
      customer_email,
      transaction_date: todayISO(),
    });
    if (txnErr) return toast("Save failed: " + txnErr.message, "error");

    const p = productsCache.find((x) => x.id === item.product_id);
    const newStock = (Number(p?.unit) || 0) - item.quantity;
    const { error: stockErr } = await db
      .from("products")
      .update({ unit: newStock })
      .eq("id", item.product_id);
    if (stockErr)
      return toast("Stock update failed: " + stockErr.message, "error");
  }

  toast(`${saleCart.length} line(s) saved!`);
  clearCart();
  e.target.reset();
  $("#txnModal").classList.add("hidden");
  await loadProducts();
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

// ========== SALE CART ==========

function addToCart(product, qty = 1) {
  const existing = saleCart.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity += qty;
  } else {
    saleCart.push({
      product_id: product.id,
      product_name: product.name,
      cost_price: Number(product.cost_price),
      selling_price: Number(product.selling_price),
      quantity: qty,
    });
  }
  renderCart();
}

function removeFromCart(productId) {
  saleCart = saleCart.filter((i) => i.product_id !== productId);
  renderCart();
}

function clearCart() {
  saleCart = [];
  renderCart();
}

function renderCart() {
  const container = document.getElementById("cartList");
  const summary = document.getElementById("cartSummary");
  const modal = document.getElementById("txnModal");
  if (!container || !summary) return;

  if (!saleCart.length) {
    container.innerHTML =
      '<p style="color:#94a3b8; font-size:12.5px; text-align:center; margin:8px 0;">No items yet — scan or pick a product above.</p>';
    summary.textContent = "0 items · ₦0.00";
    return;
  }

  let html = "";
  let totalQty = 0;
  let totalAmount = 0;
  let totalProfit = 0;

  saleCart.forEach((item) => {
    const lineTotal = item.selling_price * item.quantity;
    const lineProfit = (item.selling_price - item.cost_price) * item.quantity;
    totalQty += item.quantity;
    totalAmount += lineTotal;
    totalProfit += lineProfit;

    html += `
      <div style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #f1f5f9;">
        <div style="flex:1;">
          <div style="font-weight:600; font-size:13px;">${escapeHtml(item.product_name)}</div>
          <div style="font-size:11.5px; color:#64748b;">
            ${money(item.selling_price)} × ${item.quantity} = <strong>${money(lineTotal)}</strong>
            · profit <span class="text-green">${money(lineProfit)}</span>
          </div>
        </div>
        <input
          type="number"
          min="1"
          value="${item.quantity}"
          data-cart-qty="${item.product_id}"
          style="width:60px; padding:4px 6px; font-size:12px;"
        />
        <button
          type="button"
          data-cart-remove="${item.product_id}"
          style="background:#fee2e2; color:#b91c1c; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px;"
        >✕</button>
      </div>`;
  });

  container.innerHTML = html;
  summary.textContent = `${totalQty} item(s) · Total ${money(totalAmount)} · Profit ${money(totalProfit)}`;

  // Wire qty inputs
  container.querySelectorAll("[data-cart-qty]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = e.target.dataset.cartQty;
      const val = Math.max(1, Number(e.target.value) || 1);
      const item = saleCart.find((i) => i.product_id === id);
      if (item) item.quantity = val;
      renderCart();
    });
  });

  // Wire remove buttons
  container.querySelectorAll("[data-cart-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      removeFromCart(e.currentTarget.dataset.cartRemove);
    });
  });
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
  const scanned = String(barcodeValue).trim();

  // 1. Try to find an exact match
  let product = productsCache.find(
    (p) => p.barcode && String(p.barcode).trim() === scanned,
  );

  // 2. If no exact match, try a "fuzzy" match (ignoring spaces, dashes, and case)
  if (!product) {
    const cleanScanned = scanned.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    product = productsCache.find((p) => {
      if (!p.barcode) return false;
      const cleanStored = String(p.barcode)
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase();
      return cleanStored === cleanScanned;
    });
  }

  // 3. If still no match, check if the scanned value contains the product name
  if (!product) {
    product = productsCache.find(
      (p) => p.name && scanned.toLowerCase().includes(p.name.toLowerCase()),
    );
  }

  if (product) {
    addToCart(product, 1);
    document.getElementById("txnModal").classList.remove("hidden");
    toast("Added: " + product.name);
    return;
  }

  // If we reach here, it's truly a new/unknown barcode
  toast("Barcode not recognized. Save it first from Products.", "error");
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
function generateBarcode(name, index) {
  // Short slug from name (letters/numbers only, max 8 chars)
  const slug =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "PROD";
  // Timestamp suffix so identical names still get unique codes
  const stamp =
    Date.now().toString().slice(-5) + String(index).padStart(2, "0");
  return `${slug}-${stamp}`;
}

function generateBarcode(name, index) {
  // Short slug from name (letters/numbers only, max 8 chars)
  const slug =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "PROD";
  // Timestamp suffix so identical names still get unique codes
  const stamp =
    Date.now().toString().slice(-5) + String(index).padStart(2, "0");
  return `${slug}-${stamp}`;
}
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
      barcode: barcode || generateBarcode(name, i),
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

// ========== BARCODE SHEET EXPORT ==========

// ========== BARCODE SHEET EXPORT ==========

// ========== BARCODE SHEET EXPORT ==========

// ========== BARCODE SHEET EXPORT ==========

// ========== BARCODE SHEET EXPORT ==========

// ========== BARCODE SHEET EXPORT ==========

// ========== BARCODE SHEET EXPORT (PAGINATED) ==========

// ========== BARCODE SHEET EXPORT (MULTI-PAGE PDF) ==========

// ========== BARCODE SHEET EXPORT (MULTI-PAGE PDF) ==========

// ========== BARCODE SHEET EXPORT (DIRECT PDF TEXT) ==========

// ========== BARCODE SHEET EXPORT (BROWSER PRINT TO PDF) ==========

document
  .getElementById("downloadBarcodeSheet")
  ?.addEventListener("click", () => {
    if (!productsCache.length) {
      toast("No products to export", "error");
      return;
    }

    // 1. Flatten the stock into a single array of labels
    const allLabels = [];
    productsCache.forEach((p) => {
      const qty = Number(p.unit) > 0 ? Number(p.unit) : 1;
      for (let i = 0; i < qty; i++) {
        allLabels.push(p);
      }
    });

    // 2. Open a new window for printing
    const win = window.open("", "_blank");
    if (!win) {
      toast("Please allow pop-ups to generate the PDF", "error");
      return;
    }

    // 3. Write the HTML for the print page
    win.document.write(`
    <!doctype html>
    <html>
    <head>
      <title>Barcode Print Sheet</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .page { 
          display: grid; 
          grid-template-columns: repeat(3, 1fr); 
          gap: 10px; 
          page-break-after: always; 
        }
        .label { 
          border: 1px dashed #ccc; 
          padding: 10px; 
          text-align: center; 
          page-break-inside: avoid; 
          height: 120px; 
          display: flex; 
          flex-direction: column; 
          justify-content: center; 
          align-items: center; 
          overflow: hidden;
        }
        .name { font-size: 12px; font-weight: bold; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
        .barcode-container svg { max-width: 100%; height: auto; }
        .code { font-size: 10px; font-family: monospace; margin-top: 5px; }
        .price { font-size: 11px; color: #333; }
        @media print {
          .label { border: none; } /* Hides dashed lines when printing */
        }
      </style>
    </head>
    <body>
      <div id="pages-container"></div>
      <script>
        const labels = ${JSON.stringify(allLabels)};
        const container = document.getElementById("pages-container");
        const labelsPerPage = 18; // 3 cols x 6 rows
        
        let currentPage = document.createElement("div");
        currentPage.className = "page";
        container.appendChild(currentPage);

        labels.forEach((p, index) => {
          if (index > 0 && index % labelsPerPage === 0) {
            currentPage = document.createElement("div");
            currentPage.className = "page";
            container.appendChild(currentPage);
          }

          const code = p.barcode || "AUTO-" + p.name.replace(/\\W+/g, "").slice(0, 10).toUpperCase();
          
          const div = document.createElement("div");
          div.className = "label";
          
          // Sanitize name for HTML
          const safeName = String(p.name).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'})[c]);
          
          div.innerHTML = \`
            <div class="name">\${safeName.substring(0, 25)}</div>
            <svg class="bc"></svg>
            <div class="price">Sell: NGN \${p.selling_price}</div>
            <div class="code">\${code}</div>
          \`;
          currentPage.appendChild(div);

          // Draw the barcode
          try {
            JsBarcode(div.querySelector("svg"), code, {
              format: "CODE128",
              width: 1.5,
              height: 40,
              displayValue: false,
              margin: 0
            });
          } catch (e) {
            console.error(e);
          }
        });

        // Wait for barcodes to render, then open print dialog
        setTimeout(() => {
          window.print();
        }, 1000);
      <\/script>
    </body>
    </html>
  `);
    win.document.close();
  });
// ========== MOBILE SIDEBAR TOGGLE ==========
// ========== MOBILE SIDEBAR TOGGLE ==========

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.querySelector(".sidebar");

if (menuToggle && sidebar) {
  // Ensure an overlay element exists for closing by tapping outside
  let overlay = document.querySelector(".sidebar-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    document.body.appendChild(overlay);
  }

  const openSidebar = () => {
    sidebar.classList.add("open");
    overlay.classList.add("open");
  };

  const closeSidebar = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  };

  menuToggle.addEventListener("click", (e) => {
    e.preventDefault();
    if (sidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  overlay.addEventListener("click", closeSidebar);

  // Auto-close when a nav item is tapped (so the view is visible)
  sidebar.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", closeSidebar);
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });
}

// ========== REVEAL PROFIT WITH PIN ==========
$("#revealProfitBtn")?.addEventListener("click", () => {
  if (isProfitRevealed) {
    // Lock it
    isProfitRevealed = false;
    $("#revealProfitBtn").textContent = "🔒 Reveal Profit";
    renderProductTable(); // Updates Products table
    loadDashboard(); // Updates Dashboard cards
    return;
  }

  // Ask for PIN
  const enteredPin = prompt("Enter Manager PIN to view Cost & Profit:");

  if (enteredPin === null) return; // User clicked Cancel

  if (enteredPin === MANAGER_PIN) {
    isProfitRevealed = true;
    $("#revealProfitBtn").textContent = "🔓 Hide Profit";
    renderProductTable(); // Updates Products table
    loadDashboard(); // Updates Dashboard cards
    toast("Profit unlocked");
  } else {
    toast("Incorrect PIN", "error");
  }
});
