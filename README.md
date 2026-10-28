# Course Feedback Auto-Runner (feedback-autofill-suite)

A Google Chrome Extension (Manifest V3) that automates sequential feedback completion across all courses on student and academic management portals (such as SLCM, ERP, Moodle, and customized LMS portals).

## ✨ Features

- **Sequential Course Traversal**: Scans the course table for any courses marked `"Pending"`, opens the first one, fills it, submits, and automatically continues to the next pending course.
- **Automated Feedback Form Filling**:
  - Automatically selects `"YES"` on all radio inputs, rating pills, labels, and buttons.
  - Automatically selects `"Yes"` (or highest rating) on all `<select>` dropdown menus and triggers `change` / `input` events.
  - Fills empty `<textarea>` comment fields with `"Good"`.
  - Automatically detects and triggers the `"Submit"` / `"Save"` action after an 800ms state-binding delay.
- **Seamless State Persistence**: Uses `chrome.storage.local` to track automation state (`isRunning`, progress status) across page navigations.
- **Safe Completion Detection**: When all courses are marked completed and no more `"Pending"` items exist, the runner automatically disables itself, logs completion to the console, and alerts the user with `"All course feedback completed!"`.
- **One-Click Start & Stop**: Clean 240px popup UI with real-time status indication and instant stop button.

---

## 🚀 How to Install & Load the Extension

1. Open **Google Chrome** (or any Chromium browser like Brave, Edge, or Opera).
2. Navigate to `chrome://extensions/` in the address bar.
3. Toggle on **Developer mode** in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. In the file picker dialog, select this folder:
   ```text
   c:\Users\hikai\Desktop\visual studio\mujslcm
   ```
6. The extension **"Course Feedback Auto-Runner"** is now loaded and visible in your Chrome extensions list and toolbar.

---

## 📖 How to Use

1. Log into your university or college student portal and open the **Course Feedback** page (where the list of courses with "Pending" buttons is displayed).
2. Click the extension icon in your Chrome toolbar to open the popup.
3. Click **"Start Auto-Fill All Courses"**.
4. The extension will:
   - Identify the first "Pending" course button/link.
   - Click it and navigate to the feedback questionnaire.
   - Automatically answer "Yes", add "Good" in text fields, and click "Submit".
   - Upon redirecting back to the course table, immediately proceed to the next "Pending" course.
   - Stop automatically and alert you once every course has been submitted.
5. You can stop the runner at any time by clicking **"Stop Automation"** in the popup.

---

## 📁 File Structure

- `manifest.json`: Manifest V3 configuration, permissions (`storage`, `activeTab`, `scripting`), and content script declaration.
- `popup.html`: 240px wide sleek popup user interface with status indicators.
- `popup.js`: Manages extension state, storage synchronization, and communication.
- `content.js`: Main automation engine running on web pages to detect course tables, fill forms, and trigger submissions.
- `README.md`: Setup and usage instructions.
