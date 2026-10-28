/**
 * Course Feedback Auto-Runner - Content Script
 * Robustly automates traversing the Course Feedback table, skipping "Completed" rows,
 * clicking "Pending" courses sequentially, auto-filling feedback forms, and submitting.
 */

(() => {
  // Prevent duplicate execution within the same frame context
  if (window.__FEEDBACK_AUTO_RUNNER_LOADED__) {
    console.log("[Feedback Auto-Runner] Already active in this frame.");
    return;
  }
  window.__FEEDBACK_AUTO_RUNNER_LOADED__ = true;

  console.log("[Feedback Auto-Runner] Initialized on frame:", window.location.href);

  let isBusy = false;
  let lastActionTimestamp = 0;

  // Auto-accept window alerts and confirmation prompts (e.g., "Are you sure you want to submit?")
  try {
    const inlineScript = document.createElement("script");
    inlineScript.textContent = `
      window.confirm = () => true;
      window.alert = (msg) => { console.log('[Feedback Auto-Runner Page Alert]:', msg); return true; };
    `;
    (document.head || document.documentElement).appendChild(inlineScript);
    inlineScript.remove();
  } catch (e) {
    console.warn("[Feedback Auto-Runner] Failed to bypass confirm/alert:", e);
  }

  // Visual status banner on the webpage for transparent progress
  let bannerEl = null;
  function updateBanner(text, isError = false) {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = "feedback-runner-banner";
      bannerEl.style.cssText = `
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 999999;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #3b82f6;
        border-radius: 8px;
        padding: 8px 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(bannerEl);
    }
    bannerEl.style.borderColor = isError ? "#ef4444" : "#3b82f6";
    bannerEl.innerHTML = `
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${isError ? '#ef4444' : '#22c55e'};"></span>
      <span>${text}</span>
    `;
  }

  function removeBanner() {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
  }

  function updateStatus(message, isError = false) {
    console.log(`[Feedback Auto-Runner] ${message}`);
    updateBanner(message, isError);
    chrome.storage.local.set({ statusMessage: message });
  }

  function getStorage(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  function triggerEvents(element, eventTypes = ["input", "change"]) {
    eventTypes.forEach((type) => {
      element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
  }

  /**
   * Dispatches realistic mouse and pointer events for reliable button / link clicks
   */
  function simulateClick(element) {
    if (!element) return;
    const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    events.forEach((eventType) => {
      element.dispatchEvent(
        new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
    });
    if (typeof element.click === "function") {
      element.click();
    }
  }

  /**
   * CASE A: Course Listing Page
   * Scans for table rows, completely ignores "Completed" rows, and isolates "Pending" action elements.
   */
  function findPendingElements() {
    const pendingTargets = [];
    let completedCount = 0;

    // Scan all table rows in the current document
    const tableRows = document.querySelectorAll("table tr, tbody tr, [role='row']");

    for (const row of tableRows) {
      if (!isElementVisible(row)) continue;

      // Skip header rows
      if (row.querySelector("th") && !row.querySelector("td")) continue;

      const cells = row.querySelectorAll("td, [role='cell']");
      if (cells.length === 0) continue;

      const rowText = (row.innerText || "").trim();

      // Check Status cell (typically the last cell, or cell containing 'Pending'/'Completed')
      let statusCell = null;
      let hasCompleted = false;
      let hasPending = false;

      // Scan each cell to find the one with status text
      for (const cell of cells) {
        const text = (cell.innerText || "").trim().toLowerCase();
        if (text.includes("completed")) {
          hasCompleted = true;
          statusCell = cell;
          break;
        }
        if (text.includes("pending")) {
          hasPending = true;
          statusCell = cell;
          break;
        }
      }

      // Fallback: check if the row as a whole contains completed or pending
      if (!hasCompleted && !hasPending) {
        if (/\bcompleted\b/i.test(rowText)) hasCompleted = true;
        if (/\bpending\b/i.test(rowText)) hasPending = true;
      }

      // 1. If row is Completed, IGNORE IT completely
      if (hasCompleted) {
        completedCount++;
        continue;
      }

      // 2. If row is Pending, isolate the actionable element
      if (hasPending) {
        let actionElement = null;

        if (statusCell) {
          // Look inside the Status cell for link, button, span or the cell itself
          actionElement =
            statusCell.querySelector("a, button, [role='button'], input[type='button'], span, p") ||
            statusCell;
        } else {
          // Find any child inside the row with text "Pending"
          const allChildren = row.querySelectorAll("a, button, span, [role='button'], td");
          for (const child of allChildren) {
            const childText = (child.innerText || "").trim().toLowerCase();
            if (childText === "pending") {
              actionElement = child;
              break;
            }
          }
        }

        if (actionElement && !pendingTargets.includes(actionElement)) {
          pendingTargets.push(actionElement);
        }
      }
    }

    // Secondary fallback for non-standard or card-based layouts
    if (pendingTargets.length === 0) {
      const candidates = document.querySelectorAll("a, button, span, td, div[role='button']");
      for (const el of candidates) {
        if (!isElementVisible(el)) continue;
        const text = (el.innerText || "").trim().toLowerCase();

        if (text === "pending") {
          // Verify no parent row is completed
          const parentRow = el.closest("tr, [role='row']");
          if (parentRow && /\bcompleted\b/i.test(parentRow.innerText || "")) {
            continue;
          }
          if (!pendingTargets.includes(el)) {
            pendingTargets.push(el);
          }
        }
      }
    }

    return { pendingTargets, completedCount };
  }

  /**
   * Checks if current page is the Course Feedback table page
   */
  function isCourseListingPage() {
    const text = document.body ? document.body.innerText.toLowerCase() : "";
    const hasHeaders =
      text.includes("course name") &&
      (text.includes("faculty name") || text.includes("academic session") || text.includes("status"));
    const hasTable = document.querySelectorAll("table, tbody, [role='table']").length > 0;
    return hasHeaders && hasTable;
  }

  /**
   * CASE B: Detect if current page is a Feedback Form
   */
  function detectFeedbackForm() {
    const hasTextareas = document.querySelectorAll("textarea").length > 0;
    const hasSelects = document.querySelectorAll("select").length > 0;
    const hasRadios = document.querySelectorAll("input[type='radio']").length > 0;
    const hasSubmit = Boolean(findSubmitButton());

    return (hasRadios || hasSelects || hasTextareas) && hasSubmit;
  }

  function findSubmitButton() {
    const buttons = document.querySelectorAll(
      "button, input[type='submit'], input[type='button'], a.btn, [role='button']"
    );

    const submitRegex = /^(submit|save|submit feedback|save feedback|confirm & submit|save & submit|post feedback)/i;

    for (const btn of buttons) {
      if (!isElementVisible(btn)) continue;
      const text = (btn.innerText || btn.value || btn.getAttribute("aria-label") || "").trim();
      if (submitRegex.test(text)) return btn;
    }

    for (const btn of buttons) {
      if (!isElementVisible(btn)) continue;
      const text = (btn.innerText || btn.value || "").trim().toLowerCase();
      if ((text.includes("submit") || text.includes("save")) && !text.includes("cancel") && !text.includes("back")) {
        return btn;
      }
    }

    return null;
  }

  /**
   * Clicks next Pending course
   */
  async function handleCourseListing(pendingTargets, completedCount) {
    const total = pendingTargets.length;
    const completedInfo = completedCount > 0 ? ` (${completedCount} already completed)` : "";
    updateStatus(`Found ${total} pending course(s)${completedInfo}. Clicking next course...`);

    const target = pendingTargets[0];

    // Scroll into view & highlight
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.style.outline = "3px solid #f97316";
    target.style.boxShadow = "0 0 14px rgba(249, 115, 22, 0.9)";
    target.style.backgroundColor = "rgba(249, 115, 22, 0.2)";

    await delay(500);

    lastActionTimestamp = Date.now();

    console.log("[Feedback Auto-Runner] Triggering click on Pending target:", target);
    simulateClick(target);

    // If target is inside an anchor or has an anchor inside, trigger that too
    const parentLink = target.closest("a");
    if (parentLink && parentLink !== target) {
      simulateClick(parentLink);
    }
    const childLink = target.querySelector("a");
    if (childLink && childLink !== target) {
      simulateClick(childLink);
    }
  }

  /**
   * Fills and Submits the Feedback Form
   */
  async function handleFeedbackForm() {
    updateStatus("Feedback form detected. Auto-filling answers...");

    // 1. Click all elements matching "YES"
    fillYesOptions();

    // 2. Select "Yes" on all <select> dropdowns
    fillSelectDropdowns();

    // 3. Fill empty comment <textarea> inputs with "Good"
    fillCommentTextareas();

    updateStatus("Form filled. Preparing to submit...");

    // Wait 800ms for state to bind
    await delay(800);

    const submitBtn = findSubmitButton();
    if (submitBtn) {
      updateStatus("Clicking Submit / Save button...");
      submitBtn.style.outline = "3px solid #3b82f6";
      submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });

      await delay(300);
      lastActionTimestamp = Date.now();
      simulateClick(submitBtn);

      updateStatus("Submitted. Waiting for redirection back to table...");
    } else {
      updateStatus("Form filled. Please click Submit manually.", true);
    }
  }

  function fillYesOptions() {
    // Process radio inputs
    const radios = document.querySelectorAll("input[type='radio']");
    radios.forEach((radio) => {
      let isYes = false;
      const val = (radio.value || "").trim().toLowerCase();
      const id = (radio.id || "").toLowerCase();

      if (val === "yes" || val === "y" || val === "1" || val === "5" || id.includes("yes")) {
        isYes = true;
      }

      if (!isYes && radio.id) {
        const label = document.querySelector(`label[for='${radio.id}']`);
        if (label && /\byes\b/i.test(label.innerText)) isYes = true;
      }

      if (!isYes) {
        const parentLabel = radio.closest("label");
        if (parentLabel && /\byes\b/i.test(parentLabel.innerText)) isYes = true;
      }

      if (!isYes && radio.parentElement) {
        const siblingText = (radio.parentElement.innerText || "").toLowerCase();
        if (siblingText.includes("yes") && !siblingText.includes("no")) isYes = true;
      }

      if (isYes) {
        radio.checked = true;
        simulateClick(radio);
        triggerEvents(radio, ["input", "change"]);
      }
    });

    // Custom clickable Yes pills / labels / buttons
    const customYesCandidates = document.querySelectorAll("label, button, div, span, [role='radio']");
    customYesCandidates.forEach((el) => {
      if (el.children.length > 2) return;
      if (!isElementVisible(el)) return;

      const text = (el.innerText || el.textContent || "").trim();
      if (/^yes$/i.test(text) || /^strongly agree$/i.test(text) || /^excellent$/i.test(text)) {
        simulateClick(el);
        triggerEvents(el, ["input", "change"]);
      }
    });
  }

  function fillSelectDropdowns() {
    const selects = document.querySelectorAll("select");
    selects.forEach((select) => {
      let targetValue = null;

      for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        const text = (opt.text || "").trim().toLowerCase();
        const val = (opt.value || "").trim().toLowerCase();

        if (text === "yes" || val === "yes" || text.includes("strongly agree") || text.includes("excellent")) {
          targetValue = opt.value;
          select.selectedIndex = i;
          break;
        }
      }

      if (targetValue === null && select.options.length > 1) {
        for (let i = 0; i < select.options.length; i++) {
          const opt = select.options[i];
          if (opt.value && opt.value !== "0" && opt.value !== "-1") {
            targetValue = opt.value;
            select.selectedIndex = i;
            break;
          }
        }
      }

      if (targetValue !== null) {
        select.value = targetValue;
        triggerEvents(select, ["input", "change"]);
      }
    });
  }

  function fillCommentTextareas() {
    const textareas = document.querySelectorAll("textarea");
    textareas.forEach((ta) => {
      if (!ta.value || ta.value.trim() === "") {
        ta.value = "Good";
        triggerEvents(ta, ["input", "change", "blur"]);
      }
    });

    const textInputs = document.querySelectorAll("input[type='text']");
    textInputs.forEach((inp) => {
      const hint = (inp.name + " " + inp.placeholder + " " + inp.id).toLowerCase();
      if (
        (hint.includes("comment") || hint.includes("remark") || hint.includes("feedback") || hint.includes("suggestion")) &&
        (!inp.value || inp.value.trim() === "")
      ) {
        inp.value = "Good";
        triggerEvents(inp, ["input", "change", "blur"]);
      }
    });
  }

  async function handleAllCompleted(completedCount = 0) {
    const state = await getStorage(["isRunning"]);
    if (state.isRunning) {
      const completionText = completedCount > 0
        ? `All course feedback completed! (${completedCount} courses completed)`
        : "All course feedback completed!";

      await new Promise((resolve) => {
        chrome.storage.local.set(
          {
            isRunning: false,
            statusMessage: completionText
          },
          resolve
        );
      });

      updateStatus(completionText);
      alert(completionText);
      setTimeout(removeBanner, 5000);
    }
  }

  /**
   * Main step evaluation runner
   */
  async function evaluateAndRun() {
    if (isBusy) return;

    // Cooldown check (prevent spamming clicks)
    if (Date.now() - lastActionTimestamp < 2500) {
      return;
    }

    const state = await getStorage(["isRunning"]);
    if (!state.isRunning) {
      removeBanner();
      return;
    }

    isBusy = true;

    try {
      // Step 1: Scan for Pending courses (ignoring Completed rows)
      const { pendingTargets, completedCount } = findPendingElements();

      if (pendingTargets.length > 0) {
        await handleCourseListing(pendingTargets, completedCount);
        isBusy = false;
        return;
      }

      // Step 2: Check if this is a Feedback Form
      if (detectFeedbackForm()) {
        await handleFeedbackForm();
        isBusy = false;
        return;
      }

      // Step 3: Check if on Course Listing page and everything is finished
      if (completedCount > 0 || isCourseListingPage()) {
        await handleAllCompleted(completedCount);
        isBusy = false;
        return;
      }
    } catch (err) {
      console.error("[Feedback Auto-Runner] Error during evaluation:", err);
    } finally {
      isBusy = false;
    }
  }

  // Active Watchdog Loop: Checks every 1200ms when isRunning is true.
  // This automatically catches AJAX navigation, SPA state shifts, and table returns.
  setInterval(() => {
    evaluateAndRun();
  }, 1200);

  // Storage listener for start/stop changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.isRunning) {
      if (changes.isRunning.newValue) {
        console.log("[Feedback Auto-Runner] isRunning activated.");
        lastActionTimestamp = 0;
        evaluateAndRun();
      } else {
        console.log("[Feedback Auto-Runner] isRunning deactivated.");
        removeBanner();
      }
    }
  });

  // Runtime message listener from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "START_AUTOMATION") {
      lastActionTimestamp = 0;
      evaluateAndRun();
      sendResponse({ status: "started" });
    } else if (message.action === "STOP_AUTOMATION") {
      removeBanner();
      sendResponse({ status: "stopped" });
    }
    return true;
  });

  // Evaluate on initial script load
  evaluateAndRun();
})();
