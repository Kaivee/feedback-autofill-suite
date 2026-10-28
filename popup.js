document.addEventListener("DOMContentLoaded", () => {
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const statusDetail = document.getElementById("statusDetail");

  function renderStatus(isRunning, detail) {
    if (isRunning) {
      statusBadge.classList.add("active");
      statusText.textContent = "RUNNING";
      statusDetail.textContent = detail || "Running feedback automation...";
      btnStart.disabled = true;
      btnStart.style.opacity = "0.6";
      btnStart.style.cursor = "not-allowed";
    } else {
      statusBadge.classList.remove("active");
      statusText.textContent = "IDLE";
      statusDetail.textContent = detail || "Ready to run.";
      btnStart.disabled = false;
      btnStart.style.opacity = "1";
      btnStart.style.cursor = "pointer";
    }
  }

  // Load initial state
  chrome.storage.local.get(["isRunning", "statusMessage"], (data) => {
    const isRunning = Boolean(data.isRunning);
    const detail = data.statusMessage || (isRunning ? "Running feedback automation..." : "Ready to run.");
    renderStatus(isRunning, detail);
  });

  // Listen for storage updates in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    chrome.storage.local.get(["isRunning", "statusMessage"], (data) => {
      renderStatus(Boolean(data.isRunning), data.statusMessage);
    });
  });

  // Start automation
  btnStart.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs && tabs[0];
      if (activeTab && activeTab.id) {
        // Ensure content script is actively injected across all frames
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, allFrames: true },
            files: ["content.js"]
          });
        } catch (e) {
          console.warn("Could not inject script (may already exist or restricted page):", e);
        }
      }

      chrome.storage.local.set(
        {
          isRunning: true,
          runTrigger: Date.now(),
          statusMessage: "Scanning courses table..."
        },
        () => {
          renderStatus(true, "Scanning courses table...");
          if (activeTab && activeTab.id) {
            chrome.tabs.sendMessage(activeTab.id, { action: "START_AUTOMATION" }).catch(() => {});
          }
        }
      );
    });
  });

  // Stop automation
  btnStop.addEventListener("click", () => {
    chrome.storage.local.set(
      {
        isRunning: false,
        statusMessage: "Automation stopped by user."
      },
      () => {
        renderStatus(false, "Automation stopped by user.");
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_AUTOMATION" }).catch(() => {});
          }
        });
      }
    );
  });
});
